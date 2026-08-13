import crypto from "node:crypto";
import { config } from "../../../core/config.js";

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
      `SELECT id FROM waste_line_notifications
       WHERE delivery_status IN ('PENDING','FAILED') AND next_attempt_at <= NOW() AND attempts < 5
       ORDER BY next_attempt_at, created_at LIMIT ${safeLimit}`,
    );
    const results = [];
    for (const row of rows) results.push(await this.deliver(row.id));
    return results;
  }

  async deliver(id) {
    const [claimed] = await this.database.execute(
      `UPDATE waste_line_notifications SET delivery_status = 'PROCESSING', attempts = attempts + 1
       WHERE id = ? AND delivery_status IN ('PENDING','FAILED') AND next_attempt_at <= NOW() AND attempts < 5`,
      [id],
    );
    if (!claimed.affectedRows) return { status: "SKIPPED" };
    const [[row]] = await this.database.execute(
      `SELECT line_user_id AS lineUserId, message_text AS message, attempts
       FROM waste_line_notifications WHERE id = ?`,
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
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
          "X-Line-Retry-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({ to: row.lineUserId, messages: [{ type: "text", text: row.message }] }),
      });
      if (response.ok) {
        await this.database.execute(
          `UPDATE waste_line_notifications SET delivery_status = 'SENT', sent_at = NOW(), last_error = NULL WHERE id = ?`,
          [id],
        );
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
      `UPDATE waste_line_notifications
       SET delivery_status = 'FAILED', next_attempt_at = DATE_ADD(NOW(), INTERVAL ? MINUTE), last_error = ?
       WHERE id = ?`,
      [delayMinutes, message, id],
    );
  }
}
