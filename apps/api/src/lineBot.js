import crypto from "node:crypto";

import { config } from "./config.js";
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

function textMessage(text) {
  return {
    type: "text",
    text: String(text || "").slice(0, 5000),
  };
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

    const state = await loadState(lineUserId);

    if (event.type === "follow") {
      const menuTask = showWizardMainMenu(lineUserId, state);
      const replyTask = event.replyToken
        ? reply(event.replyToken, [
            textMessage(
              state.linked
                ? `ยินดีต้อนรับกลับ ${state.owner?.fullName || ""}
เลือกบริการจาก Rich Menu ด้านล่างได้ทันที`
                : "ยินดีต้อนรับสู่ ThaPho PET\nทุกขั้นตอนเลือกจาก Rich Menu ด้านล่าง โดยไม่ต้องเปิดเว็บไซต์",
            ),
            buildCitizenStatusFlex(state),
          ])
        : Promise.resolve({ status: "SKIPPED" });

      const [replyResult, menuResult] = await Promise.allSettled([replyTask, menuTask]);
      if (replyResult.status === "rejected") throw replyResult.reason;
      if (menuResult.status === "rejected") {
        console.error("[line-bot] follow wizard menu failed", menuResult.reason);
      }
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

    const tasks = [replyTask, menuTask].filter(Boolean);
    const settled = await Promise.allSettled(tasks);
    if (replyTask && settled[0]?.status === "rejected") {
      throw settled[0].reason;
    }
    const menuIndex = replyTask ? 1 : 0;
    if (menuTask && settled[menuIndex]?.status === "rejected") {
      console.error("[line-bot] rich menu task failed", settled[menuIndex].reason);
    }

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
