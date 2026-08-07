import crypto from "node:crypto";

import sharp from "sharp";

import { config } from "./config.js";
import { pool } from "./db.js";

const LINE_API_BASE = "https://api.line.me";
const LINE_DATA_BASE = "https://api-data.line.me";

const MENU_WIDTH = 2500;
const MENU_HEIGHT = 1686;
const HEADER_HEIGHT = 238;
const PAGE_MARGIN = 42;
const CARD_GAP = 20;
const CONTROL_HEIGHT = 182;
const CONTROL_BOTTOM = 30;
const CONTROL_TOP = MENU_HEIGHT - CONTROL_BOTTOM - CONTROL_HEIGHT;
const CHOICE_LIMIT = 6;
const RUNTIME_TTL_DAYS = 7;
const STATIC_ASSET_TTL_DAYS = 90;
const DYNAMIC_ASSET_TTL_DAYS = 7;
const RENDER_VERSION = "v12.2";
const MAX_HISTORY = 12;
const REQUEST_TIMEOUT_MS = 15_000;
const IMAGE_CACHE_LIMIT = 32;
const ASSET_SOFT_LIMIT = 850;

const STATIC_ALIAS_BY_KEY = Object.freeze({
  "main-guest-v12": "prms-v12-main-guest",
  "main-owner-v12": "prms-v12-main-owner",
  "submenu-pets-v12": "prms-v12-pets",
  "submenu-health-v12": "prms-v12-health",
  "submenu-status-v12": "prms-v12-status",
  "submenu-requests-v12": "prms-v12-requests",
  "submenu-owner-v12": "prms-v12-owner",
  "input-v12": "prms-v12-input",
});
const MAIN_OWNER_ALIAS = STATIC_ALIAS_BY_KEY["main-owner-v12"];

const CAMERA_URI = "https://line.me/R/nv/camera/";
const CAMERA_ROLL_URI = "https://line.me/R/nv/cameraRoll/single";
const LOCATION_URI = "https://line.me/R/nv/location/";

const FLOW_LABELS = Object.freeze({
  REGISTER: "ลงทะเบียนสัตว์เลี้ยง",
  LINK: "เชื่อมทะเบียนเดิม",
  TRACK: "ติดตามคำขอ",
  VACCINATION: "แจ้งวัคซีน",
  STERILIZATION: "แจ้งทำหมัน",
  PET_STATUS: "แจ้งสถานะสัตว์เลี้ยง",
  PET_UPDATE: "แก้ข้อมูลสัตว์เลี้ยง",
  OWNER_TRANSFER: "โอนเจ้าของ",
  LOCATION: "ตำแหน่งบ้าน",
  PROFILE_UPDATE: "แก้ข้อมูลเจ้าของ",
  RESUBMIT: "ส่งข้อมูลเพิ่มเติม",
});

const STEP_LABELS = Object.freeze({
  CONSENT: "ยืนยันการใช้ข้อมูล",
  OWNER_NAME: "ชื่อเจ้าของ",
  PHONE: "เบอร์โทรศัพท์",
  HOUSE_NO: "บ้านเลขที่",
  VILLAGE: "หมู่บ้าน",
  ADDRESS_DETAIL: "รายละเอียดที่อยู่",
  ADDRESS: "รายละเอียดที่อยู่",
  LOCATION: "ตำแหน่งบ้าน",
  PET_SPECIES: "ชนิดสัตว์เลี้ยง",
  PET_NAME: "ชื่อสัตว์เลี้ยง",
  PET_SEX: "เพศสัตว์เลี้ยง",
  PET_BREED: "สายพันธุ์",
  PET_COLOR: "สีและตำหนิ",
  PET_BIRTHDATE: "วันเกิด",
  PHOTO: "รูปหรือหลักฐาน",
  CONFIRM: "ตรวจสอบก่อนส่ง",
  REFERENCE: "เลขอ้างอิง",
  VACCINE_NAME: "ชนิดวัคซีน",
  VACCINE_NAME_TEXT: "ชื่อวัคซีน",
  VACCINATED_AT: "วันที่ฉีดวัคซีน",
  NEXT_DUE_AT: "วันครบกำหนด",
  LOT_NO: "เลขล็อต",
  PROVIDER: "สถานที่ให้บริการ",
  DATE: "วันที่มีผล",
  REASON: "เหตุผล",
  STATUS: "สถานะใหม่",
  FIELD: "หัวข้อที่จะแก้",
  VALUE: "ข้อมูลใหม่",
  NOTE: "หมายเหตุ",
  DETAIL: "ข้อมูลเพิ่มเติม",
});

const userQueues = new Map();
const assetCreationLocks = new Map();
const imageCache = new Map();
let schemaPromise = null;
let staticWarmPromise = null;

function clamp(value, max = 300) {
  return String(value ?? "").slice(0, max);
}

