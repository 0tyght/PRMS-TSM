import crypto from "node:crypto";
import { config } from "../../../core/config.js";


const THEMES = Object.freeze({
  SCHEDULE_PUBLISHED: { kicker: "ตารางเก็บขยะ", title: "แจ้งกำหนดการเก็บขยะ", accent: "#176B50", action: ["ดูตารางกำหนดการ", "waste=citizen_schedule", "ตารางกำหนดการเก็บขยะประจำพื้นที่"] },
  SCHEDULE_WITHDRAWN: { kicker: "ตารางเก็บขยะ", title: "แจ้งเปลี่ยนแปลงกำหนดการ", accent: "#8A5A22", action: ["ตรวจตารางล่าสุด", "waste=citizen_schedule", "ตารางกำหนดการเก็บขยะประจำพื้นที่"] },
  COLLECTION_STATUS: { kicker: "สถานะการเก็บขยะ", title: "อัปเดตการปฏิบัติงาน", accent: "#176B50", action: ["ดูตำแหน่งรถ", "waste=citizen_location", "ดูตำแหน่งรถเก็บขยะ"] },
  CHARGE_NOTICE: { kicker: "ค่าบริการเก็บขยะ", title: "ใบแจ้งค่าบริการ", accent: "#7A5B2F", action: ["ตรวจสอบค่าบริการ", "waste=citizen_charges", "ตรวจสอบค่าบริการเก็บขยะ"] },
  PAYMENT_REMINDER: { kicker: "ค่าบริการเก็บขยะ", title: "แจ้งเตือนกำหนดชำระ", accent: "#9A4C2D", action: ["ตรวจสอบค่าบริการ", "waste=citizen_charges", "ตรวจสอบค่าบริการเก็บขยะ"] },
  PLAN_ASSIGNMENT: { kicker: "งานเก็บขยะ", title: "ได้รับมอบหมายงาน", accent: "#315E86", action: ["ดูงานของฉัน", "waste=driver_jobs", "ดูแผนปฏิบัติงานเก็บขยะที่ได้รับมอบหมาย"] },
});


export function buildWasteLinePushMessage(notificationType, text) {
  const sourceText = String(text || "").trim();
  const theme = THEMES[notificationType] || { kicker: "บริการเก็บขยะ", title: "แจ้งข้อมูลจากเทศบาล", accent: "#176B50", action: null };
  const footer = theme.action ? {
    type: "box", layout: "vertical", paddingAll: "16px",
    contents: [{ type: "button", style: "primary", height: "sm", color: theme.accent,
      action: { type: "postback", label: theme.action[0], data: theme.action[1], displayText: theme.action[2] } }],
  } : null;
  return {
    type: "flex",
    altText: (sourceText || theme.title).slice(0, 400),
    contents: {
      type: "bubble", size: "mega",
      header: { type: "box", layout: "vertical", paddingAll: "18px", backgroundColor: theme.accent,
        contents: [
          { type: "text", text: "เทศบาลเมืองท่าโพธิ์", color: "#E7F1ED", size: "xs", weight: "bold" },
          { type: "text", text: theme.kicker, color: "#FFFFFF", size: "sm", margin: "sm" },
          { type: "text", text: theme.title, color: "#FFFFFF", size: "xl", weight: "bold", wrap: true, margin: "sm" },
        ] },
      body: { type: "box", layout: "vertical", paddingAll: "18px",
        contents: [{ type: "text", text: sourceText || "มีข้อมูลใหม่จากระบบบริการเก็บขยะ", size: "sm", color: "#31473F", wrap: true }] },
      ...(footer ? { footer } : {}),
    },
  };
}


export class WasteLineNotificationQueue {
  constructor({ database, fetchImplementation = fetch, accessToken = config.lineChannelAccessToken } = {}) {
    if (!database) throw new TypeError("WasteLineNotificationQueue requires database");
    this.database = database;
    this.fetchImplementation = fetchImplementation;
    this.accessToken = accessToken;
  }
  async processPending(limit = 30) {
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 30));
    const [rows] = await this.database.query(
      `SELECT id FROM waste_line_notifications WHERE delivery_status IN ('PENDING','FAILED') AND next_attempt_at <= NOW() AND attempts < 5 ORDER BY next_attempt_at, created_at LIMIT ${safeLimit}`,
    );
    const results = [];
    for (const row of rows) results.push(await this.deliver(row.id));
    return results;
  }
  async deliver(id) {
    const [claimed] = await this.database.execute(
      `UPDATE waste_line_notifications SET delivery_status = 'PROCESSING', attempts = attempts + 1 WHERE id = ? AND delivery_status IN ('PENDING','FAILED') AND next_attempt_at <= NOW() AND attempts < 5`,
      [id],
    );
    if (!claimed.affectedRows) return { status: "SKIPPED" };
    const [[row]] = await this.database.execute(
      `SELECT line_user_id AS lineUserId, notification_type AS notificationType, message_text AS message, attempts FROM waste_line_notifications WHERE id = ?`,
      [id],
    );
    if (!row) return { status: "NOT_FOUND" };
    if (!this.accessToken) {
      await this.markFailed(id, "LINE_NOT_CONFIGURED", Number(row.attempts || 1));
      return { status: "FAILED" };
    }
    try {
      const response = await this.fetchImplementation("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.accessToken}`, "Content-Type": "application/json", "X-Line-Retry-Key": crypto.randomUUID() },
        body: JSON.stringify({ to: row.lineUserId, messages: [buildWasteLinePushMessage(row.notificationType, row.message)] }),
      });
      if (response.ok) {
        await this.database.execute(`UPDATE waste_line_notifications SET delivery_status = 'SENT', sent_at = NOW(), last_error = NULL WHERE id = ?`, [id]);
        return { status: "SENT" };
      }
      const errorText = String(await response.text().catch(() => "")).slice(0, 900) || `LINE_HTTP_${response.status}`;
      await this.markFailed(id, errorText, Number(row.attempts || 1));
      return { status: "FAILED", httpStatus: response.status };
    } catch (error) {
      await this.markFailed(id, String(error?.message || "LINE_NETWORK_ERROR").slice(0, 900), Number(row.attempts || 1));
      return { status: "FAILED" };
    }
  }
  async markFailed(id, message, attempts) {
    const delayMinutes = Math.min(60, 2 ** attempts);
    await this.database.execute(
      `UPDATE waste_line_notifications SET delivery_status = 'FAILED', next_attempt_at = DATE_ADD(NOW(), INTERVAL ? MINUTE), last_error = ? WHERE id = ?`,
      [delayMinutes, message, id],
    );
  }
}