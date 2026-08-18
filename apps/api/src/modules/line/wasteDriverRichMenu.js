import sharp from "sharp";

import { lineChannelSettings } from "./lineChannelSettings.js";

const LINE_API_BASE = "https://api.line.me";
const LINE_DATA_BASE = "https://api-data.line.me";
const MENU_WIDTH = 2500;
const MENU_HEIGHT = 1686;
const MENU_ALIAS = "waste-driver-main-v1";
const REQUEST_TIMEOUT_MS = 15_000;

let setupPromise = null;

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function action(label, data, displayText = label) {
  return {
    type: "postback",
    label,
    data,
    displayText,
  };
}

export function buildWasteDriverRichMenuDefinition() {
  const cards = [
    {
      title: "งานของฉัน",
      subtitle: "ดูแผนที่ได้รับมอบหมาย",
      icon: "งาน",
      color: "#087F5B",
      action: action("งานของฉัน", "waste=driver_jobs", "ดูแผนปฏิบัติงานเก็บขยะที่ได้รับมอบหมาย"),
    },
    {
      title: "งานวันนี้",
      subtitle: "ดูรอบเก็บขยะของวันนี้",
      icon: "วันนี้",
      color: "#0D6E8A",
      action: action("งานวันนี้", "waste=driver_jobs_today", "ดูงานเก็บขยะวันนี้"),
    },
    {
      title: "ยืนยันตัวตน",
      subtitle: "เชื่อมบัญชีพนักงาน",
      icon: "ยืนยัน",
      color: "#547A12",
      action: action("ยืนยันตัวตน", "waste=driver_link", "ยืนยันตัวตนพนักงานประจำรถขยะ"),
    },
    {
      title: "วิธีใช้งาน",
      subtitle: "ขั้นตอนปฏิบัติงานและแจ้งเหตุ",
      icon: "ช่วย",
      color: "#A55A0A",
      action: action("วิธีใช้งาน", "waste=driver_help", "วิธีใช้งานระบบพนักงานประจำรถขยะ"),
    },
  ];

  return {
    size: { width: MENU_WIDTH, height: MENU_HEIGHT },
    selected: true,
    name: "Smart Tha Pho | เมนูพนักงานประจำรถขยะ",
    chatBarText: "เมนูพนักงาน",
    cards,
    areas: cards.map((card, index) => ({
      bounds: {
        x: index % 2 === 0 ? 0 : 1250,
        y: index < 2 ? 0 : 843,
        width: 1250,
        height: 843,
      },
      action: card.action,
    })),
  };
}