function truncateLabel(value, max = 20) {
  const text = String(value ?? "").trim();
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1))}…`;
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function stripEmoji(value) {
  return String(value ?? "")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function wrapThaiLabel(value, maxChars = 23, maxLines = 2) {
  const text = stripEmoji(value);
  if (!text) return ["เลือก"];

  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }

    if (`${current} ${word}`.length <= maxChars) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);

  if (lines.length === 1 && lines[0].length > maxChars) {
    const chunks = [];
    for (let index = 0; index < lines[0].length; index += maxChars) {
      chunks.push(lines[0].slice(index, index + maxChars));
    }
    lines.splice(0, 1, ...chunks);
  }

  const limited = lines.slice(0, maxLines);
  if (lines.length > maxLines) {
    limited[maxLines - 1] = `${limited[maxLines - 1].slice(0, maxChars - 1)}…`;
  }

  return limited;
}

function postbackAction(label, data, inputOption = "openRichMenu") {
  return {
    type: "postback",
    label: truncateLabel(label),
    data: clamp(data),
    inputOption,
  };
}

function uriAction(label, uri) {
  return {
    type: "uri",
    label: truncateLabel(label),
    uri,
  };
}

function richMenuSwitchAction(label, richMenuAliasId, data = "wizard=switched") {
  return {
    type: "richmenuswitch",
    label: truncateLabel(label),
    richMenuAliasId: clamp(richMenuAliasId, 32),
    data: clamp(data, 300),
  };
}

function keyboardAction(prompt = "") {
  return {
    type: "postback",
    label: "พิมพ์ข้อมูล",
    data: "wizard=input",
    inputOption: "openKeyboard",
    ...(prompt ? { fillInText: clamp(prompt, 300) } : {}),
  };
}

export function normalizeWizardAction(action) {
  if (!action || typeof action !== "object") return null;

  const label = truncateLabel(action.label || "เลือก");

  if (action.type === "postback") {
    const data = clamp(action.data);
    if (!data) return null;

    return {
      type: "postback",
      label,
      data,
      inputOption: action.inputOption || "openRichMenu",
      ...(action.fillInText && action.inputOption === "openKeyboard"
        ? { fillInText: clamp(action.fillInText, 300) }
        : {}),
    };
  }

  if (action.type === "datetimepicker") {
    const data = clamp(action.data);
    if (!data) return null;
    return {
      type: "datetimepicker",
      label,
      data,
      mode: action.mode || "date",
      ...(action.initial ? { initial: action.initial } : {}),
      ...(action.min ? { min: action.min } : {}),
      ...(action.max ? { max: action.max } : {}),
    };
  }

  if (action.type === "camera") {
    return uriAction(label || "ถ่ายรูป", CAMERA_URI);
  }

  if (action.type === "cameraRoll") {
    return uriAction(label || "เลือกรูป", CAMERA_ROLL_URI);
  }

  if (action.type === "location") {
    return uriAction(label || "ส่งตำแหน่ง", LOCATION_URI);
  }

  if (action.type === "uri") {
    const uri = String(action.uri || "").trim();
    if (
      uri === CAMERA_URI ||
      uri === CAMERA_ROLL_URI ||
      uri === LOCATION_URI ||
      uri.startsWith("https://line.me/R/")
    ) {
      return uriAction(label, uri);
    }
    return null;
  }

  if (action.type === "richmenuswitch") {
    const richMenuAliasId = String(action.richMenuAliasId || "").trim();
    const data = clamp(action.data || "wizard=switched", 300);
    if (!/^[a-z0-9_-]{1,32}$/.test(richMenuAliasId) || !data) return null;
    return richMenuSwitchAction(label, richMenuAliasId, data);
  }

  if (action.type === "message" && action.text) {
    return postbackAction(
      label,
      `wizard=message&text=${encodeURIComponent(clamp(action.text, 180))}`,
    );
  }

  return null;
}

function actionIdentity(action) {
  if (!action) return "";
  if (action.type === "postback") return `postback:${action.data}`;
  if (action.type === "datetimepicker") return `date:${action.data}`;
  if (action.type === "uri") return `uri:${action.uri}`;
  if (action.type === "richmenuswitch") return `switch:${action.richMenuAliasId}:${action.data}`;
  return JSON.stringify(action);
}

function isNavigationAction(action) {
  if (action?.type !== "postback") return false;
  const data = String(action.data || "");
  return [
    "session=cancel",
    "session=back",
    "session=home",
    "action=menu",
    "wizard=home",
    "wizard=back",
    "wizard=refresh",
  ].includes(data);
}

function collectActions(node, output = [], visited = new Set()) {
  if (!node || typeof node !== "object") return output;
  if (visited.has(node)) return output;
  visited.add(node);

  if (Array.isArray(node)) {
    for (const child of node) collectActions(child, output, visited);
    return output;
  }

  const wizardItems = node.quickReply?._wizardItems || node.quickReply?.wizardItems;
  if (Array.isArray(wizardItems)) {
    for (const item of wizardItems) {
      if (item?.action) output.push(item.action);
    }
  } else if (node.quickReply?.items) {
    for (const item of node.quickReply.items) {
      if (item?.action) output.push(item.action);
    }
  }

  if (node.type === "button" && node.action) {
    output.push(node.action);
  }

  for (const [key, value] of Object.entries(node)) {
    if (key === "quickReply" || key === "action") continue;
    if (value && typeof value === "object") collectActions(value, output, visited);
  }

  return output;
}

export function extractWizardChoicesFromMessages(messages) {
  const collected = collectActions(Array.isArray(messages) ? messages : [], []);
  const seen = new Set();
  const choices = [];

  for (const originalAction of collected) {
    const normalized = normalizeWizardAction(originalAction);
    if (!normalized || isNavigationAction(normalized)) continue;

    const identity = actionIdentity(normalized);
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);

    choices.push({
      label:
        originalAction.displayText ||
        originalAction.label ||
        normalized.label ||
        "เลือก",
      action: normalized,
    });
  }

  return choices;
}

function stripInteractiveNodes(node) {
  if (!node || typeof node !== "object") return node;

  if (Array.isArray(node)) {
    return node
      .filter((item) => !(item && typeof item === "object" && item.type === "button"))
      .map(stripInteractiveNodes)
      .filter(Boolean);
  }

  const next = {};

  for (const [key, value] of Object.entries(node)) {
    if (key === "quickReply" || key === "action") continue;
    if (key.startsWith("_wizard") || key.startsWith("wizard")) continue;

    const cleaned = stripInteractiveNodes(value);

    if (
      key === "footer" &&
      cleaned &&
      Array.isArray(cleaned.contents) &&
      cleaned.contents.length === 0
    ) {
      continue;
    }

    next[key] = cleaned;
  }

  return next;
}

function sanitizeMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .map((message) => stripInteractiveNodes(structuredClone(message)))
    .filter(Boolean)
    .filter((message) => {
      if (message.type !== "flex") return true;
      return Boolean(message.contents);
    });
}

function firstPromptLine(messages) {
  for (const message of messages || []) {
    if (message?.type === "text" && message.text) {
      const lines = String(message.text)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      if (lines.length) {
        return {
          title: lines[0],
          subtitle: lines.slice(1, 3).join(" • "),
          fullText: String(message.text),
        };
      }
    }

    if (message?.type === "flex") {
      return {
        title: message.altText || "เลือกเมนู",
        subtitle: "เลือกจากเมนูด้านล่าง",
        fullText: message.altText || "",
      };
    }
  }

  return {
    title: "เลือกเมนู",
    subtitle: "เลือกขั้นตอนที่ต้องการ",
    fullText: "",
  };
}

function looksLikeTextPrompt(text) {
  return /(พิมพ์|กรอก|ระบุ|ใส่ข้อมูล|แก้ข้อมูล|เบอร์โทร|บ้านเลขที่|ชื่อ–นามสกุล)/.test(
    String(text || ""),
  );
}

function looksLikeDevicePrompt(text) {
  return /(ส่งตำแหน่ง|ถ่ายรูป|เลือกรูป|แนบรูป|กล้อง|คลังภาพ)/.test(
    String(text || ""),
  );
}

function looksLikeOutcome(text) {
  return /(เรียบร้อย|เลขอ้างอิง|ไม่พบ|ไม่สามารถ|ผิดพลาด|เจ้าหน้าที่|ยกเลิกแล้ว|สถานะปัจจุบัน)/.test(
    String(text || ""),
  );
}

function filterMessagesForExperience(messages, { choices, activeSession, refreshState }) {
  const sanitized = sanitizeMessages(messages);

  return sanitized.filter((message) => {
    if (message.type !== "text") return true;
    const text = String(message.text || "");

    if (refreshState && /เมนูหลัก|เลือกหมวดบริการ|Rich Menu ด้านล่าง/.test(text)) {
      return false;
    }

    if (!choices.length) return true;
    if (looksLikeTextPrompt(text) || looksLikeDevicePrompt(text) || looksLikeOutcome(text)) {
      return true;
    }

    // Choice-only prompts are already visible in the rich-menu header.
    return !activeSession && text.length > 180;
  });
}

function abortSignal() {
  return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
}

async function lineRequest(method, endpoint, body = undefined) {
  if (!config.lineChannelAccessToken) {
    throw new Error("ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN");
  }

  const response = await fetch(`${LINE_API_BASE}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.lineChannelAccessToken}`,
      ...(body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: abortSignal(),
  });

  const text = await response.text();
  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text.slice(0, 500) };
    }
  }

  if (!response.ok) {
    const error = new Error(
      `LINE API ${method} ${endpoint} (${response.status}): ${JSON.stringify(payload)}`,
    );
    error.status = response.status;
    throw error;
  }

  return payload;
}

async function uploadMenuImage(richMenuId, image) {
  const response = await fetch(
    `${LINE_DATA_BASE}/v2/bot/richmenu/${encodeURIComponent(richMenuId)}/content`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.lineChannelAccessToken}`,
        "Content-Type": "image/png",
      },
      body: image,
      signal: abortSignal(),
    },
  );

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 500);
    const error = new Error(
      `อัปโหลดรูป Rich Menu ไม่สำเร็จ (${response.status}): ${detail}`,
    );
    error.status = response.status;
    throw error;
  }
}

async function linkMenuToUser(lineUserId, richMenuId) {
  await lineRequest(
    "POST",
    `/v2/bot/user/${encodeURIComponent(lineUserId)}/richmenu/${encodeURIComponent(richMenuId)}`,
  );
}

async function ensureRichMenuAlias(richMenuAliasId, richMenuId) {
  if (!richMenuAliasId || !richMenuId) return;

  try {
    const current = await lineRequest(
      "GET",
      `/v2/bot/richmenu/alias/${encodeURIComponent(richMenuAliasId)}`,
    );
    if (current?.richMenuId === richMenuId) return;
    await lineRequest(
      "POST",
      `/v2/bot/richmenu/alias/${encodeURIComponent(richMenuAliasId)}`,
      { richMenuId },
    );
  } catch (error) {
    if (Number(error?.status) !== 404) throw error;
    await lineRequest("POST", "/v2/bot/richmenu/alias", {
      richMenuAliasId,
      richMenuId,
    });
  }
}

async function deleteRichMenu(richMenuId) {
  if (!richMenuId) return;
  await lineRequest(
    "DELETE",
    `/v2/bot/richmenu/${encodeURIComponent(richMenuId)}`,
  ).catch((error) => {
    if (Number(error?.status) !== 404) {
      console.warn("[rich-menu-v12] delete menu failed", {
        richMenuId,
        error: String(error?.message || error),
      });
    }
  });
}

function actionData(slot) {
  return String(slot?.action?.data || "");
}

function semanticKey(slot) {
  const data = actionData(slot);
  const label = String(slot?.label || "");

  if (slot?.kind === "control") {
    if (/back|ย้อนกลับ/.test(`${data} ${label}`)) return "back";
    if (/home|menu|เมนูหลัก/.test(`${data} ${label}`)) return "home";
    if (/cancel|ยกเลิก/.test(`${data} ${label}`)) return "cancel";
    if (/refresh|รีเฟรช/.test(`${data} ${label}`)) return "refresh";
    return "control";
  }

  if (slot?.kind === "pager") {
    return /ก่อน/.test(label) ? "back" : "next";
  }

  if (/register|เพิ่มสัตว์|ลงทะเบียน/.test(`${data} ${label}`)) return "register";
  if (/pets|pet_detail|pet_update|สัตว์ของฉัน|ข้อมูลสัตว์/.test(`${data} ${label}`)) return "pets";
  if (/vaccin|steriliz|health|วัคซีน|ทำหมัน|สุขภาพ/.test(`${data} ${label}`)) return "health";
  if (/status|missing|deceased|transfer|สูญหาย|เสียชีวิต|โอนเจ้าของ|พบแล้ว/.test(`${data} ${label}`)) return "status";
  if (/request|track|reference|คำขอ|ติดตาม/.test(`${data} ${label}`)) return "requests";
  if (/profile|owner|ข้อมูลเจ้าของ|เจ้าของ/.test(`${data} ${label}`)) return "owner";
  if (/location|ตำแหน่ง|หมู่บ้าน|village/.test(`${data} ${label}`)) return "location";
  if (/contact|ติดต่อ/.test(`${data} ${label}`)) return "contact";
  if (/services|วิธีใช้งาน/.test(`${data} ${label}`)) return "info";
  if (slot?.action?.type === "datetimepicker" || /date|วันที่|กำหนด/.test(`${data} ${label}`)) return "date";
  if (slot?.action?.type === "uri" && /camera/.test(String(slot.action.uri || ""))) return "photo";
  if (slot?.action?.type === "uri" && /location/.test(String(slot.action.uri || ""))) return "location";
  if (slot?.action?.inputOption === "openKeyboard" || /พิมพ์ข้อมูล/.test(label)) return "input";
  if (/skip|ข้าม|ไม่ระบุ|ไม่ทราบ/.test(`${data} ${label}`)) return "skip";
  if (/confirm|ยืนยัน/.test(`${data} ${label}`)) return "confirm";
  if (/action_center|ต้องทำ|ดำเนินการ/.test(`${data} ${label}`)) return "attention";
  return "default";
}

