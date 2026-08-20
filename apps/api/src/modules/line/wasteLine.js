import crypto from "node:crypto";

import { config } from "../../core/config.js";
import { pool, withTransaction } from "../../core/db.js";
import { WasteCitizenScheduleService } from "../waste/application/WasteCitizenScheduleService.js";
import { wasteLineShortcuts } from "../waste/application/WasteLineShortcutCatalog.js";
import { WasteTrackingTokenService } from "../waste/application/WasteTrackingTokenService.js";
import {
  WASTE_LINE_CARD_COLORS as LINE_CARD_COLORS,
  cardButtonsFromActions,
  lineCardBubble,
  lineCardButton,
  lineCardRow,
  lineCardText,
} from "./WasteLineCard.js";

const SESSION_MINUTES = 30;
const DRIVER_INCIDENT_TYPES = new Set([
  "VEHICLE_BREAKDOWN",
  "ACCIDENT",
  "ROAD_CLOSED",
  "ACCESS_BLOCKED",
  "OTHER",
]);
const DRIVER_INCIDENT_LABELS = Object.freeze({
  VEHICLE_BREAKDOWN: "รถขัดข้อง",
  ACCIDENT: "อุบัติเหตุ",
  ROAD_CLOSED: "ถนนปิด",
  ACCESS_BLOCKED: "เข้าพื้นที่ไม่ได้",
  OTHER: "เหตุอื่น ๆ",
});
const citizenScheduleService = new WasteCitizenScheduleService({ database: pool });
const trackingTokenService = new WasteTrackingTokenService({ secret: config.jwtSecret });

function textMessage(text, quickReplyItems = []) {
  return buildWasteLineTextCard(text, quickReplyItems);
}

function postbackAction(label, data, displayText = label) {
  return wasteLineShortcuts.postback(label, data, displayText);
}

function uriAction(label, uri) {
  return wasteLineShortcuts.uri(label, uri);
}

function trackingUrl(plan, lineUserId, driverId) {
  const token = trackingTokenService.issue({ planId: plan.id, driverId, lineUserId });
  return `${config.wasteDriverTrackingUrl.replace(/\/+$/, "")}/#/driver-gps?token=${encodeURIComponent(token)}`;
}

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

// LINE shows a postback's displayText in the chat.  Supporting that visible
// text as a command as well means a user can tap it again, type it manually,
// or use the persistent Rich Menu without reaching a dead end.
const DISPLAY_TEXT_COMMANDS = Object.freeze({
  CITIZEN: Object.freeze({
    "ตารางกำหนดการเก็บขยะประจำพื้นที่": "ตารางกำหนดการ",
    "ดูตำแหน่งรถเก็บขยะ": "ตำแหน่งรถขยะ",
    "ตรวจสอบค่าบริการเก็บขยะ": "ค่าบริการเก็บขยะ",
    "กลับเมนูบริการเก็บขยะ": "เมนูขยะ",
  }),
  DRIVER: Object.freeze({
    "ดูแผนปฏิบัติงานเก็บขยะที่ได้รับมอบหมาย": "งานเก็บขยะของฉัน",
    "ดูงานเก็บขยะวันนี้": "งานวันนี้",
    "ดูงานเก็บขยะล่วงหน้า": "งานล่วงหน้า",
    "กลับเมนูพนักงานประจำรถขยะ": "เมนูพนักงานประจำรถขยะ",
    "ยืนยันตัวตน": "ยืนยันตัวตนพนักงานประจำรถขยะ",
    "เริ่มยืนยันตัวตนพนักงานใหม่": "เริ่มยืนยันตัวตนใหม่",
    "วิธีใช้งานระบบพนักงานประจำรถขยะ": "วิธีใช้งานพนักงาน",
    "วิธีใช้งาน": "วิธีใช้งานพนักงาน",
    "ช่วยเหลือ": "วิธีใช้งานพนักงาน",
  }),
});

export function normalizeWasteCommand(value, audience = "CITIZEN") {
  const normalized = normalizeText(value).toLowerCase();
  const aliases = DISPLAY_TEXT_COMMANDS[String(audience || "CITIZEN").toUpperCase()] || {};
  return aliases[normalized] || normalized;
}

function parsePostback(value) {
  return Object.fromEntries(new URLSearchParams(String(value || "")));
}


function formatThaiDate(value, withTime = false) {
  if (!value) return "ไม่ระบุ";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "ไม่ระบุ";
  return new Intl.DateTimeFormat("th-TH", withTime
    ? { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }
    : { dateStyle: "medium", timeZone: "Asia/Bangkok" }).format(date);
}

function formatThaiTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function formatThaiTimeRange(start, end) {
  const from = formatThaiTime(start);
  const to = formatThaiTime(end);
  if (!from) return "ยังไม่ระบุรอบ";
  return to ? `${from}–${to} น.` : `${from} น.`;
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("th-TH", { style: "currency", currency: "THB" });
}

function flexMessage(altText, contents, quickReplyItems = []) {
  const actions = wasteLineShortcuts.normalize(quickReplyItems);
  return {
    type: "flex",
    altText: String(altText || "ข้อมูลบริการเก็บขยะ").slice(0, 400),
    contents,
    ...(actions.length ? { quickReply: { items: actions.map((action) => ({ type: "action", action })) } } : {}),
  };
}

function textCardAccent(value) {
  const text = String(value || "");
  if (/(ไม่พบ|ไม่สามารถ|ไม่ถูกต้อง|ถูกระงับ|ยกเลิกการใช้งาน|ไม่ตรงกับ|เชื่อมต่อ LINE แล้ว|เชื่อมกับบัญชี LINE อื่น|เชื่อมกับพนักงานประจำรถขยะรายอื่น|เชื่อมกับบัญชี LINE อื่นอยู่)/.test(text)) {
    return LINE_CARD_COLORS.RED;
  }
  if (/(ต้องมี \d|ต้องมี 2–30|ต้องมี 10 หลัก|กรุณาตรวจสอบ|กรุณาพิมพ์|กรุณาส่ง|รอเจ้าหน้าที่|ยังไม่มี)/.test(text)) {
    return LINE_CARD_COLORS.ORANGE;
  }
  if (/(สำเร็จ|เรียบร้อย|เสร็จสิ้น|ยืนยันเก็บขยะแล้ว|ยืนยันตัวตนแล้ว)/.test(text)) {
    return LINE_CARD_COLORS.GREEN;
  }
  return LINE_CARD_COLORS.BLUE;
}
function textCardTitle(lines) {
  const first = String(lines[0] || "").trim();
  if (lines.some((line) => /ลงทะเบียนผู้ใช้บริการเก็บขยะ/.test(line))) return "ลงทะเบียนผู้ใช้บริการเก็บขยะ";
  if (lines.some((line) => /ยืนยันตัวตนพนักงานประจำรถขยะ/.test(line))) return "ยืนยันตัวตนพนักงานประจำรถขยะ";
  if (/^ขั้นตอน\s+\d+\/\d+/.test(first)) return "ข้อมูลที่ต้องดำเนินการ";
  return first.slice(0, 120) || "บริการเก็บขยะ";
}

function textCardStatus(accent) {
  if (accent === LINE_CARD_COLORS.RED) return "ตรวจสอบข้อมูล";
  if (accent === LINE_CARD_COLORS.ORANGE) return "ต้องดำเนินการ";
  if (accent === LINE_CARD_COLORS.GREEN) return "ดำเนินการสำเร็จ";
  return "ข้อมูลจากระบบ";
}

// Every outbound waste text is intentionally rendered as a Flex card.  Free-text
// input still goes through LINE's normal composer; only the municipal response
// gains a consistent, readable visual hierarchy.
export function buildWasteLineTextCard(text, quickReplyItems = []) {
  const source = String(text || "").trim() || "ไม่มีข้อมูลสำหรับแสดง";
  const lines = source.split("\n").map((line) => line.trim()).filter(Boolean);
  const title = textCardTitle(lines);
  const accent = textCardAccent(source);
  const progress = /^ขั้นตอน\s+\d+\/\d+/.test(lines[0] || "") ? lines[0] : "";
  const bodyLines = lines.filter((line, index) =>
    index !== 0 &&
    line !== title
  );
  const bodyText = bodyLines.length
    ? bodyLines.join("\n")
    : lines.length > 1
      ? lines.slice(1).join("\n")
      : source;
  return flexMessage(
    source,
    lineCardBubble({
      eyebrow: "SMART THA PHO · บริการเก็บขยะ",
      title,
      subtitle: progress,
      accent,
      statusLabel: textCardStatus(accent),
      rows: [lineCardText(bodyText, { size: "sm", color: "#28463C", maxLength: 1600 })],
      footerActions: cardButtonsFromActions(wasteLineShortcuts.normalize(quickReplyItems), accent),
    }),
    quickReplyItems,
  );
}

function planStatusLabel(status) {
  return {
    SCHEDULED: "รอเริ่มงาน",
    IN_PROGRESS: "กำลังปฏิบัติงาน",
    INTERRUPTED: "หยุดชะงัก",
    COMPLETED: "เสร็จสิ้น",
  }[status] || String(status || "ไม่ระบุ");
}

function planStatusColor(status) {
  return {
    SCHEDULED: LINE_CARD_COLORS.BLUE,
    IN_PROGRESS: LINE_CARD_COLORS.GREEN,
    INTERRUPTED: LINE_CARD_COLORS.ORANGE,
    COMPLETED: LINE_CARD_COLORS.SLATE,
  }[status] || LINE_CARD_COLORS.SLATE;
}

