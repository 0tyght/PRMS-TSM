import crypto from "node:crypto";

import { lineChannelSettings } from "./lineChannelSettings.js";
import {
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
} from "./lineRichMenuWizard.js";
import { smartThaPhoLineMenu } from "./SmartThaPhoLineMenu.js";
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

async function reply(replyToken, messages, channel) {
  if (!replyToken || !channel.channelAccessToken) {
    return {
      status: "SKIPPED",
      reason: !replyToken ? "NO_REPLY_TOKEN" : `NO_${channel.kind}_CHANNEL_ACCESS_TOKEN`,
    };
  }

  const safeMessages = (Array.isArray(messages) ? messages : [])
    .filter(Boolean)
    .slice(0, 5);

  if (!safeMessages.length) return { status: "SKIPPED", reason: "NO_MESSAGES" };

  const response = await fetch(LINE_REPLY_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${channel.channelAccessToken}`,
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

function publicLineErrorMessage(error) {
  const message = String(error?.message || "").trim();

  if (
    error?.code === "ER_DUP_ENTRY" ||
    /Duplicate entry|uk_waste_|ER_DUP_ENTRY/i.test(message)
  ) {
    return "ข้อมูลนี้มีอยู่ในระบบแล้ว กรุณาตรวจสอบทะเบียนเดิม หรือติดต่อเจ้าหน้าที่เทศบาล";
  }

  if (
    /SQLSTATE|foreign key|constraint|ER_[A-Z_]+|Unknown column|SQL syntax/i.test(message)
  ) {
    return "ระบบไม่สามารถบันทึกข้อมูลได้ในขณะนี้ กรุณาลองใหม่หรือติดต่อเจ้าหน้าที่เทศบาล";
  }

  return message || "ไม่สามารถดำเนินการได้ในขณะนี้";
}

async function processEvent(event, channel) {
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

    if (channel.kind === "DRIVER") {
      const wasteResult = await handleWasteLineEvent(event, { audience: "DRIVER", force: true });
      if (event.replyToken && wasteResult.messages?.length) {
        await reply(event.replyToken, wasteResult.messages, channel);
      }
      await completeLineWebhookEvent(event);
      return;
    }

    const smartMenuRequest = smartThaPhoLineMenu.parse(event);
    if (smartMenuRequest?.action === "menu") {
      await smartThaPhoLineMenu.clearPendingFlows(lineUserId);
      if (event.replyToken) await reply(event.replyToken, [smartThaPhoLineMenu.message()], channel);
      await completeLineWebhookEvent(event);
      return;
    }

    if (smartMenuRequest?.action === "system") {
      await smartThaPhoLineMenu.clearPendingFlows(lineUserId);

      if (smartMenuRequest.system === "waste") {
        const wasteResult = await handleWasteLineEvent({
          ...event,
          type: "postback",
          postback: { data: "waste=menu" },
        }, { audience: "CITIZEN", force: true });
        if (event.replyToken && wasteResult.messages?.length) {
          await reply(event.replyToken, wasteResult.messages, channel);
        }
        await completeLineWebhookEvent(event);
        return;
      }

      if (smartMenuRequest.system !== "pet") {
        if (event.replyToken) {
          await reply(event.replyToken, [smartThaPhoLineMenu.unavailableMessage(smartMenuRequest.system)], channel);
        }
        await completeLineWebhookEvent(event);
        return;
      }

      event = {
        ...event,
        type: "postback",
        postback: { data: "action=menu" },
      };
    }

    const wasteResult = await handleWasteLineEvent(event, { audience: "CITIZEN" });
    if (wasteResult.handled) {
      if (event.replyToken && wasteResult.messages?.length) {
        await reply(event.replyToken, wasteResult.messages, channel);
      }
      await completeLineWebhookEvent(event);
      return;
    }

    const state = await loadState(lineUserId);

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
      ? reply(event.replyToken, result.messages, channel)
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
      const recoveryActions = channel.kind === "DRIVER"
        ? [
            { type: "postback", label: "เมนูพนักงาน", data: "waste=menu", displayText: "กลับเมนูพนักงานประจำรถขยะ" },
            { type: "message", label: "ยกเลิก", text: "ยกเลิกบริการขยะ" },
          ]
        : [smartThaPhoLineMenu.homeAction(), { type: "message", label: "ยกเลิก", text: "ยกเลิก" }];
      const recoveryHint = channel.kind === "DRIVER"
        ? "กด ‘เมนูพนักงาน’ เพื่อเริ่มใหม่ หรือกด ‘ยกเลิก’ เพื่อล้างรายการที่ค้างอยู่"
        : "พิมพ์ “เมนู” เพื่อเลือกบริการใหม่ หรือพิมพ์ “ยกเลิก” เพื่อยกเลิกรายการที่ค้างอยู่";
      await reply(event.replyToken, [
        textMessage(
          `${publicLineErrorMessage(error)}\n\n${recoveryHint}`,
          recoveryActions,
        ),
      ], channel).catch((replyError) => {
        console.error("[line-bot] error reply failed", replyError);
      });
    }

    await completeLineWebhookEvent(event, "FAILED", String(error?.message || error)).catch(() => {});
  }
}

async function processEvents(events, channel) {
  for (const [index, event] of events.entries()) {
    try {
      await processEvent(event, channel);
    } catch (error) {
      console.error("[line-bot] webhook event rejected", {
        index,
        error: String(error?.message || error || "UNKNOWN_ERROR"),
      });
    }
  }
}

async function handleLineWebhookForChannel(req, res, kind) {
  const channel = await lineChannelSettings.get(kind);
  const rawBody = Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.from(req.body || "");
  const signature = req.get("x-line-signature");

  if (!channel.channelSecret) {
    const key = channel.kind === "DRIVER" ? "LINE_DRIVER_CHANNEL_SECRET" : "LINE_CHANNEL_SECRET";
    return res.status(503).json({ message: `ยังไม่ได้ตั้งค่า ${key}` });
  }

  if (!verifyLineWebhookSignature(rawBody, signature, channel.channelSecret)) {
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
      void processEvents(events, channel);
    });
  }

  return undefined;
}

export function handleCitizenLineWebhook(req, res) {
  return handleLineWebhookForChannel(req, res, "CITIZEN");
}

export function handleDriverLineWebhook(req, res) {
  return handleLineWebhookForChannel(req, res, "DRIVER");
}

export const handleLineWebhook = handleCitizenLineWebhook;
