import crypto from "node:crypto";

import { config } from "../../core/config.js";
import {
  buildCitizenStatusFlex,
  loadCitizenExperienceByLineUserId,
  syncRichMenuForLineUser,
} from "./citizenExperience.js";
import {
  claimLineWebhookEvent,
  completeLineWebhookEvent,
  handleNativeCitizenEvent,
} from "./lineNativeCitizen.js";
import {
  decorateNativeCitizenResultWithRichMenu,
  handleWizardControl,
  showWizardMainMenu,
} from "./lineRichMenuWizard.js";
import { handleWasteLineEvent } from "./wasteLine.js";

const LINE_REPLY_ENDPOINT = "https://api.line.me/v2/bot/message/reply";

export function verifyLineWebhookSignature(rawBody, signature, channelSecret) {
  if (!Buffer.isBuffer(rawBody) || !signature || !channelSecret) return false;

  const expected = crypto
    .createHmac("sha256", channelSecret)
    .update(rawBody)
    .digest("base64");

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(String(signature).trim());

  return (
    expectedBuffer.length === receivedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

function textMessage(text, quickReplyItems = []) {
  return {
    type: "text",
    text: String(text || "").slice(0, 5000),
    ...(quickReplyItems.length ? { quickReply: { items: quickReplyItems.slice(0, 13).map((action) => ({ type: "action", action })) } } : {}),
  };
}

function wasteMenuAction() {
  return { type: "postback", label: "บริการรถเก็บขยะ", data: "waste=menu", displayText: "เปิดบริการรถเก็บขยะ" };
}

async function reply(replyToken, messages) {
  if (!replyToken || !config.lineChannelAccessToken) {
    return {
      status: "SKIPPED",
      reason: !replyToken ? "NO_REPLY_TOKEN" : "NO_CHANNEL_ACCESS_TOKEN",
    };
  }

  const safeMessages = (Array.isArray(messages) ? messages : [])
    .filter(Boolean)
    .slice(0, 5);

  if (!safeMessages.length) return { status: "SKIPPED", reason: "NO_MESSAGES" };

  const response = await fetch(LINE_REPLY_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.lineChannelAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ replyToken, messages: safeMessages }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 500);
    throw new Error(
      `LINE_REPLY_${response.status}${detail ? `: ${detail}` : ""}`,
    );
  }

  return { status: "SENT", httpStatus: response.status };
}

function continueRichMenuTask(task, event) {
  if (!task) return;

  // A Rich Menu can involve a LINE API call and, on a cache miss, an image
  // upload. Do not make the chat reply wait for that work. Per-user ordering is
  // retained inside lineRichMenuWizard's queue.
  void Promise.resolve(task).catch((error) => {
    console.error("[line-bot] rich menu task failed", {
      eventType: event?.type,
      lineUserId: String(event?.source?.userId || "").slice(0, 8),
      error: String(error?.message || error),
    });
  });
}

async function loadState(lineUserId) {
  try {
    return await loadCitizenExperienceByLineUserId(lineUserId);
  } catch (error) {
    console.error("[line-bot] load citizen state failed", error);
    return {
      linked: false,
      menuKey: "guest",
      owner: null,
      location: { latitude: null, longitude: null, missing: true },
      counts: {
        pets: 0,
        pending: 0,
        needsAttention: 0,
        vaccinationDue: 0,
        unsterilized: 0,
        missingPets: 0,
      },
      actions: ["REGISTER", "TRACK", "LINK"],
    };
  }
}