function operationResultCard(title, rows, quickReplyItems = [], accent = LINE_CARD_COLORS.GREEN) {
  return flexMessage(
    title,
    lineCardBubble({
      eyebrow: "SMART THA PHO · ผลการดำเนินงาน",
      title,
      accent,
      statusLabel: textCardStatus(accent),
      rows,
      footerActions: cardButtonsFromActions(wasteLineShortcuts.normalize(quickReplyItems), accent),
    }),
    quickReplyItems,
  );
}

async function getSession(lineUserId, channelType) {
  const [rows] = await pool.execute(
    `SELECT actor_type AS actorType, flow_type AS flowType, current_step AS currentStep,
            CAST(draft_json AS CHAR) AS draftJson
     FROM waste_line_sessions
     WHERE channel_type = ? AND line_user_id = ? AND expires_at > NOW()`,
    [channelType, lineUserId],
  );
  if (!rows[0]) return null;
  return { ...rows[0], draft: rows[0].draftJson ? JSON.parse(rows[0].draftJson) : {} };
}

async function saveSession(lineUserId, channelType, actorType, flowType, currentStep, draft = {}) {
  await pool.execute(
    `INSERT INTO waste_line_sessions
      (line_user_id, channel_type, actor_type, flow_type, current_step, draft_json, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))
     ON DUPLICATE KEY UPDATE actor_type = VALUES(actor_type), flow_type = VALUES(flow_type),
       current_step = VALUES(current_step), draft_json = VALUES(draft_json),
       expires_at = VALUES(expires_at)`,
    [lineUserId, channelType, actorType, flowType, currentStep, JSON.stringify(draft), SESSION_MINUTES],
  );
}

async function clearSession(lineUserId, channelType) {
  await pool.execute(`DELETE FROM waste_line_sessions WHERE channel_type = ? AND line_user_id = ?`, [channelType, lineUserId]);
}

async function loadActors(lineUserId) {
  const [[drivers], [citizens]] = await Promise.all([
    pool.execute(
      `SELECT id, driver_code AS driverCode, full_name AS fullName, phone,
              line_user_id AS lineUserId, is_active AS isActive
       FROM waste_drivers
       WHERE line_user_id = ?
       LIMIT 1`,
      [lineUserId],
    ),
    pool.execute(`SELECT id, service_no AS serviceNo, full_name AS fullName, route_id AS routeId FROM waste_service_users WHERE line_user_id = ? AND is_active = 1 LIMIT 1`, [lineUserId]),
  ]);
  const driverRecord = drivers[0]
    ? { ...drivers[0], isActive: Boolean(Number(drivers[0].isActive)) }
    : null;
  return {
    driver: driverRecord?.isActive ? driverRecord : null,
    driverRecord,
    citizen: citizens[0] || null,
  };
}

async function findWasteRegistrationByLine(lineUserId) {
  const [rows] = await pool.execute(
    `SELECT id,
            service_no AS serviceNo,
            full_name AS fullName,
            is_active AS isActive
     FROM waste_service_users
     WHERE line_user_id = ?
     LIMIT 1`,
    [lineUserId],
  );

  if (!rows[0]) return null;

  return {
    ...rows[0],
    isActive: Boolean(Number(rows[0].isActive)),
  };
}

function existingWasteRegistrationMessage(user) {
  if (user.isActive) {
    return textMessage(
      `บัญชี LINE นี้ลงทะเบียนบริการเก็บขยะแล้ว
เลขผู้ใช้บริการ ${user.serviceNo}
ชื่อ ${user.fullName}

ไม่ต้องลงทะเบียนซ้ำ`,
      wasteLineShortcuts.citizen(),
    );
  }

  return textMessage(
    `พบทะเบียนเดิม ${user.serviceNo} แต่ถูกปิดบริการแล้ว
กรุณาติดต่อเจ้าหน้าที่เทศบาล หรือให้เจ้าหน้าที่ยกเลิกการเชื่อม LINE ก่อนลงทะเบียนใหม่`,
    wasteLineShortcuts.unregistered(),
  );
}
function wasteMenu(actors, audience = "CITIZEN") {
  if (audience === "DRIVER") {
    if (actors.driverRecord && !actors.driverRecord.isActive) {
      return textMessage(
        `ระบบงานพนักงานประจำรถขยะ\nบัญชีพนักงาน ${actors.driverRecord.fullName} ถูกระงับหรือยกเลิกการใช้งาน กรุณาติดต่อเจ้าหน้าที่เทศบาล`,
      );
    }
    return textMessage(
      actors.driver
        ? `ระบบงานพนักงานประจำรถขยะ\nผู้ปฏิบัติงาน: ${actors.driver.fullName}\nรหัสพนักงาน: ${actors.driver.driverCode || "ยังไม่ได้กำหนด"}\nเลือกเมนูที่ต้องการ`
        : "ระบบงานพนักงานประจำรถขยะ\nบัญชีนี้ยังไม่ได้ยืนยันตัวตน กรุณากด “ยืนยันตัวตน” แล้วกรอกรหัสพนักงานและหมายเลขโทรศัพท์ที่เทศบาลบันทึกไว้",
      actors.driver ? wasteLineShortcuts.driverMenu() : wasteLineShortcuts.driverGuest(),
    );
  }
  return textMessage(
    `บริการเก็บขยะ Smart Tha Pho\n${actors.citizen ? `ผู้ใช้บริการ: ${actors.citizen.fullName}` : "ยังไม่ได้ลงทะเบียนผู้ใช้บริการเก็บขยะ"}\nเลือกเมนูที่ต้องการ`,
    wasteLineShortcuts.menu(actors),
  );
}

async function citizenSchedule(citizen) {
  const result = await citizenScheduleService.upcomingFor(citizen);
  const actions = result.state === "UNREGISTERED" ? wasteLineShortcuts.unregistered() : wasteLineShortcuts.citizen();
  if (result.state === "READY") return buildCitizenScheduleMessage(result, actions);
  return textMessage(citizenScheduleService.toLineText(result), actions);
}

async function citizenLocation(citizen) {
  if (!citizen) return textMessage("ยังไม่พบทะเบียนผู้ใช้บริการเก็บขยะ กรุณาลงทะเบียนก่อน", wasteLineShortcuts.unregistered());
  if (!citizen.routeId) return textMessage("ยังไม่พบเส้นทางรับผิดชอบของทะเบียนนี้", wasteLineShortcuts.citizen());
  const [rows] = await pool.execute(
    `SELECT v.vehicle_code AS vehicleCode, v.last_latitude AS latitude, v.last_longitude AS longitude,
            v.last_gps_at AS lastGpsAt, r.route_name AS routeName
     FROM waste_operation_plans p
     INNER JOIN waste_vehicles v ON v.id = p.vehicle_id
     INNER JOIN waste_routes r ON r.id = p.route_id
     WHERE p.route_id = ? AND p.scheduled_date = CURDATE() AND p.status = 'IN_PROGRESS'
     ORDER BY p.actual_start_at DESC LIMIT 1`,
    [citizen.routeId],
  );
  const vehicle = rows[0];
  if (!vehicle) return textMessage("ขณะนี้ยังไม่มีรถเก็บขยะกำลังปฏิบัติงานในเส้นทางของคุณ", wasteLineShortcuts.citizen());
  if (vehicle.latitude == null || vehicle.longitude == null) return textMessage(`รถ ${vehicle.vehicleCode} กำลังปฏิบัติงาน แต่ยังไม่ได้รับตำแหน่งล่าสุดจากพนักงานประจำรถขยะ`, wasteLineShortcuts.citizen());
  return [
    {
      type: "location",
      title: `รถ ${vehicle.vehicleCode} · ${vehicle.routeName}`.slice(0, 100),
      address: `อัปเดตล่าสุด ${formatThaiDate(vehicle.lastGpsAt, true)}`.slice(0, 100),
      latitude: Number(vehicle.latitude),
      longitude: Number(vehicle.longitude),
    },
    textMessage("เลือกบริการที่ต้องการต่อได้ด้านล่าง", wasteLineShortcuts.citizen()),
  ];
}

async function citizenCharges(citizen) {
  if (!citizen) return textMessage("ยังไม่พบทะเบียนผู้ใช้บริการเก็บขยะ กรุณาลงทะเบียนก่อน", wasteLineShortcuts.unregistered());
  const [rows] = await pool.execute(
    `SELECT billing_period AS billingPeriod, due_date AS dueDate, amount, status, paid_at AS paidAt
     FROM waste_service_charges WHERE service_user_id = ?
     ORDER BY billing_period DESC LIMIT 6`,
    [citizen.id],
  );
  if (!rows.length) return textMessage("ยังไม่มีรายการค่าบริการเก็บขยะในทะเบียนของคุณ", wasteLineShortcuts.citizen());
  return buildCitizenChargesMessage(rows, wasteLineShortcuts.citizen());
}

