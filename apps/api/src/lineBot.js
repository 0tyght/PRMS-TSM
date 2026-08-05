import crypto from "node:crypto";

import { config } from "./config.js";
import {
  buildCitizenStatusFlex,
  citizenLinks,
  loadCitizenExperienceByLineUserId,
  syncRichMenuForLineUser,
} from "./citizenExperience.js";

const LINE_REPLY_ENDPOINT = "https://api.line.me/v2/bot/message/reply";
const RECENT_EVENT_TTL_MS = 10 * 60 * 1000;
const recentEventIds = new Map();

function pruneRecentEvents(now = Date.now()) {
  for (const [eventId, expiresAt] of recentEventIds) {
    if (expiresAt <= now) recentEventIds.delete(eventId);
  }
}

function acceptEvent(event) {
  const eventId = String(event?.webhookEventId || "").trim();
  if (!eventId) return true;

  const now = Date.now();
  pruneRecentEvents(now);

  if (recentEventIds.has(eventId)) return false;
  recentEventIds.set(eventId, now + RECENT_EVENT_TTL_MS);
  return true;
}

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

function quickReply() {
  return {
    items: [
      {
        type: "action",
        action: {
          type: "uri",
          label: "ข้อมูลของฉัน",
          uri: citizenLinks.account(),
        },
      },
      {
        type: "action",
        action: {
          type: "uri",
          label: "ลงทะเบียนสัตว์",
          uri: citizenLinks.register(),
        },
      },
      {
        type: "action",
        action: {
          type: "uri",
          label: "ติดตามคำขอ",
          uri: citizenLinks.track(),
        },
      },
      {
        type: "action",
        action: {
          type: "message",
          label: "เช็กสถานะ",
          text: "สถานะของฉัน",
        },
      },
    ],
  };
}

function textMessage(text, withQuickReply = true) {
  return {
    type: "text",
    text,
    ...(withQuickReply ? { quickReply: quickReply() } : {}),
  };
}