function slotPalette(slot) {
  const palettes = {
    register: { accent: "#1769D2", tint: "#EAF3FF", text: "#123F78" },
    pets: { accent: "#008A6A", tint: "#E7F7F2", text: "#075A48" },
    health: { accent: "#2C915D", tint: "#E9F7EF", text: "#176241" },
    status: { accent: "#D97400", tint: "#FFF2DE", text: "#8B4800" },
    requests: { accent: "#7351B6", tint: "#F1ECFF", text: "#4E3481" },
    owner: { accent: "#3B5FC0", tint: "#ECF0FF", text: "#2F478D" },
    location: { accent: "#147F93", tint: "#E6F6F8", text: "#145965" },
    contact: { accent: "#536676", tint: "#EDF1F4", text: "#344651" },
    info: { accent: "#287CA8", tint: "#E8F5FB", text: "#245B76" },
    date: { accent: "#B66B11", tint: "#FFF3E1", text: "#78470E" },
    photo: { accent: "#8150A4", tint: "#F4EBFA", text: "#5C3976" },
    input: { accent: "#0C7364", tint: "#E5F7F3", text: "#0B5148" },
    skip: { accent: "#68757E", tint: "#EEF2F4", text: "#45515A" },
    confirm: { accent: "#007A57", tint: "#E2F5ED", text: "#065B43" },
    attention: { accent: "#C44921", tint: "#FFF0E9", text: "#853117" },
    back: { accent: "#60717C", tint: "#EEF2F4", text: "#33424B" },
    next: { accent: "#287CA8", tint: "#E8F5FB", text: "#245B76" },
    home: { accent: "#007A57", tint: "#E2F5ED", text: "#065B43" },
    cancel: { accent: "#C33D3D", tint: "#FFF0F0", text: "#8A2D2D" },
    refresh: { accent: "#287CA8", tint: "#E8F5FB", text: "#245B76" },
    control: { accent: "#60717C", tint: "#EEF2F4", text: "#33424B" },
    default: { accent: "#24776F", tint: "#E8F6F4", text: "#1E5B56" },
  };
  return palettes[semanticKey(slot)] || palettes.default;
}

function iconSvg(slot, centerX, centerY, size, color) {
  const key = semanticKey(slot);
  const stroke = Math.max(8, Math.round(size * 0.085));
  const common = `fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"`;
  const left = centerX - size / 2;
  const top = centerY - size / 2;

  if (key === "pets") {
    return `
      <circle cx="${centerX - size * 0.28}" cy="${centerY - size * 0.22}" r="${size * 0.11}" fill="${color}"/>
      <circle cx="${centerX}" cy="${centerY - size * 0.32}" r="${size * 0.11}" fill="${color}"/>
      <circle cx="${centerX + size * 0.28}" cy="${centerY - size * 0.22}" r="${size * 0.11}" fill="${color}"/>
      <circle cx="${centerX + size * 0.37}" cy="${centerY + size * 0.05}" r="${size * 0.1}" fill="${color}"/>
      <path d="M ${centerX - size * 0.3} ${centerY + size * 0.25}
               C ${centerX - size * 0.2} ${centerY - size * 0.02},
                 ${centerX + size * 0.2} ${centerY - size * 0.02},
                 ${centerX + size * 0.3} ${centerY + size * 0.25}
               C ${centerX + size * 0.18} ${centerY + size * 0.48},
                 ${centerX - size * 0.18} ${centerY + size * 0.48},
                 ${centerX - size * 0.3} ${centerY + size * 0.25} Z" fill="${color}"/>`;
  }

  if (key === "register") {
    return `<path d="M ${centerX} ${top + size * 0.12} V ${top + size * 0.88} M ${left + size * 0.12} ${centerY} H ${left + size * 0.88}" ${common}/>`;
  }

  if (key === "health") {
    return `<path d="M ${centerX} ${top + size * 0.15} V ${top + size * 0.85} M ${left + size * 0.15} ${centerY} H ${left + size * 0.85}" ${common}/>`;
  }

  if (key === "status" || key === "attention") {
    return `<circle cx="${centerX}" cy="${centerY}" r="${size * 0.37}" ${common}/>
      <path d="M ${centerX} ${top + size * 0.25} V ${top + size * 0.58}" ${common}/>
      <circle cx="${centerX}" cy="${top + size * 0.73}" r="${size * 0.055}" fill="${color}"/>`;
  }

  if (key === "requests") {
    return `<rect x="${left + size * 0.2}" y="${top + size * 0.12}" width="${size * 0.6}" height="${size * 0.76}" rx="${size * 0.08}" ${common}/>
      <path d="M ${left + size * 0.33} ${top + size * 0.36} H ${left + size * 0.67} M ${left + size * 0.33} ${top + size * 0.52} H ${left + size * 0.67} M ${left + size * 0.33} ${top + size * 0.68} H ${left + size * 0.6}" ${common}/>`;
  }

  if (key === "owner") {
    return `<circle cx="${centerX}" cy="${top + size * 0.32}" r="${size * 0.17}" ${common}/>
      <path d="M ${left + size * 0.22} ${top + size * 0.82} C ${left + size * 0.26} ${top + size * 0.58}, ${left + size * 0.74} ${top + size * 0.58}, ${left + size * 0.78} ${top + size * 0.82}" ${common}/>`;
  }

  if (key === "location") {
    return `<path d="M ${centerX} ${top + size * 0.88} C ${left + size * 0.22} ${top + size * 0.54}, ${left + size * 0.24} ${top + size * 0.18}, ${centerX} ${top + size * 0.12} C ${left + size * 0.76} ${top + size * 0.18}, ${left + size * 0.78} ${top + size * 0.54}, ${centerX} ${top + size * 0.88} Z" ${common}/>
      <circle cx="${centerX}" cy="${top + size * 0.4}" r="${size * 0.11}" ${common}/>`;
  }

  if (key === "date") {
    return `<rect x="${left + size * 0.12}" y="${top + size * 0.2}" width="${size * 0.76}" height="${size * 0.65}" rx="${size * 0.08}" ${common}/>
      <path d="M ${left + size * 0.12} ${top + size * 0.38} H ${left + size * 0.88} M ${left + size * 0.3} ${top + size * 0.1} V ${top + size * 0.3} M ${left + size * 0.7} ${top + size * 0.1} V ${top + size * 0.3}" ${common}/>`;
  }

  if (key === "photo") {
    return `<rect x="${left + size * 0.1}" y="${top + size * 0.23}" width="${size * 0.8}" height="${size * 0.58}" rx="${size * 0.1}" ${common}/>
      <circle cx="${centerX}" cy="${centerY + size * 0.05}" r="${size * 0.18}" ${common}/>
      <path d="M ${left + size * 0.3} ${top + size * 0.23} L ${left + size * 0.4} ${top + size * 0.1} H ${left + size * 0.6} L ${left + size * 0.7} ${top + size * 0.23}" ${common}/>`;
  }

  if (key === "input") {
    return `<rect x="${left + size * 0.1}" y="${top + size * 0.18}" width="${size * 0.8}" height="${size * 0.64}" rx="${size * 0.08}" ${common}/>
      <path d="M ${left + size * 0.25} ${top + size * 0.4} H ${left + size * 0.75} M ${left + size * 0.25} ${top + size * 0.58} H ${left + size * 0.6}" ${common}/>`;
  }

  if (key === "confirm") {
    return `<path d="M ${left + size * 0.14} ${centerY} L ${left + size * 0.42} ${top + size * 0.76} L ${left + size * 0.88} ${top + size * 0.2}" ${common}/>`;
  }

  if (key === "cancel") {
    return `<path d="M ${left + size * 0.18} ${top + size * 0.18} L ${left + size * 0.82} ${top + size * 0.82} M ${left + size * 0.82} ${top + size * 0.18} L ${left + size * 0.18} ${top + size * 0.82}" ${common}/>`;
  }

  if (key === "home") {
    return `<path d="M ${left + size * 0.12} ${centerY} L ${centerX} ${top + size * 0.14} L ${left + size * 0.88} ${centerY} M ${left + size * 0.25} ${centerY - size * 0.04} V ${top + size * 0.84} H ${left + size * 0.75} V ${centerY - size * 0.04}" ${common}/>`;
  }

  if (key === "back") {
    return `<path d="M ${left + size * 0.75} ${top + size * 0.18} L ${left + size * 0.25} ${centerY} L ${left + size * 0.75} ${top + size * 0.82}" ${common}/>`;
  }

  if (key === "next") {
    return `<path d="M ${left + size * 0.25} ${top + size * 0.18} L ${left + size * 0.75} ${centerY} L ${left + size * 0.25} ${top + size * 0.82}" ${common}/>`;
  }

  if (key === "refresh") {
    return `<path d="M ${left + size * 0.78} ${top + size * 0.38} A ${size * 0.34} ${size * 0.34} 0 1 0 ${left + size * 0.72} ${top + size * 0.72}" ${common}/>
      <path d="M ${left + size * 0.68} ${top + size * 0.18} H ${left + size * 0.88} V ${top + size * 0.38}" ${common}/>`;
  }

  if (key === "contact") {
    return `<path d="M ${left + size * 0.2} ${top + size * 0.18} H ${left + size * 0.8} V ${top + size * 0.66} H ${left + size * 0.52} L ${left + size * 0.32} ${top + size * 0.84} V ${top + size * 0.66} H ${left + size * 0.2} Z" ${common}/>`;
  }

  return `<circle cx="${centerX}" cy="${centerY}" r="${size * 0.34}" ${common}/>
    <circle cx="${centerX}" cy="${centerY}" r="${size * 0.055}" fill="${color}"/>`;
}

