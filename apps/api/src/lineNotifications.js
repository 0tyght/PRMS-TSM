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

export async function enqueueVaccinationReminders() {
  if (!config.lineChannelAccessToken) return { queued: 0 };

  const [result] = await pool.execute(
    `INSERT INTO notifications
      (id, owner_id, entity_type, entity_id, line_user_id, template_code,
       message_text, delivery_status, last_error)
     SELECT
       UUID(), o.id, 'PET', p.id, o.line_user_id,
       CONCAT(
         CASE WHEN vr.next_due_at < CURDATE()
           THEN 'VACCINE_OVERDUE_' ELSE 'VACCINE_DUE_SOON_' END,
         DATE_FORMAT(vr.next_due_at, '%Y%m%d')
       ) AS templateCode,
       CONCAT(
         'แจ้งเตือนวัคซีนสัตว์เลี้ยง: ', p.name, ' ',
         CASE WHEN vr.next_due_at < CURDATE()
           THEN 'เกินกำหนดฉีดวัคซีนตั้งแต่วันที่ '
           ELSE 'ใกล้ถึงกำหนดฉีดวัคซีนวันที่ ' END,
         DATE_FORMAT(vr.next_due_at, '%d/%m/%Y'),
         ' กรุณาติดต่อเทศบาลท่าโพธ์หรือบันทึกข้อมูลวัคซีนล่าสุดผ่าน LINE'
       ),
       'PENDING', NULL
     FROM pets p
     INNER JOIN owners o
       ON o.id = p.owner_id
      AND o.deleted_at IS NULL
      AND o.line_user_id IS NOT NULL
     INNER JOIN vaccination_records vr
       ON vr.id = (
         SELECT latest.id
         FROM vaccination_records latest
         WHERE latest.pet_id = p.id
         ORDER BY latest.vaccinated_at DESC, latest.created_at DESC
         LIMIT 1
       )
     WHERE p.deleted_at IS NULL
       AND p.status = 'ACTIVE'
       AND vr.next_due_at IS NOT NULL
       AND vr.next_due_at <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
       AND EXISTS (
         SELECT 1 FROM registrations r
         WHERE r.pet_id = p.id AND r.status = 'APPROVED'
       )
       AND NOT EXISTS (
         SELECT 1
         FROM notifications n
         WHERE n.entity_type = 'PET'
           AND n.entity_id = p.id
           AND n.template_code = CONCAT(
             CASE WHEN vr.next_due_at < CURDATE()
               THEN 'VACCINE_OVERDUE_' ELSE 'VACCINE_DUE_SOON_' END,
             DATE_FORMAT(vr.next_due_at, '%Y%m%d')
           )
       )`,
  );

  return { queued: Number(result.affectedRows || 0) };
}