export function buildDriverJobsMessage(plans, scope = "ALL") {
  const title = scope === "TODAY"
    ? "งานเก็บขยะวันนี้"
    : scope === "UPCOMING"
      ? "งานเก็บขยะล่วงหน้า 7 วัน"
      : "งานเก็บขยะของฉันใน 7 วัน";
  return flexMessage(
    title,
    {
      type: "carousel",
      contents: plans.map((plan) => lineCardBubble({
        eyebrow: "แผนปฏิบัติงานเก็บขยะ",
        title: plan.planNo,
        subtitle: plan.routeName,
        accent: planStatusColor(plan.status),
        statusLabel: planStatusLabel(plan.status),
        rows: [
          lineCardRow("วันปฏิบัติงาน", formatThaiDate(plan.scheduledDate)),
          lineCardRow("เวลา", formatThaiTimeRange(plan.scheduledStartAt, plan.scheduledEndAt)),
          lineCardRow("รถเก็บขยะ", plan.vehicleCode),
          lineCardRow("จุดเก็บขยะ", `${Number(plan.stopTotal || 0).toLocaleString("th-TH")} จุด`),
        ],
        footerActions: [
          lineCardButton("ดูรายละเอียดงาน", postbackAction("ดูรายละเอียดงาน", `waste=driver_plan&planId=${plan.id}`, `ดูงาน ${plan.planNo}`)),
        ],
      })),
    },
    wasteLineShortcuts.driverMenu(),
  );
}

export function buildCitizenScheduleMessage(result, quickReplyItems = []) {
  return flexMessage(
    "ตารางกำหนดการเก็บขยะประจำพื้นที่",
    {
      type: "carousel",
      contents: result.schedules.map((schedule) => lineCardBubble({
        eyebrow: "กำหนดการเก็บขยะ",
        title: schedule.routeName,
        subtitle: schedule.routeCode || "ตารางประจำพื้นที่",
        accent: planStatusColor(schedule.status),
        statusLabel: planStatusLabel(schedule.status),
        rows: [
          lineCardRow("วันเก็บขยะ", formatThaiDate(schedule.scheduledDate)),
          lineCardRow("เวลาโดยประมาณ", formatThaiTimeRange(schedule.scheduledStartAt, schedule.scheduledEndAt)),
        ],
        footerActions: cardButtonsFromActions(wasteLineShortcuts.normalize(quickReplyItems), planStatusColor(schedule.status)),
      })),
    },
    quickReplyItems,
  );
}

export function buildCitizenChargesMessage(charges, quickReplyItems = []) {
  const labels = { PENDING: "รอชำระ", PAID: "ชำระแล้ว", OVERDUE: "ค้างชำระ", VOID: "ยกเลิก" };
  const colors = { PENDING: LINE_CARD_COLORS.ORANGE, PAID: LINE_CARD_COLORS.GREEN, OVERDUE: LINE_CARD_COLORS.RED, VOID: LINE_CARD_COLORS.SLATE };
  return flexMessage(
    "ค่าบริการเก็บขยะ",
    {
      type: "carousel",
      contents: charges.map((charge) => lineCardBubble({
        eyebrow: "ค่าบริการเก็บขยะ",
        title: formatMoney(charge.amount),
        subtitle: `รอบ ${formatThaiDate(charge.billingPeriod)}`,
        accent: colors[charge.status] || LINE_CARD_COLORS.SLATE,
        statusLabel: labels[charge.status] || charge.status,
        rows: [
          ...(["PENDING", "OVERDUE"].includes(charge.status)
            ? [lineCardRow("กำหนดชำระ", formatThaiDate(charge.dueDate))]
            : []),
          ...(charge.paidAt ? [lineCardRow("ชำระเมื่อ", formatThaiDate(charge.paidAt))] : []),
        ],
        footerActions: cardButtonsFromActions(wasteLineShortcuts.normalize(quickReplyItems), colors[charge.status] || LINE_CARD_COLORS.SLATE),
      })),
    },
    quickReplyItems,
  );
}

function buildDriverPlanDetailMessage({ plan, status, collectedStops, stopTotal, stops, page, totalPages, primaryAction }, quickReplyItems = []) {
  const stopPreview = stops.length
    ? stops.map((stop) => `${stop.sequenceNo}. ${stop.stopName} · ${stop.collectionStatus === "COLLECTED" ? "เก็บแล้ว" : "รอดำเนินการ"}`).join("\n")
    : "ยังไม่มีจุดเก็บขยะในเส้นทางนี้";
  return flexMessage(
    `รายละเอียดงาน ${plan.planNo}`,
    lineCardBubble({
      eyebrow: "รายละเอียดแผนปฏิบัติงานเก็บขยะ",
      title: plan.routeName,
      subtitle: plan.planNo,
      accent: planStatusColor(plan.status),
      statusLabel: status,
      rows: [
        lineCardRow("วันปฏิบัติงาน", formatThaiDate(plan.scheduledDate)),
        lineCardRow("เวลา", formatThaiTimeRange(plan.scheduledStartAt, plan.scheduledEndAt)),
        lineCardRow("รถเก็บขยะ", plan.vehicleCode),
        lineCardRow("เส้นทาง", plan.routeName),
        lineCardRow("ความคืบหน้า", `${collectedStops}/${stopTotal} จุด`),
        { type: "separator", margin: "lg" },
        lineCardText(`จุดเก็บขยะตามลำดับ${totalPages > 1 ? ` · หน้า ${page}/${totalPages}` : ""}`, { size: "xs", color: "#6B8179", weight: "bold", margin: "lg" }),
        lineCardText(stopPreview, { size: "xs", color: "#28463C" }),
      ],
      footerActions: primaryAction ? [lineCardButton(primaryAction.label, primaryAction.action, { color: primaryAction.color })] : [],
    }),
    quickReplyItems,
  );
}

function buildCollectionStopsMessage(plan, stops, quickReplyItems = []) {
  return flexMessage(
    `ยืนยันจุดเก็บขยะ ${plan.planNo}`,
    {
      type: "carousel",
      contents: stops.map((stop) => lineCardBubble({
        eyebrow: "ยืนยันการเก็บขยะ",
        title: stop.stopName,
        subtitle: `จุดเก็บขยะลำดับ ${stop.sequenceNo}`,
        accent: LINE_CARD_COLORS.ORANGE,
        statusLabel: "รอยืนยัน",
        rows: [lineCardText("ตรวจสอบจุดเก็บขยะให้ถูกต้องก่อนยืนยันการเก็บ", { size: "xs", color: "#49665C" })],
        footerActions: [
          lineCardButton(
            "ยืนยันเก็บขยะแล้ว",
            postbackAction(
              "ยืนยันเก็บขยะแล้ว",
              `waste=driver_confirm_stop&planId=${plan.id}&stopId=${stop.id}`,
              `ยืนยันจุด ${stop.sequenceNo} ${stop.stopName}`,
            ),
          ),
        ],
      })),
    },
    quickReplyItems,
  );
}

async function driverJobs(driver, _lineUserId, scope = "ALL") {
  if (!driver) return textMessage("บัญชี LINE นี้ยังไม่ได้เชื่อมกับข้อมูลพนักงานประจำรถขยะ", wasteLineShortcuts.driverGuest());
  const dateClause = scope === "TODAY"
    ? "p.scheduled_date = CURDATE()"
    : scope === "UPCOMING"
      ? "p.scheduled_date > CURDATE() AND p.scheduled_date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)"
      : "p.scheduled_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)";
  const [rows] = await pool.execute(
    `SELECT p.id, p.plan_no AS planNo, p.scheduled_date AS scheduledDate, p.status,
            p.scheduled_start_at AS scheduledStartAt, p.scheduled_end_at AS scheduledEndAt,
            r.route_name AS routeName, v.vehicle_code AS vehicleCode,
            (SELECT COUNT(*) FROM waste_route_stops s WHERE s.route_id = p.route_id AND s.is_active = 1) AS stopTotal
     FROM waste_operation_plans p
     INNER JOIN waste_routes r ON r.id = p.route_id
     INNER JOIN waste_vehicles v ON v.id = p.vehicle_id
     WHERE p.driver_id = ? AND ${dateClause}
       AND p.publication_status = 'PUBLISHED' AND p.status <> 'CANCELLED'
     ORDER BY FIELD(p.status, 'IN_PROGRESS', 'INTERRUPTED', 'SCHEDULED', 'COMPLETED'), p.scheduled_date, p.scheduled_start_at
     LIMIT 8`,
    [driver.id],
  );
  if (!rows.length) {
    const label = scope === "TODAY" ? "วันนี้" : scope === "UPCOMING" ? "ใน 7 วันข้างหน้า" : "ใน 7 วัน";
    return operationResultCard(
      "ยังไม่มีงานที่ได้รับมอบหมาย",
      [
        lineCardText(`ไม่พบแผนปฏิบัติงานเก็บขยะ${label}สำหรับบัญชีนี้`, { weight: "bold" }),
        lineCardText("เมื่อเจ้าหน้าที่ตรวจความพร้อมและประกาศแผน ระบบจะแจ้งงานมาที่ LINE นี้", { size: "xs", color: "#6B8179", margin: "md" }),
        lineCardText("เลือก “งานล่วงหน้า” เพื่อตรวจรอบถัดไป หรือเปิดเมนูเพื่อทำรายการอื่น", { size: "xs", color: "#6B8179", margin: "md" }),
      ],
      wasteLineShortcuts.driverMenu(),
      LINE_CARD_COLORS.SLATE,
    );
  }
  return buildDriverJobsMessage(rows, scope);
}