function gridBounds(count, top, bottom, columns = 2) {
  const rows = Math.ceil(count / columns);
  const usableWidth = MENU_WIDTH - PAGE_MARGIN * 2;
  const usableHeight = bottom - top;
  const cardWidth = Math.floor((usableWidth - CARD_GAP * (columns - 1)) / columns);
  const cardHeight = Math.floor((usableHeight - CARD_GAP * (rows - 1)) / rows);
  const bounds = [];

  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const isLonelyLast = count % columns === 1 && index === count - 1;
    const x = isLonelyLast
      ? PAGE_MARGIN
      : PAGE_MARGIN + column * (cardWidth + CARD_GAP);
    const width = isLonelyLast ? usableWidth : cardWidth;
    const y = top + row * (cardHeight + CARD_GAP);
    bounds.push({ x, y, width, height: cardHeight });
  }

  return bounds;
}

function listBounds(count, top, bottom) {
  const usableHeight = bottom - top;
  const rowHeight = Math.floor((usableHeight - CARD_GAP * (count - 1)) / count);
  return Array.from({ length: count }, (_, index) => ({
    x: PAGE_MARGIN,
    y: top + index * (rowHeight + CARD_GAP),
    width: MENU_WIDTH - PAGE_MARGIN * 2,
    height: rowHeight,
  }));
}

function choiceBounds(count, isMain) {
  if (!count) return [];

  const top = HEADER_HEIGHT + 28;
  const bottom = isMain ? MENU_HEIGHT - 34 : CONTROL_TOP - 24;

  if (!isMain && count <= 3) {
    return listBounds(count, top, bottom);
  }

  return gridBounds(count, top, bottom, 2);
}

function controlBounds(count) {
  if (!count) return [];
  const usableWidth = MENU_WIDTH - PAGE_MARGIN * 2;
  const width = Math.floor((usableWidth - CARD_GAP * (count - 1)) / count);

  return Array.from({ length: count }, (_, index) => {
    const x = PAGE_MARGIN + index * (width + CARD_GAP);
    return {
      x,
      y: CONTROL_TOP,
      width: index === count - 1 ? MENU_WIDTH - PAGE_MARGIN - x : width,
      height: CONTROL_HEIGHT,
    };
  });
}

function pagerBounds(page) {
  const result = [];
  const y = 44;
  const width = 230;
  const height = 118;

  for (const slot of page.pagerSlots) {
    if (slot.label === "หน้าก่อน") {
      result.push({ x: 1740, y, width, height });
    } else {
      result.push({ x: 2208, y, width, height });
    }
  }

  return result;
}

function normalizeChoice(choice) {
  const action = normalizeWizardAction(choice?.action || choice);
  if (!action) return null;
  return {
    label: String(choice?.label || action.label || "เลือก"),
    action,
    kind: "choice",
  };
}

export function buildWizardPage(definition, offset = 0, activeSession = false) {
  const choices = (Array.isArray(definition?.choices) ? definition.choices : [])
    .map(normalizeChoice)
    .filter(Boolean);
  const safeOffset = Math.min(
    Math.max(0, Number(offset) || 0),
    Math.max(0, Math.floor(Math.max(0, choices.length - 1) / CHOICE_LIMIT) * CHOICE_LIMIT),
  );
  const pageChoices = choices.slice(safeOffset, safeOffset + CHOICE_LIMIT);
  const pageCount = Math.max(1, Math.ceil(choices.length / CHOICE_LIMIT));
  const pageIndex = Math.floor(safeOffset / CHOICE_LIMIT);
  const pagerSlots = [];

  if (safeOffset > 0) {
    pagerSlots.push({
      kind: "pager",
      label: "หน้าก่อน",
      action: postbackAction("หน้าก่อน", `wizard=page&offset=${Math.max(0, safeOffset - CHOICE_LIMIT)}`),
    });
  }

  if (safeOffset + CHOICE_LIMIT < choices.length) {
    pagerSlots.push({
      kind: "pager",
      label: "หน้าถัดไป",
      action: postbackAction("หน้าถัดไป", `wizard=page&offset=${safeOffset + CHOICE_LIMIT}`),
    });
  }

  const isMain = Boolean(definition?.isMain);
  const staticReturnAlias = !activeSession && definition?.returnAlias
    ? String(definition.returnAlias)
    : "";
  const controlSlots = isMain
    ? []
    : [
        {
          kind: "control",
          label: "ย้อนกลับ",
          action: activeSession
            ? postbackAction("ย้อนกลับ", "session=back")
            : staticReturnAlias
              ? richMenuSwitchAction("ย้อนกลับ", staticReturnAlias, "wizard=switched&target=main")
              : postbackAction("ย้อนกลับ", "wizard=back"),
        },
        {
          kind: "control",
          label: "เมนูหลัก",
          action: staticReturnAlias
            ? richMenuSwitchAction("เมนูหลัก", MAIN_OWNER_ALIAS, "wizard=switched&target=main")
            : postbackAction("เมนูหลัก", "wizard=home"),
        },
        {
          kind: "control",
          label: activeSession ? "ยกเลิกรายการ" : "รีเฟรช",
          action: activeSession
            ? postbackAction("ยกเลิกรายการ", "session=cancel")
            : postbackAction("รีเฟรช", "wizard=refresh"),
        },
      ];

  return {
    key: definition?.key || "wizard",
    title: definition?.title || "เลือกเมนู",
    subtitle: definition?.subtitle || "",
    contextLabel: definition?.contextLabel || "",
    cacheScope: definition?.cacheScope || "dynamic",
    staticAlias: definition?.staticAlias || STATIC_ALIAS_BY_KEY[definition?.key] || "",
    isMain,
    offset: safeOffset,
    pageIndex,
    pageCount,
    totalChoices: choices.length,
    choiceSlots: pageChoices,
    pagerSlots,
    controlSlots,
    slots: [...pageChoices, ...pagerSlots, ...controlSlots],
  };
}

function quickReplyActionFromWizardAction(action) {
  const normalized = normalizeWizardAction(action);
  if (!normalized) return null;

  // LINE Quick Reply does not support richmenuswitch. Keep the same label and
  // postback data so the server can show the matching submenu and reply.
  if (normalized.type === "richmenuswitch") {
    return postbackAction(
      normalized.label,
      normalized.data || "wizard=switched",
      "openRichMenu",
    );
  }

  return normalized;
}

export function buildQuickReplyItemsFromWizardPage(page) {
  return (Array.isArray(page?.slots) ? page.slots : [])
    .map((slot) => {
      const action = quickReplyActionFromWizardAction(slot?.action);
      return action ? { type: "action", action } : null;
    })
    .filter(Boolean)
    .slice(0, 13);
}

export function buildWizardMenuMessage(page, acknowledgement = "") {
  const quickReplyItems = buildQuickReplyItemsFromWizardPage(page);
  const text = [
    acknowledgement,
    page?.title || "เมนูบริการ",
    page?.subtitle || "เลือกบริการที่ต้องการ",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    type: "text",
    text: clamp(text, 5000),
    ...(quickReplyItems.length ? { quickReply: { items: quickReplyItems } } : {}),
  };
}

function attachMatchingQuickReplies(messages, page) {
  const quickReplyItems = buildQuickReplyItemsFromWizardPage(page);
  if (!quickReplyItems.length) return messages;

  const next = [...messages];
  const targetIndex = next.map((message) => message?.type).lastIndexOf("text");

  if (targetIndex < 0) {
    next.push(buildWizardMenuMessage(page));
    return next;
  }

  next[targetIndex] = {
    ...next[targetIndex],
    quickReply: { items: quickReplyItems },
  };
  return next;
}