export async function renderWasteDriverRichMenuImage(definition = buildWasteDriverRichMenuDefinition()) {
  const [topLeft, topRight, bottomLeft, bottomRight] = definition.cards;
  const cardSvg = (card, x, y, number) => `
    <g>
      <rect x="${x + 52}" y="${y + 54}" width="1146" height="733" rx="46" fill="#FFFFFF"/>
      <rect x="${x + 52}" y="${y + 54}" width="20" height="733" rx="10" fill="${card.color}"/>
      <circle cx="${x + 170}" cy="${y + 188}" r="76" fill="${card.color}" opacity="0.12"/>
      <text x="${x + 170}" y="${y + 204}" text-anchor="middle" font-family="Tahoma, 'Leelawadee UI', 'Noto Sans Thai', Arial, sans-serif" font-size="34" font-weight="700" fill="${card.color}">${escapeXml(card.icon)}</text>
      <text x="${x + 286}" y="${y + 190}" font-family="Tahoma, 'Leelawadee UI', 'Noto Sans Thai', Arial, sans-serif" font-size="70" font-weight="700" fill="#13382D">${escapeXml(card.title)}</text>
      <text x="${x + 286}" y="${y + 263}" font-family="Tahoma, 'Leelawadee UI', 'Noto Sans Thai', Arial, sans-serif" font-size="38" fill="#5C756D">${escapeXml(card.subtitle)}</text>
      <line x1="${x + 110}" y1="${y + 410}" x2="${x + 1136}" y2="${y + 410}" stroke="#E3EEE9" stroke-width="4"/>
      <text x="${x + 110}" y="${y + 535}" font-family="Tahoma, 'Leelawadee UI', 'Noto Sans Thai', Arial, sans-serif" font-size="36" font-weight="700" fill="${card.color}">แตะเพื่อเลือก</text>
      <circle cx="${x + 1088}" cy="${y + 518}" r="42" fill="${card.color}"/>
      <text x="${x + 1088}" y="${y + 531}" text-anchor="middle" font-family="Arial, sans-serif" font-size="40" font-weight="700" fill="#FFFFFF">${number}</text>
    </g>`;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${MENU_WIDTH}" height="${MENU_HEIGHT}">
      <defs>
        <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#EAF8F1"/>
          <stop offset="100%" stop-color="#F7FBF8"/>
        </linearGradient>
      </defs>
      <rect width="${MENU_WIDTH}" height="${MENU_HEIGHT}" fill="url(#background)"/>
      <rect x="0" y="0" width="${MENU_WIDTH}" height="16" fill="#92D21F"/>
      ${cardSvg(topLeft, 0, 0, "1")}
      ${cardSvg(topRight, 1250, 0, "2")}
      ${cardSvg(bottomLeft, 0, 843, "3")}
      ${cardSvg(bottomRight, 1250, 843, "4")}
    </svg>`;

  return sharp(Buffer.from(svg))
    .png({ compressionLevel: 6, palette: true, effort: 3, adaptiveFiltering: false })
    .toBuffer();
}

async function request(channel, method, endpoint, { body, fetchImplementation = fetch } = {}) {
  const response = await fetchImplementation(`${LINE_API_BASE}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${channel.channelAccessToken}`,
      ...(body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const raw = await response.text();
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = { raw: raw.slice(0, 300) };
  }
  if (!response.ok) {
    const error = new Error(`LINE Rich Menu ${method} ${endpoint} failed (${response.status})`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function uploadImage(channel, richMenuId, image, fetchImplementation = fetch) {
  const response = await fetchImplementation(
    `${LINE_DATA_BASE}/v2/bot/richmenu/${encodeURIComponent(richMenuId)}/content`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${channel.channelAccessToken}`,
        "Content-Type": "image/png",
      },
      body: image,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );
  if (!response.ok) {
    const error = new Error(`LINE Rich Menu image upload failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
}

async function configureWasteDriverRichMenu({ fetchImplementation = fetch } = {}) {
  const channel = await lineChannelSettings.get("DRIVER");
  if (!channel.channelAccessToken) return { status: "SKIPPED", reason: "NO_DRIVER_CHANNEL_ACCESS_TOKEN" };

  let richMenuId = "";
  try {
    const alias = await request(channel, "GET", `/v2/bot/richmenu/alias/${MENU_ALIAS}`, { fetchImplementation });
    richMenuId = String(alias?.richMenuId || "");
  } catch (error) {
    if (Number(error?.status) !== 404) throw error;
  }

  let created = false;
  if (!richMenuId) {
    const definition = buildWasteDriverRichMenuDefinition();
    const image = await renderWasteDriverRichMenuImage(definition);
    if (image.length > 1024 * 1024) throw new Error(`รูป Rich Menu พนักงานมีขนาดเกิน 1 MB (${image.length} bytes)`);
    const menu = await request(channel, "POST", "/v2/bot/richmenu", {
      body: {
        size: definition.size,
        selected: definition.selected,
        name: definition.name,
        chatBarText: definition.chatBarText,
        areas: definition.areas,
      },
      fetchImplementation,
    });
    richMenuId = String(menu?.richMenuId || "");
    if (!richMenuId) throw new Error("LINE ไม่ส่ง Rich Menu ID ของพนักงานกลับมา");
    await uploadImage(channel, richMenuId, image, fetchImplementation);
    await request(channel, "POST", "/v2/bot/richmenu/alias", {
      body: { richMenuAliasId: MENU_ALIAS, richMenuId },
      fetchImplementation,
    });
    created = true;
  }

  await request(channel, "POST", `/v2/bot/user/all/richmenu/${encodeURIComponent(richMenuId)}`, { fetchImplementation });
  return { status: created ? "CREATED" : "READY", richMenuId };
}

// This is intentionally a channel-wide default menu.  It is safe for guests:
// “ยืนยันตัวตน” begins FR2, while all other actions explain how to continue.
export async function ensureWasteDriverRichMenu(options = {}) {
  if (setupPromise) return setupPromise;
  setupPromise = configureWasteDriverRichMenu(options).finally(() => {
    setupPromise = null;
  });
  return setupPromise;
}

export { MENU_ALIAS as wasteDriverRichMenuAlias };