function driverHelp(actors) {
  if (!actors.driver) {
    return textMessage(
      "วิธีเริ่มใช้งานสำหรับพนักงานประจำรถขยะ\n1. กด “ยืนยันตัวตน”\n2. พิมพ์รหัสพนักงานและหมายเลขโทรศัพท์ที่เทศบาลบันทึกไว้\n3. เมื่อยืนยันแล้ว กด “งานของฉัน” เพื่อดูแผนที่ได้รับมอบหมาย",
      wasteLineShortcuts.driverGuest(),
    );
  }

  return textMessage(
    "วิธีปฏิบัติงานเก็บขยะ\n1. กด “งานวันนี้” หรือ “งานของฉัน” แล้วเลือกแผน\n2. กด “เริ่มงาน” เมื่อเริ่มปฏิบัติงานจริง\n3. เปิด GPS ต่อเนื่อง หรือส่งตำแหน่งรถ\n4. ยืนยันจุดเก็บขยะตามลำดับ\n5. หากมีปัญหาให้กด “แจ้งเหตุ”\n6. กด “เสร็จสิ้น” เมื่อจบรอบเก็บขยะ",
    wasteLineShortcuts.driverMenu(),
  );
}

async function ensureDriverPlan(driver, planId, statuses) {
  if (!driver) {
    throw new Error(
      "บัญชี LINE นี้ยังไม่ได้เชื่อมกับข้อมูลพนักงานประจำรถขยะ",
    );
  }

  const placeholders =
    statuses.map(() => "?").join(",");

  const [rows] =
    await pool.execute(
      `SELECT
         p.id,
         p.plan_no AS planNo,
         p.status,
         p.publication_status AS publicationStatus,
         p.vehicle_id AS vehicleId,
         p.route_id AS routeId,
         r.route_name AS routeName
       FROM waste_operation_plans p
       INNER JOIN waste_routes r
         ON r.id = p.route_id
       WHERE p.id = ?
         AND p.driver_id = ?
         AND p.publication_status = 'PUBLISHED'
         AND p.status IN (${placeholders})`,
      [
        planId,
        driver.id,
        ...statuses,
      ],
    );

  if (!rows[0]) {
    throw new Error(
      "ไม่พบงานนี้ หรือสถานะงานไม่อนุญาตให้ดำเนินการ",
    );
  }

  return rows[0];
}


async function driverPlanDetails(driver, planId, lineUserId, pageValue = 1) {
  if (!driver) return textMessage("บัญชี LINE นี้ยังไม่ได้เชื่อมกับข้อมูลพนักงานประจำรถขยะ", wasteLineShortcuts.driverGuest());
  const [planRows] = await pool.execute(`SELECT p.id, p.plan_no AS planNo, p.status,
           p.publication_status AS publicationStatus,
           p.vehicle_id AS vehicleId, p.route_id AS routeId,
           p.scheduled_date AS scheduledDate,
           p.scheduled_start_at AS scheduledStartAt,
           p.scheduled_end_at AS scheduledEndAt,
           r.route_name AS routeName,
           v.vehicle_code AS vehicleCode
    FROM waste_operation_plans p
    INNER JOIN waste_routes r ON r.id = p.route_id
    INNER JOIN waste_vehicles v ON v.id = p.vehicle_id
    WHERE p.id = ? AND p.driver_id = ?
      AND p.publication_status = 'PUBLISHED'
      AND p.status IN ('SCHEDULED', 'IN_PROGRESS', 'INTERRUPTED', 'COMPLETED')
    LIMIT 1`, [planId, driver.id]);
  const plan = planRows[0];
  if (!plan) return textMessage("ไม่พบงานนี้ หรือคุณไม่มีสิทธิ์ดูงานดังกล่าว", wasteLineShortcuts.driverMenu());
  const [stops] = await pool.execute(
    `SELECT s.id, s.sequence_no AS sequenceNo, s.stop_name AS stopName,
            CASE WHEN c.status = 'COLLECTED' THEN 'COLLECTED' ELSE 'PENDING' END AS collectionStatus
     FROM waste_route_stops s
     LEFT JOIN waste_stop_confirmations c ON c.stop_id = s.id AND c.plan_id = ?
     WHERE s.route_id = ? AND s.is_active = 1
     ORDER BY s.sequence_no`,
    [plan.id, plan.routeId],
  );
  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(stops.length / pageSize));
  const page = Math.min(totalPages, Math.max(1, Number(pageValue) || 1));
  const visible = stops.slice((page - 1) * pageSize, page * pageSize);
  const status = { SCHEDULED: "รอเริ่มงาน", IN_PROGRESS: "กำลังปฏิบัติงาน", INTERRUPTED: "หยุดชะงัก", COMPLETED: "เสร็จสิ้น" }[plan.status] || plan.status;
  const collectedStops = stops.filter(
    (stop) => stop.collectionStatus === "COLLECTED",
  ).length;
  const paging = [];
  if (page > 1) paging.push(postbackAction("ก่อนหน้า", `waste=driver_plan&planId=${plan.id}&page=${page - 1}`, `ดูจุดเก็บก่อนหน้า ${plan.planNo}`));
  if (page < totalPages) paging.push(postbackAction("ถัดไป", `waste=driver_plan&planId=${plan.id}&page=${page + 1}`, `ดูจุดเก็บถัดไป ${plan.planNo}`));
  let actions;
  let primaryAction;
  if (plan.status === "SCHEDULED") {
    primaryAction = {
      label: "เริ่มงาน",
      action: postbackAction("เริ่มงาน", `waste=driver_start&planId=${plan.id}`, `เริ่มงาน ${plan.planNo}`),
      color: LINE_CARD_COLORS.GREEN,
    };
    actions = wasteLineShortcuts.normalize([
      ...paging,
      ...wasteLineShortcuts.driverMenu(),
    ]);
  } else if (["IN_PROGRESS", "INTERRUPTED"].includes(plan.status)) {
    primaryAction = {
      label: "ยืนยันจุดเก็บขยะ",
      action: postbackAction("ยืนยันจุดเก็บขยะ", `waste=driver_stops&planId=${plan.id}`, `ยืนยันการเก็บขยะ ${plan.planNo}`),
      color: plan.status === "INTERRUPTED" ? LINE_CARD_COLORS.ORANGE : LINE_CARD_COLORS.GREEN,
    };
    actions = wasteLineShortcuts.normalize([
      ...paging,
      uriAction("เปิด GPS ต่อเนื่อง", trackingUrl(plan, lineUserId, driver.id)),
      ...wasteLineShortcuts.activePlan(plan).filter((action) => !String(action.data || "").startsWith("waste=driver_gps")),
    ]);
  } else {
    actions = wasteLineShortcuts.normalize([...paging, ...wasteLineShortcuts.driverMenu()]);
  }
  return buildDriverPlanDetailMessage({
    plan,
    status,
    collectedStops,
    stopTotal: stops.length,
    stops: visible,
    page,
    totalPages,
    primaryAction,
  }, actions);
}

async function queueCollectionStatusNotices(
  db,
  plan,
  status,
) {
  if (
    plan.publicationStatus !== "PUBLISHED" ||
    status !== "IN_PROGRESS"
  ) {
    return 0;
  }

  const statusLabel = "กำลังปฏิบัติงาน";

  const message = [
    "สถานะการดำเนินการตามแผนปฏิบัติงานเก็บขยะ",
    statusLabel,
    plan.routeName,
    `เลขที่แผน ${plan.planNo}`,
    "ตรวจสอบตำแหน่งรถได้จากเมนู “ตำแหน่งรถ”",
  ].join("\n");

  const [users] =
    await db.execute(
      `SELECT
         id,
         line_user_id AS lineUserId
       FROM waste_service_users
       WHERE route_id = ?
         AND is_active = 1
         AND line_user_id IS NOT NULL
         AND line_user_id <> ''`,
      [plan.routeId],
    );

  let queued = 0;

  for (const user of users) {
    const [existing] =
      await db.execute(
        `SELECT id
         FROM waste_line_notifications
         WHERE plan_id = ?
           AND service_user_id = ?
           AND notification_type = 'COLLECTION_STATUS'
           AND message_text = ?
         LIMIT 1`,
        [
          plan.id,
          user.id,
          message,
        ],
      );

    if (existing.length) {
      continue;
    }

    await db.execute(
      `INSERT INTO waste_line_notifications
        (
          id,
          line_user_id,
          service_user_id,
          plan_id,
          notification_type,
          message_text
        )
       VALUES (
         UUID(),
         ?, ?, ?,
         'COLLECTION_STATUS',
         ?
       )`,
      [
        user.lineUserId,
        user.id,
        plan.id,
        message,
      ],
    );

    queued += 1;
  }

  return queued;
}

async function beginRegistration(lineUserId) {
  const existing = await findWasteRegistrationByLine(lineUserId);

  if (existing) {
    await clearSession(lineUserId, "CITIZEN");
    return existingWasteRegistrationMessage(existing);
  }

  await saveSession(lineUserId, "CITIZEN", "CITIZEN", "REGISTER", "FULL_NAME", {});
  return textMessage(`${wasteLineShortcuts.registrationProgress("FULL_NAME")}\nลงทะเบียนผู้ใช้บริการเก็บขยะ\nกรุณาพิมพ์ชื่อ-นามสกุล`, wasteLineShortcuts.registration("FULL_NAME"));
}