function renderChoiceSvg(slot, bounds, compact = false) {
  const palette = slotPalette(slot);
  const radius = 24;
  const iconSize = compact ? 88 : Math.min(116, bounds.height * 0.34);
  const iconX = bounds.x + (compact ? 82 : 94);
  const iconY = bounds.y + bounds.height / 2;
  const labelX = bounds.x + (compact ? 154 : 180);
  const maxChars = bounds.width > 1800 ? 34 : 20;
  const lines = wrapThaiLabel(slot.label, maxChars, 2);
  const fontSize = bounds.width > 1800 ? 94 : 78;
  const lineHeight = Math.round(fontSize * 1.12);
  const textTop = iconY - ((lines.length - 1) * lineHeight) / 2 + fontSize * 0.34;

  return `
    <rect x="${bounds.x + 5}" y="${bounds.y + 9}" width="${bounds.width - 10}" height="${bounds.height - 8}" rx="${radius}" fill="#D8E2DE" opacity="0.68"/>
    <rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height - 9}" rx="${radius}" fill="#FFFFFF" stroke="#D7E4DF" stroke-width="4"/>
    <rect x="${bounds.x}" y="${bounds.y}" width="18" height="${bounds.height - 9}" rx="9" fill="${palette.accent}"/>
    <circle cx="${iconX}" cy="${iconY}" r="${iconSize * 0.58}" fill="${palette.tint}"/>
    ${iconSvg(slot, iconX, iconY, iconSize, palette.accent)}
    ${lines
      .map(
        (line, index) => `<text x="${labelX}" y="${textTop + index * lineHeight}" font-family="Tahoma, 'Leelawadee UI', 'Noto Sans Thai', Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="${palette.text}">${escapeXml(line)}</text>`,
      )
      .join("")}
  `;
}

function renderControlSvg(slot, bounds) {
  const palette = slotPalette(slot);
  const iconSize = 62;
  const iconX = bounds.x + 68;
  const iconY = bounds.y + bounds.height / 2;
  const fontSize = 52;

  return `
    <rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" rx="22" fill="${palette.tint}" stroke="${palette.accent}" stroke-width="4"/>
    <circle cx="${iconX}" cy="${iconY}" r="39" fill="#FFFFFF" opacity="0.92"/>
    ${iconSvg(slot, iconX, iconY, iconSize, palette.accent)}
    <text x="${bounds.x + 122}" y="${iconY + 18}" font-family="Tahoma, 'Leelawadee UI', 'Noto Sans Thai', Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="${palette.text}">${escapeXml(slot.label)}</text>
  `;
}

function renderPagerSvg(slot, bounds) {
  const palette = slotPalette(slot);
  const isPrevious = slot.label === "หน้าก่อน";
  const arrow = isPrevious ? "‹" : "›";
  return `
    <rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" rx="59" fill="#FFFFFF" opacity="0.18"/>
    <text x="${bounds.x + bounds.width / 2}" y="${bounds.y + 78}" text-anchor="middle" font-family="Tahoma, 'Leelawadee UI', Arial, sans-serif" font-size="86" font-weight="700" fill="${palette.tint}">${arrow}</text>
  `;
}

function setImageCache(key, buffer) {
  if (imageCache.has(key)) imageCache.delete(key);
  imageCache.set(key, buffer);
  while (imageCache.size > IMAGE_CACHE_LIMIT) {
    imageCache.delete(imageCache.keys().next().value);
  }
}

export async function renderWizardMenuImage(page) {
  const visualKey = crypto
    .createHash("sha256")
    .update(JSON.stringify({ version: RENDER_VERSION, page }))
    .digest("hex");
  const cached = imageCache.get(visualKey);
  if (cached) return cached;

  const choiceLayout = choiceBounds(page.choiceSlots.length, Boolean(page.isMain));
  const controlLayout = controlBounds(page.controlSlots.length);
  const pagerLayout = pagerBounds(page);
  const subtitle = clamp(page.subtitle || "เลือกจากเมนูด้านล่าง", 90);
  const context = clamp(page.contextLabel || "", 50);

  const choiceSvg = page.choiceSlots
    .map((slot, index) => renderChoiceSvg(slot, choiceLayout[index], page.choiceSlots.length >= 5))
    .join("");
  const controlSvg = page.controlSlots
    .map((slot, index) => renderControlSvg(slot, controlLayout[index]))
    .join("");
  const pagerSvg = page.pagerSlots
    .map((slot, index) => renderPagerSvg(slot, pagerLayout[index]))
    .join("");

  const pageBadge = page.pageCount > 1
    ? `<rect x="1988" y="62" width="205" height="82" rx="41" fill="#FFFFFF" opacity="0.18"/>
       <text x="2090" y="118" text-anchor="middle" font-family="Tahoma, 'Leelawadee UI', 'Noto Sans Thai', Arial, sans-serif" font-size="40" font-weight="700" fill="#FFFFFF">${page.pageIndex + 1}/${page.pageCount}</text>`
    : "";

  const contextBadge = context
    ? `<rect x="${MENU_WIDTH - 760}" y="158" width="700" height="58" rx="29" fill="#FFFFFF" opacity="0.13"/>
       <text x="${MENU_WIDTH - 410}" y="199" text-anchor="middle" font-family="Tahoma, 'Leelawadee UI', 'Noto Sans Thai', Arial, sans-serif" font-size="34" font-weight="700" fill="#E8FFF6">${escapeXml(context)}</text>`
    : "";

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${MENU_WIDTH}" height="${MENU_HEIGHT}">
    <defs>
      <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#F6FBF9"/>
        <stop offset="100%" stop-color="#EDF5F1"/>
      </linearGradient>
      <linearGradient id="header" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#075E54"/>
        <stop offset="58%" stop-color="#087F5B"/>
        <stop offset="100%" stop-color="#16926F"/>
      </linearGradient>
    </defs>
    <rect width="${MENU_WIDTH}" height="${MENU_HEIGHT}" fill="url(#background)"/>
    <rect width="${MENU_WIDTH}" height="${HEADER_HEIGHT}" fill="url(#header)"/>
    <circle cx="2370" cy="-40" r="310" fill="#FFFFFF" opacity="0.06"/>
    <text x="70" y="99" font-family="Tahoma, 'Leelawadee UI', 'Noto Sans Thai', Arial, sans-serif" font-size="88" font-weight="700" fill="#FFFFFF">${escapeXml(clamp(page.title || "เมนูบริการ", 52))}</text>
    <text x="72" y="177" font-family="Tahoma, 'Leelawadee UI', 'Noto Sans Thai', Arial, sans-serif" font-size="43" font-weight="400" fill="#DDF5EC">${escapeXml(subtitle)}</text>
    ${pageBadge}
    ${contextBadge}
    ${pagerSvg}
    ${choiceSvg}
    ${controlSvg}
  </svg>`;

  const image = await sharp(Buffer.from(svg))
    .png({ compressionLevel: 6, palette: true, effort: 3, adaptiveFiltering: false })
    .toBuffer();

  setImageCache(visualKey, image);
  return image;
}

function buildAreas(page) {
  const choiceLayout = choiceBounds(page.choiceSlots.length, Boolean(page.isMain));
  const controlLayout = controlBounds(page.controlSlots.length);
  const pagerLayout = pagerBounds(page);

  return [
    ...page.choiceSlots.map((slot, index) => ({
      bounds: choiceLayout[index],
      action: slot.action,
    })),
    ...page.pagerSlots.map((slot, index) => ({
      bounds: pagerLayout[index],
      action: slot.action,
    })),
    ...page.controlSlots.map((slot, index) => ({
      bounds: controlLayout[index],
      action: slot.action,
    })),
  ];
}

