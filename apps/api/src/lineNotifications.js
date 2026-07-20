import crypto from "node:crypto";
import { config } from "./config.js";
import { pool } from "./db.js";

export async function enqueueLineNotification(db, { ownerId, entityType, entityId, lineUserId, templateCode, message }) {
  const id = crypto.randomUUID();
  const configured = Boolean(lineUserId && config.lineChannelAccessToken);
  await db.execute(
    `INSERT INTO notifications
      (id, owner_id, entity_type, entity_id, line_user_id, template_code, message_text,
       delivery_status, last_error)
     VALUES (?, ?, ?, ?, NULLIF(?, ''), ?, ?, ?, ?)`,
    [id, ownerId, entityType, entityId || null, lineUserId || "", templateCode, message,
      configured ? "PENDING" : "SKIPPED", configured ? null : (lineUserId ? "LINE_NOT_CONFIGURED" : "OWNER_NOT_LINKED")],
  );
  return { id, status: configured ? "PENDING" : "SKIPPED" };
}

export async function deliverLineNotification(id) {
  const [claim] = await pool.execute(
    `UPDATE notifications
     SET delivery_status = 'PROCESSING', attempts = attempts + 1
     WHERE id = ? AND delivery_status IN ('PENDING','FAILED')
       AND next_attempt_at <= NOW() AND attempts < 5`,
    [id],
  );
  if (!claim.affectedRows) {
    const [rows] = await pool.execute("SELECT delivery_status AS status FROM notifications WHERE id = ? LIMIT 1", [id]);
    return { status: rows[0]?.status || "NOT_FOUND" };
  }

  const [rows] = await pool.execute(
    `SELECT line_user_id AS lineUserId, message_text AS message, attempts
     FROM notifications WHERE id = ? LIMIT 1`,
    [id],
  );
  const notification = rows[0];
  try {
    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.lineChannelAccessToken}`,
        "Content-Type": "application/json",
        "X-Line-Retry-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ to: notification.lineUserId, messages: [{ type: "text", text: notification.message }] }),
    });
    if (response.ok) {
      await pool.execute(
        `UPDATE notifications SET delivery_status = 'SENT', sent_at = NOW(), last_http_status = ?, last_error = NULL WHERE id = ?`,
        [response.status, id],
      );
      return { status: "SENT", httpStatus: response.status };
    }
    const errorText = (await response.text().catch(() => "")).slice(0, 500);
    const delayMinutes = Math.min(60, 2 ** Number(notification.attempts || 1));
    const nextAttemptAt = new Date(Date.now() + delayMinutes * 60_000);
    await pool.execute(
      `UPDATE notifications SET delivery_status = 'FAILED', next_attempt_at = ?, last_http_status = ?, last_error = ? WHERE id = ?`,
      [nextAttemptAt, response.status, errorText || `LINE_HTTP_${response.status}`, id],
    );
    return { status: "FAILED", httpStatus: response.status };
  } catch (error) {
    const delayMinutes = Math.min(60, 2 ** Number(notification.attempts || 1));
    await pool.execute(
      `UPDATE notifications SET delivery_status = 'FAILED', next_attempt_at = ?, last_error = ? WHERE id = ?`,
      [new Date(Date.now() + delayMinutes * 60_000), String(error?.message || "LINE_NETWORK_ERROR").slice(0, 500), id],
    );
    return { status: "FAILED", httpStatus: null };
  }
}

export async function processPendingLineNotifications(limit = 20) {
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const [rows] = await pool.query(
    `SELECT id FROM notifications
     WHERE delivery_status IN ('PENDING','FAILED') AND next_attempt_at <= NOW() AND attempts < 5
     ORDER BY next_attempt_at LIMIT ${safeLimit}`,
  );
  const results = [];
  for (const row of rows) results.push(await deliverLineNotification(row.id));
  return results;
}