async function handleRegistrationStep(event, lineUserId, session) {
  const text = normalizeText(event.message?.text);
  const draft = { ...session.draft };
  if (event.type === "message" && event.message?.type === "location" && session.currentStep === "LOCATION") {
    draft.latitude = Number(event.message.latitude);
    draft.longitude = Number(event.message.longitude);
    await saveSession(lineUserId, "CITIZEN", "CITIZEN", "REGISTER", "CONFIRM", draft);
    return textMessage(`${wasteLineShortcuts.registrationProgress("CONFIRM")}\nตรวจสอบข้อมูล\nชื่อ ${draft.fullName}\nโทรศัพท์ ${draft.phone}\nบ้านเลขที่ ${draft.houseNo} หมู่ ${draft.villageNo}\n${draft.addressDetail ? `${draft.addressDetail}\n` : ""}ได้รับตำแหน่งแล้ว\n\nกด “ยืนยัน” เพื่อส่งข้อมูลขึ้นทะเบียน`, wasteLineShortcuts.registration("CONFIRM"));
  }
  if (event.message?.type !== "text") return textMessage("กรุณาส่งข้อมูลตามขั้นตอนที่ระบุ", wasteLineShortcuts.registration(session.currentStep));

  if (session.currentStep === "FULL_NAME") {
    if (text.length < 2) return textMessage("กรุณาระบุชื่อ-นามสกุลอย่างน้อย 2 ตัวอักษร", wasteLineShortcuts.registration("FULL_NAME"));
    draft.fullName = text;
    await saveSession(lineUserId, "CITIZEN", "CITIZEN", "REGISTER", "PHONE", draft);
    return textMessage(`${wasteLineShortcuts.registrationProgress("PHONE")}\nกรุณาพิมพ์หมายเลขโทรศัพท์ 10 หลัก`, wasteLineShortcuts.registration("PHONE"));
  }
  if (session.currentStep === "PHONE") {
    const phone = text.replace(/\D/g, "");
    if (!/^0\d{9}$/.test(phone)) return textMessage("หมายเลขโทรศัพท์ต้องมี 10 หลักและขึ้นต้นด้วย 0", wasteLineShortcuts.registration("PHONE"));
    draft.phone = phone;
    await saveSession(lineUserId, "CITIZEN", "CITIZEN", "REGISTER", "HOUSE_NO", draft);
    return textMessage(`${wasteLineShortcuts.registrationProgress("HOUSE_NO")}\nกรุณาพิมพ์บ้านเลขที่`, wasteLineShortcuts.registration("HOUSE_NO"));
  }
  if (session.currentStep === "HOUSE_NO") {
    if (!text) return textMessage("กรุณาระบุบ้านเลขที่", wasteLineShortcuts.registration("HOUSE_NO"));
    draft.houseNo = text;
    await saveSession(lineUserId, "CITIZEN", "CITIZEN", "REGISTER", "VILLAGE_NO", draft);
    return textMessage(`${wasteLineShortcuts.registrationProgress("VILLAGE_NO")}\nกรุณาพิมพ์เลขหมู่บ้านในเขตเทศบาลเมืองท่าโพธิ์`, wasteLineShortcuts.registration("VILLAGE_NO"));
  }
  if (session.currentStep === "VILLAGE_NO") {
    const villageNo = Number(text.replace(/\D/g, ""));
    const [rows] = await pool.execute(`SELECT id, village_no AS villageNo, name_th AS name FROM villages WHERE village_no = ? LIMIT 1`, [villageNo]);
    if (!rows[0]) return textMessage("ไม่พบหมู่บ้านนี้ในเขตเทศบาลเมืองท่าโพธิ์ กรุณาตรวจสอบเลขหมู่บ้านอีกครั้ง", wasteLineShortcuts.registration("VILLAGE_NO"));
    draft.villageId = rows[0].id;
    draft.villageNo = rows[0].villageNo;
    draft.villageName = rows[0].name;
    await saveSession(lineUserId, "CITIZEN", "CITIZEN", "REGISTER", "ADDRESS", draft);
    return textMessage(`${wasteLineShortcuts.registrationProgress("ADDRESS")}\nพิมพ์รายละเอียดที่อยู่หรือจุดสังเกต หากไม่มีให้กด “ข้าม”`, wasteLineShortcuts.registration("ADDRESS"));
  }
  if (session.currentStep === "ADDRESS") {
    draft.addressDetail = text === "ข้าม" ? null : text;
    await saveSession(lineUserId, "CITIZEN", "CITIZEN", "REGISTER", "LOCATION", draft);
    return textMessage(`${wasteLineShortcuts.registrationProgress("LOCATION")}\nกรุณาส่งตำแหน่งบ้าน เพื่อให้เจ้าหน้าที่กำหนดเส้นทางเก็บขยะได้ถูกต้อง`, wasteLineShortcuts.registration("LOCATION"));
  }
  if (session.currentStep === "CONFIRM") {
    if (text !== "ยืนยัน") return textMessage("หากข้อมูลถูกต้องให้กด “ยืนยัน” หรือกด “ยกเลิก” เพื่อเริ่มใหม่", wasteLineShortcuts.registration("CONFIRM"));

    const existing = await findWasteRegistrationByLine(lineUserId);

    if (existing) {
      await clearSession(lineUserId, "CITIZEN");
      return existingWasteRegistrationMessage(existing);
    }
    let serviceNo;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = `WU-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${crypto.randomInt(1000, 10000)}`;
      const [existing] = await pool.execute(`SELECT id FROM waste_service_users WHERE service_no = ?`, [candidate]);
      if (!existing.length) { serviceNo = candidate; break; }
    }
    if (!serviceNo) throw new Error("ไม่สามารถออกเลขผู้ใช้บริการได้ กรุณาลองใหม่");
    const id = crypto.randomUUID();
    await withTransaction(async (db) => {
      await db.execute(
        `INSERT INTO waste_service_users
          (id, service_no, full_name, phone, house_no, village_id, address_detail, line_user_id, latitude, longitude, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [id, serviceNo, draft.fullName, draft.phone, draft.houseNo, draft.villageId, draft.addressDetail, lineUserId, draft.latitude, draft.longitude],
      );
      await db.execute(`DELETE FROM waste_line_sessions WHERE channel_type = 'CITIZEN' AND line_user_id = ?`, [lineUserId]);
    });
    const nextActors = await loadActors(lineUserId);
    return [
      textMessage(`ลงทะเบียนสำเร็จ\nเลขผู้ใช้บริการ ${serviceNo}\nเจ้าหน้าที่จะตรวจสอบและกำหนดเส้นทางรับผิดชอบให้ต่อไป`),
      wasteMenu(nextActors, "CITIZEN"),
    ];
  }
  return textMessage("ไม่พบขั้นตอนลงทะเบียน กรุณายกเลิกรายการแล้วเริ่มใหม่", wasteLineShortcuts.cancelFlow());
}

function normalizeDriverPhone(value) {
  return String(value || "").replace(/\D/g, "");
}

export function classifyDriverCodeCheckpoint(driver, lineUserId) {
  if (!driver) return "NOT_FOUND";
  if (!Boolean(Number(driver.isActive))) return "INACTIVE";
  if (driver.lineUserId === lineUserId) return "ALREADY";
  if (driver.lineUserId) return "DRIVER_USED";
  return "PHONE_REQUIRED";
}

export function classifyDriverPhoneCheckpoint({
  driver,
  lineUserId,
  phone,
  usedByLine = null,
}) {
  if (!driver) return "NOT_FOUND";
  if (!Boolean(Number(driver.isActive))) return "INACTIVE";
  if (usedByLine) return "LINE_USED";
  if (driver.lineUserId === lineUserId) return "ALREADY";
  if (driver.lineUserId) return "DRIVER_USED";
  if (normalizeDriverPhone(driver.phone) !== normalizeDriverPhone(phone)) {
    return "PHONE_MISMATCH";
  }
  return "LINK";
}

async function handleDriverSession(event, lineUserId, session, actors) {
  if (session.flowType === "DRIVER_LINK") {
    if (actors.driverRecord) {
      await clearSession(lineUserId, "DRIVER");
      if (!actors.driverRecord.isActive) {
        return textMessage(
          `บัญชี LINE นี้เชื่อมกับพนักงาน ${actors.driverRecord.fullName} แต่บัญชีพนักงานถูกระงับหรือยกเลิกการใช้งาน กรุณาติดต่อเจ้าหน้าที่เทศบาล`,
          wasteLineShortcuts.driverIdentity(),
        );
      }
      return [
        textMessage(
          `บัญชี LINE นี้ยืนยันตัวตนแล้ว\n${actors.driverRecord.fullName}\nรหัสพนักงาน ${actors.driverRecord.driverCode || "-"}`,
          wasteLineShortcuts.driverMenu(),
        ),
        wasteMenu(actors, "DRIVER"),
      ];
    }

    if (session.currentStep === "DRIVER_CODE") {
      if (event.message?.type !== "text") {
        return textMessage(
          "กรุณาพิมพ์รหัสพนักงาน",
          wasteLineShortcuts.driverIdentity(),
        );
      }

      const driverCode = normalizeText(event.message.text).toUpperCase();
      if (driverCode.length < 2 || driverCode.length > 30) {
        return textMessage(
          "รูปแบบรหัสพนักงานไม่ถูกต้อง รหัสพนักงานต้องมี 2–30 ตัวอักษร",
          wasteLineShortcuts.driverIdentity(),
        );
      }

      const [rows] = await pool.execute(
        `SELECT id, driver_code AS driverCode, full_name AS fullName, phone,
                line_user_id AS lineUserId, is_active AS isActive
         FROM waste_drivers
         WHERE driver_code = ?
         LIMIT 1`,
        [driverCode],
      );
      const driver = rows[0] || null;
      const checkpoint = classifyDriverCodeCheckpoint(driver, lineUserId);

      if (checkpoint === "NOT_FOUND") {
        return textMessage(
          `ไม่พบรหัสพนักงาน ${driverCode} ในระบบ กรุณาตรวจสอบรหัสพนักงานแล้วกรอกใหม่`,
          wasteLineShortcuts.driverIdentity(),
        );
      }

      if (checkpoint === "INACTIVE") {
        return textMessage(
          `บัญชีพนักงาน ${driver.fullName} รหัส ${driver.driverCode} ถูกระงับหรือยกเลิกการใช้งาน กรุณาติดต่อเจ้าหน้าที่เทศบาล`,
          wasteLineShortcuts.driverIdentity(),
        );
      }

      if (checkpoint === "DRIVER_USED") {
        return textMessage(
          `พนักงาน ${driver.fullName} รหัส ${driver.driverCode} เชื่อมต่อ LINE แล้ว กรุณาติดต่อเจ้าหน้าที่เทศบาลหากต้องการเปลี่ยนบัญชี LINE`,
          wasteLineShortcuts.driverIdentity(),
        );
      }

      if (checkpoint === "ALREADY") {
        await clearSession(lineUserId, "DRIVER");
        const nextActors = await loadActors(lineUserId);
        return [
          textMessage(
            `บัญชี LINE นี้ยืนยันตัวตนกับ ${driver.fullName} อยู่แล้ว\nรหัสพนักงาน ${driver.driverCode}`,
            wasteLineShortcuts.driverMenu(),
          ),
          wasteMenu(nextActors, "DRIVER"),
        ];
      }

      await saveSession(
        lineUserId,
        "DRIVER",
        "DRIVER",
        "DRIVER_LINK",
        "PHONE",
        { driverId: driver.id, driverCode: driver.driverCode },
      );
      return textMessage(
        `พบรหัสพนักงาน ${driver.driverCode}\nชื่อ ${driver.fullName}\nกรุณาพิมพ์หมายเลขโทรศัพท์ 10 หลักที่เทศบาลบันทึกไว้`,
        wasteLineShortcuts.driverIdentity(),
      );
    }

    if (session.currentStep === "PHONE") {
      if (event.message?.type !== "text") {
        return textMessage(
          "กรุณาพิมพ์หมายเลขโทรศัพท์ 10 หลัก",
          wasteLineShortcuts.driverIdentity(),
        );
      }

      const phone = normalizeDriverPhone(normalizeText(event.message.text));
      if (!/^0\d{9}$/.test(phone)) {
        return textMessage(
          "รูปแบบหมายเลขโทรศัพท์ไม่ถูกต้อง หมายเลขโทรศัพท์ต้องมี 10 หลักและขึ้นต้นด้วย 0",
          wasteLineShortcuts.driverIdentity(),
        );
      }

      const outcome = await withTransaction(async (db) => {
        const [rows] = await db.execute(
          `SELECT id, driver_code AS driverCode, full_name AS fullName, phone,
                  line_user_id AS lineUserId, is_active AS isActive
           FROM waste_drivers
           WHERE driver_code = ?
           LIMIT 1 FOR UPDATE`,
          [session.draft.driverCode],
        );
        const driver = rows[0] || null;

        let usedByLine = null;
        if (driver) {
          const [usedRows] = await db.execute(
            `SELECT id, driver_code AS driverCode, full_name AS fullName
             FROM waste_drivers
             WHERE line_user_id = ? AND id <> ?
             LIMIT 1`,
            [lineUserId, driver.id],
          );
          usedByLine = usedRows[0] || null;
        }

        const checkpoint = classifyDriverPhoneCheckpoint({
          driver,
          lineUserId,
          phone,
          usedByLine,
        });

        if (checkpoint !== "LINK") {
          return {
            type: checkpoint,
            driver,
            usedByLine,
          };
        }

        await db.execute(
          `DELETE FROM waste_line_sessions
           WHERE channel_type = 'DRIVER' AND line_user_id = ?`,
          [lineUserId],
        );
        await db.execute(
          `UPDATE waste_drivers
           SET line_user_id = ?
           WHERE id = ?`,
          [lineUserId, driver.id],
        );
        await db.execute(
          `INSERT INTO audit_logs
            (id, user_id, action, entity_type, entity_id, new_value, ip_address)
           VALUES (?, NULL, 'LINK_WASTE_DRIVER_LINE', 'WASTE_DRIVER', ?, ?, NULL)`,
          [
            crypto.randomUUID(),
            driver.id,
            JSON.stringify({
              lineUserId,
              driverCode: driver.driverCode,
              source: "LINE_DRIVER_OA",
            }),
          ],
        );
        return { type: "LINKED", driver };
      });

      if (outcome.type === "NOT_FOUND") {
        await saveSession(
          lineUserId,
          "DRIVER",
          "DRIVER",
          "DRIVER_LINK",
          "DRIVER_CODE",
          {},
        );
        return textMessage(
          "ไม่พบรหัสพนักงานที่เลือกไว้แล้ว ข้อมูลอาจมีการเปลี่ยนแปลง กรุณากรอกรหัสพนักงานใหม่",
          wasteLineShortcuts.driverIdentity(),
        );
      }

      if (outcome.type === "INACTIVE") {
        await saveSession(
          lineUserId,
          "DRIVER",
          "DRIVER",
          "DRIVER_LINK",
          "DRIVER_CODE",
          {},
        );
        return textMessage(
          `บัญชีพนักงาน ${outcome.driver.fullName} รหัส ${outcome.driver.driverCode} ถูกระงับหรือยกเลิกการใช้งาน กรุณาติดต่อเจ้าหน้าที่เทศบาล`,
          wasteLineShortcuts.driverIdentity(),
        );
      }

      if (outcome.type === "LINE_USED") {
        await clearSession(lineUserId, "DRIVER");
        const nextActors = await loadActors(lineUserId);
        return [
          textMessage(
            `บัญชี LINE นี้เชื่อมกับพนักงาน ${outcome.usedByLine.fullName} รหัส ${outcome.usedByLine.driverCode || "-"} อยู่แล้ว ไม่สามารถนำไปเชื่อมกับพนักงานรายอื่นได้`,
            nextActors.driver ? wasteLineShortcuts.driverMenu() : wasteLineShortcuts.driverIdentity(),
          ),
          wasteMenu(nextActors, "DRIVER"),
        ];
      }

      if (outcome.type === "DRIVER_USED") {
        await saveSession(
          lineUserId,
          "DRIVER",
          "DRIVER",
          "DRIVER_LINK",
          "DRIVER_CODE",
          {},
        );
        return textMessage(
          `พนักงาน ${outcome.driver.fullName} รหัส ${outcome.driver.driverCode} เชื่อมต่อ LINE แล้ว กรุณาติดต่อเจ้าหน้าที่เทศบาลหากต้องการเปลี่ยนบัญชี LINE`,
          wasteLineShortcuts.driverIdentity(),
        );
      }

      if (outcome.type === "ALREADY") {
        await clearSession(lineUserId, "DRIVER");
        const nextActors = await loadActors(lineUserId);
        return [
          textMessage(
            `บัญชี LINE นี้ยืนยันตัวตนกับ ${outcome.driver.fullName} อยู่แล้ว\nรหัสพนักงาน ${outcome.driver.driverCode}`,
            wasteLineShortcuts.driverMenu(),
          ),
          wasteMenu(nextActors, "DRIVER"),
        ];
      }

      if (outcome.type === "PHONE_MISMATCH") {
        await saveSession(
          lineUserId,
          "DRIVER",
          "DRIVER",
          "DRIVER_LINK",
          "PHONE",
          {
            driverId: outcome.driver.id,
            driverCode: outcome.driver.driverCode,
          },
        );
        return textMessage(
          `หมายเลขโทรศัพท์ไม่ตรงกับข้อมูลของรหัสพนักงาน ${outcome.driver.driverCode} กรุณาตรวจสอบหมายเลขโทรศัพท์แล้วกรอกใหม่`,
          wasteLineShortcuts.driverIdentity(),
        );
      }

      const nextActors = await loadActors(lineUserId);
      return [
        textMessage(
          `ยืนยันตัวตนพนักงานประจำรถขยะสำเร็จ\n${outcome.driver.fullName}\nรหัสพนักงาน ${outcome.driver.driverCode}`,
          wasteLineShortcuts.driverMenu(),
        ),
        wasteMenu(nextActors, "DRIVER"),
      ];
    }

    await saveSession(
      lineUserId,
      "DRIVER",
      "DRIVER",
      "DRIVER_LINK",
      "DRIVER_CODE",
      {},
    );
    return textMessage(
      "ไม่พบขั้นตอนยืนยันตัวตนที่ค้างอยู่ ระบบเริ่มขั้นตอนใหม่แล้ว กรุณาพิมพ์รหัสพนักงาน",
      wasteLineShortcuts.driverIdentity(),
    );
  }
  const plan = await ensureDriverPlan(actors.driver, session.draft.planId, ["IN_PROGRESS", "INTERRUPTED"]);
  if (session.flowType === "DRIVER_LOCATION") {
    if (event.message?.type !== "location") return textMessage("กรุณากดปุ่ม “ส่งตำแหน่งรถ” ด้านล่าง", wasteLineShortcuts.driverLocation());
    const latitude = Number(event.message.latitude);
    const longitude = Number(event.message.longitude);
    await withTransaction(async (db) => {
      await db.execute(
        `INSERT INTO waste_location_logs (plan_id, latitude, longitude, accuracy_m, recorded_at, source)
         VALUES (?, ?, ?, ?, NOW(), 'LINE')`,
        [plan.id, latitude, longitude, event.message.accuracy || null],
      );
      await db.execute(`UPDATE waste_vehicles SET last_latitude = ?, last_longitude = ?, last_gps_at = NOW() WHERE id = ?`, [latitude, longitude, plan.vehicleId]);
      await db.execute(`DELETE FROM waste_line_sessions WHERE channel_type = 'DRIVER' AND line_user_id = ?`, [lineUserId]);
    });
    return textMessage(`บันทึกตำแหน่งรถสำหรับ ${plan.planNo} แล้ว`, wasteLineShortcuts.activePlan(plan));
  }
  if (session.flowType === "DRIVER_INCIDENT") {
    if (event.message?.type !== "text" || normalizeText(event.message.text).length < 4) return textMessage("กรุณาพิมพ์รายละเอียดเหตุที่เกิดขึ้นอย่างน้อย 4 ตัวอักษร", wasteLineShortcuts.driverCancelFlow());
    await withTransaction(async (db) => {
      await db.execute(
        `INSERT INTO waste_incidents (id, plan_id, vehicle_id, driver_id, incident_type, description, happened_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [crypto.randomUUID(), plan.id, plan.vehicleId, actors.driver.id, session.draft.incidentType || "OTHER", normalizeText(event.message.text)],
      );
      await db.execute(`UPDATE waste_operation_plans SET status = 'INTERRUPTED' WHERE id = ?`, [plan.id]);
      await db.execute(`DELETE FROM waste_line_sessions WHERE channel_type = 'DRIVER' AND line_user_id = ?`, [lineUserId]);
    });
    return textMessage(`ส่งเหตุ “${DRIVER_INCIDENT_LABELS[session.draft.incidentType] || DRIVER_INCIDENT_LABELS.OTHER}” ของงาน ${plan.planNo} ให้เจ้าหน้าที่แล้ว\nสถานะงานเปลี่ยนเป็น “หยุดชะงัก”`, wasteLineShortcuts.activePlan({ ...plan, status: "INTERRUPTED" }));
  }
  return textMessage("ไม่พบขั้นตอนงานพนักงานประจำรถขยะ กรุณายกเลิกรายการแล้วเปิดงานของฉันใหม่", wasteLineShortcuts.driverCancelFlow());
}