function stableAction(action) {
  if (!action) return null;
  return Object.fromEntries(
    Object.entries(action)
      .filter(([, value]) => value !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

export function fingerprintWizardPage(page) {
  const canonical = {
    renderVersion: RENDER_VERSION,
    size: { width: MENU_WIDTH, height: MENU_HEIGHT },
    title: page.title,
    subtitle: page.subtitle,
    contextLabel: page.contextLabel,
    staticAlias: page.staticAlias,
    isMain: page.isMain,
    pageIndex: page.pageIndex,
    pageCount: page.pageCount,
    choices: page.choiceSlots.map((slot) => ({
      label: slot.label,
      action: stableAction(slot.action),
    })),
    pager: page.pagerSlots.map((slot) => ({
      label: slot.label,
      action: stableAction(slot.action),
    })),
    controls: page.controlSlots.map((slot) => ({
      label: slot.label,
      action: stableAction(slot.action),
    })),
  };

  return crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export async function ensureWizardSchema() {
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS line_runtime_rich_menus (
        line_user_id VARCHAR(64) NOT NULL,
        rich_menu_id VARCHAR(100) NOT NULL,
        menu_fingerprint CHAR(64) NULL,
        definition_json LONGTEXT NOT NULL,
        history_json LONGTEXT NULL,
        page_offset INT UNSIGNED NOT NULL DEFAULT 0,
        expires_at DATETIME NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (line_user_id),
        KEY idx_line_runtime_rich_menus_expires_at (expires_at),
        KEY idx_line_runtime_rich_menus_fingerprint (menu_fingerprint)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.execute(
      "ALTER TABLE line_runtime_rich_menus ADD COLUMN IF NOT EXISTS menu_fingerprint CHAR(64) NULL AFTER rich_menu_id",
    );
    await pool.execute(
      "ALTER TABLE line_runtime_rich_menus ADD INDEX IF NOT EXISTS idx_line_runtime_rich_menus_fingerprint (menu_fingerprint)",
    ).catch((error) => {
      if (!["ER_DUP_KEYNAME", "ER_PARSE_ERROR"].includes(error?.code)) throw error;
    });

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS line_rich_menu_assets (
        fingerprint CHAR(64) NOT NULL,
        rich_menu_id VARCHAR(100) NOT NULL,
        menu_name VARCHAR(300) NOT NULL,
        is_static TINYINT(1) NOT NULL DEFAULT 0,
        page_json LONGTEXT NOT NULL,
        expires_at DATETIME NOT NULL,
        last_used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (fingerprint),
        UNIQUE KEY uq_line_rich_menu_assets_id (rich_menu_id),
        KEY idx_line_rich_menu_assets_expires (expires_at),
        KEY idx_line_rich_menu_assets_last_used (last_used_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  })().catch((error) => {
    schemaPromise = null;
    throw error;
  });

  return schemaPromise;
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function loadRuntime(lineUserId) {
  await ensureWizardSchema();
  const [rows] = await pool.execute(
    `SELECT line_user_id AS lineUserId,
            rich_menu_id AS richMenuId,
            menu_fingerprint AS menuFingerprint,
            definition_json AS definitionJson,
            history_json AS historyJson,
            page_offset AS pageOffset
     FROM line_runtime_rich_menus
     WHERE line_user_id = ?
     LIMIT 1`,
    [lineUserId],
  );

  const row = rows[0];
  if (!row) return null;

  return {
    ...row,
    definition: parseJson(row.definitionJson, null),
    history: parseJson(row.historyJson, []),
  };
}

async function loadActiveSessionContext(lineUserId) {
  const [rows] = await pool.execute(
    `SELECT flow_type AS flowType, current_step AS currentStep
     FROM line_conversation_sessions
     WHERE line_user_id = ? AND expires_at > NOW()
     LIMIT 1`,
    [lineUserId],
  );

  const row = rows[0];
  if (!row) return { active: false, label: "" };
  const flowLabel = FLOW_LABELS[row.flowType] || row.flowType;
  const stepLabel = STEP_LABELS[row.currentStep] || row.currentStep;
  return {
    active: true,
    flowType: row.flowType,
    currentStep: row.currentStep,
    label: [flowLabel, stepLabel].filter(Boolean).join(" • "),
  };
}

async function saveRuntime(
  lineUserId,
  richMenuId,
  fingerprint,
  definition,
  history,
  offset,
) {
  await pool.execute(
    `INSERT INTO line_runtime_rich_menus
       (line_user_id, rich_menu_id, menu_fingerprint, definition_json,
        history_json, page_offset, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))
     ON DUPLICATE KEY UPDATE
       rich_menu_id = VALUES(rich_menu_id),
       menu_fingerprint = VALUES(menu_fingerprint),
       definition_json = VALUES(definition_json),
       history_json = VALUES(history_json),
       page_offset = VALUES(page_offset),
       expires_at = VALUES(expires_at),
       updated_at = NOW()`,
    [
      lineUserId,
      richMenuId,
      fingerprint,
      JSON.stringify(definition),
      JSON.stringify(history.slice(-MAX_HISTORY)),
      offset,
      RUNTIME_TTL_DAYS,
    ],
  );
}

async function loadAsset(fingerprint) {
  await ensureWizardSchema();
  const [rows] = await pool.execute(
    `SELECT fingerprint,
            rich_menu_id AS richMenuId,
            menu_name AS menuName,
            is_static AS isStatic
     FROM line_rich_menu_assets
     WHERE fingerprint = ? AND expires_at > NOW()
     LIMIT 1`,
    [fingerprint],
  );
  return rows[0] || null;
}

async function touchAsset(fingerprint, isStatic) {
  await pool.execute(
    `UPDATE line_rich_menu_assets
     SET last_used_at = NOW(),
         expires_at = DATE_ADD(NOW(), INTERVAL ? DAY)
     WHERE fingerprint = ?`,
    [isStatic ? STATIC_ASSET_TTL_DAYS : DYNAMIC_ASSET_TTL_DAYS, fingerprint],
  );
}

async function invalidateAsset(fingerprint, richMenuId = "") {
  await pool.execute(
    "DELETE FROM line_rich_menu_assets WHERE fingerprint = ?",
    [fingerprint],
  );
  if (richMenuId) await deleteRichMenu(richMenuId);
}

async function createAsset(page, fingerprint, isStatic) {
  const image = await renderWizardMenuImage(page);
  if (image.length > 1024 * 1024) {
    throw new Error(`รูป Rich Menu มีขนาดเกิน 1 MB (${image.length} bytes)`);
  }

  const menuName = `PRMS ${RENDER_VERSION} ${isStatic ? "static" : "dynamic"} ${fingerprint.slice(0, 12)}`;
  const created = await lineRequest("POST", "/v2/bot/richmenu", {
    size: { width: MENU_WIDTH, height: MENU_HEIGHT },
    selected: true,
    name: menuName,
    chatBarText: "เมนูบริการ",
    areas: buildAreas(page),
  });

  const richMenuId = created?.richMenuId;
  if (!richMenuId) throw new Error("LINE ไม่ส่ง Rich Menu ID กลับมา");

  try {
    await uploadMenuImage(richMenuId, image);
    await pool.execute(
      `INSERT INTO line_rich_menu_assets
         (fingerprint, rich_menu_id, menu_name, is_static, page_json,
          expires_at, last_used_at)
       VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY), NOW())`,
      [
        fingerprint,
        richMenuId,
        menuName,
        isStatic ? 1 : 0,
        JSON.stringify(page),
        isStatic ? STATIC_ASSET_TTL_DAYS : DYNAMIC_ASSET_TTL_DAYS,
      ],
    );
  } catch (error) {
    if (error?.code === "ER_DUP_ENTRY") {
      await deleteRichMenu(richMenuId);
      const existing = await loadAsset(fingerprint);
      if (existing) return existing;
    }
    await deleteRichMenu(richMenuId);
    throw error;
  }

  return { fingerprint, richMenuId, menuName, isStatic: isStatic ? 1 : 0 };
}

async function getOrCreateAsset(page, fingerprint) {
  const existing = await loadAsset(fingerprint);
  if (existing) {
    await touchAsset(fingerprint, Boolean(existing.isStatic));
    return existing;
  }

  if (assetCreationLocks.has(fingerprint)) {
    return assetCreationLocks.get(fingerprint);
  }

  const isStatic = page.cacheScope === "static";
  const promise = createAsset(page, fingerprint, isStatic)
    .finally(() => assetCreationLocks.delete(fingerprint));
  assetCreationLocks.set(fingerprint, promise);
  return promise;
}

function enqueueUser(lineUserId, task) {
  const previous = userQueues.get(lineUserId) || Promise.resolve();
  const current = previous
    .catch(() => undefined)
    .then(task)
    .finally(() => {
      if (userQueues.get(lineUserId) === current) userQueues.delete(lineUserId);
    });
  userQueues.set(lineUserId, current);
  return current;
}

function historyEntryIdentity(entry) {
  return `${entry?.definition?.key || ""}:${Number(entry?.offset || 0)}`;
}

async function showWizardMenuInternal(lineUserId, definition, options = {}) {
  const startedAt = performance.now();
  const runtime = await loadRuntime(lineUserId);
  const sessionContext = options.sessionContext || await loadActiveSessionContext(lineUserId);
  const activeSession = options.activeSession ?? sessionContext.active;
  let history = options.resetHistory ? [] : [...(runtime?.history || [])];

  if (
    options.pushHistory !== false &&
    runtime?.definition &&
    !runtime.definition.isMain
  ) {
    const entry = {
      definition: runtime.definition,
      offset: Number(runtime.pageOffset || 0),
    };
    const previous = history.at(-1);
    if (historyEntryIdentity(previous) !== historyEntryIdentity(entry)) {
      history.push(entry);
    }
  }

  const enrichedDefinition = {
    ...definition,
    contextLabel: definition.contextLabel || sessionContext.label || "",
  };
  const offset = Math.max(0, Number(options.offset) || 0);
  const page = buildWizardPage(enrichedDefinition, offset, activeSession);
  const fingerprint = fingerprintWizardPage(page);

  if (
    runtime?.richMenuId &&
    runtime?.menuFingerprint === fingerprint
  ) {
    await saveRuntime(
      lineUserId,
      runtime.richMenuId,
      fingerprint,
      enrichedDefinition,
      history,
      page.offset,
    );
    console.info("[rich-menu-v12] reused current", {
      key: enrichedDefinition.key,
      ms: Math.round(performance.now() - startedAt),
    });
    return true;
  }

  let asset = await getOrCreateAsset(page, fingerprint);
  if (page.staticAlias) {
    await ensureRichMenuAlias(page.staticAlias, asset.richMenuId);
  }

  try {
    await linkMenuToUser(lineUserId, asset.richMenuId);
  } catch (error) {
    if (Number(error?.status) !== 404) throw error;
    await invalidateAsset(fingerprint, asset.richMenuId);
    asset = await getOrCreateAsset(page, fingerprint);
    if (page.staticAlias) {
      await ensureRichMenuAlias(page.staticAlias, asset.richMenuId);
    }
    await linkMenuToUser(lineUserId, asset.richMenuId);
  }

  await Promise.all([
    saveRuntime(
      lineUserId,
      asset.richMenuId,
      fingerprint,
      enrichedDefinition,
      history,
      page.offset,
    ),
    touchAsset(fingerprint, Boolean(asset.isStatic)),
  ]);

  console.info("[rich-menu-v12] linked", {
    key: enrichedDefinition.key,
    fingerprint: fingerprint.slice(0, 10),
    ms: Math.round(performance.now() - startedAt),
  });

  return true;
}

export async function showWizardMenu(lineUserId, definition, options = {}) {
  if (!/^U[0-9a-f]{32}$/i.test(String(lineUserId || ""))) return false;
  return enqueueUser(lineUserId, () => showWizardMenuInternal(lineUserId, definition, options));
}

function choice(label, dataOrAction) {
  return {
    label,
    action: typeof dataOrAction === "string"
      ? postbackAction(label, dataOrAction)
      : dataOrAction,
  };
}

function staticSwitchChoice(label, key) {
  const alias = STATIC_ALIAS_BY_KEY[`submenu-${key}-v12`];
  return choice(label, richMenuSwitchAction(label, alias, `wizard=switched&target=${key}`));
}

const STATIC_SUBMENUS = Object.freeze({
  pets: {
    key: "submenu-pets-v12",
    title: "สัตว์ของฉัน",
    subtitle: "ดู เพิ่ม หรือแก้ข้อมูลสัตว์",
    cacheScope: "static",
    staticAlias: STATIC_ALIAS_BY_KEY["submenu-pets-v12"],
    returnAlias: MAIN_OWNER_ALIAS,
    choices: [
      choice("ดูสัตว์ทั้งหมด", "action=pets"),
      choice("เพิ่มสัตว์ใหม่", "action=register"),
      choice("แก้ข้อมูลสัตว์", "action=pet_update"),
    ],
  },
  health: {
    key: "submenu-health-v12",
    title: "สุขภาพสัตว์",
    subtitle: "บันทึกวัคซีนและการทำหมัน",
    cacheScope: "static",
    staticAlias: STATIC_ALIAS_BY_KEY["submenu-health-v12"],
    returnAlias: MAIN_OWNER_ALIAS,
    choices: [
      choice("แจ้งวัคซีน", "action=vaccination"),
      choice("แจ้งทำหมัน", "action=sterilization"),
      choice("ดูข้อมูลสุขภาพ", "action=pets"),
    ],
  },
  status: {
    key: "submenu-status-v12",
    title: "แจ้งสถานะสัตว์",
    subtitle: "เลือกเหตุการณ์ที่ต้องการแจ้ง",
    cacheScope: "static",
    staticAlias: STATIC_ALIAS_BY_KEY["submenu-status-v12"],
    returnAlias: MAIN_OWNER_ALIAS,
    choices: [
      choice("แจ้งสูญหาย", "action=status_pick_MISSING"),
      choice("แจ้งพบแล้ว", "action=status_pick_ACTIVE"),
      choice("แจ้งเสียชีวิต", "action=status_pick_DECEASED"),
      choice("โอนเจ้าของ", "action=transfer_select"),
    ],
  },
  requests: {
    key: "submenu-requests-v12",
    title: "คำขอของฉัน",
    subtitle: "ตรวจสถานะและส่งข้อมูลเพิ่มเติม",
    cacheScope: "static",
    staticAlias: STATIC_ALIAS_BY_KEY["submenu-requests-v12"],
    returnAlias: MAIN_OWNER_ALIAS,
    choices: [
      choice("ต้องส่งข้อมูลเพิ่ม", "action=requests_need_info"),
      choice("กำลังตรวจสอบ", "action=requests_pending"),
      choice("ดำเนินการเสร็จแล้ว", "action=requests_finished"),
      choice("คำขอทั้งหมด", "action=requests_all"),
      choice("ติดตามเลขอ้างอิง", "action=track"),
    ],
  },
  owner: {
    key: "submenu-owner-v12",
    title: "ข้อมูลเจ้าของ",
    subtitle: "ดูและแก้ข้อมูลที่ใช้ในทะเบียน",
    cacheScope: "static",
    staticAlias: STATIC_ALIAS_BY_KEY["submenu-owner-v12"],
    returnAlias: MAIN_OWNER_ALIAS,
    choices: [
      choice("ดูหรือแก้ข้อมูล", "action=profile"),
      choice("แก้ตำแหน่งบ้าน", "action=location"),
      choice("ติดต่อเทศบาล", "action=contact"),
    ],
  },
});

export function buildStaticSubmenuDefinition(key) {
  const definition = STATIC_SUBMENUS[String(key || "").toLowerCase()];
  return definition ? structuredClone(definition) : null;
}

export function buildTextEntryWizardDefinition() {
  return {
    key: "input-v12",
    title: "กรอกข้อมูล",
    subtitle: "กดพิมพ์ข้อมูล แล้วส่งข้อความตามคำถามในแชต",
    cacheScope: "static",
    staticAlias: STATIC_ALIAS_BY_KEY["input-v12"],
    choices: [
      choice("พิมพ์ข้อมูล", keyboardAction()),
    ],
  };
}

export function buildMainWizardDefinition(state) {
  if (!state?.linked) {
    return {
      key: "main-guest-v12",
      title: "เริ่มใช้ ThaPho PET",
      subtitle: "ลงทะเบียนหรือเชื่อมข้อมูลเดิมกับ LINE",
      cacheScope: "static",
      staticAlias: STATIC_ALIAS_BY_KEY["main-guest-v12"],
      isMain: true,
      choices: [
        choice("ลงทะเบียนสัตว์", "action=register"),
        choice("เชื่อมทะเบียนเดิม", "action=link"),
        choice("ติดตามคำขอ", "action=track"),
        choice("วิธีใช้งาน", "action=services"),
        choice("ติดต่อเทศบาล", "action=contact"),
      ],
    };
  }

  return {
    key: "main-owner-v12",
    title: "เมนูหลัก ThaPho PET",
    subtitle: "เลือกงานที่ต้องการทำ",
    cacheScope: "static",
    isMain: true,
    staticAlias: STATIC_ALIAS_BY_KEY["main-owner-v12"],
    choices: [
      staticSwitchChoice("สัตว์ของฉัน", "pets"),
      staticSwitchChoice("สุขภาพสัตว์", "health"),
      staticSwitchChoice("แจ้งสถานะสัตว์", "status"),
      staticSwitchChoice("คำขอของฉัน", "requests"),
      staticSwitchChoice("ข้อมูลเจ้าของ", "owner"),
      choice("รายการที่ต้องทำ", "action=action_center"),
    ],
  };
}

export async function warmWizardRichMenus() {
  if (staticWarmPromise) return staticWarmPromise;

  staticWarmPromise = (async () => {
    await ensureWizardSchema();
    const definitions = [
      buildMainWizardDefinition({ linked: false }),
      buildMainWizardDefinition({ linked: true }),
      buildTextEntryWizardDefinition(),
      ...Object.values(STATIC_SUBMENUS).map((item) => structuredClone(item)),
    ];

    const warmed = [];
    for (const definition of definitions) {
      const page = buildWizardPage(definition, 0, false);
      const fingerprint = fingerprintWizardPage(page);
      const asset = await getOrCreateAsset(page, fingerprint);
      if (page.staticAlias) {
        await ensureRichMenuAlias(page.staticAlias, asset.richMenuId);
      }
      warmed.push({ key: definition.key, richMenuId: asset.richMenuId, fingerprint, alias: page.staticAlias });
    }
    return warmed;
  })().catch((error) => {
    staticWarmPromise = null;
    throw error;
  });

  return staticWarmPromise;
}

export async function showWizardMainMenu(lineUserId, state) {
  await warmWizardRichMenus();
  return showWizardMenu(lineUserId, buildMainWizardDefinition(state), {
    pushHistory: false,
    resetHistory: true,
    activeSession: false,
    sessionContext: { active: false, label: "" },
  });
}

async function showPreviousWizard(lineUserId, state) {
  const runtime = await loadRuntime(lineUserId);
  const history = [...(runtime?.history || [])];
  const previous = history.pop();

  if (!previous?.definition) {
    return showWizardMainMenu(lineUserId, state);
  }

  await showWizardMenu(lineUserId, previous.definition, {
    offset: previous.offset || 0,
    pushHistory: false,
    resetHistory: false,
  });

  await pool.execute(
    `UPDATE line_runtime_rich_menus
     SET history_json = ?, updated_at = NOW()
     WHERE line_user_id = ?`,
    [JSON.stringify(history), lineUserId],
  );
  return true;
}

function definitionForSwitchedMenu(target, state) {
  if (target === "main") return buildMainWizardDefinition(state);
  return buildStaticSubmenuDefinition(target);
}

async function loadRuntimeMenuContext(lineUserId, state, requestedOffset = null) {
  const [runtime, sessionContext] = await Promise.all([
    loadRuntime(lineUserId),
    loadActiveSessionContext(lineUserId),
  ]);
  const definition = runtime?.definition || buildMainWizardDefinition(state);
  return {
    definition,
    offset: requestedOffset == null ? Number(runtime?.pageOffset || 0) : requestedOffset,
    sessionContext,
  };
}

function menuControlResult({
  definition,
  lineUserId,
  acknowledgement,
  activeSession = false,
  offset = 0,
  sessionContext = undefined,
  richMenuTask,
}) {
  const page = buildWizardPage(definition, offset, activeSession);
  return {
    handled: true,
    preserveRichMenu: true,
    messages: [buildWizardMenuMessage(page, acknowledgement)],
    richMenuTask: richMenuTask || showWizardMenu(lineUserId, definition, {
      activeSession,
      sessionContext,
      offset: page.offset,
      pushHistory: false,
    }),
  };
}

export async function handleWizardControl(event, state) {
  if (event?.type !== "postback") return null;

  const params = new URLSearchParams(String(event.postback?.data || ""));
  const wizard = params.get("wizard");
  const lineUserId = String(event.source?.userId || "");

  if (!wizard) return null;

  if (wizard === "switched") {
    const target = String(params.get("target") || "").toLowerCase();
    const definition = definitionForSwitchedMenu(target, state);
    if (!definition) {
      return {
        handled: true,
        preserveRichMenu: true,
        messages: [{ type: "text", text: "เปิดเมนูแล้ว เลือกรายการที่ต้องการได้จาก Rich Menu ด้านล่าง" }],
      };
    }
    const isMain = target === "main";
    return menuControlResult({
      definition,
      lineUserId,
      acknowledgement: `เปิดเมนู ${definition.title} แล้ว`,
      richMenuTask: isMain
        ? showWizardMainMenu(lineUserId, state)
        : showWizardMenu(lineUserId, definition, {
            activeSession: false,
            sessionContext: { active: false, label: "" },
            pushHistory: false,
          }),
    });
  }

  if (wizard === "input") {
    const context = await loadRuntimeMenuContext(lineUserId, state);
    return menuControlResult({
      ...context,
      lineUserId,
      activeSession: context.sessionContext.active,
      acknowledgement: "พร้อมรับข้อมูลแล้ว พิมพ์คำตอบแล้วกดส่งได้เลย",
    });
  }

  if (wizard === "message") {
    return { handled: false, syntheticText: params.get("text") || "" };
  }

  if (wizard === "home") {
    const definition = buildMainWizardDefinition(state);
    return menuControlResult({
      definition,
      lineUserId,
      acknowledgement: "กลับสู่เมนูหลักแล้ว",
      richMenuTask: showWizardMainMenu(lineUserId, state),
    });
  }

  if (wizard === "refresh") {
    const context = await loadRuntimeMenuContext(lineUserId, state);
    return menuControlResult({
      ...context,
      lineUserId,
      activeSession: context.sessionContext.active,
      acknowledgement: "อัปเดตเมนูแล้ว",
    });
  }

  if (wizard === "page") {
    const context = await loadRuntimeMenuContext(
      lineUserId,
      state,
      Number(params.get("offset") || 0),
    );
    const page = buildWizardPage(
      context.definition,
      context.offset,
      context.sessionContext.active,
    );
    return menuControlResult({
      ...context,
      lineUserId,
      activeSession: context.sessionContext.active,
      acknowledgement: `แสดงรายการหน้า ${page.pageIndex + 1} จาก ${page.pageCount}`,
    });
  }

  if (wizard === "back") {
    const [runtime, sessionContext] = await Promise.all([
      loadRuntime(lineUserId),
      loadActiveSessionContext(lineUserId),
    ]);
    const previous = runtime?.history?.at(-1);
    const definition = previous?.definition || buildMainWizardDefinition(state);
    return menuControlResult({
      definition,
      lineUserId,
      activeSession: sessionContext.active,
      sessionContext,
      offset: Number(previous?.offset || 0),
      acknowledgement: "กลับไปยังเมนูก่อนหน้าแล้ว",
      richMenuTask: showPreviousWizard(lineUserId, state),
    });
  }

  return null;
}

function definitionKey(prompt, choices, suppliedKey = "") {
  if (suppliedKey) return suppliedKey;
  const signature = JSON.stringify({
    title: prompt.title,
    actions: choices.map((item) => actionIdentity(item.action)),
  });
  return `flow-${crypto.createHash("sha1").update(signature).digest("hex").slice(0, 14)}`;
}

function isKeyboardOnlySessionChoice(choiceItem) {
  const action = choiceItem?.action || choiceItem;
  if (action?.type === "postback" && action.inputOption === "openKeyboard") return true;

  // Older prompt helpers still attach a cancel quick reply. The static input
  // menu already contains cancellation, so it does not need a unique menu.
  return action?.type === "postback" && action.data === "session=cancel";
}

function shouldUseStaticTextEntryMenu(activeSession, choices) {
  return (
    activeSession &&
    choices.some((choiceItem) => {
      const action = choiceItem?.action || choiceItem;
      return action?.type === "postback" && action.inputOption === "openKeyboard";
    }) &&
    choices.every(isKeyboardOnlySessionChoice)
  );
}

export async function decorateNativeCitizenResultWithRichMenu({
  lineUserId,
  result,
  state,
}) {
  const safeResult = result || { messages: [] };
  const rawMessages = Array.isArray(safeResult.messages) ? safeResult.messages : [];
  const prompt = firstPromptLine(rawMessages);
  const sessionContext = await loadActiveSessionContext(lineUserId);
  const activeSession = sessionContext.active;

  if (safeResult.refreshState) {
    const definition = buildMainWizardDefinition(state);
    const page = buildWizardPage(definition, 0, false);
    return {
      ...safeResult,
      messages: attachMatchingQuickReplies(
        filterMessagesForExperience(rawMessages, {
          choices: [],
          activeSession: false,
          refreshState: true,
        }),
        page,
      ),
      preserveRichMenu: true,
      richMenuTask: showWizardMainMenu(lineUserId, state),
    };
  }

  let definition = safeResult.wizardDefinition
    ? structuredClone(safeResult.wizardDefinition)
    : null;
  let choices = definition?.choices || extractWizardChoicesFromMessages(rawMessages);

  if (activeSession && looksLikeTextPrompt(prompt.fullText)) {
    const hasKeyboard = choices.some(
      (choiceItem) =>
        choiceItem.action?.type === "postback" &&
        choiceItem.action?.inputOption === "openKeyboard",
    );

    if (!hasKeyboard) {
      choices.unshift({ label: "พิมพ์ข้อมูล", action: keyboardAction() });
    }
  }

  if (!choices.length && activeSession) {
    choices.push({ label: "พิมพ์ข้อมูล", action: keyboardAction() });
  }

  if (!choices.length && !definition) {
    return {
      ...safeResult,
      messages: attachMatchingQuickReplies(
        filterMessagesForExperience(rawMessages, {
          choices,
          activeSession,
          refreshState: false,
        }),
        buildWizardPage(buildMainWizardDefinition(state), 0, false),
      ),
      preserveRichMenu: true,
    };
  }

  // Text-entry steps repeat frequently (name, address, notes, etc.). Reusing
  // one pre-warmed menu prevents a new image upload and Rich Menu creation for
  // every field, while the question itself remains clearly visible in chat.
  if (shouldUseStaticTextEntryMenu(activeSession, choices)) {
    definition = buildTextEntryWizardDefinition();
    choices = definition.choices;
  }

  definition = {
    ...(definition || {}),
    key: definitionKey(prompt, choices, definition?.key),
    title: definition?.title || prompt.title || "เลือกขั้นตอน",
    subtitle:
      definition?.subtitle ||
      prompt.subtitle ||
      (activeSession ? "เลือกหรือกรอกข้อมูลตามขั้นตอน" : "เลือกเมนูที่ต้องการ"),
    contextLabel: definition?.contextLabel || sessionContext.label,
    choices,
    isMain: Boolean(definition?.isMain),
    cacheScope: definition?.cacheScope || "dynamic",
  };

  const page = buildWizardPage(definition, 0, activeSession);
  const richMenuTask = showWizardMenu(lineUserId, definition, {
    activeSession,
    sessionContext,
    pushHistory: true,
  });

  return {
    ...safeResult,
    messages: attachMatchingQuickReplies(
      filterMessagesForExperience(rawMessages, {
        choices,
        activeSession,
        refreshState: false,
      }),
      page,
    ),
    preserveRichMenu: true,
    richMenuTask,
  };
}

export async function cleanupWizardRichMenus() {
  await ensureWizardSchema();

  const [runtimeResult] = await pool.execute(
    "DELETE FROM line_runtime_rich_menus WHERE expires_at <= NOW()",
  );

  const [expiredAssets] = await pool.execute(
    `SELECT a.fingerprint, a.rich_menu_id AS richMenuId
     FROM line_rich_menu_assets a
     LEFT JOIN line_runtime_rich_menus r
       ON r.menu_fingerprint = a.fingerprint
     WHERE a.expires_at <= NOW() AND a.is_static = 0 AND r.line_user_id IS NULL
     ORDER BY a.last_used_at ASC
     LIMIT 100`,
  );

  for (const asset of expiredAssets) {
    await deleteRichMenu(asset.richMenuId);
    await pool.execute(
      "DELETE FROM line_rich_menu_assets WHERE fingerprint = ?",
      [asset.fingerprint],
    );
  }

  const [[countRow]] = await pool.execute(
    "SELECT COUNT(*) AS total FROM line_rich_menu_assets",
  );
  const overflow = Math.max(0, Number(countRow?.total || 0) - ASSET_SOFT_LIMIT);
  let overflowDeleted = 0;

  if (overflow > 0) {
    const [oldAssets] = await pool.execute(
      `SELECT a.fingerprint, a.rich_menu_id AS richMenuId
       FROM line_rich_menu_assets a
       LEFT JOIN line_runtime_rich_menus r
         ON r.menu_fingerprint = a.fingerprint
       WHERE a.is_static = 0 AND r.line_user_id IS NULL
       ORDER BY a.last_used_at ASC
       LIMIT ${Math.min(overflow, 100)}`,
    );

    for (const asset of oldAssets) {
      await deleteRichMenu(asset.richMenuId);
      await pool.execute(
        "DELETE FROM line_rich_menu_assets WHERE fingerprint = ?",
        [asset.fingerprint],
      );
      overflowDeleted += 1;
    }
  }

  return {
    deletedRuntimeMenus: Number(runtimeResult.affectedRows || 0),
    deletedCachedMenus: expiredAssets.length + overflowDeleted,
  };
}
