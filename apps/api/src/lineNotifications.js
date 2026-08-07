import crypto from "node:crypto";

import { config } from "./config.js";
import { pool } from "./db.js";
import { syncRichMenuForLineUser } from "./citizenExperience.js";

const ACTIONABLE_STATUS_CODES = new Set([
  "NEED_MORE_INFO",
  "APPROVED",
  "REJECTED",
]);

const LINE_TEXT_LIMIT = 5_000;
const MESSAGE_SAFETY_LIMIT = 4_800;
const REMINDER_LOCK_NAME = "prms-tsm:vaccine-household-reminders:v13";

export function shouldSendRealtimeStatusNotification(status) {
  return ACTIONABLE_STATUS_CODES.has(String(status || "").trim().toUpperCase());
}

function toIsoDate(value) {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function formatThaiDate(value) {
  const iso = toIsoDate(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "ไม่ระบุวัน";
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

function reminderTypeLabel(type) {
  return type === "OVERDUE" ? "เกินกำหนด" : "ใกล้ถึงกำหนด";
}

export function groupVaccinationReminderRows(rows) {
  const groups = new Map();

  for (const row of rows || []) {
    const lineUserId = String(row?.lineUserId || "").trim();
    if (!lineUserId) continue;

    const householdKey = String(row?.householdId || row?.ownerId || lineUserId);
    const key = `${lineUserId}:${householdKey}`;

    if (!groups.has(key)) {
      groups.set(key, {
        ownerId: row.ownerId,
        householdId: row.householdId || null,
        lineUserId,
        houseNo: row.houseNo || "",
        villageNo: row.villageNo || "",
        items: [],
      });
    }

    groups.get(key).items.push({
      ownerId: row.ownerId,
      petId: row.petId,
      petName: row.petName || "สัตว์เลี้ยง",
      nextDueAt: toIsoDate(row.nextDueAt),
      reminderType: row.reminderType === "OVERDUE" ? "OVERDUE" : "DUE_SOON",
      reminderCode: row.reminderCode,
    });
  }

  return [...groups.values()].map((group) => ({
    ...group,
    items: group.items.sort((left, right) => {
      if (left.reminderType !== right.reminderType) {
        return left.reminderType === "OVERDUE" ? -1 : 1;
      }
      return String(left.nextDueAt).localeCompare(String(right.nextDueAt));
    }),
  }));
}

export function buildHouseholdVaccinationMessage(group) {
  const items = Array.isArray(group?.items) ? group.items : [];
  const addressParts = [];
  if (group?.houseNo) addressParts.push(`บ้านเลขที่ ${group.houseNo}`);
  if (group?.villageNo) addressParts.push(`หมู่ ${group.villageNo}`);

  const lines = [
    "PRMS-TSM เทศบาลท่าโพธิ์",
    "แจ้งเตือนวัคซีนสัตว์เลี้ยง",
  ];

  if (addressParts.length) lines.push(addressParts.join(" "));
  lines.push(`มีสัตว์ที่ต้องดำเนินการ ${items.length} ตัว`);

  let currentType = null;
  let included = 0;

  for (const item of items) {
    if (currentType !== item.reminderType) {
      const heading = item.reminderType === "OVERDUE"
        ? "\nเกินกำหนด"
        : "\nใกล้ถึงกำหนด";
      const candidateHeading = [...lines, heading].join("\n");
      if (candidateHeading.length > MESSAGE_SAFETY_LIMIT) break;
      lines.push(heading);
      currentType = item.reminderType;
    }

    const itemLine = `• ${item.petName} — ${reminderTypeLabel(item.reminderType)} ${formatThaiDate(item.nextDueAt)}`;
    const candidate = [...lines, itemLine].join("\n");
    if (candidate.length > MESSAGE_SAFETY_LIMIT) break;
    lines.push(itemLine);
    included += 1;
  }

  const omitted = Math.max(0, items.length - included);
  if (omitted > 0) lines.push(`• และอีก ${omitted} ตัว กรุณาเปิดเมนูสุขภาพสัตว์เพื่อตรวจสอบ`);

  lines.push("\nกรุณาติดต่อเทศบาลท่าโพธิ์ หรือบันทึกข้อมูลวัคซีนล่าสุดผ่าน LINE");

  const message = lines.join("\n");
  return message.length <= LINE_TEXT_LIMIT
    ? message
    : `${message.slice(0, LINE_TEXT_LIMIT - 1)}…`;
}

function buildReminderBatchCode(group) {
  const source = group.items
    .map((item) => `${item.petId}:${item.reminderCode}`)
    .sort()
    .join("|");
  const digest = crypto.createHash("sha256").update(source).digest("hex").slice(0, 16);
  return `VACCINE_HOUSEHOLD_${digest}`;
}

export async function enqueueLineNotification(
  db,
  { ownerId, entityType, entityId, lineUserId, templateCode, message },
) {
  const id = crypto.randomUUID();
  const configured = Boolean(lineUserId && config.lineChannelAccessToken);
  await db.execute(
    `INSERT INTO notifications
      (id, owner_id, entity_type, entity_id, line_user_id, template_code, message_text,
       delivery_status, last_error)
     VALUES (?, ?, ?, ?, NULLIF(?, ''), ?, ?, ?, ?)`,
    [
      id,
      ownerId,
      entityType,
      entityId || null,
      lineUserId || "",
      templateCode,
      message,
      configured ? "PENDING" : "SKIPPED",
      configured ? null : (lineUserId ? "LINE_NOT_CONFIGURED" : "OWNER_NOT_LINKED"),
    ],
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
    const [rows] = await pool.execute(
      "SELECT delivery_status AS status FROM notifications WHERE id = ? LIMIT 1",
      [id],
    );
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
      body: JSON.stringify({
        to: notification.lineUserId,
        messages: [{ type: "text", text: notification.message }],
      }),
    });

    if (response.ok) {
      await pool.execute(
        `UPDATE notifications
         SET delivery_status = 'SENT', sent_at = NOW(), last_http_status = ?, last_error = NULL
         WHERE id = ?`,
        [response.status, id],
      );
      await syncRichMenuForLineUser(notification.lineUserId).catch((error) => {
        console.error(
          "[line-notification] rich menu sync failed",
          String(error?.message || error),
        );
      });
      return { status: "SENT", httpStatus: response.status };
    }

    const errorText = (await response.text().catch(() => "")).slice(0, 500);
    const delayMinutes = Math.min(60, 2 ** Number(notification.attempts || 1));
    const nextAttemptAt = new Date(Date.now() + delayMinutes * 60_000);
    await pool.execute(
      `UPDATE notifications
       SET delivery_status = 'FAILED', next_attempt_at = ?, last_http_status = ?, last_error = ?
       WHERE id = ?`,
      [nextAttemptAt, response.status, errorText || `LINE_HTTP_${response.status}`, id],
    );
    return { status: "FAILED", httpStatus: response.status };
  } catch (error) {
    const delayMinutes = Math.min(60, 2 ** Number(notification.attempts || 1));
    await pool.execute(
      `UPDATE notifications
       SET delivery_status = 'FAILED', next_attempt_at = ?, last_error = ?
       WHERE id = ?`,
      [
        new Date(Date.now() + delayMinutes * 60_000),
        String(error?.message || "LINE_NETWORK_ERROR").slice(0, 500),
        id,
      ],
    );
    return { status: "FAILED", httpStatus: null };
  }
}

export async function processPendingLineNotifications(limit = 20) {
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const [rows] = await pool.query(
    `SELECT id FROM notifications
     WHERE delivery_status IN ('PENDING','FAILED')
       AND next_attempt_at <= NOW()
       AND attempts < 5
     ORDER BY next_attempt_at
     LIMIT ${safeLimit}`,
  );

  const results = [];
  for (const row of rows) results.push(await deliverLineNotification(row.id));
  return results;
}

async function selectPendingVaccinationRows(db) {
  const [rows] = await db.execute(
    `SELECT
       o.id AS ownerId,
       o.line_user_id AS lineUserId,
       h.id AS householdId,
       h.house_no AS houseNo,
       v.village_no AS villageNo,
       p.id AS petId,
       p.name AS petName,
       vr.next_due_at AS nextDueAt,
       CASE
         WHEN vr.next_due_at < CURDATE() THEN 'OVERDUE'
         ELSE 'DUE_SOON'
       END AS reminderType,
       CONCAT(
         CASE
           WHEN vr.next_due_at < CURDATE() THEN 'VACCINE_OVERDUE_'
           ELSE 'VACCINE_DUE_SOON_'
         END,
         DATE_FORMAT(vr.next_due_at, '%Y%m%d')
       ) AS reminderCode
     FROM pets p
     INNER JOIN owners o
       ON o.id = p.owner_id
      AND o.deleted_at IS NULL
      AND o.line_user_id IS NOT NULL
     INNER JOIN households h
       ON h.id = o.household_id
      AND h.deleted_at IS NULL
     INNER JOIN villages v
       ON v.id = h.village_id
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
         SELECT 1
         FROM registrations r
         WHERE r.pet_id = p.id
           AND r.status = 'APPROVED'
       )
       AND NOT EXISTS (
         SELECT 1
         FROM notifications n
         WHERE n.entity_type = 'PET'
           AND n.entity_id = p.id
           AND n.template_code = CONCAT(
             CASE
               WHEN vr.next_due_at < CURDATE() THEN 'VACCINE_OVERDUE_'
               ELSE 'VACCINE_DUE_SOON_'
             END,
             DATE_FORMAT(vr.next_due_at, '%Y%m%d')
           )
       )
     ORDER BY o.line_user_id, h.id, vr.next_due_at, p.name`,
  );
  return rows;
}

async function insertReminderMarker(db, groupNotificationId, group, item) {
  const markerId = crypto.randomUUID();
  const [result] = await db.execute(
    `INSERT INTO notifications
      (id, owner_id, entity_type, entity_id, line_user_id, template_code,
       message_text, delivery_status, last_error)
     SELECT ?, ?, 'PET', ?, ?, ?, ?, 'SKIPPED', ?
     WHERE NOT EXISTS (
       SELECT 1
       FROM notifications existing
       WHERE existing.entity_type = 'PET'
         AND existing.entity_id = ?
         AND existing.template_code = ?
     )`,
    [
      markerId,
      item.ownerId || group.ownerId,
      item.petId,
      group.lineUserId,
      item.reminderCode,
      `รวมแจ้งเตือนวัคซีนของ ${item.petName} ไว้ในข้อความระดับครัวเรือน`,
      `GROUPED_IN:${groupNotificationId}`,
      item.petId,
      item.reminderCode,
    ],
  );
  return Number(result.affectedRows || 0) === 1;
}

export async function enqueueVaccinationReminders() {
  if (!config.lineChannelAccessToken) return { queued: 0, pets: 0, households: 0 };

  const db = await pool.getConnection();
  let lockAcquired = false;

  try {
    const [lockRows] = await db.execute(
      "SELECT GET_LOCK(?, 5) AS acquired",
      [REMINDER_LOCK_NAME],
    );
    lockAcquired = Number(lockRows[0]?.acquired || 0) === 1;
    if (!lockAcquired) return { queued: 0, pets: 0, households: 0, skipped: "LOCKED" };

    await db.beginTransaction();
    const rows = await selectPendingVaccinationRows(db);
    const initialGroups = groupVaccinationReminderRows(rows);

    let queued = 0;
    let pets = 0;

    for (const initialGroup of initialGroups) {
      const groupNotificationId = crypto.randomUUID();
      const acceptedItems = [];

      for (const item of initialGroup.items) {
        if (await insertReminderMarker(db, groupNotificationId, initialGroup, item)) {
          acceptedItems.push(item);
        }
      }

      if (!acceptedItems.length) continue;

      const group = { ...initialGroup, items: acceptedItems };
      const message = buildHouseholdVaccinationMessage(group);
      const templateCode = buildReminderBatchCode(group);
      const representativePetId = acceptedItems[0].petId;

      await db.execute(
        `INSERT INTO notifications
          (id, owner_id, entity_type, entity_id, line_user_id, template_code,
           message_text, delivery_status, last_error)
         VALUES (?, ?, 'PET', ?, ?, ?, ?, 'PENDING', NULL)`,
        [
          groupNotificationId,
          group.ownerId,
          representativePetId,
          group.lineUserId,
          templateCode,
          message,
        ],
      );

      queued += 1;
      pets += acceptedItems.length;
    }

    await db.commit();
    return { queued, pets, households: queued };
  } catch (error) {
    await db.rollback().catch(() => {});
    throw error;
  } finally {
    if (lockAcquired) {
      await db.execute("SELECT RELEASE_LOCK(?)", [REMINDER_LOCK_NAME]).catch(() => {});
    }
    db.release();
  }
}