async function handleWasteAction(params, lineUserId, actors, audience) {
  const action = String(params.waste || "");
  const allowed = audience === "DRIVER"
    ? action === "menu" || action.startsWith("driver_")
    : action === "menu" || action === "register" || action.startsWith("citizen_");
  if (!allowed) return wasteMenu(actors, audience);
  if (params.waste === "menu") return wasteMenu(actors, audience);
  if (params.waste === "register") return beginRegistration(lineUserId);
  if (params.waste === "citizen_schedule") return citizenSchedule(actors.citizen);
  if (params.waste === "citizen_location") return citizenLocation(actors.citizen);
  if (params.waste === "citizen_charges") return citizenCharges(actors.citizen);
  if (params.waste === "driver_link") {
    if (actors.driverRecord && !actors.driverRecord.isActive) {
      return textMessage(`บัญชีพนักงาน ${actors.driverRecord.fullName} ถูกระงับหรือยกเลิกการใช้งาน กรุณาติดต่อเจ้าหน้าที่เทศบาล`);
    }
    if (actors.driver) return textMessage(`บัญชี LINE นี้ยืนยันตัวตนแล้ว\n${actors.driver.fullName}\nรหัสพนักงาน ${actors.driver.driverCode || "-"}`, wasteLineShortcuts.driverMenu());
    await saveSession(lineUserId, "DRIVER", "DRIVER", "DRIVER_LINK", "DRIVER_CODE", {});
    return textMessage("ยืนยันตัวตนพนักงานประจำรถขยะ\nกรุณาพิมพ์รหัสพนักงานที่เทศบาลบันทึกไว้", wasteLineShortcuts.driverIdentity());
  }
  if (actors.driverRecord && !actors.driverRecord.isActive && action.startsWith("driver_") && action !== "driver_link") {
    return textMessage(`บัญชีพนักงาน ${actors.driverRecord.fullName} ถูกระงับหรือยกเลิกการใช้งาน กรุณาติดต่อเจ้าหน้าที่เทศบาล`);
  }
  if (params.waste === "driver_jobs") return driverJobs(actors.driver, lineUserId, "ALL");
  if (params.waste === "driver_jobs_today") return driverJobs(actors.driver, lineUserId, "TODAY");
  if (params.waste === "driver_jobs_upcoming") return driverJobs(actors.driver, lineUserId, "UPCOMING");
  if (params.waste === "driver_help") return driverHelp(actors);
  if (params.waste === "driver_plan") return driverPlanDetails(actors.driver, params.planId, lineUserId, params.page);

  if (params.waste === "driver_start") {
    const plan =
      await ensureDriverPlan(
        actors.driver,
        params.planId,
        ["SCHEDULED"],
      );

    await withTransaction(
      async (db) => {
        await db.execute(
          `UPDATE waste_operation_plans
           SET
             status = 'IN_PROGRESS',
             actual_start_at =
               COALESCE(
                 actual_start_at,
                 NOW()
               )
           WHERE id = ?`,
          [plan.id],
        );

        await db.execute(
          `UPDATE waste_vehicles
           SET status = 'IN_SERVICE'
           WHERE id = ?`,
          [plan.vehicleId],
        );

        await queueCollectionStatusNotices(
          db,
          plan,
          "IN_PROGRESS",
        );
      },
    );

    return operationResultCard(
      "เริ่มปฏิบัติงานแล้ว",
      [
        lineCardRow("เลขที่แผนปฏิบัติงานเก็บขยะ", plan.planNo),
        lineCardRow("เส้นทาง", plan.routeName),
        lineCardText("เปิด GPS ต่อเนื่องและอนุญาตตำแหน่ง โดยคงหน้าติดตามไว้ระหว่างปฏิบัติงาน", { size: "xs", color: "#49665C" }),
      ],
      [
        uriAction(
          "เปิด GPS ต่อเนื่อง",
          trackingUrl(
            plan,
            lineUserId,
            actors.driver.id,
          ),
        ),
        ...wasteLineShortcuts
          .activePlan(plan)
          .filter(
            (action) =>
              !String(
                action.data || "",
              ).startsWith(
                "waste=driver_gps",
          ),
        ),
      ],
    );
  }
  if (params.waste === "driver_complete") {
    const plan =
      await ensureDriverPlan(
        actors.driver,
        params.planId,
        [
          "IN_PROGRESS",
          "INTERRUPTED",
        ],
      );

    await withTransaction(
      async (db) => {
        await db.execute(
          `UPDATE waste_operation_plans
           SET
             status = 'COMPLETED',
             actual_end_at = NOW()
           WHERE id = ?`,
          [plan.id],
        );

        await db.execute(
          `UPDATE waste_vehicles
           SET status = 'AVAILABLE'
           WHERE id = ?`,
          [plan.vehicleId],
        );
      },
    );

    const noticeText =
      "ปิดแผนเรียบร้อยแล้ว ระบบแจ้งประชาชนตามการยืนยันเก็บขยะรายจุดเท่านั้น และไม่ส่งแจ้งเตือนซ้ำทั้งเส้นทางเมื่อปิดงาน";

    return operationResultCard(
      "บันทึกงานเสร็จสิ้นแล้ว",
      [
        lineCardRow(
          "เลขที่แผนปฏิบัติงานเก็บขยะ",
          plan.planNo,
        ),
        lineCardRow(
          "เส้นทาง",
          plan.routeName,
        ),
        lineCardText(
          noticeText,
          {
            size: "xs",
            color: "#49665C",
          },
        ),
      ],
      wasteLineShortcuts.driverMenu(),
    );
  }
  if (params.waste === "driver_gps") {
    const plan = await ensureDriverPlan(actors.driver, params.planId, ["IN_PROGRESS", "INTERRUPTED"]);
    return textMessage(`เปิด GPS ต่อเนื่องสำหรับ ${plan.planNo}\nกดปุ่มด้านล่างและอนุญาตตำแหน่ง`, [uriAction("เปิดหน้า GPS", trackingUrl(plan, lineUserId, actors.driver.id)), ...wasteLineShortcuts.activePlan(plan).filter((action) => !String(action.data || "").startsWith("waste=driver_gps"))]);
  }
  if (params.waste === "driver_location") {
    const plan = await ensureDriverPlan(actors.driver, params.planId, ["IN_PROGRESS", "INTERRUPTED"]);
    await saveSession(lineUserId, "DRIVER", "DRIVER", "DRIVER_LOCATION", "LOCATION", { planId: plan.id });
    return textMessage(`ส่งตำแหน่งรถสำหรับ ${plan.planNo}`, wasteLineShortcuts.driverLocation());
  }
  if (params.waste === "driver_incident") {
    const plan = await ensureDriverPlan(actors.driver, params.planId, ["IN_PROGRESS", "INTERRUPTED"]);
    return textMessage(`แจ้งเหตุสำหรับ ${plan.planNo}\nเลือกประเภทเหตุที่เกิดขึ้นก่อน แล้วระบบจะให้พิมพ์รายละเอียด`, wasteLineShortcuts.incidentTypes(plan));
  }
  if (params.waste === "driver_incident_type") {
    const plan = await ensureDriverPlan(actors.driver, params.planId, ["IN_PROGRESS", "INTERRUPTED"]);
    if (!DRIVER_INCIDENT_TYPES.has(params.incidentType)) {
      return textMessage("ประเภทเหตุไม่ถูกต้อง กรุณาเลือกจากเมนู", wasteLineShortcuts.incidentTypes(plan));
    }
    await saveSession(lineUserId, "DRIVER", "DRIVER", "DRIVER_INCIDENT", "DESCRIPTION", {
      planId: plan.id,
      incidentType: params.incidentType,
    });
    return textMessage(`แจ้งเหตุ: ${DRIVER_INCIDENT_LABELS[params.incidentType]}\nกรุณาพิมพ์รายละเอียดที่เกิดขึ้นอย่างน้อย 4 ตัวอักษร`, wasteLineShortcuts.driverCancelFlow());
  }
  if (params.waste === "driver_stops") {
    const plan = await ensureDriverPlan(
      actors.driver,
      params.planId,
      ["IN_PROGRESS", "INTERRUPTED"],
    );

    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS totalStops
       FROM waste_route_stops
       WHERE route_id = ? AND is_active = 1`,
      [plan.routeId],
    );
    const totalStops = Number(countRows[0]?.totalStops || 0);
    const withoutStopAction = wasteLineShortcuts
      .activePlan(plan)
      .filter(
        (action) =>
          !String(action.data || "").startsWith("waste=driver_stops"),
      );

    if (!totalStops) {
      return operationResultCard(
        "เส้นทางนี้ยังไม่มีจุดเก็บขยะ",
        [
          lineCardRow("เลขที่แผนปฏิบัติงานเก็บขยะ", plan.planNo),
          lineCardRow("เส้นทาง", plan.routeName),
          lineCardText(
            "ไม่พบจุดเก็บขยะที่เปิดใช้งานในเส้นทางนี้ กรุณาแจ้งเจ้าหน้าที่เทศบาลตรวจสอบข้อมูลเส้นทาง",
            { size: "xs", color: "#6B8179" },
          ),
        ],
        withoutStopAction,
        LINE_CARD_COLORS.ORANGE,
      );
    }

    const [rows] = await pool.execute(
      `SELECT s.id, s.sequence_no AS sequenceNo, s.stop_name AS stopName
       FROM waste_route_stops s
       LEFT JOIN waste_stop_confirmations c
         ON c.stop_id = s.id AND c.plan_id = ?
       WHERE s.route_id = ?
         AND s.is_active = 1
         AND c.id IS NULL
       ORDER BY s.sequence_no
       LIMIT 8`,
      [plan.id, plan.routeId],
    );

    if (!rows.length) {
      return operationResultCard(
        "ยืนยันจุดเก็บขยะครบแล้ว",
        [
          lineCardRow("เลขที่แผนปฏิบัติงานเก็บขยะ", plan.planNo),
          lineCardRow("เส้นทาง", plan.routeName),
          lineCardRow("จุดเก็บขยะทั้งหมด", `${totalStops.toLocaleString("th-TH")} จุด`),
          lineCardText(
            "ไม่มีจุดเก็บขยะที่รอยืนยันในงานนี้แล้ว",
            { size: "xs", color: "#49665C" },
          ),
        ],
        withoutStopAction,
        LINE_CARD_COLORS.GREEN,
      );
    }

    return buildCollectionStopsMessage(
      plan,
      rows,
      wasteLineShortcuts.activePlan(plan),
    );
  }
  if (params.waste === "driver_confirm_stop") {
    const plan = await ensureDriverPlan(actors.driver, params.planId, ["IN_PROGRESS", "INTERRUPTED"]);
    const [stops] = await pool.execute(`SELECT id, stop_name AS stopName FROM waste_route_stops WHERE id = ? AND route_id = ? AND is_active = 1`, [params.stopId, plan.routeId]);
    if (!stops[0]) throw new Error("ไม่พบจุดเก็บในเส้นทางนี้");
    await pool.execute(
      `INSERT INTO waste_stop_confirmations (id, plan_id, stop_id, status, confirmed_at)
       VALUES (?, ?, ?, 'COLLECTED', NOW())
       ON DUPLICATE KEY UPDATE status = 'COLLECTED', confirmed_at = NOW()`,
      [crypto.randomUUID(), plan.id, params.stopId],
    );
    return operationResultCard(
      "ยืนยันเก็บขยะแล้ว",
      [
        lineCardRow("จุดเก็บขยะ", stops[0].stopName),
        lineCardRow("เลขที่แผนปฏิบัติงานเก็บขยะ", plan.planNo),
      ],
      wasteLineShortcuts.normalize([
        postbackAction("จุดถัดไป", `waste=driver_stops&planId=${plan.id}`, `ดูจุดเก็บถัดไป ${plan.planNo}`),
        ...wasteLineShortcuts.activePlan(plan),
      ]),
    );
  }
  return wasteMenu(actors, audience);
}

export function isExplicitWasteCommand(event, audience = "CITIZEN") {
  if (event?.type === "postback") return Boolean(parsePostback(event.postback?.data).waste);
  if (event?.type !== "message" || event.message?.type !== "text") return false;
  const text = normalizeWasteCommand(event.message.text, audience);
  if (audience === "DRIVER") {
    return [
      "เมนู",
      "เมนูพนักงานประจำรถขยะ",
      "งานเก็บขยะของฉัน",
      "งานวันนี้",
      "งานล่วงหน้า",
      "ยืนยันตัวตนพนักงานประจำรถขยะ",
      "เริ่มยืนยันตัวตนใหม่",
      "วิธีใช้งานพนักงาน",
      "ยกเลิกบริการขยะ",
    ].includes(text);
  }
  return ["เมนูขยะ", "บริการขยะ", "รถขยะ", "เก็บขยะ", "ลงทะเบียนบริการเก็บขยะ", "ตารางกำหนดการ", "ตำแหน่งรถขยะ", "ค่าบริการเก็บขยะ", "ยกเลิกบริการขยะ"].includes(text);
}

export async function handleWasteLineEvent(event, { audience = "CITIZEN", force = false } = {}) {
  const lineUserId = String(event?.source?.userId || "").trim();
  if (!lineUserId) return { handled: false };
  let session = await getSession(lineUserId, audience);
  if (!session && !force && !isExplicitWasteCommand(event, audience)) return { handled: false };

  const text = event.type === "message" && event.message?.type === "text" ? normalizeWasteCommand(event.message.text, audience) : "";
  if (text === "ยกเลิกบริการขยะ") {
    await clearSession(lineUserId, audience);
    const actors = await loadActors(lineUserId);
    return { handled: true, messages: [textMessage("ยกเลิกรายการที่ค้างอยู่แล้ว"), wasteMenu(actors, audience)] };
  }

  const actors = await loadActors(lineUserId);
  let result;
  const postbackParams = event.type === "postback" ? parsePostback(event.postback?.data) : {};
  if (session && event.type === "message" && isExplicitWasteCommand(event, audience)) {
    await clearSession(lineUserId, audience);
    session = null;
  }
  if (audience === "DRIVER" && postbackParams.waste === "driver_link") {
    result = await handleWasteAction(postbackParams, lineUserId, actors, audience);
  } else if (audience === "DRIVER" && text === "เริ่มยืนยันตัวตนใหม่") {
    await saveSession(lineUserId, "DRIVER", "DRIVER", "DRIVER_LINK", "DRIVER_CODE", {});
    result = textMessage("เริ่มยืนยันตัวตนใหม่ กรุณาพิมพ์รหัสพนักงาน", wasteLineShortcuts.driverIdentity());
  } else if (audience === "DRIVER" && text === "ยืนยันตัวตนพนักงานประจำรถขยะ") {
    result = await handleWasteAction({ waste: "driver_link" }, lineUserId, actors, audience);
  } else if (audience === "DRIVER" && text === "วิธีใช้งานพนักงาน") {
    result = driverHelp(actors);
  } else if (event.type === "postback" && postbackParams.waste) {
    if (session) {
      await clearSession(lineUserId, audience);
    }
    result = await handleWasteAction(postbackParams, lineUserId, actors, audience);
  } else if (audience === "CITIZEN" && session?.flowType === "REGISTER") {
    result = await handleRegistrationStep(event, lineUserId, session);
  } else if (audience === "DRIVER" && session) {
    result = await handleDriverSession(event, lineUserId, session, actors);
  } else if (audience === "CITIZEN" && text === "ลงทะเบียนบริการเก็บขยะ") {
    result = await beginRegistration(lineUserId);
  } else if (audience === "CITIZEN" && text === "ตารางกำหนดการ") {
    result = await citizenSchedule(actors.citizen);
  } else if (audience === "CITIZEN" && text === "ตำแหน่งรถขยะ") {
    result = await citizenLocation(actors.citizen);
  } else if (audience === "CITIZEN" && text === "ค่าบริการเก็บขยะ") {
    result = await citizenCharges(actors.citizen);
  } else if (audience === "DRIVER" && text === "งานเก็บขยะของฉัน") {
    result = await driverJobs(actors.driver, lineUserId, "ALL");
  } else if (audience === "DRIVER" && text === "งานวันนี้") {
    result = await driverJobs(actors.driver, lineUserId, "TODAY");
  } else if (audience === "DRIVER" && text === "งานล่วงหน้า") {
    result = await driverJobs(actors.driver, lineUserId, "UPCOMING");
  } else if (event.type === "postback") {
    result = await handleWasteAction(postbackParams, lineUserId, actors, audience);
  } else {
    result = wasteMenu(actors, audience);
  }

  return { handled: true, messages: (Array.isArray(result) ? result : [result]).filter(Boolean), preserveRichMenu: true };
}

export async function cleanupWasteLineState() {
  const [sessions] = await pool.execute(`DELETE FROM waste_line_sessions WHERE expires_at <= NOW()`);
  return { sessions: Number(sessions.affectedRows || 0), linkCodes: 0 };
}

export { parsePostback as parseWastePostback };