async function processEvent(event) {
  if (!event || event.mode === "standby") return;

  const accepted = await claimLineWebhookEvent(event);
  if (!accepted) return;

  const lineUserId = String(event.source?.userId || "").trim();

  try {
    if (event.type === "unfollow") {
      console.info("[line-bot] user unfollowed", lineUserId || "unknown");
      await completeLineWebhookEvent(event);
      return;
    }

    const wasteResult = await handleWasteLineEvent(event);
    if (wasteResult.handled) {
      if (event.replyToken && wasteResult.messages?.length) {
        await reply(event.replyToken, wasteResult.messages);
      }
      await completeLineWebhookEvent(event);
      return;
    }

    const state = await loadState(lineUserId);

    if (event.type === "follow") {
      const menuTask = showWizardMainMenu(lineUserId, state);
      const replyTask = event.replyToken
        ? reply(event.replyToken, [
            textMessage(
              state.linked
                ? `ยินดีต้อนรับกลับ ${state.owner?.fullName || ""}
เลือกบริการทะเบียนสัตว์เลี้ยงจาก Rich Menu หรือพิมพ์ “เมนูขยะ” เพื่อใช้บริการเก็บขยะ`
                : "ยินดีต้อนรับสู่ Smart Tha Pho\nเลือกบริการทะเบียนสัตว์เลี้ยงจาก Rich Menu หรือพิมพ์ “เมนูขยะ” เพื่อใช้บริการเก็บขยะ โดยไม่ต้องเปิดเว็บไซต์",
              [wasteMenuAction()],
            ),
            buildCitizenStatusFlex(state),
          ])
        : Promise.resolve({ status: "SKIPPED" });

      continueRichMenuTask(menuTask, event);
      await replyTask;
      await completeLineWebhookEvent(event);
      return;
    }

    const wizardControl = await handleWizardControl(event, state);
    let result;
    let resultCameFromWizard = false;

    if (wizardControl?.handled) {
      result = wizardControl;
      resultCameFromWizard = true;
    } else {
      const effectiveEvent = wizardControl?.syntheticText
        ? {
            ...event,
            type: "message",
            message: {
              type: "text",
              text: wizardControl.syntheticText,
            },
          }
        : event;

      result = await handleNativeCitizenEvent(effectiveEvent, state);
    }

    let currentState = state;
    if (result.refreshState && lineUserId) {
      currentState = await loadState(lineUserId);
    }

    if (!resultCameFromWizard) {
      result = await decorateNativeCitizenResultWithRichMenu({
        lineUserId,
        result,
        state: currentState,
      });
    }

    const menuTask = result.richMenuTask || (
      lineUserId && !result.preserveRichMenu
        ? syncRichMenuForLineUser(lineUserId, currentState)
        : null
    );
    const replyTask = event.replyToken && result.messages?.length
      ? reply(event.replyToken, result.messages)
      : null;

    continueRichMenuTask(menuTask, event);
    if (replyTask) await replyTask;

    await completeLineWebhookEvent(event);
  } catch (error) {
    console.error("[line-bot] event failed", {
      eventType: event?.type,
      eventId: event?.webhookEventId,
      lineUserId: lineUserId ? `${lineUserId.slice(0, 8)}...` : "unknown",
      error: String(error?.message || error),
    });

    if (event.replyToken) {
      await reply(event.replyToken, [
        textMessage(
          `${String(error?.message || "ไม่สามารถดำเนินการได้ในขณะนี้")}\n\nพิมพ์ “เมนู” เพื่อเลือกบริการใหม่ หรือพิมพ์ “ยกเลิก” เพื่อยกเลิกรายการที่ค้างอยู่`,
          [wasteMenuAction(), { type: "message", label: "เมนูหลัก", text: "เมนู" }, { type: "message", label: "ยกเลิก", text: "ยกเลิก" }],
        ),
      ]).catch((replyError) => {
        console.error("[line-bot] error reply failed", replyError);
      });
    }

    await completeLineWebhookEvent(event, "FAILED", String(error?.message || error)).catch(() => {});
  }
}

async function processEvents(events) {
  for (const [index, event] of events.entries()) {
    try {
      await processEvent(event);
    } catch (error) {
      console.error("[line-bot] webhook event rejected", {
        index,
        error: String(error?.message || error || "UNKNOWN_ERROR"),
      });
    }
  }
}

export function handleLineWebhook(req, res) {
  const rawBody = Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.from(req.body || "");
  const signature = req.get("x-line-signature");

  if (!config.lineChannelSecret) {
    return res.status(503).json({ message: "ยังไม่ได้ตั้งค่า LINE_CHANNEL_SECRET" });
  }

  if (!verifyLineWebhookSignature(rawBody, signature, config.lineChannelSecret)) {
    return res.status(401).json({ message: "LINE webhook signature ไม่ถูกต้อง" });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return res.status(400).json({ message: "LINE webhook JSON ไม่ถูกต้อง" });
  }

  const events = Array.isArray(payload?.events) ? payload.events : [];

  res.status(200).json({ ok: true, accepted: events.length });

  if (events.length) {
    queueMicrotask(() => {
      void processEvents(events);
    });
  }

  return undefined;
}