function normalizeCommand(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function containsAny(text, words) {
  return words.some((word) => text.includes(word));
}

async function loadState(lineUserId) {
  try {
    return await loadCitizenExperienceByLineUserId(lineUserId);
  } catch (error) {
    console.error("[line-bot] load state failed", error);
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

function commandReply(command, state) {
  if (
    containsAny(command, [
      "เมนู",
      "สถานะของฉัน",
      "ข้อมูลของฉัน",
      "ช่วยเหลือ",
      "help",
      "สวัสดี",
      "เริ่มต้น",
    ])
  ) {
    return [buildCitizenStatusFlex(state)];
  }

  if (containsAny(command, ["ลงทะเบียน", "ขึ้นทะเบียน", "เพิ่มสัตว์"])) {
    return [
      textMessage(
        "เปิดแบบฟอร์มลงทะเบียนสัตว์เลี้ยง พร้อมเลือกตำแหน่งบ้านบนแผนที่",
      ),
      {
        type: "template",
        altText: "เปิดแบบฟอร์มลงทะเบียนสัตว์เลี้ยง",
        template: {
          type: "buttons",
          text: "ลงทะเบียนสัตว์เลี้ยง",
          actions: [
            {
              type: "uri",
              label: "เปิดแบบฟอร์มและแผนที่",
              uri: citizenLinks.register(),
            },
          ],
        },
      },
    ];
  }

  if (containsAny(command, ["วัคซีน", "ฉีดยา"])) {
    return [
      textMessage(
        state.linked
          ? `มีสัตว์ใกล้ครบกำหนดวัคซีน ${state.counts.vaccinationDue} ตัว`
          : "กรุณาเชื่อมทะเบียนกับ LINE ก่อนแจ้งวัคซีน",
      ),
      {
        type: "template",
        altText: "แจ้งข้อมูลวัคซีน",
        template: {
          type: "buttons",
          text: "เลือกสัตว์และแจ้งข้อมูลวัคซีน",
          actions: [
            {
              type: "uri",
              label: "เปิดเมนูวัคซีน",
              uri: citizenLinks.vaccination(),
            },
          ],
        },
      },
    ];
  }

  if (command.includes("ทำหมัน")) {
    return [
      textMessage(
        state.linked
          ? `มีสัตว์ที่ยังไม่มีประวัติทำหมัน ${state.counts.unsterilized} ตัว`
          : "กรุณาเชื่อมทะเบียนกับ LINE ก่อนแจ้งทำหมัน",
      ),
      {
        type: "template",
        altText: "แจ้งข้อมูลทำหมัน",
        template: {
          type: "buttons",
          text: "เลือกสัตว์และแจ้งข้อมูลทำหมัน",
          actions: [
            {
              type: "uri",
              label: "เปิดเมนูทำหมัน",
              uri: citizenLinks.sterilization(),
            },
          ],
        },
      },
    ];
  }

  if (
    containsAny(command, [
      "หาย",
      "สูญหาย",
      "เสียชีวิต",
      "ย้ายเจ้าของ",
      "แจ้งสถานะ",
    ])
  ) {
    return [
      textMessage(
        state.linked
          ? `สัตว์ที่อยู่ในสถานะสูญหาย ${state.counts.missingPets} ตัว`
          : "กรุณาเชื่อมทะเบียนกับ LINE ก่อนแจ้งสถานะสัตว์",
      ),
      {
        type: "template",
        altText: "แจ้งสถานะสัตว์เลี้ยง",
        template: {
          type: "buttons",
          text: "เลือกสัตว์และแจ้งสถานะล่าสุด",
          actions: [
            {
              type: "uri",
              label: "เปิดเมนูแจ้งสถานะ",
              uri: citizenLinks.status(),
            },
          ],
        },
      },
    ];
  }

  if (containsAny(command, ["ตำแหน่ง", "พิกัด", "แผนที่", "ที่อยู่"])) {
    return [
      textMessage(
        state.location?.missing
          ? "ยังไม่ได้ระบุตำแหน่งบ้าน กรุณาเลือกจุดบนแผนที่"
          : "ตำแหน่งบ้านถูกบันทึกแล้ว คุณสามารถเปิดแผนที่เพื่อแก้ไขได้",
      ),
      {
        type: "template",
        altText: "เปิดแผนที่ตำแหน่งบ้าน",
        template: {
          type: "buttons",
          text: "ตำแหน่งบ้าน",
          actions: [
            {
              type: "uri",
              label: "เปิดแผนที่",
              uri: citizenLinks.location(),
            },
          ],
        },
      },
    ];
  }

  if (containsAny(command, ["ติดต่อเทศบาล", "เบอร์โทร", "ติดต่อเจ้าหน้าที่"])) {
    return [
      textMessage(
        [
          "ติดต่อเทศบาลเมืองท่าโพธิ์",
          "โทรศัพท์ 055-906-050",
          "ที่อยู่ 99/99 หมู่ที่ 6 ตำบลท่าโพธิ์ อำเภอเมืองพิษณุโลก จังหวัดพิษณุโลก 65000",
        ].join("\n"),
      ),
    ];
  }

  if (
    containsAny(command, [
      "ติดตาม",
      "เลขคำขอ",
      "ผลตรวจ",
      "คำขอ",
    ])
  ) {
    return [
      textMessage(
        state.linked
          ? `มีคำขอรอดำเนินการ ${state.counts.pending} รายการ และต้องแก้ไข ${state.counts.needsAttention} รายการ`
          : "กรอกเลขอ้างอิงเพื่อติดตามผลคำขอ",
      ),
      {
        type: "template",
        altText: "ติดตามคำขอ",
        template: {
          type: "buttons",
          text: "ติดตามผลจากเลขอ้างอิงหรือดูคำขอในบัญชี",
          actions: [
            {
              type: "uri",
              label: state.linked ? "เปิดคำขอของฉัน" : "กรอกเลขอ้างอิง",
              uri: state.linked ? citizenLinks.account() : citizenLinks.track(),
            },
          ],
        },
      },
    ];
  }

  return [
    textMessage(
      "ยังไม่พบคำสั่งนี้ พิมพ์ “เมนู” เพื่อดูข้อมูลจริงและบริการที่ใช้งานได้ในขณะนี้",
    ),
  ];
}

async function reply(replyToken, messages) {
  if (!replyToken || !config.lineChannelAccessToken) {
    return {
      status: "SKIPPED",
      reason: !replyToken ? "NO_REPLY_TOKEN" : "NO_CHANNEL_ACCESS_TOKEN",
    };
  }

  const safeMessages = messages.slice(0, 5);
  const response = await fetch(LINE_REPLY_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.lineChannelAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      replyToken,
      messages: safeMessages,
    }),
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 500);
    throw new Error(
      `LINE_REPLY_${response.status}${detail ? `: ${detail}` : ""}`,
    );
  }

  return { status: "SENT", httpStatus: response.status };
}

async function processEvent(event) {
  if (!event || event.mode === "standby" || !acceptEvent(event)) return;

  const lineUserId = event.source?.userId || "";

  if (event.type === "unfollow") {
    console.info("[line-bot] user unfollowed", lineUserId || "unknown");
    return;
  }

  const state = await loadState(lineUserId);

  if (lineUserId) {
    await syncRichMenuForLineUser(lineUserId, state).catch((error) => {
      console.error("[line-bot] rich menu sync failed", error);
    });
  }

  if (!event.replyToken) return;

  if (event.type === "follow") {
    await reply(event.replyToken, [
      textMessage(
        state.linked
          ? `ยินดีต้อนรับกลับ ${state.owner?.fullName || ""} เมนูได้รับการปรับตามข้อมูลทะเบียนล่าสุดแล้ว`
          : "ยินดีต้อนรับสู่ ThaPho PET ลงทะเบียนสัตว์เลี้ยง ติดตามคำขอ และเชื่อมทะเบียนได้จากเมนูด้านล่าง",
      ),
      buildCitizenStatusFlex(state),
    ]);
    return;
  }

  if (event.type === "message" && event.message?.type === "text") {
    await reply(
      event.replyToken,
      commandReply(normalizeCommand(event.message.text), state),
    );
    return;
  }

  if (event.type === "postback") {
    await reply(
      event.replyToken,
      commandReply(normalizeCommand(event.postback?.data || "เมนู"), state),
    );
    return;
  }

  await reply(event.replyToken, [
    textMessage("ขณะนี้รองรับคำสั่งข้อความ กรุณาพิมพ์ “เมนู”"),
  ]);
}

async function processEvents(events) {
  const results = await Promise.allSettled(events.map(processEvent));

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error("[line-bot] webhook event failed", {
        index,
        error: String(result.reason?.message || result.reason || "UNKNOWN_ERROR"),
      });
    }
  });
}

export function handleLineWebhook(req, res) {
  const rawBody = Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.from(req.body || "");

  const signature = req.get("x-line-signature");

  if (!config.lineChannelSecret) {
    return res.status(503).json({
      message: "ยังไม่ได้ตั้งค่า LINE_CHANNEL_SECRET",
    });
  }

  if (
    !verifyLineWebhookSignature(
      rawBody,
      signature,
      config.lineChannelSecret,
    )
  ) {
    return res.status(401).json({
      message: "LINE webhook signature ไม่ถูกต้อง",
    });
  }

  let payload;

  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return res.status(400).json({
      message: "LINE webhook JSON ไม่ถูกต้อง",
    });
  }

  const events = Array.isArray(payload?.events) ? payload.events : [];

  res.status(200).json({
    ok: true,
    accepted: events.length,
  });

  if (events.length) {
    queueMicrotask(() => {
      void processEvents(events);
    });
  }

  return undefined;
}
