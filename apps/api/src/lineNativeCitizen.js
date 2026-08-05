import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { config } from "./config.js";
import { pool, withTransaction } from "./db.js";
import {
  buildCitizenStatusFlex,
  loadCitizenExperienceByLineUserId,
  syncRichMenuForLineUser,
} from "./citizenExperience.js";

const LINE_CONTENT_ENDPOINT = "https://api-data.line.me/v2/bot/message";
const SESSION_TTL_HOURS = 24;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const PET_PAGE_SIZE = 8;

const FLOW_LABELS = Object.freeze({
  REGISTER: "ลงทะเบียนสัตว์เลี้ยง",
  LINK: "เชื่อมทะเบียนกับ LINE",
  TRACK: "ติดตามคำขอ",
  VACCINATION: "แจ้งข้อมูลวัคซีน",
  STERILIZATION: "แจ้งข้อมูลทำหมัน",
  PET_STATUS: "แจ้งสถานะสัตว์เลี้ยง",
  PET_UPDATE: "แก้ไขข้อมูลสัตว์เลี้ยง",
  OWNER_TRANSFER: "ขอโอนเจ้าของสัตว์เลี้ยง",
  LOCATION: "แก้ไขตำแหน่งบ้าน",
  PROFILE_UPDATE: "แก้ไขข้อมูลเจ้าของ",
  RESUBMIT: "ส่งข้อมูลเพิ่มเติม",
});

const STATUS_LABELS = Object.freeze({
  DRAFT: "ฉบับร่าง",
  SUBMITTED: "รอตรวจสอบ",
  UNDER_REVIEW: "เจ้าหน้าที่กำลังตรวจสอบ",
  NEED_MORE_INFO: "ต้องส่งข้อมูลเพิ่มเติม",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ไม่อนุมัติ",
  CANCELLED: "ยกเลิกแล้ว",
});

const SPECIES_LABELS = Object.freeze({ DOG: "สุนัข", CAT: "แมว" });
const SEX_LABELS = Object.freeze({
  MALE: "เพศผู้",
  FEMALE: "เพศเมีย",
  UNKNOWN: "ไม่ระบุ",
});
const PET_STATUS_LABELS = Object.freeze({
  ACTIVE: "ปกติ",
  MISSING: "สูญหาย",
  DECEASED: "เสียชีวิต",
  TRANSFERRED: "โอนเจ้าของ",
});
const SUBJECT_LABELS = Object.freeze({
  PET_UPDATE: "แก้ไขข้อมูลสัตว์",
  VACCINATION: "ข้อมูลวัคซีน",
  STERILIZATION: "ข้อมูลทำหมัน",
  PET_STATUS: "สถานะสัตว์",
  OWNER_TRANSFER: "โอนเจ้าของ",
});

function clampText(value, max = 5000) {
  return String(value ?? "").slice(0, max);
}

export function normalizeThaiPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("66") && digits.length === 11) {
    return `0${digits.slice(2)}`;
  }
  return digits;
}

export function isValidLineUserId(value) {
  return /^U[0-9a-f]{32}$/i.test(String(value || ""));
}

export function parsePostbackData(value) {
  const params = new URLSearchParams(String(value || ""));
  return Object.fromEntries(params.entries());
}

export function normalizeNativeCommand(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatThaiDate(value) {
  if (!value) return "ไม่ระบุ";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(date);
}

function truncateLabel(value, max = 20) {
  const text = String(value || "");
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function textMessage(text, quickReply = null) {
  return {
    type: "text",
    text: clampText(text),
    ...(quickReply ? { quickReply } : {}),
  };
}

function quickReply(items) {
  return {
    items: items.slice(0, 13).map((action) => ({ type: "action", action })),
  };
}

function postbackAction(label, data, displayText = label) {
  return {
    type: "postback",
    label: truncateLabel(label),
    data: clampText(data, 300),
    displayText: clampText(displayText, 300),
  };
}

function messageAction(label, text = label) {
  return {
    type: "message",
    label: truncateLabel(label),
    text: clampText(text, 300),
  };
}

function datetimeAction(label, data, options = {}) {
  return {
    type: "datetimepicker",
    label: truncateLabel(label),
    data: clampText(data, 300),
    mode: options.mode || "date",
    ...(options.initial ? { initial: options.initial } : {}),
    ...(options.min ? { min: options.min } : {}),
    ...(options.max ? { max: options.max } : {}),
  };
}

function locationAction(label = "ส่งตำแหน่งบ้าน") {
  return { type: "location", label: truncateLabel(label) };
}

function cameraAction(label = "ถ่ายรูป") {
  return { type: "camera", label: truncateLabel(label) };
}

function cameraRollAction(label = "เลือกรูป") {
  return { type: "cameraRoll", label: truncateLabel(label) };
}

function citizenLiffUrl(params = {}) {
  const base = config.lineLiffId
    ? `https://liff.line.me/${encodeURIComponent(config.lineLiffId)}`
    : "https://0tyght.github.io/PRMS-TSM/citizen/";
  const query = new URLSearchParams(params);
  return query.size ? `${base}?${query.toString()}` : base;
}

function uriAction(label, params = {}) {
  return {
    type: "uri",
    label: truncateLabel(label),
    uri: citizenLiffUrl(params),
  };
}

function resumeQuickReply() {
  return quickReply([
    postbackAction("ทำต่อ", "session=resume", "ทำรายการต่อ"),
    postbackAction("ยกเลิกรายการ", "session=cancel", "ยกเลิกรายการที่ค้างอยู่"),
  ]);
}

function cancelQuickReply(extra = []) {
  return quickReply([
    ...extra,
    postbackAction("ยกเลิก", "session=cancel", "ยกเลิกรายการ"),
  ]);
}

function locationPrompt(label = "กรุณาส่งตำแหน่งบ้าน") {
  return textMessage(
    `${label}\n\nกดปุ่ม “ส่งตำแหน่ง” แล้วเลื่อนหมุดบนแผนที่ของ LINE ให้ตรงกับบ้านก่อนกดส่ง`,
    cancelQuickReply([locationAction("ส่งตำแหน่ง")]),
  );
}

function photoPrompt({ required = false } = {}) {
  const actions = [cameraAction(), cameraRollAction()];
  if (!required) {
    actions.push(postbackAction("ข้าม", "session=photo_skip", "ข้ามการแนบรูป"));
  }
  return textMessage(
    required
      ? "กรุณาถ่ายรูปหรือเลือกรูปจากคลังภาพ"
      : "แนบรูปหลักฐานได้ตอนนี้ หรือกดข้าม",
    cancelQuickReply(actions),
  );
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function loadSession(lineUserId) {
  const [rows] = await pool.execute(
    `SELECT line_user_id AS lineUserId, flow_type AS flowType,
            current_step AS currentStep, draft_payload AS draftPayload,
            selected_pet_id AS selectedPetId, expires_at AS expiresAt
     FROM line_conversation_sessions
     WHERE line_user_id = ?
       AND expires_at > NOW()
     LIMIT 1`,
    [lineUserId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    draft: parseJson(row.draftPayload, {}),
  };
}

async function saveSession(lineUserId, flowType, currentStep, draft = {}, selectedPetId = null) {
  await pool.execute(
    `INSERT INTO line_conversation_sessions
       (line_user_id, flow_type, current_step, draft_payload, selected_pet_id, expires_at)
     VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))
     ON DUPLICATE KEY UPDATE
       flow_type = VALUES(flow_type),
       current_step = VALUES(current_step),
       draft_payload = VALUES(draft_payload),
       selected_pet_id = VALUES(selected_pet_id),
       expires_at = VALUES(expires_at),
       updated_at = NOW()`,
    [lineUserId, flowType, currentStep, JSON.stringify(draft), selectedPetId, SESSION_TTL_HOURS],
  );
  return { lineUserId, flowType, currentStep, draft, selectedPetId };
}

async function updateSession(session, currentStep, draft = session.draft, selectedPetId = session.selectedPetId) {
  return saveSession(session.lineUserId, session.flowType, currentStep, draft, selectedPetId);
}

async function clearSession(lineUserId) {
  await pool.execute("DELETE FROM line_conversation_sessions WHERE line_user_id = ?", [lineUserId]);
}

export async function claimLineWebhookEvent(event) {
  const eventId = String(event?.webhookEventId || "").trim();
  if (!eventId) return true;
  try {
    const [result] = await pool.execute(
      `INSERT INTO line_webhook_events
         (webhook_event_id, event_type, source_user_id, status)
       VALUES (?, ?, NULLIF(?, ''), 'PROCESSING')
       ON DUPLICATE KEY UPDATE
         event_type = IF(
           status = 'FAILED' OR (status = 'PROCESSING' AND received_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE)),
           VALUES(event_type), event_type
         ),
         source_user_id = IF(
           status = 'FAILED' OR (status = 'PROCESSING' AND received_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE)),
           VALUES(source_user_id), source_user_id
         ),
         error_message = IF(
           status = 'FAILED' OR (status = 'PROCESSING' AND received_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE)),
           NULL, error_message
         ),
         received_at = IF(
           status = 'FAILED' OR (status = 'PROCESSING' AND received_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE)),
           NOW(), received_at
         ),
         processed_at = IF(
           status = 'FAILED' OR (status = 'PROCESSING' AND received_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE)),
           NULL, processed_at
         ),
         status = IF(
           status = 'FAILED' OR (status = 'PROCESSING' AND received_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE)),
           'PROCESSING', status
         )`,
      [eventId, String(event?.type || "UNKNOWN"), String(event?.source?.userId || "")],
    );
    return result.affectedRows > 0;
  } catch (error) {
    if (error?.code === "ER_NO_SUCH_TABLE") return true;
    throw error;
  }
}

export async function completeLineWebhookEvent(event, status = "PROCESSED", errorMessage = "") {
  const eventId = String(event?.webhookEventId || "").trim();
  if (!eventId) return;
  try {
    await pool.execute(
      `UPDATE line_webhook_events
       SET status = ?, processed_at = NOW(), error_message = NULLIF(?, '')
       WHERE webhook_event_id = ?`,
      [status, clampText(errorMessage, 500), eventId],
    );
  } catch (error) {
    if (error?.code !== "ER_NO_SUCH_TABLE") throw error;
  }
}

async function listVillages() {
  const [rows] = await pool.execute(
    `SELECT id, village_no AS villageNo, name_th AS villageName
     FROM villages
     WHERE is_active = 1
     ORDER BY village_no`,
  );
  return rows;
}

async function villageQuickReply(prefix) {
  const villages = await listVillages();
  return quickReply([
    ...villages.slice(0, 12).map((village) =>
      postbackAction(
        `หมู่ ${village.villageNo}`,
        `${prefix}&villageId=${encodeURIComponent(village.id)}&villageNo=${encodeURIComponent(village.villageNo)}`,
        `เลือกหมู่ที่ ${village.villageNo}`,
      ),
    ),
    postbackAction("ยกเลิก", "session=cancel", "ยกเลิกรายการ"),
  ]);
}

async function loadOwnerByLineUserId(lineUserId, db = pool) {
  const [rows] = await db.execute(
    `SELECT o.id, o.full_name AS fullName, o.phone, o.household_id AS householdId,
            h.house_no AS houseNo, h.address_detail AS addressDetail,
            h.latitude, h.longitude,
            v.id AS villageId, v.village_no AS villageNo, v.name_th AS villageName
     FROM owners o
     INNER JOIN households h ON h.id = o.household_id AND h.deleted_at IS NULL
     INNER JOIN villages v ON v.id = h.village_id
     WHERE o.line_user_id = ? AND o.deleted_at IS NULL
     LIMIT 1`,
    [lineUserId],
  );
  return rows[0] || null;
}

async function assertOwner(lineUserId) {
  const owner = await loadOwnerByLineUserId(lineUserId);
  if (!owner) {
    const error = new Error("กรุณาลงทะเบียนสัตว์หรือเชื่อมทะเบียนกับ LINE ก่อนใช้เมนูนี้");
    error.code = "OWNER_NOT_LINKED";
    throw error;
  }
  return owner;
}

async function loadPet(lineUserId, petId, db = pool, { forUpdate = false } = {}) {
  const [rows] = await db.execute(
    `SELECT p.id, p.owner_id AS ownerId, p.registration_no AS registrationNo,
            p.name AS petName, p.species, p.sex, p.breed, p.color,
            p.birth_date AS birthDate, p.microchip_no AS microchipNo,
            p.status, p.registered_at AS registeredAt,
            o.full_name AS ownerName
     FROM pets p
     INNER JOIN owners o ON o.id = p.owner_id AND o.deleted_at IS NULL
     WHERE p.id = ? AND o.line_user_id = ? AND p.deleted_at IS NULL
     LIMIT 1${forUpdate ? " FOR UPDATE" : ""}`,
    [petId, lineUserId],
  );
  return rows[0] || null;
}

async function loadPets(lineUserId, page = 0) {
  const offset = Math.max(0, Number(page) || 0) * PET_PAGE_SIZE;
  const [rows] = await pool.execute(
    `SELECT p.id, p.registration_no AS registrationNo, p.name AS petName,
            p.species, p.sex, p.status,
            EXISTS (SELECT 1 FROM sterilization_records sr WHERE sr.pet_id = p.id) AS sterilized,
            (SELECT MAX(vr.next_due_at) FROM vaccination_records vr WHERE vr.pet_id = p.id) AS nextVaccinationDueAt
     FROM pets p
     INNER JOIN owners o ON o.id = p.owner_id AND o.deleted_at IS NULL
     WHERE o.line_user_id = ? AND p.deleted_at IS NULL
     ORDER BY p.created_at DESC
     LIMIT ${PET_PAGE_SIZE + 1} OFFSET ${offset}`,
    [lineUserId],
  );
  return {
    rows: rows.slice(0, PET_PAGE_SIZE),
    hasNext: rows.length > PET_PAGE_SIZE,
    page: Math.max(0, Number(page) || 0),
  };
}

function petPickerMessage(result, action) {
  if (!result.rows.length) {
    return textMessage(
      "ยังไม่พบสัตว์เลี้ยงในบัญชีนี้",
      quickReply([
        postbackAction("ลงทะเบียนสัตว์", "action=register", "ลงทะเบียนสัตว์เลี้ยง"),
        uriAction("เมนูหลัก", { view: "home" }),
      ]),
    );
  }
  const items = result.rows.map((pet) =>
    postbackAction(
      `${pet.species === "CAT" ? "🐱" : "🐶"} ${pet.petName}`,
      `action=${encodeURIComponent(action)}&petId=${encodeURIComponent(pet.id)}`,
      `เลือก ${pet.petName}`,
    ),
  );
  if (result.page > 0) {
    items.push(postbackAction("ก่อนหน้า", `action=pet_page&target=${encodeURIComponent(action)}&page=${result.page - 1}`, "ดูสัตว์หน้าก่อน"));
  }
  if (result.hasNext) {
    items.push(postbackAction("ถัดไป", `action=pet_page&target=${encodeURIComponent(action)}&page=${result.page + 1}`, "ดูสัตว์หน้าถัดไป"));
  }
  items.push(uriAction("เมนูหลัก", { view: "home" }));
  return textMessage("เลือกสัตว์เลี้ยงที่ต้องการดำเนินการ", quickReply(items));
}

async function showPetPicker(lineUserId, action, page = 0) {
  await assertOwner(lineUserId);
  return [petPickerMessage(await loadPets(lineUserId, page), action)];
}

async function downloadLineImage(lineUserId, messageId) {
  if (!config.lineChannelAccessToken) {
    throw new Error("ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN");
  }
  const response = await fetch(
    `${LINE_CONTENT_ENDPOINT}/${encodeURIComponent(messageId)}/content`,
    { headers: { Authorization: `Bearer ${config.lineChannelAccessToken}` } },
  );
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new Error(`ไม่สามารถดาวน์โหลดรูปจาก LINE (${response.status})${detail ? `: ${detail}` : ""}`);
  }
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_IMAGE_BYTES) throw new Error("รูปภาพต้องมีขนาดไม่เกิน 10 MB");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error("รูปภาพต้องมีขนาดไม่เกิน 10 MB");

  let mimeType = "";
  let extension = "";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    mimeType = "image/jpeg";
    extension = ".jpg";
  } else if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    mimeType = "image/png";
    extension = ".png";
  } else if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
    mimeType = "image/webp";
    extension = ".webp";
  } else {
    throw new Error("รองรับเฉพาะรูป JPEG, PNG หรือ WebP");
  }

  await fs.mkdir(config.privateStorageDir, { recursive: true });
  const id = crypto.randomUUID();
  const storagePath = `${crypto.randomUUID()}${extension}`;
  const absolutePath = path.join(config.privateStorageDir, storagePath);
  await fs.writeFile(absolutePath, bytes, { flag: "wx" });
  const checksum = crypto.createHash("sha256").update(bytes).digest("hex");

  await pool.execute(
    `INSERT INTO line_native_attachments
       (id, line_user_id, line_message_id, file_name, storage_path, mime_type,
        file_size, checksum_sha256, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))`,
    [id, lineUserId, messageId, `line-${messageId}${extension}`, storagePath, mimeType, bytes.length, checksum, SESSION_TTL_HOURS],
  );
  return id;
}

async function finalizeAttachment(db, attachmentId, entityType, entityId) {
  if (!attachmentId) return;
  await db.execute(
    `UPDATE line_native_attachments
     SET entity_type = ?, entity_id = ?, expires_at = NULL
     WHERE id = ?`,
    [entityType, entityId, attachmentId],
  );
}

function createReferenceNo(prefix = "TSM") {
  const now = new Date();
  const buddhistYear = now.getFullYear() + 543;
  const datePart = [
    String(now.getFullYear()).slice(-2),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  const randomPart = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${prefix}-${buddhistYear}-${datePart}-${randomPart}`;
}

async function ensureVillage(db, villageId) {
  const [rows] = await db.execute(
    "SELECT id FROM villages WHERE id = ? AND is_active = 1 LIMIT 1 FOR UPDATE",
    [villageId],
  );
  if (!rows[0]) throw new Error("ไม่พบหมู่บ้านที่เลือก");
}

async function createOrLinkOwner(db, lineUserId, draft) {
  if (draft.ownerId) {
    const [rows] = await db.execute(
      `SELECT o.id, o.household_id AS householdId
       FROM owners o
       WHERE o.id = ? AND o.line_user_id = ? AND o.deleted_at IS NULL
       LIMIT 1 FOR UPDATE`,
      [draft.ownerId, lineUserId],
    );
    if (!rows[0]) throw new Error("ไม่พบข้อมูลเจ้าของที่เชื่อมกับ LINE");
    await db.execute(
      `UPDATE households
       SET latitude = COALESCE(?, latitude), longitude = COALESCE(?, longitude)
       WHERE id = ? AND deleted_at IS NULL`,
      [draft.latitude ?? null, draft.longitude ?? null, rows[0].householdId],
    );
    return { ownerId: rows[0].id, householdId: rows[0].householdId, reused: true };
  }

  await ensureVillage(db, draft.villageId);
  const [ownerRows] = await db.execute(
    `SELECT id, household_id AS householdId, line_user_id AS lineUserId
     FROM owners
     WHERE deleted_at IS NULL AND phone = ? AND full_name = ?
     ORDER BY created_at ASC LIMIT 1 FOR UPDATE`,
    [draft.phone, draft.ownerName],
  );
  const existing = ownerRows[0];
  if (existing) {
    if (existing.lineUserId && existing.lineUserId !== lineUserId) {
      throw new Error("ทะเบียนนี้เชื่อมกับบัญชี LINE อื่นอยู่แล้ว กรุณาติดต่อเจ้าหน้าที่");
    }
    if (!existing.lineUserId) {
      throw new Error("พบทะเบียนเดิมที่ตรงกับชื่อและเบอร์โทร กรุณายกเลิกรายการนี้แล้วใช้เมนู “เชื่อมทะเบียน” พร้อมเลขอ้างอิง เพื่อยืนยันว่าเป็นเจ้าของจริง");
    }
    await db.execute(
      `UPDATE owners SET consent_at = COALESCE(consent_at, NOW()) WHERE id = ?`,
      [existing.id],
    );
    await db.execute(
      `UPDATE households
       SET house_no = ?, village_id = ?, address_detail = NULLIF(?, ''),
           latitude = ?, longitude = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [draft.houseNo, draft.villageId, draft.addressDetail || "", draft.latitude, draft.longitude, existing.householdId],
    );
    return { ownerId: existing.id, householdId: existing.householdId, reused: true };
  }

  const householdId = crypto.randomUUID();
  const ownerId = crypto.randomUUID();
  await db.execute(
    `INSERT INTO households
       (id, house_no, village_id, address_detail, latitude, longitude)
     VALUES (?, ?, ?, NULLIF(?, ''), ?, ?)`,
    [householdId, draft.houseNo, draft.villageId, draft.addressDetail || "", draft.latitude, draft.longitude],
  );
  await db.execute(
    `INSERT INTO owners
       (id, household_id, full_name, phone, line_user_id, consent_at)
     VALUES (?, ?, ?, ?, ?, NOW())`,
    [ownerId, householdId, draft.ownerName, draft.phone, lineUserId],
  );
  return { ownerId, householdId, reused: false };
}

async function finalizeRegistration(lineUserId, draft) {
  return withTransaction(async (db) => {
    const owner = await createOrLinkOwner(db, lineUserId, draft);
    const [duplicates] = await db.execute(
      `SELECT r.id, r.reference_no AS referenceNo, r.status
       FROM registrations r
       INNER JOIN pets p ON p.id = r.pet_id
       WHERE r.owner_id = ? AND r.status IN ('DRAFT','SUBMITTED','UNDER_REVIEW','NEED_MORE_INFO','APPROVED')
         AND r.created_at >= DATE_SUB(NOW(), INTERVAL 10 MINUTE)
         AND p.deleted_at IS NULL AND p.name = ? AND p.species = ? AND p.sex = ?
         AND p.birth_date <=> NULLIF(?, '')
       ORDER BY r.created_at DESC LIMIT 1 FOR UPDATE`,
      [owner.ownerId, draft.petName, draft.species, draft.sex, draft.birthDate || ""],
    );
    if (duplicates[0]) {
      await finalizeAttachment(db, draft.attachmentId, "REGISTRATION", duplicates[0].id);
      return { ...duplicates[0], duplicate: true, ownerId: owner.ownerId };
    }

    const petId = crypto.randomUUID();
    const registrationId = crypto.randomUUID();
    const referenceNo = createReferenceNo("TSM");
    await db.execute(
      `INSERT INTO pets
         (id, owner_id, name, species, sex, breed, color, birth_date, status)
       VALUES (?, ?, ?, ?, ?, NULLIF(?, ''), NULLIF(?, ''), NULLIF(?, ''), 'ACTIVE')`,
      [petId, owner.ownerId, draft.petName, draft.species, draft.sex, draft.breed || "", draft.color || "", draft.birthDate || ""],
    );
    await db.execute(
      `INSERT INTO registrations
         (id, reference_no, owner_id, pet_id, status, submitted_at)
       VALUES (?, ?, ?, ?, 'SUBMITTED', NOW())`,
      [registrationId, referenceNo, owner.ownerId, petId],
    );
    await db.execute(
      `INSERT INTO pet_status_history
         (id, pet_id, old_status, new_status, effective_at, note, recorded_by)
       VALUES (?, ?, NULL, 'ACTIVE', NOW(), ?, NULL)`,
      [crypto.randomUUID(), petId, "สร้างสถานะเริ่มต้นจาก LINE Official Account"],
    );
    await db.execute(
      `INSERT INTO pet_owner_history
         (id, pet_id, previous_owner_id, new_owner_id, transferred_at, reason, recorded_by)
       VALUES (?, ?, NULL, ?, NOW(), ?, NULL)`,
      [crypto.randomUUID(), petId, owner.ownerId, "บันทึกเจ้าของเริ่มต้นจาก LINE Official Account"],
    );
    await db.execute(
      `INSERT INTO audit_logs
         (id, user_id, action, entity_type, entity_id, new_value)
       VALUES (?, NULL, 'SUBMIT_REGISTRATION_LINE_NATIVE', 'REGISTRATION', ?, ?)`,
      [crypto.randomUUID(), registrationId, JSON.stringify({ referenceNo, ownerId: owner.ownerId, petId, species: draft.species })],
    );
    await finalizeAttachment(db, draft.attachmentId, "REGISTRATION", registrationId);
    return { id: registrationId, referenceNo, status: "SUBMITTED", duplicate: false, ownerId: owner.ownerId, petId };
  });
}

async function createCitizenSubmission(lineUserId, subjectType, petId, current, proposed, attachmentId = null) {
  return withTransaction(async (db) => {
    const pet = await loadPet(lineUserId, petId, db, { forUpdate: true });
    if (!pet) throw new Error("ไม่พบสัตว์เลี้ยงหรือไม่มีสิทธิ์ดำเนินการ");
    const id = crypto.randomUUID();
    const referenceNo = createReferenceNo("TSM-C");
    await db.execute(
      `INSERT INTO citizen_submissions
         (id, reference_no, owner_id, pet_id, subject_type,
          current_payload, proposed_payload, status, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'SUBMITTED', NOW())`,
      [id, referenceNo, pet.ownerId, petId, subjectType, JSON.stringify(current ?? null), JSON.stringify(proposed)],
    );
    await db.execute(
      `INSERT INTO audit_logs
         (id, user_id, action, entity_type, entity_id, new_value)
       VALUES (?, NULL, 'SUBMIT_CITIZEN_CHANGE_LINE_NATIVE', 'CITIZEN_SUBMISSION', ?, ?)`,
      [crypto.randomUUID(), id, JSON.stringify({ referenceNo, subjectType, petId })],
    );
    await finalizeAttachment(db, attachmentId, "CITIZEN_SUBMISSION", id);
    return { id, referenceNo, status: "SUBMITTED", subjectType, pet };
  });
}

function confirmationFlex(title, lines, confirmData, editActions = []) {
  const footer = [
    {
      type: "button",
      style: "primary",
      color: "#087F5B",
      action: postbackAction("ยืนยันส่ง", confirmData, "ยืนยันส่งข้อมูล"),
    },
    ...editActions.map((action) => ({ type: "button", style: "secondary", action })),
    {
      type: "button",
      style: "secondary",
      color: "#64748B",
      action: postbackAction("ยกเลิก", "session=cancel", "ยกเลิกรายการ"),
    },
  ];
  return {
    type: "flex",
    altText: `ตรวจสอบข้อมูล ${title}`,
    contents: {
      type: "bubble",
      size: "kilo",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#087F5B",
        paddingAll: "18px",
        contents: [
          { type: "text", text: "ตรวจสอบก่อนส่ง", color: "#D1FAE5", size: "xs", weight: "bold" },
          { type: "text", text: title, color: "#FFFFFF", size: "lg", weight: "bold", wrap: true, margin: "sm" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "18px",
        contents: lines.map((line) => ({
          type: "text",
          text: clampText(line, 300),
          size: "sm",
          color: "#334155",
          wrap: true,
          margin: "sm",
        })),
      },
      footer: { type: "box", layout: "vertical", spacing: "sm", paddingAll: "18px", contents: footer },
    },
  };
}

async function registrationPrompt(session) {
  const { currentStep: step, draft } = session;
  if (step === "CONSENT") {
    return [textMessage(
      "การลงทะเบียนจะบันทึกข้อมูลเจ้าของ ที่อยู่ พิกัด และข้อมูลสัตว์เพื่อให้เทศบาลตรวจสอบ\n\nกรุณายืนยันความยินยอมในการใช้ข้อมูลสำหรับงานทะเบียนสัตว์เลี้ยง",
      cancelQuickReply([
        postbackAction("ยินยอม", "session=consent_yes", "ยินยอมและเริ่มลงทะเบียน"),
      ]),
    )];
  }
  if (step === "OWNER_NAME") return [textMessage("พิมพ์ชื่อ–นามสกุลเจ้าของสัตว์", cancelQuickReply())];
  if (step === "PHONE") return [textMessage("พิมพ์เบอร์โทรศัพท์ 10 หลัก เช่น 0812345678", cancelQuickReply())];
  if (step === "HOUSE_NO") return [textMessage("พิมพ์บ้านเลขที่", cancelQuickReply())];
  if (step === "VILLAGE") return [textMessage("เลือกหมู่บ้าน", await villageQuickReply("session=village"))];
  if (step === "ADDRESS_DETAIL") {
    return [textMessage("พิมพ์รายละเอียดที่อยู่เพิ่มเติม เช่น ซอย หรือจุดสังเกต หรือกดข้าม", cancelQuickReply([
      postbackAction("ข้าม", "session=address_skip", "ข้ามรายละเอียดที่อยู่"),
    ]))];
  }
  if (step === "LOCATION") return [locationPrompt("กรุณาส่งตำแหน่งบ้านสำหรับแสดงบนแผนที่เทศบาล")];
  if (step === "PET_SPECIES") return [textMessage("เลือกชนิดสัตว์", cancelQuickReply([
    postbackAction("สุนัข", "session=species&value=DOG", "เลือกสุนัข"),
    postbackAction("แมว", "session=species&value=CAT", "เลือกแมว"),
  ]))];
  if (step === "PET_NAME") return [textMessage("พิมพ์ชื่อสัตว์เลี้ยง", cancelQuickReply())];
  if (step === "PET_SEX") return [textMessage("เลือกเพศสัตว์", cancelQuickReply([
    postbackAction("เพศผู้", "session=sex&value=MALE", "เลือกเพศผู้"),
    postbackAction("เพศเมีย", "session=sex&value=FEMALE", "เลือกเพศเมีย"),
    postbackAction("ไม่ระบุ", "session=sex&value=UNKNOWN", "ไม่ระบุเพศ"),
  ]))];
  if (step === "PET_BREED") return [textMessage("พิมพ์สายพันธุ์ หรือกดไม่ระบุ", cancelQuickReply([
    postbackAction("ไม่ระบุ", "session=breed_skip", "ไม่ระบุสายพันธุ์"),
  ]))];
  if (step === "PET_COLOR") return [textMessage("พิมพ์สีหรือตำหนิของสัตว์ หรือกดไม่ระบุ", cancelQuickReply([
    postbackAction("ไม่ระบุ", "session=color_skip", "ไม่ระบุสีหรือตำหนิ"),
  ]))];
  if (step === "PET_BIRTHDATE") return [textMessage("เลือกวันเกิดโดยประมาณ หรือกดไม่ทราบ", cancelQuickReply([
    datetimeAction("เลือกวันเกิด", "session=birthdate", { max: todayIso() }),
    postbackAction("ไม่ทราบ", "session=birthdate_skip", "ไม่ทราบวันเกิด"),
  ]))];
  if (step === "PHOTO") return [photoPrompt()];
  if (step === "CONFIRM") {
    return [confirmationFlex(
      "คำขอลงทะเบียนสัตว์เลี้ยง",
      [
        `เจ้าของ: ${draft.ownerName}`,
        `โทรศัพท์: ${draft.phone}`,
        `ที่อยู่: บ้านเลขที่ ${draft.houseNo} หมู่ ${draft.villageNo || "-"}${draft.addressDetail ? ` ${draft.addressDetail}` : ""}`,
        `ตำแหน่ง: ${draft.latitude != null && draft.longitude != null ? "บันทึกแล้ว" : "ยังไม่มี"}`,
        `สัตว์: ${SPECIES_LABELS[draft.species] || draft.species} ชื่อ ${draft.petName}`,
        `เพศ: ${SEX_LABELS[draft.sex] || draft.sex}`,
        `สายพันธุ์: ${draft.breed || "ไม่ระบุ"}`,
        `สี/ตำหนิ: ${draft.color || "ไม่ระบุ"}`,
        `วันเกิด: ${formatThaiDate(draft.birthDate)}`,
        `รูปสัตว์: ${draft.attachmentId ? "แนบแล้ว" : "ไม่ได้แนบ"}`,
      ],
      "session=register_confirm",
      [
        postbackAction("แก้ข้อมูลสัตว์", "session=register_edit_pet", "แก้ข้อมูลสัตว์"),
        ...(draft.ownerId ? [] : [postbackAction("แก้ข้อมูลเจ้าของ", "session=register_edit_owner", "แก้ข้อมูลเจ้าของ")]),
      ],
    )];
  }
  return [textMessage("ไม่พบขั้นตอนลงทะเบียน กรุณาเริ่มใหม่", cancelQuickReply())];
}

async function startRegistration(lineUserId, state) {
  const owner = state?.linked ? await loadOwnerByLineUserId(lineUserId) : null;
  const draft = owner ? {
    ownerId: owner.id,
    ownerName: owner.fullName,
    phone: owner.phone,
    houseNo: owner.houseNo,
    villageId: owner.villageId,
    villageNo: owner.villageNo,
    addressDetail: owner.addressDetail || "",
    latitude: owner.latitude == null ? null : Number(owner.latitude),
    longitude: owner.longitude == null ? null : Number(owner.longitude),
  } : {};
  const step = owner
    ? (Number.isFinite(draft.latitude) && Number.isFinite(draft.longitude) ? "PET_SPECIES" : "LOCATION")
    : "CONSENT";
  const session = await saveSession(lineUserId, "REGISTER", step, draft);
  return registrationPrompt(session);
}

async function handleRegistrationSession(event, session, params) {
  const text = event.message?.type === "text" ? String(event.message.text || "").trim() : "";
  const draft = { ...session.draft };
  let next = session.currentStep;

  if (params.session === "register_confirm" && session.currentStep === "CONFIRM") {
    const result = await finalizeRegistration(session.lineUserId, draft);
    await clearSession(session.lineUserId);
    return {
      refreshState: true,
      messages: [
        textMessage(
          result.duplicate
            ? `พบคำขอที่ส่งไว้แล้ว\nเลขอ้างอิง: ${result.referenceNo}\nสถานะ: ${STATUS_LABELS[result.status] || result.status}`
            : `ส่งคำขอลงทะเบียนเรียบร้อย\nเลขอ้างอิง: ${result.referenceNo}\nเจ้าหน้าที่จะตรวจสอบและแจ้งผลผ่าน LINE\n\nกด “เมนูหลัก” เพื่อดูข้อมูลล่าสุดใน LIFF`,
          quickReply([
            uriAction("ดูคำขอ", { view: "account", section: "requests" }),
            postbackAction("เพิ่มสัตว์อีก", "action=register", "ลงทะเบียนสัตว์เพิ่ม"),
            uriAction("เมนูหลัก", { view: "home" }),
          ]),
        ),
      ],
    };
  }
  if (params.session === "register_edit_pet") {
    next = "PET_SPECIES";
  } else if (params.session === "register_edit_owner" && !draft.ownerId) {
    next = "OWNER_NAME";
  } else if (session.currentStep === "CONSENT" && params.session === "consent_yes") {
    draft.consent = true;
    next = "OWNER_NAME";
  } else if (session.currentStep === "OWNER_NAME" && text) {
    if (text.length < 2 || text.length > 150) throw new Error("ชื่อ–นามสกุลต้องมี 2–150 ตัวอักษร");
    draft.ownerName = text;
    next = "PHONE";
  } else if (session.currentStep === "PHONE" && text) {
    const phone = normalizeThaiPhone(text);
    if (!/^0\d{9}$/.test(phone)) throw new Error("กรุณากรอกเบอร์โทรศัพท์ 10 หลักที่ขึ้นต้นด้วย 0");
    draft.phone = phone;
    next = "HOUSE_NO";
  } else if (session.currentStep === "HOUSE_NO" && text) {
    if (text.length > 30) throw new Error("บ้านเลขที่ยาวเกินไป");
    draft.houseNo = text;
    next = "VILLAGE";
  } else if (session.currentStep === "VILLAGE" && params.session === "village") {
    draft.villageId = Number(params.villageId);
    draft.villageNo = Number(params.villageNo);
    if (!Number.isInteger(draft.villageId) || draft.villageId <= 0) throw new Error("หมู่บ้านไม่ถูกต้อง");
    next = "ADDRESS_DETAIL";
  } else if (session.currentStep === "ADDRESS_DETAIL" && (text || params.session === "address_skip")) {
    draft.addressDetail = params.session === "address_skip" ? "" : text.slice(0, 255);
    next = "LOCATION";
  } else if (session.currentStep === "LOCATION" && event.message?.type === "location") {
    draft.latitude = Number(event.message.latitude);
    draft.longitude = Number(event.message.longitude);
    draft.locationAddress = String(event.message.address || "").slice(0, 255);
    if (!Number.isFinite(draft.latitude) || !Number.isFinite(draft.longitude)) throw new Error("ตำแหน่งที่ส่งมาไม่ถูกต้อง");
    next = "PET_SPECIES";
  } else if (session.currentStep === "PET_SPECIES" && params.session === "species") {
    if (!["DOG", "CAT"].includes(params.value)) throw new Error("ชนิดสัตว์ไม่ถูกต้อง");
    draft.species = params.value;
    next = "PET_NAME";
  } else if (session.currentStep === "PET_NAME" && text) {
    if (text.length > 100) throw new Error("ชื่อสัตว์ยาวเกินไป");
    draft.petName = text;
    next = "PET_SEX";
  } else if (session.currentStep === "PET_SEX" && params.session === "sex") {
    if (!["MALE", "FEMALE", "UNKNOWN"].includes(params.value)) throw new Error("เพศสัตว์ไม่ถูกต้อง");
    draft.sex = params.value;
    next = "PET_BREED";
  } else if (session.currentStep === "PET_BREED" && (text || params.session === "breed_skip")) {
    draft.breed = params.session === "breed_skip" ? "" : text.slice(0, 100);
    next = "PET_COLOR";
  } else if (session.currentStep === "PET_COLOR" && (text || params.session === "color_skip")) {
    draft.color = params.session === "color_skip" ? "" : text.slice(0, 100);
    next = "PET_BIRTHDATE";
  } else if (session.currentStep === "PET_BIRTHDATE" && (params.session === "birthdate" || params.session === "birthdate_skip")) {
    const date = params.session === "birthdate_skip" ? "" : String(event.postback?.params?.date || "");
    if (date && date > todayIso()) throw new Error("วันเกิดต้องไม่เป็นวันที่ในอนาคต");
    draft.birthDate = date;
    next = "PHOTO";
  } else if (session.currentStep === "PHOTO" && event.message?.type === "image") {
    draft.attachmentId = await downloadLineImage(session.lineUserId, event.message.id);
    next = "CONFIRM";
  } else if (session.currentStep === "PHOTO" && params.session === "photo_skip") {
    draft.attachmentId = null;
    next = "CONFIRM";
  } else {
    return { messages: await registrationPrompt(session) };
  }

  const updated = await updateSession(session, next, draft);
  return { messages: await registrationPrompt(updated) };
}

async function startReferenceFlow(lineUserId, flowType) {
  const step = "REFERENCE";
  const session = await saveSession(lineUserId, flowType, step, {});
  return [textMessage("พิมพ์เลขอ้างอิง เช่น TSM-2569-260805-A1B2C3", cancelQuickReply())];
}

async function handleReferenceFlow(event, session) {
  const text = event.message?.type === "text" ? String(event.message.text || "").trim().toUpperCase() : "";
  const draft = { ...session.draft };
  if (session.currentStep === "REFERENCE" && text) {
    if (text.length < 8 || text.length > 30) throw new Error("เลขอ้างอิงไม่ถูกต้อง");
    draft.referenceNo = text;
    const updated = await updateSession(session, "PHONE", draft);
    return { messages: [textMessage("พิมพ์เบอร์โทรศัพท์ของเจ้าของที่ใช้ส่งคำขอ", cancelQuickReply())] };
  }
  if (session.currentStep === "PHONE" && text) {
    const phone = normalizeThaiPhone(text);
    if (!/^0\d{9}$/.test(phone)) throw new Error("กรุณากรอกเบอร์โทรศัพท์ 10 หลัก");
    if (session.flowType === "LINK") {
      const result = await withTransaction(async (db) => {
        const [rows] = await db.execute(
          `SELECT r.reference_no AS referenceNo, r.status, o.id AS ownerId,
                  o.full_name AS ownerName, o.line_user_id AS lineUserId
           FROM registrations r
           INNER JOIN owners o ON o.id = r.owner_id AND o.deleted_at IS NULL
           WHERE r.reference_no = ? AND o.phone = ? LIMIT 1 FOR UPDATE`,
          [draft.referenceNo, phone],
        );
        const row = rows[0];
        if (!row) throw new Error("ไม่พบคำขอที่ตรงกับเลขอ้างอิงและเบอร์โทรศัพท์");
        if (row.lineUserId && row.lineUserId !== session.lineUserId) {
          throw new Error("ทะเบียนนี้เชื่อมกับบัญชี LINE อื่นแล้ว กรุณาติดต่อเจ้าหน้าที่");
        }
        await db.execute("UPDATE owners SET line_user_id = ? WHERE id = ?", [session.lineUserId, row.ownerId]);
        return row;
      });
      await clearSession(session.lineUserId);
      return {
        refreshState: true,
        messages: [textMessage(
          `เชื่อมทะเบียนสำเร็จ\nเจ้าของ: ${result.ownerName}\nเลขอ้างอิง: ${result.referenceNo}\nสถานะ: ${STATUS_LABELS[result.status] || result.status}`,
          quickReply([
            postbackAction("สัตว์ของฉัน", "action=pets", "ดูสัตว์เลี้ยงของฉัน"),
            uriAction("เมนูหลัก", { view: "home" }),
          ]),
        )],
      };
    }
    const [rows] = await pool.execute(
      `SELECT r.reference_no AS referenceNo, r.status, r.review_note AS reviewNote,
              r.submitted_at AS submittedAt, p.name AS petName, p.species,
              o.full_name AS ownerName
       FROM registrations r
       INNER JOIN owners o ON o.id = r.owner_id AND o.deleted_at IS NULL
       INNER JOIN pets p ON p.id = r.pet_id AND p.deleted_at IS NULL
       WHERE r.reference_no = ? AND o.phone = ? LIMIT 1`,
      [draft.referenceNo, phone],
    );
    const row = rows[0];
    if (!row) throw new Error("ไม่พบคำขอที่ตรงกับเลขอ้างอิงและเบอร์โทรศัพท์");
    await clearSession(session.lineUserId);
    return { messages: [textMessage([
      `เลขอ้างอิง: ${row.referenceNo}`,
      `เจ้าของ: ${row.ownerName}`,
      `สัตว์: ${row.petName} (${SPECIES_LABELS[row.species] || row.species})`,
      `สถานะ: ${STATUS_LABELS[row.status] || row.status}`,
      row.reviewNote ? `ข้อความจากเจ้าหน้าที่: ${row.reviewNote}` : "",
    ].filter(Boolean).join("\n"), quickReply([
      postbackAction("เชื่อมทะเบียน", "action=link", "เชื่อมทะเบียนกับ LINE"),
      postbackAction("ติดตามอีกคำขอ", "action=track", "ติดตามคำขออื่น"),
      uriAction("เมนูหลัก", { view: "home" }),
    ]))] };
  }
  return { messages: [textMessage(session.currentStep === "REFERENCE" ? "กรุณาพิมพ์เลขอ้างอิง" : "กรุณาพิมพ์เบอร์โทรศัพท์", cancelQuickReply())] };
}

async function petDetailMessages(lineUserId, petId) {
  const pet = await loadPet(lineUserId, petId);
  if (!pet) throw new Error("ไม่พบสัตว์เลี้ยงหรือไม่มีสิทธิ์เข้าถึง");
  const [[vaccinations], [sterilizations]] = await Promise.all([
    pool.execute(
      `SELECT vaccine_name AS vaccineName, vaccinated_at AS vaccinatedAt, next_due_at AS nextDueAt
       FROM vaccination_records WHERE pet_id = ? ORDER BY vaccinated_at DESC LIMIT 1`,
      [petId],
    ),
    pool.execute(
      `SELECT sterilized_at AS sterilizedAt, provider_name AS providerName
       FROM sterilization_records WHERE pet_id = ? ORDER BY sterilized_at DESC LIMIT 1`,
      [petId],
    ),
  ]);
  const vaccination = vaccinations[0] || null;
  const sterilization = sterilizations[0] || null;
  return [{
    type: "flex",
    altText: `ข้อมูล ${pet.petName}`,
    contents: {
      type: "bubble",
      size: "kilo",
      header: {
        type: "box", layout: "vertical", backgroundColor: "#087F5B", paddingAll: "18px",
        contents: [
          { type: "text", text: `${pet.species === "CAT" ? "🐱" : "🐶"} ${pet.petName}`, color: "#FFFFFF", weight: "bold", size: "xl" },
          { type: "text", text: pet.registrationNo || "รออนุมัติทะเบียน", color: "#D1FAE5", size: "xs", margin: "sm" },
        ],
      },
      body: {
        type: "box", layout: "vertical", paddingAll: "18px", spacing: "sm",
        contents: [
          { type: "text", text: `ชนิด: ${SPECIES_LABELS[pet.species] || pet.species}`, wrap: true, size: "sm" },
          { type: "text", text: `เพศ: ${SEX_LABELS[pet.sex] || pet.sex}`, wrap: true, size: "sm" },
          { type: "text", text: `สายพันธุ์: ${pet.breed || "ไม่ระบุ"}`, wrap: true, size: "sm" },
          { type: "text", text: `สี/ตำหนิ: ${pet.color || "ไม่ระบุ"}`, wrap: true, size: "sm" },
          { type: "text", text: `สถานะ: ${PET_STATUS_LABELS[pet.status] || pet.status}`, wrap: true, size: "sm" },
          { type: "text", text: vaccination ? `วัคซีนล่าสุด: ${formatThaiDate(vaccination.vaccinatedAt)}${vaccination.nextDueAt ? `\nครบกำหนด: ${formatThaiDate(vaccination.nextDueAt)}` : ""}` : "วัคซีน: ยังไม่มีประวัติ", wrap: true, size: "sm" },
          { type: "text", text: sterilization ? `ทำหมันแล้ว: ${formatThaiDate(sterilization.sterilizedAt)}` : "ทำหมัน: ยังไม่มีประวัติ", wrap: true, size: "sm" },
        ],
      },
      footer: {
        type: "box", layout: "vertical", spacing: "sm", paddingAll: "18px",
        contents: [
          { type: "button", style: "primary", color: "#087F5B", action: postbackAction("แจ้งวัคซีน", `action=vaccination_pet&petId=${pet.id}`, `แจ้งวัคซีนของ ${pet.petName}`) },
          { type: "button", style: "secondary", action: postbackAction("แจ้งทำหมัน", `action=sterilization_pet&petId=${pet.id}`, `แจ้งทำหมันของ ${pet.petName}`) },
          { type: "button", style: "secondary", action: postbackAction("แก้ไข/แจ้งสถานะ", `action=pet_manage&petId=${pet.id}`, `จัดการข้อมูล ${pet.petName}`) },
        ],
      },
    },
  }];
}

async function startVaccination(lineUserId, petId) {
  const pet = await loadPet(lineUserId, petId);
  if (!pet) throw new Error("ไม่พบสัตว์เลี้ยงหรือไม่มีสิทธิ์ดำเนินการ");
  const session = await saveSession(lineUserId, "VACCINATION", "VACCINE_NAME", { petName: pet.petName }, petId);
  return vaccinationPrompt(session);
}

async function vaccinationPrompt(session) {
  const { currentStep: step, draft } = session;
  if (step === "VACCINE_NAME") return [textMessage(`แจ้งวัคซีนของ ${draft.petName}\nเลือกชนิดวัคซีน หรือเลือกอื่น ๆ แล้วพิมพ์ชื่อ`, cancelQuickReply([
    postbackAction("พิษสุนัขบ้า", "session=vaccine_name&value=วัคซีนพิษสุนัขบ้า", "วัคซีนพิษสุนัขบ้า"),
    postbackAction("วัคซีนรวม", "session=vaccine_name&value=วัคซีนรวม", "วัคซีนรวม"),
    postbackAction("อื่น ๆ", "session=vaccine_other", "ระบุวัคซีนอื่น"),
  ]))];
  if (step === "VACCINE_NAME_TEXT") return [textMessage("พิมพ์ชื่อวัคซีน", cancelQuickReply())];
  if (step === "VACCINATED_AT") return [textMessage("เลือกวันที่ฉีดวัคซีน", cancelQuickReply([
    datetimeAction("เลือกวันที่", "session=vaccinated_at", { initial: todayIso(), max: todayIso() }),
  ]))];
  if (step === "NEXT_DUE_AT") return [textMessage("เลือกวันครบกำหนดครั้งถัดไป หรือกดไม่ทราบ", cancelQuickReply([
    datetimeAction("เลือกกำหนด", "session=next_due_at", { min: draft.vaccinatedAt || todayIso() }),
    postbackAction("ไม่ทราบ", "session=next_due_skip", "ไม่ทราบวันครบกำหนด"),
  ]))];
  if (step === "LOT_NO") return [textMessage("พิมพ์เลขล็อตวัคซีน หรือกดข้าม", cancelQuickReply([
    postbackAction("ข้าม", "session=lot_skip", "ข้ามเลขล็อต"),
  ]))];
  if (step === "PROVIDER") return [textMessage("พิมพ์ชื่อสถานที่หรือผู้ให้บริการวัคซีน หรือกดข้าม", cancelQuickReply([
    postbackAction("ข้าม", "session=provider_skip", "ข้ามชื่อผู้ให้บริการ"),
  ]))];
  if (step === "PHOTO") return [photoPrompt()];
  if (step === "CONFIRM") return [confirmationFlex(
    `แจ้งวัคซีนของ ${draft.petName}`,
    [
      `วัคซีน: ${draft.vaccineName}`,
      `วันที่ฉีด: ${formatThaiDate(draft.vaccinatedAt)}`,
      `ครบกำหนดครั้งถัดไป: ${formatThaiDate(draft.nextDueAt)}`,
      `เลขล็อต: ${draft.lotNo || "ไม่ระบุ"}`,
      `ผู้ให้บริการ: ${draft.providerName || "ไม่ระบุ"}`,
      `หลักฐาน: ${draft.attachmentId ? "แนบรูปแล้ว" : "ไม่ได้แนบ"}`,
    ],
    "session=vaccination_confirm",
    [postbackAction("แก้ไข", "session=vaccination_edit", "แก้ไขข้อมูลวัคซีน")],
  )];
  return [textMessage("ไม่พบขั้นตอนแจ้งวัคซีน", cancelQuickReply())];
}

async function handleVaccinationSession(event, session, params) {
  const text = event.message?.type === "text" ? String(event.message.text || "").trim() : "";
  const draft = { ...session.draft };
  let next = session.currentStep;
  if (params.session === "vaccination_confirm" && session.currentStep === "CONFIRM") {
    const result = await createCitizenSubmission(session.lineUserId, "VACCINATION", session.selectedPetId, null, {
      subjectType: "VACCINATION",
      vaccineName: draft.vaccineName,
      vaccinatedAt: draft.vaccinatedAt,
      nextDueAt: draft.nextDueAt || "",
      lotNo: draft.lotNo || "",
      providerName: draft.providerName || "",
    }, draft.attachmentId);
    await clearSession(session.lineUserId);
    return { refreshState: true, messages: [submissionSuccessMessage(result)] };
  }
  if (params.session === "vaccination_edit") next = "VACCINE_NAME";
  else if (session.currentStep === "VACCINE_NAME" && params.session === "vaccine_name") {
    draft.vaccineName = String(params.value || "").slice(0, 150);
    next = "VACCINATED_AT";
  } else if (session.currentStep === "VACCINE_NAME" && params.session === "vaccine_other") next = "VACCINE_NAME_TEXT";
  else if (session.currentStep === "VACCINE_NAME_TEXT" && text) {
    if (text.length < 2 || text.length > 150) throw new Error("ชื่อวัคซีนต้องมี 2–150 ตัวอักษร");
    draft.vaccineName = text;
    next = "VACCINATED_AT";
  } else if (session.currentStep === "VACCINATED_AT" && params.session === "vaccinated_at") {
    draft.vaccinatedAt = String(event.postback?.params?.date || "");
    if (!draft.vaccinatedAt || draft.vaccinatedAt > todayIso()) throw new Error("วันที่ฉีดวัคซีนไม่ถูกต้อง");
    next = "NEXT_DUE_AT";
  } else if (session.currentStep === "NEXT_DUE_AT" && ["next_due_at", "next_due_skip"].includes(params.session)) {
    draft.nextDueAt = params.session === "next_due_skip" ? "" : String(event.postback?.params?.date || "");
    if (draft.nextDueAt && draft.nextDueAt < draft.vaccinatedAt) throw new Error("วันครบกำหนดต้องไม่ก่อนวันที่ฉีด");
    next = "LOT_NO";
  } else if (session.currentStep === "LOT_NO" && (text || params.session === "lot_skip")) {
    draft.lotNo = params.session === "lot_skip" ? "" : text.slice(0, 100);
    next = "PROVIDER";
  } else if (session.currentStep === "PROVIDER" && (text || params.session === "provider_skip")) {
    draft.providerName = params.session === "provider_skip" ? "" : text.slice(0, 150);
    next = "PHOTO";
  } else if (session.currentStep === "PHOTO" && event.message?.type === "image") {
    draft.attachmentId = await downloadLineImage(session.lineUserId, event.message.id);
    next = "CONFIRM";
  } else if (session.currentStep === "PHOTO" && params.session === "photo_skip") {
    draft.attachmentId = null;
    next = "CONFIRM";
  } else return { messages: await vaccinationPrompt(session) };
  const updated = await updateSession(session, next, draft);
  return { messages: await vaccinationPrompt(updated) };
}

async function startSterilization(lineUserId, petId) {
  const pet = await loadPet(lineUserId, petId);
  if (!pet) throw new Error("ไม่พบสัตว์เลี้ยงหรือไม่มีสิทธิ์ดำเนินการ");
  return sterilizationPrompt(await saveSession(lineUserId, "STERILIZATION", "DATE", { petName: pet.petName }, petId));
}

async function sterilizationPrompt(session) {
  const { currentStep: step, draft } = session;
  if (step === "DATE") return [textMessage(`แจ้งทำหมันของ ${draft.petName}\nเลือกวันที่ทำหมัน`, cancelQuickReply([
    datetimeAction("เลือกวันที่", "session=sterilized_at", { initial: todayIso(), max: todayIso() }),
  ]))];
  if (step === "PROVIDER") return [textMessage("พิมพ์ชื่อสถานที่หรือผู้ให้บริการ หรือกดข้าม", cancelQuickReply([
    postbackAction("ข้าม", "session=provider_skip", "ข้ามชื่อผู้ให้บริการ"),
  ]))];
  if (step === "NOTE") return [textMessage("พิมพ์หมายเหตุ หรือกดข้าม", cancelQuickReply([
    postbackAction("ข้าม", "session=note_skip", "ข้ามหมายเหตุ"),
  ]))];
  if (step === "PHOTO") return [photoPrompt()];
  if (step === "CONFIRM") return [confirmationFlex(
    `แจ้งทำหมันของ ${draft.petName}`,
    [
      `วันที่ทำหมัน: ${formatThaiDate(draft.sterilizedAt)}`,
      `ผู้ให้บริการ: ${draft.providerName || "ไม่ระบุ"}`,
      `หมายเหตุ: ${draft.note || "ไม่มี"}`,
      `หลักฐาน: ${draft.attachmentId ? "แนบรูปแล้ว" : "ไม่ได้แนบ"}`,
    ],
    "session=sterilization_confirm",
    [postbackAction("แก้ไข", "session=sterilization_edit", "แก้ไขข้อมูลทำหมัน")],
  )];
  return [textMessage("ไม่พบขั้นตอนแจ้งทำหมัน", cancelQuickReply())];
}

async function handleSterilizationSession(event, session, params) {
  const text = event.message?.type === "text" ? String(event.message.text || "").trim() : "";
  const draft = { ...session.draft };
  let next = session.currentStep;
  if (params.session === "sterilization_confirm" && session.currentStep === "CONFIRM") {
    const result = await createCitizenSubmission(session.lineUserId, "STERILIZATION", session.selectedPetId, null, {
      subjectType: "STERILIZATION",
      sterilizedAt: draft.sterilizedAt,
      providerName: draft.providerName || "",
      note: draft.note || "",
    }, draft.attachmentId);
    await clearSession(session.lineUserId);
    return { refreshState: true, messages: [submissionSuccessMessage(result)] };
  }
  if (params.session === "sterilization_edit") next = "DATE";
  else if (session.currentStep === "DATE" && params.session === "sterilized_at") {
    draft.sterilizedAt = String(event.postback?.params?.date || "");
    if (!draft.sterilizedAt || draft.sterilizedAt > todayIso()) throw new Error("วันที่ทำหมันไม่ถูกต้อง");
    next = "PROVIDER";
  } else if (session.currentStep === "PROVIDER" && (text || params.session === "provider_skip")) {
    draft.providerName = params.session === "provider_skip" ? "" : text.slice(0, 150);
    next = "NOTE";
  } else if (session.currentStep === "NOTE" && (text || params.session === "note_skip")) {
    draft.note = params.session === "note_skip" ? "" : text.slice(0, 500);
    next = "PHOTO";
  } else if (session.currentStep === "PHOTO" && event.message?.type === "image") {
    draft.attachmentId = await downloadLineImage(session.lineUserId, event.message.id);
    next = "CONFIRM";
  } else if (session.currentStep === "PHOTO" && params.session === "photo_skip") {
    draft.attachmentId = null;
    next = "CONFIRM";
  } else return { messages: await sterilizationPrompt(session) };
  const updated = await updateSession(session, next, draft);
  return { messages: await sterilizationPrompt(updated) };
}

async function startPetStatus(lineUserId, petId, presetStatus = "") {
  const pet = await loadPet(lineUserId, petId);
  if (!pet) throw new Error("ไม่พบสัตว์เลี้ยงหรือไม่มีสิทธิ์ดำเนินการ");
  const draft = { petName: pet.petName, oldStatus: pet.status };
  const step = presetStatus ? "DATE" : "STATUS";
  if (presetStatus) draft.status = presetStatus;
  return petStatusPrompt(await saveSession(lineUserId, "PET_STATUS", step, draft, petId));
}

async function petStatusPrompt(session) {
  const { currentStep: step, draft } = session;
  if (step === "STATUS") {
    return [
      textMessage(
        `เลือกสถานะใหม่ของ ${draft.petName}`,
        cancelQuickReply(
          buildStatusMenuActions({
            id: session.selectedPetId,
            petName: draft.petName,
            status: draft.oldStatus,
          }).filter((action) =>
            String(action.data || "").startsWith("action=status_set"),
          ).map((action) => ({
            ...action,
            data: String(action.data || "")
              .replace("action=status_set", "session=pet_status")
              .replace(/&petId=[^&]*/u, ""),
          })),
        ),
      ),
    ];
  }
  if (step === "DATE") return [textMessage(`เลือกวันที่มีผลสำหรับสถานะ “${PET_STATUS_LABELS[draft.status]}”`, cancelQuickReply([
    datetimeAction("เลือกวันที่", "session=status_date", { initial: todayIso(), max: todayIso() }),
  ]))];
  if (step === "REASON") return [textMessage("พิมพ์รายละเอียดหรือเหตุผลอย่างน้อย 2 ตัวอักษร", cancelQuickReply())];
  if (step === "PHOTO") return [photoPrompt()];
  if (step === "CONFIRM") return [confirmationFlex(
    `แจ้งสถานะ ${draft.petName}`,
    [
      `สถานะเดิม: ${PET_STATUS_LABELS[draft.oldStatus] || draft.oldStatus}`,
      `สถานะใหม่: ${PET_STATUS_LABELS[draft.status] || draft.status}`,
      `วันที่มีผล: ${formatThaiDate(draft.effectiveAt)}`,
      `รายละเอียด: ${draft.reason}`,
      `หลักฐาน: ${draft.attachmentId ? "แนบรูปแล้ว" : "ไม่ได้แนบ"}`,
    ],
    "session=status_confirm",
    [postbackAction("แก้ไข", "session=status_edit", "แก้ไขสถานะสัตว์")],
  )];
  return [textMessage("ไม่พบขั้นตอนแจ้งสถานะ", cancelQuickReply())];
}

async function handlePetStatusSession(event, session, params) {
  const text = event.message?.type === "text" ? String(event.message.text || "").trim() : "";
  const draft = { ...session.draft };
  let next = session.currentStep;
  if (params.session === "status_confirm" && session.currentStep === "CONFIRM") {
    const result = await createCitizenSubmission(session.lineUserId, "PET_STATUS", session.selectedPetId, { status: draft.oldStatus }, {
      subjectType: "PET_STATUS",
      status: draft.status,
      effectiveAt: draft.effectiveAt,
      reason: draft.reason,
    }, draft.attachmentId);
    await clearSession(session.lineUserId);
    return { refreshState: true, messages: [submissionSuccessMessage(result)] };
  }
  if (params.session === "status_edit") next = "STATUS";
  else if (session.currentStep === "STATUS" && params.session === "pet_status") {
    if (!["MISSING", "ACTIVE", "DECEASED"].includes(params.value)) throw new Error("สถานะไม่ถูกต้อง");
    draft.status = params.value;
    next = "DATE";
  } else if (session.currentStep === "DATE" && params.session === "status_date") {
    draft.effectiveAt = String(event.postback?.params?.date || "");
    if (!draft.effectiveAt || draft.effectiveAt > todayIso()) throw new Error("วันที่มีผลไม่ถูกต้อง");
    next = "REASON";
  } else if (session.currentStep === "REASON" && text) {
    if (text.length < 2 || text.length > 500) throw new Error("รายละเอียดต้องมี 2–500 ตัวอักษร");
    draft.reason = text;
    next = "PHOTO";
  } else if (session.currentStep === "PHOTO" && event.message?.type === "image") {
    draft.attachmentId = await downloadLineImage(session.lineUserId, event.message.id);
    next = "CONFIRM";
  } else if (session.currentStep === "PHOTO" && params.session === "photo_skip") {
    draft.attachmentId = null;
    next = "CONFIRM";
  } else return { messages: await petStatusPrompt(session) };
  const updated = await updateSession(session, next, draft);
  return { messages: await petStatusPrompt(updated) };
}

async function startPetUpdate(lineUserId, petId) {
  const pet = await loadPet(lineUserId, petId);
  if (!pet) throw new Error("ไม่พบสัตว์เลี้ยงหรือไม่มีสิทธิ์ดำเนินการ");
  return petUpdatePrompt(await saveSession(lineUserId, "PET_UPDATE", "FIELD", { pet }, petId));
}

async function petUpdatePrompt(session) {
  const { currentStep: step, draft } = session;
  if (step === "FIELD") return [textMessage(`เลือกข้อมูลของ ${draft.pet.petName} ที่ต้องการแก้ไข`, cancelQuickReply([
    postbackAction("ชื่อสัตว์", "session=update_field&field=petName", "แก้ชื่อสัตว์"),
    postbackAction("ชนิดสัตว์", "session=update_field&field=species", "แก้ชนิดสัตว์"),
    postbackAction("เพศ", "session=update_field&field=sex", "แก้เพศสัตว์"),
    postbackAction("สายพันธุ์", "session=update_field&field=breed", "แก้สายพันธุ์"),
    postbackAction("สี/ตำหนิ", "session=update_field&field=color", "แก้สีหรือตำหนิ"),
    postbackAction("วันเกิด", "session=update_field&field=birthDate", "แก้วันเกิด"),
    postbackAction("ไมโครชิป", "session=update_field&field=microchipNo", "แก้เลขไมโครชิป"),
  ]))];
  if (step === "VALUE") {
    if (draft.field === "species") return [textMessage("เลือกชนิดสัตว์", cancelQuickReply([
      postbackAction("สุนัข", "session=update_value&value=DOG", "แก้เป็นสุนัข"),
      postbackAction("แมว", "session=update_value&value=CAT", "แก้เป็นแมว"),
    ]))];
    if (draft.field === "sex") return [textMessage("เลือกเพศสัตว์", cancelQuickReply([
      postbackAction("เพศผู้", "session=update_value&value=MALE", "แก้เป็นเพศผู้"),
      postbackAction("เพศเมีย", "session=update_value&value=FEMALE", "แก้เป็นเพศเมีย"),
      postbackAction("ไม่ระบุ", "session=update_value&value=UNKNOWN", "ไม่ระบุเพศ"),
    ]))];
    if (draft.field === "birthDate") return [textMessage("เลือกวันเกิดใหม่ หรือกดไม่ทราบ", cancelQuickReply([
      datetimeAction("เลือกวันเกิด", "session=update_date", { max: todayIso() }),
      postbackAction("ไม่ทราบ", "session=update_empty", "ไม่ทราบวันเกิด"),
    ]))];
    return [textMessage("พิมพ์ข้อมูลใหม่ หรือกดล้างข้อมูล", cancelQuickReply([
      postbackAction("ล้างข้อมูล", "session=update_empty", "ล้างข้อมูลช่องนี้"),
    ]))];
  }
  if (step === "REASON") return [textMessage("พิมพ์เหตุผลที่ต้องการแก้ไข", cancelQuickReply())];
  if (step === "PHOTO") return [photoPrompt()];
  if (step === "CONFIRM") {
    const oldValue = draft.pet[draft.field] ?? "";
    return [confirmationFlex(
      `ขอแก้ไขข้อมูล ${draft.pet.petName}`,
      [
        `ช่องที่แก้ไข: ${draft.fieldLabel}`,
        `ข้อมูลเดิม: ${oldValue || "ไม่ระบุ"}`,
        `ข้อมูลใหม่: ${draft.value || "ไม่ระบุ"}`,
        `เหตุผล: ${draft.reason}`,
        `หลักฐาน: ${draft.attachmentId ? "แนบรูปแล้ว" : "ไม่ได้แนบ"}`,
      ],
      "session=pet_update_confirm",
      [postbackAction("แก้ไขใหม่", "session=pet_update_edit", "แก้ข้อมูลใหม่")],
    )];
  }
  return [textMessage("ไม่พบขั้นตอนแก้ไขข้อมูลสัตว์", cancelQuickReply())];
}

const PET_FIELD_LABELS = Object.freeze({
  petName: "ชื่อสัตว์",
  species: "ชนิดสัตว์",
  sex: "เพศ",
  breed: "สายพันธุ์",
  color: "สี/ตำหนิ",
  birthDate: "วันเกิด",
  microchipNo: "หมายเลขไมโครชิป",
});

async function handlePetUpdateSession(event, session, params) {
  const text = event.message?.type === "text" ? String(event.message.text || "").trim() : "";
  const draft = { ...session.draft };
  let next = session.currentStep;
  if (params.session === "pet_update_confirm" && session.currentStep === "CONFIRM") {
    const pet = draft.pet;
    const proposed = {
      subjectType: "PET_UPDATE",
      petName: pet.petName,
      species: pet.species,
      sex: pet.sex,
      breed: pet.breed || "",
      color: pet.color || "",
      birthDate: pet.birthDate ? String(pet.birthDate).slice(0, 10) : "",
      microchipNo: pet.microchipNo || "",
      reason: draft.reason,
      [draft.field]: draft.value,
    };
    const current = { ...proposed, reason: undefined, [draft.field]: pet[draft.field] ?? "" };
    const result = await createCitizenSubmission(session.lineUserId, "PET_UPDATE", session.selectedPetId, current, proposed, draft.attachmentId);
    await clearSession(session.lineUserId);
    return { refreshState: true, messages: [submissionSuccessMessage(result)] };
  }
  if (params.session === "pet_update_edit") next = "FIELD";
  else if (session.currentStep === "FIELD" && params.session === "update_field") {
    if (!PET_FIELD_LABELS[params.field]) throw new Error("ช่องข้อมูลไม่ถูกต้อง");
    draft.field = params.field;
    draft.fieldLabel = PET_FIELD_LABELS[params.field];
    next = "VALUE";
  } else if (session.currentStep === "VALUE") {
    if (params.session === "update_value") {
      draft.value = params.value;
      next = "REASON";
    } else if (params.session === "update_date") {
      draft.value = String(event.postback?.params?.date || "");
      if (!draft.value || draft.value > todayIso()) throw new Error("วันเกิดไม่ถูกต้อง");
      next = "REASON";
    } else if (params.session === "update_empty") {
      draft.value = "";
      next = "REASON";
    } else if (text) {
      const max = draft.field === "petName" ? 100 : 100;
      if (draft.field === "petName" && !text) throw new Error("ชื่อสัตว์ห้ามว่าง");
      draft.value = text.slice(0, max);
      next = "REASON";
    } else return { messages: await petUpdatePrompt(session) };
  } else if (session.currentStep === "REASON" && text) {
    if (text.length < 2 || text.length > 500) throw new Error("เหตุผลต้องมี 2–500 ตัวอักษร");
    draft.reason = text;
    next = "PHOTO";
  } else if (session.currentStep === "PHOTO" && event.message?.type === "image") {
    draft.attachmentId = await downloadLineImage(session.lineUserId, event.message.id);
    next = "CONFIRM";
  } else if (session.currentStep === "PHOTO" && params.session === "photo_skip") {
    draft.attachmentId = null;
    next = "CONFIRM";
  } else return { messages: await petUpdatePrompt(session) };
  const updated = await updateSession(session, next, draft);
  return { messages: await petUpdatePrompt(updated) };
}

async function startOwnerTransfer(lineUserId, petId) {
  const pet = await loadPet(lineUserId, petId);
  if (!pet) throw new Error("ไม่พบสัตว์เลี้ยงหรือไม่มีสิทธิ์ดำเนินการ");
  return ownerTransferPrompt(await saveSession(lineUserId, "OWNER_TRANSFER", "OWNER_NAME", {
    petName: pet.petName,
    oldOwnerId: pet.ownerId,
    oldStatus: pet.status,
  }, petId));
}

async function ownerTransferPrompt(session) {
  const { currentStep: step, draft } = session;
  if (step === "OWNER_NAME") return [textMessage(`ขอโอนเจ้าของ ${draft.petName}\nพิมพ์ชื่อ–นามสกุลเจ้าของใหม่`, cancelQuickReply())];
  if (step === "PHONE") return [textMessage("พิมพ์เบอร์โทรศัพท์เจ้าของใหม่ 10 หลัก", cancelQuickReply())];
  if (step === "HOUSE_NO") return [textMessage("พิมพ์บ้านเลขที่ของเจ้าของใหม่", cancelQuickReply())];
  if (step === "VILLAGE") return [textMessage("เลือกหมู่บ้านของเจ้าของใหม่", await villageQuickReply("session=transfer_village"))];
  if (step === "ADDRESS") return [textMessage("พิมพ์รายละเอียดที่อยู่เพิ่มเติม หรือกดข้าม", cancelQuickReply([
    postbackAction("ข้าม", "session=transfer_address_skip", "ข้ามรายละเอียดที่อยู่"),
  ]))];
  if (step === "LOCATION") return [locationPrompt("กรุณาส่งตำแหน่งบ้านของเจ้าของใหม่")];
  if (step === "DATE") return [textMessage("เลือกวันที่ต้องการให้การโอนมีผล", cancelQuickReply([
    datetimeAction("เลือกวันที่", "session=transfer_date", { initial: todayIso(), max: todayIso() }),
  ]))];
  if (step === "REASON") return [textMessage("พิมพ์เหตุผลหรือรายละเอียดการโอน", cancelQuickReply())];
  if (step === "PHOTO") return [photoPrompt()];
  if (step === "CONFIRM") return [confirmationFlex(
    `ขอโอนเจ้าของ ${draft.petName}`,
    [
      `เจ้าของใหม่: ${draft.newOwnerName}`,
      `โทรศัพท์: ${draft.newOwnerPhone}`,
      `ที่อยู่: บ้านเลขที่ ${draft.newHouseNo} หมู่ ${draft.newVillageNo}${draft.newAddressDetail ? ` ${draft.newAddressDetail}` : ""}`,
      `ตำแหน่งบ้าน: ${draft.newLatitude != null ? "บันทึกแล้ว" : "ยังไม่มี"}`,
      `วันที่มีผล: ${formatThaiDate(draft.transferredAt)}`,
      `เหตุผล: ${draft.reason}`,
      `หลักฐาน: ${draft.attachmentId ? "แนบรูปแล้ว" : "ไม่ได้แนบ"}`,
    ],
    "session=transfer_confirm",
    [postbackAction("แก้ไข", "session=transfer_edit", "แก้ไขข้อมูลการโอน")],
  )];
  return [textMessage("ไม่พบขั้นตอนโอนเจ้าของ", cancelQuickReply())];
}

async function handleOwnerTransferSession(event, session, params) {
  const text = event.message?.type === "text" ? String(event.message.text || "").trim() : "";
  const draft = { ...session.draft };
  let next = session.currentStep;
  if (params.session === "transfer_confirm" && session.currentStep === "CONFIRM") {
    const proposed = {
      subjectType: "OWNER_TRANSFER",
      newOwnerName: draft.newOwnerName,
      newOwnerPhone: draft.newOwnerPhone,
      newHouseNo: draft.newHouseNo,
      newVillageId: draft.newVillageId,
      newVillageNo: draft.newVillageNo,
      newAddressDetail: draft.newAddressDetail || "",
      newLatitude: draft.newLatitude,
      newLongitude: draft.newLongitude,
      transferredAt: draft.transferredAt,
      reason: draft.reason,
    };
    const result = await createCitizenSubmission(session.lineUserId, "OWNER_TRANSFER", session.selectedPetId, {
      ownerId: draft.oldOwnerId,
      status: draft.oldStatus,
    }, proposed, draft.attachmentId);
    await clearSession(session.lineUserId);
    return { refreshState: true, messages: [submissionSuccessMessage(result)] };
  }
  if (params.session === "transfer_edit") next = "OWNER_NAME";
  else if (session.currentStep === "OWNER_NAME" && text) {
    if (text.length < 2 || text.length > 150) throw new Error("ชื่อเจ้าของใหม่ต้องมี 2–150 ตัวอักษร");
    draft.newOwnerName = text;
    next = "PHONE";
  } else if (session.currentStep === "PHONE" && text) {
    const phone = normalizeThaiPhone(text);
    if (!/^0\d{9}$/.test(phone)) throw new Error("เบอร์โทรศัพท์ต้องมี 10 หลัก");
    draft.newOwnerPhone = phone;
    next = "HOUSE_NO";
  } else if (session.currentStep === "HOUSE_NO" && text) {
    draft.newHouseNo = text.slice(0, 30);
    next = "VILLAGE";
  } else if (session.currentStep === "VILLAGE" && params.session === "transfer_village") {
    draft.newVillageId = Number(params.villageId);
    draft.newVillageNo = Number(params.villageNo);
    next = "ADDRESS";
  } else if (session.currentStep === "ADDRESS" && (text || params.session === "transfer_address_skip")) {
    draft.newAddressDetail = params.session === "transfer_address_skip" ? "" : text.slice(0, 255);
    next = "LOCATION";
  } else if (session.currentStep === "LOCATION" && event.message?.type === "location") {
    draft.newLatitude = Number(event.message.latitude);
    draft.newLongitude = Number(event.message.longitude);
    next = "DATE";
  } else if (session.currentStep === "DATE" && params.session === "transfer_date") {
    draft.transferredAt = String(event.postback?.params?.date || "");
    if (!draft.transferredAt || draft.transferredAt > todayIso()) throw new Error("วันที่โอนไม่ถูกต้อง");
    next = "REASON";
  } else if (session.currentStep === "REASON" && text) {
    if (text.length < 2 || text.length > 500) throw new Error("เหตุผลต้องมี 2–500 ตัวอักษร");
    draft.reason = text;
    next = "PHOTO";
  } else if (session.currentStep === "PHOTO" && event.message?.type === "image") {
    draft.attachmentId = await downloadLineImage(session.lineUserId, event.message.id);
    next = "CONFIRM";
  } else if (session.currentStep === "PHOTO" && params.session === "photo_skip") {
    draft.attachmentId = null;
    next = "CONFIRM";
  } else return { messages: await ownerTransferPrompt(session) };
  const updated = await updateSession(session, next, draft);
  return { messages: await ownerTransferPrompt(updated) };
}

async function startLocationUpdate(lineUserId) {
  const owner = await assertOwner(lineUserId);
  const session = await saveSession(lineUserId, "LOCATION", "LOCATION", { ownerId: owner.id });
  return [locationPrompt("ส่งตำแหน่งบ้านใหม่")];
}

async function handleLocationSession(event, session) {
  if (event.message?.type !== "location") return { messages: [locationPrompt("กรุณากดปุ่มส่งตำแหน่ง") ] };
  const latitude = Number(event.message.latitude);
  const longitude = Number(event.message.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error("ตำแหน่งที่ส่งมาไม่ถูกต้อง");
  await withTransaction(async (db) => {
    const [result] = await db.execute(
      `UPDATE households h
       INNER JOIN owners o ON o.household_id = h.id
       SET h.latitude = ?, h.longitude = ?,
           h.address_detail = COALESCE(NULLIF(?, ''), h.address_detail)
       WHERE o.id = ? AND o.line_user_id = ? AND o.deleted_at IS NULL AND h.deleted_at IS NULL`,
      [latitude, longitude, String(event.message.address || "").slice(0, 255), session.draft.ownerId, session.lineUserId],
    );
    if (!result.affectedRows) throw new Error("ไม่พบทะเบียนเจ้าของสำหรับบันทึกตำแหน่ง");
    await db.execute(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, new_value)
       VALUES (?, NULL, 'UPDATE_OWNER_LOCATION_LINE_NATIVE', 'OWNER', ?, ?)`,
      [crypto.randomUUID(), session.draft.ownerId, JSON.stringify({ latitude, longitude })],
    );
  });
  await clearSession(session.lineUserId);
  return { refreshState: true, messages: [textMessage("บันทึกตำแหน่งบ้านใหม่เรียบร้อย", quickReply([
    postbackAction("ข้อมูลของฉัน", "action=profile", "ดูข้อมูลของฉัน"),
    uriAction("เมนูหลัก", { view: "home" }),
  ]))] };
}

async function profileMessage(lineUserId) {
  const owner = await assertOwner(lineUserId);
  return textMessage([
    `ข้อมูลเจ้าของ: ${owner.fullName}`,
    `โทรศัพท์: ${owner.phone}`,
    `บ้านเลขที่: ${owner.houseNo}`,
    `หมู่บ้าน: ${owner.villageName || `หมู่ ${owner.villageNo}`}`,
    owner.addressDetail ? `รายละเอียด: ${owner.addressDetail}` : "",
    `ตำแหน่งบ้าน: ${owner.latitude != null && owner.longitude != null ? "บันทึกแล้ว" : "ยังไม่มี"}`,
  ].filter(Boolean).join("\n"), quickReply([
    postbackAction("แก้ชื่อ", "action=profile_edit&field=fullName", "แก้ชื่อเจ้าของ"),
    postbackAction("แก้เบอร์โทร", "action=profile_edit&field=phone", "แก้เบอร์โทรศัพท์"),
    postbackAction("แก้บ้านเลขที่", "action=profile_edit&field=houseNo", "แก้บ้านเลขที่"),
    postbackAction("แก้หมู่บ้าน", "action=profile_edit&field=villageId", "แก้หมู่บ้าน"),
    postbackAction("แก้รายละเอียด", "action=profile_edit&field=addressDetail", "แก้รายละเอียดที่อยู่"),
    postbackAction("แก้ตำแหน่ง", "action=location", "แก้ตำแหน่งบ้าน"),
    uriAction("เมนูหลัก", { view: "home" }),
  ]));
}

async function startProfileUpdate(lineUserId, field) {
  const owner = await assertOwner(lineUserId);
  const allowed = new Set(["fullName", "phone", "houseNo", "villageId", "addressDetail"]);
  if (!allowed.has(field)) throw new Error("ช่องข้อมูลไม่ถูกต้อง");
  const session = await saveSession(lineUserId, "PROFILE_UPDATE", field === "villageId" ? "VILLAGE" : "VALUE", { ownerId: owner.id, field });
  if (field === "villageId") return [textMessage("เลือกหมู่บ้านใหม่", await villageQuickReply("session=profile_village"))];
  const labels = { fullName: "ชื่อ–นามสกุลใหม่", phone: "เบอร์โทรศัพท์ใหม่", houseNo: "บ้านเลขที่ใหม่", addressDetail: "รายละเอียดที่อยู่ใหม่" };
  return [textMessage(`พิมพ์${labels[field]}`, cancelQuickReply())];
}

async function handleProfileSession(event, session, params) {
  const draft = { ...session.draft };
  let value;
  if (draft.field === "villageId" && params.session === "profile_village") {
    value = Number(params.villageId);
    if (!Number.isInteger(value) || value <= 0) throw new Error("หมู่บ้านไม่ถูกต้อง");
  } else if (event.message?.type === "text") {
    value = String(event.message.text || "").trim();
    if (draft.field === "fullName" && (value.length < 2 || value.length > 150)) throw new Error("ชื่อ–นามสกุลต้องมี 2–150 ตัวอักษร");
    if (draft.field === "phone") {
      value = normalizeThaiPhone(value);
      if (!/^0\d{9}$/.test(value)) throw new Error("เบอร์โทรศัพท์ต้องมี 10 หลัก");
    }
    if (draft.field === "houseNo" && (!value || value.length > 30)) throw new Error("บ้านเลขที่ไม่ถูกต้อง");
    if (draft.field === "addressDetail" && value.length > 255) throw new Error("รายละเอียดที่อยู่ยาวเกินไป");
  } else {
    return { messages: draft.field === "villageId" ? [textMessage("เลือกหมู่บ้านใหม่", await villageQuickReply("session=profile_village"))] : [textMessage("กรุณาพิมพ์ข้อมูลใหม่", cancelQuickReply())] };
  }

  await withTransaction(async (db) => {
    const owner = await loadOwnerByLineUserId(session.lineUserId, db);
    if (!owner || owner.id !== draft.ownerId) throw new Error("ไม่พบข้อมูลเจ้าของ");
    if (draft.field === "fullName") await db.execute("UPDATE owners SET full_name = ? WHERE id = ?", [value, owner.id]);
    else if (draft.field === "phone") await db.execute("UPDATE owners SET phone = ? WHERE id = ?", [value, owner.id]);
    else if (draft.field === "houseNo") await db.execute("UPDATE households SET house_no = ? WHERE id = ?", [value, owner.householdId]);
    else if (draft.field === "villageId") {
      await ensureVillage(db, value);
      await db.execute("UPDATE households SET village_id = ? WHERE id = ?", [value, owner.householdId]);
    } else if (draft.field === "addressDetail") await db.execute("UPDATE households SET address_detail = NULLIF(?, '') WHERE id = ?", [value, owner.householdId]);
    await db.execute(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, new_value)
       VALUES (?, NULL, 'UPDATE_OWNER_PROFILE_LINE_NATIVE', 'OWNER', ?, ?)`,
      [crypto.randomUUID(), owner.id, JSON.stringify({ field: draft.field, value })],
    );
  });
  await clearSession(session.lineUserId);
  return { refreshState: true, messages: [textMessage("แก้ไขข้อมูลเจ้าของเรียบร้อย", quickReply([
    postbackAction("ดูข้อมูล", "action=profile", "ดูข้อมูลของฉัน"),
    uriAction("เมนูหลัก", { view: "home" }),
  ]))] };
}

function submissionSuccessMessage(result) {
  return textMessage(
    `ส่ง${SUBJECT_LABELS[result.subjectType] || "คำขอ"}เรียบร้อย\nเลขอ้างอิง: ${result.referenceNo}\nเจ้าหน้าที่จะตรวจสอบและแจ้งผลผ่าน LINE\n\nกด “เมนูหลัก” เพื่อดูข้อมูลล่าสุดใน LIFF`,
    quickReply([
      uriAction("ดูคำขอ", { view: "account", section: "requests" }),
      uriAction("เมนูหลัก", { view: "home" }),
    ]),
  );
}

async function listRequests(lineUserId) {
  const owner = await assertOwner(lineUserId);
  const [rows] = await pool.execute(
    `SELECT * FROM (
       SELECT r.id, r.reference_no AS referenceNo, 'REGISTER_PET' AS requestType,
              r.status, r.review_note AS reviewNote, r.version, r.submitted_at AS submittedAt,
              p.name AS petName
       FROM registrations r
       INNER JOIN pets p ON p.id = r.pet_id
       WHERE r.owner_id = ?
       UNION ALL
       SELECT s.id, s.reference_no AS referenceNo, s.subject_type AS requestType,
              s.status, s.review_note AS reviewNote, s.version, s.submitted_at AS submittedAt,
              p.name AS petName
       FROM citizen_submissions s
       INNER JOIN pets p ON p.id = s.pet_id
       WHERE s.owner_id = ?
     ) requests
     ORDER BY submittedAt DESC
     LIMIT 10`,
    [owner.id, owner.id],
  );
  if (!rows.length) {
    return [textMessage("ยังไม่มีคำขอในบัญชีนี้", quickReply([
      postbackAction("ลงทะเบียนสัตว์", "action=register", "ลงทะเบียนสัตว์เลี้ยง"),
      uriAction("เมนูหลัก", { view: "home" }),
    ]))];
  }
  const bubbles = rows.map((row) => {
    const actions = [];
    if (row.status === "NEED_MORE_INFO") {
      actions.push({ type: "button", style: "primary", color: "#D97706", action: postbackAction("ส่งข้อมูลเพิ่ม", `action=resubmit&kind=${row.requestType === "REGISTER_PET" ? "REGISTRATION" : "SUBMISSION"}&id=${row.id}`, `ส่งข้อมูลเพิ่ม ${row.referenceNo}`) });
    }
    if (["SUBMITTED", "NEED_MORE_INFO"].includes(row.status)) {
      actions.push({ type: "button", style: "secondary", action: postbackAction("ยกเลิกคำขอ", `action=cancel_request&id=${row.id}&kind=${row.requestType === "REGISTER_PET" ? "REGISTRATION" : "SUBMISSION"}`, `ยกเลิก ${row.referenceNo}`) });
    }
    return {
      type: "bubble",
      size: "micro",
      body: {
        type: "box", layout: "vertical", paddingAll: "16px", spacing: "sm",
        contents: [
          { type: "text", text: row.petName || "รายการคำขอ", weight: "bold", size: "md", wrap: true },
          { type: "text", text: row.referenceNo, size: "xs", color: "#64748B", wrap: true },
          { type: "text", text: row.requestType === "REGISTER_PET" ? "ขึ้นทะเบียนสัตว์" : (SUBJECT_LABELS[row.requestType] || row.requestType), size: "sm", wrap: true },
          { type: "text", text: STATUS_LABELS[row.status] || row.status, size: "sm", color: row.status === "NEED_MORE_INFO" ? "#B45309" : "#087F5B", weight: "bold", wrap: true },
          ...(row.reviewNote ? [{ type: "text", text: `เจ้าหน้าที่: ${row.reviewNote}`, size: "xs", color: "#B45309", wrap: true }] : []),
        ],
      },
      ...(actions.length ? { footer: { type: "box", layout: "vertical", spacing: "sm", paddingAll: "12px", contents: actions } } : {}),
    };
  });
  return [{ type: "flex", altText: "คำขอของฉัน", contents: { type: "carousel", contents: bubbles } }];
}

async function startResubmit(lineUserId, kind, id) {
  const owner = await assertOwner(lineUserId);
  if (!["REGISTRATION", "SUBMISSION"].includes(kind)) throw new Error("ประเภทคำขอไม่ถูกต้อง");
  const table = kind === "REGISTRATION" ? "registrations" : "citizen_submissions";
  const [rows] = await pool.execute(
    `SELECT id, reference_no AS referenceNo, status, review_note AS reviewNote, version
     FROM ${table} WHERE id = ? AND owner_id = ? LIMIT 1`,
    [id, owner.id],
  );
  const item = rows[0];
  if (!item || item.status !== "NEED_MORE_INFO") throw new Error("คำขอนี้ไม่ได้อยู่ในสถานะที่ส่งข้อมูลเพิ่มได้");
  await saveSession(lineUserId, "RESUBMIT", "DETAIL", { kind, id, ...item });
  return [textMessage(`เจ้าหน้าที่ขอข้อมูลเพิ่มเติม:\n${item.reviewNote || "กรุณาเพิ่มรายละเอียด"}\n\nพิมพ์ข้อมูลที่ต้องการส่งเพิ่มเติม`, cancelQuickReply())];
}

async function resubmitPrompt(session) {
  if (session.currentStep === "DETAIL") return [textMessage("พิมพ์ข้อมูลเพิ่มเติมตามที่เจ้าหน้าที่แจ้ง", cancelQuickReply())];
  if (session.currentStep === "PHOTO") return [photoPrompt()];
  if (session.currentStep === "CONFIRM") return [confirmationFlex(
    `ส่งข้อมูลเพิ่ม ${session.draft.referenceNo}`,
    [
      `ข้อมูลเพิ่มเติม: ${session.draft.additionalInfo}`,
      `หลักฐาน: ${session.draft.attachmentId ? "แนบรูปแล้ว" : "ไม่ได้แนบ"}`,
    ],
    "session=resubmit_confirm",
    [postbackAction("แก้ไข", "session=resubmit_edit", "แก้ข้อมูลเพิ่มเติม")],
  )];
  return [textMessage("ไม่พบขั้นตอนส่งข้อมูลเพิ่มเติม", cancelQuickReply())];
}

async function handleResubmitSession(event, session, params) {
  const text = event.message?.type === "text" ? String(event.message.text || "").trim() : "";
  const draft = { ...session.draft };
  let next = session.currentStep;
  if (params.session === "resubmit_confirm" && session.currentStep === "CONFIRM") {
    await withTransaction(async (db) => {
      const owner = await loadOwnerByLineUserId(session.lineUserId, db);
      if (!owner) throw new Error("ไม่พบข้อมูลเจ้าของ");
      if (draft.kind === "REGISTRATION") {
        const [result] = await db.execute(
          `UPDATE registrations SET status = 'SUBMITTED', review_note = NULL,
                    submitted_at = NOW(), version = version + 1
           WHERE id = ? AND owner_id = ? AND status = 'NEED_MORE_INFO' AND version = ?`,
          [draft.id, owner.id, draft.version],
        );
        if (!result.affectedRows) throw new Error("คำขอมีการเปลี่ยนแปลง กรุณาโหลดรายการใหม่");
      } else {
        const [rows] = await db.execute(
          `SELECT proposed_payload AS proposedPayload FROM citizen_submissions
           WHERE id = ? AND owner_id = ? AND status = 'NEED_MORE_INFO' AND version = ?
           LIMIT 1 FOR UPDATE`,
          [draft.id, owner.id, draft.version],
        );
        if (!rows[0]) throw new Error("คำขอมีการเปลี่ยนแปลง กรุณาโหลดรายการใหม่");
        const proposed = { ...parseJson(rows[0].proposedPayload, {}), additionalInfo: draft.additionalInfo };
        await db.execute(
          `UPDATE citizen_submissions SET status = 'SUBMITTED', review_note = NULL,
                    proposed_payload = ?, submitted_at = NOW(), version = version + 1
           WHERE id = ?`,
          [JSON.stringify(proposed), draft.id],
        );
      }
      await finalizeAttachment(db, draft.attachmentId, draft.kind, draft.id);
      await db.execute(
        `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, new_value)
         VALUES (?, NULL, 'RESUBMIT_LINE_NATIVE', ?, ?, ?)`,
        [crypto.randomUUID(), draft.kind === "REGISTRATION" ? "REGISTRATION" : "CITIZEN_SUBMISSION", draft.id, JSON.stringify({ additionalInfo: draft.additionalInfo })],
      );
    });
    await clearSession(session.lineUserId);
    return { refreshState: true, messages: [textMessage(`ส่งข้อมูลเพิ่มเติมสำหรับ ${draft.referenceNo} เรียบร้อย`, quickReply([
      uriAction("ดูคำขอ", { view: "account", section: "requests" }),
      uriAction("เมนูหลัก", { view: "home" }),
    ]))] };
  }
  if (params.session === "resubmit_edit") next = "DETAIL";
  else if (session.currentStep === "DETAIL" && text) {
    if (text.length < 2 || text.length > 1000) throw new Error("ข้อมูลเพิ่มเติมต้องมี 2–1,000 ตัวอักษร");
    draft.additionalInfo = text;
    next = "PHOTO";
  } else if (session.currentStep === "PHOTO" && event.message?.type === "image") {
    draft.attachmentId = await downloadLineImage(session.lineUserId, event.message.id);
    next = "CONFIRM";
  } else if (session.currentStep === "PHOTO" && params.session === "photo_skip") {
    draft.attachmentId = null;
    next = "CONFIRM";
  } else return { messages: await resubmitPrompt(session) };
  const updated = await updateSession(session, next, draft);
  return { messages: await resubmitPrompt(updated) };
}

async function cancelRequest(lineUserId, kind, id, confirmed = false) {
  if (!confirmed) {
    return [textMessage("ยืนยันยกเลิกคำขอนี้หรือไม่ การยกเลิกแล้วไม่สามารถย้อนกลับได้", quickReply([
      postbackAction("ยืนยันยกเลิก", `action=cancel_request_confirm&kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`, "ยืนยันยกเลิกคำขอ"),
      postbackAction("ไม่ยกเลิก", "action=requests", "กลับไปดูคำขอ"),
    ]))];
  }
  const owner = await assertOwner(lineUserId);
  const table = kind === "REGISTRATION" ? "registrations" : "citizen_submissions";
  if (!["registrations", "citizen_submissions"].includes(table)) throw new Error("ประเภทคำขอไม่ถูกต้อง");
  const [result] = await pool.execute(
    `UPDATE ${table} SET status = 'CANCELLED', version = version + 1
     WHERE id = ? AND owner_id = ? AND status IN ('SUBMITTED','NEED_MORE_INFO')`,
    [id, owner.id],
  );
  if (!result.affectedRows) throw new Error("คำขอนี้ถูกดำเนินการแล้วหรือไม่สามารถยกเลิกได้");
  return [textMessage("ยกเลิกคำขอเรียบร้อย", quickReply([
    uriAction("ดูคำขอ", { view: "account", section: "requests" }),
    uriAction("เมนูหลัก", { view: "home" }),
  ]))];
}

export function buildMainMenuActions(state) {
  if (!state?.linked) {
    return [
      postbackAction("ลงทะเบียนสัตว์", "action=register", "ลงทะเบียนสัตว์เลี้ยง"),
      postbackAction("ติดตามคำขอ", "action=track", "ติดตามคำขอ"),
      postbackAction("เชื่อมทะเบียน", "action=link", "เชื่อมทะเบียนเดิมกับ LINE"),
      postbackAction("วิธีใช้งาน", "action=services", "ดูวิธีใช้บริการ"),
      postbackAction("ติดต่อเทศบาล", "action=contact", "ติดต่อเทศบาล"),
    ];
  }

  return [
    postbackAction("สัตว์ของฉัน", "action=pets", "ดูสัตว์เลี้ยงของฉัน"),
    postbackAction("เพิ่มสัตว์", "action=register", "ลงทะเบียนสัตว์เพิ่ม"),
    postbackAction("สุขภาพสัตว์", "action=health_menu", "เปิดเมนูสุขภาพสัตว์"),
    postbackAction("แจ้งสถานะสัตว์", "action=status_menu", "เปิดเมนูแจ้งสถานะสัตว์"),
    postbackAction("คำขอของฉัน", "action=requests", "ดูคำขอของฉัน"),
    postbackAction("ข้อมูลเจ้าของ", "action=owner_menu", "เปิดเมนูข้อมูลเจ้าของ"),
  ];
}

function nativeMenuMessage(state) {
  return textMessage(
    state.linked
      ? "เมนูหลัก\nเลือกหมวดบริการก่อน แล้วระบบจะแสดงเมนูย่อยที่เกี่ยวข้อง"
      : "เริ่มใช้บริการ ThaPho PET ได้จากเมนูด้านล่าง โดยไม่ต้องเปิดเว็บไซต์",
    quickReply(buildMainMenuActions(state)),
  );
}

function healthMenuMessage() {
  return textMessage(
    [
      "สุขภาพสัตว์",
      "เลือกบริการที่ต้องการ จากนั้นเลือกสัตว์เลี้ยง",
      "",
      "• แจ้งหรืออัปเดตวัคซีน",
      "• แจ้งข้อมูลทำหมัน",
      "• ดูข้อมูลสุขภาพจากรายละเอียดสัตว์",
    ].join("\n"),
    quickReply([
      postbackAction("แจ้งวัคซีน", "action=vaccination", "แจ้งข้อมูลวัคซีน"),
      postbackAction("แจ้งทำหมัน", "action=sterilization", "แจ้งข้อมูลทำหมัน"),
      postbackAction("ดูสัตว์ของฉัน", "action=pets", "ดูข้อมูลสุขภาพสัตว์"),
      postbackAction("เมนูหลัก", "action=menu", "กลับเมนูหลัก"),
    ]),
  );
}

function ownerMenuMessage() {
  return textMessage(
    [
      "ข้อมูลเจ้าของ",
      "เลือกข้อมูลที่ต้องการดูหรือแก้ไข",
    ].join("\n"),
    quickReply([
      postbackAction("ดูข้อมูลเจ้าของ", "action=profile", "ดูข้อมูลเจ้าของ"),
      postbackAction("แก้ตำแหน่งบ้าน", "action=location", "แก้ไขตำแหน่งบ้าน"),
      postbackAction("ติดต่อเทศบาล", "action=contact", "ติดต่อเทศบาล"),
      postbackAction("เมนูหลัก", "action=menu", "กลับเมนูหลัก"),
    ]),
  );
}

function actionCenterMessage(state) {
  const actions = [
    postbackAction("คำขอที่ต้องแก้", "action=requests", "ดูคำขอที่ต้องดำเนินการ"),
  ];

  if (Number(state?.counts?.vaccinationDue || 0) > 0) {
    actions.push(
      postbackAction("วัคซีนถึงกำหนด", "action=vaccination", "อัปเดตวัคซีนที่ถึงกำหนด"),
    );
  }

  if (Number(state?.counts?.missingPets || 0) > 0) {
    actions.push(
      postbackAction("สถานะสัตว์", "action=status_menu", "จัดการสถานะสัตว์สูญหาย"),
    );
  }

  if (state?.location?.missing) {
    actions.push(
      postbackAction("เพิ่มตำแหน่งบ้าน", "action=location", "เพิ่มตำแหน่งบ้าน"),
    );
  }

  actions.push(
    postbackAction("เมนูหลัก", "action=menu", "กลับเมนูหลัก"),
  );

  return textMessage(
    "รายการที่ต้องดำเนินการ\nระบบแสดงตัวเลือกจากข้อมูลปัจจุบันของคุณ",
    quickReply(actions),
  );
}

export function buildStatusMenuActions(pet) {
  const status = String(pet?.status || "ACTIVE");
  const petId = encodeURIComponent(String(pet?.id || ""));
  const actions = [];

  if (!["MISSING", "DECEASED", "TRANSFERRED"].includes(status)) {
    actions.push(
      postbackAction(
        "แจ้งสูญหาย",
        `action=status_set&petId=${petId}&value=MISSING`,
        `แจ้ง ${pet?.petName || "สัตว์เลี้ยง"} สูญหาย`,
      ),
    );
  }

  if (status === "MISSING") {
    actions.push(
      postbackAction(
        "แจ้งพบแล้ว",
        `action=status_set&petId=${petId}&value=ACTIVE`,
        `แจ้งพบ ${pet?.petName || "สัตว์เลี้ยง"} แล้ว`,
      ),
    );
  }

  if (!["DECEASED", "TRANSFERRED"].includes(status)) {
    actions.push(
      postbackAction(
        "แจ้งเสียชีวิต",
        `action=status_set&petId=${petId}&value=DECEASED`,
        `แจ้ง ${pet?.petName || "สัตว์เลี้ยง"} เสียชีวิต`,
      ),
    );
  }

  if (["ACTIVE", "MISSING"].includes(status)) {
    actions.push(
      postbackAction(
        "โอนเจ้าของ",
        `action=transfer_pet&petId=${petId}`,
        `ขอโอนเจ้าของ ${pet?.petName || "สัตว์เลี้ยง"}`,
      ),
    );
  }

  actions.push(
    postbackAction(
      "ดูรายละเอียด",
      `action=pet_detail&petId=${petId}`,
      `ดูข้อมูล ${pet?.petName || "สัตว์เลี้ยง"}`,
    ),
    postbackAction("เลือกสัตว์ตัวอื่น", "action=status_menu", "เลือกสัตว์ตัวอื่น"),
    postbackAction("เมนูหลัก", "action=menu", "กลับเมนูหลัก"),
  );

  return actions;
}

function statusMenuMessage(pet) {
  const statusLabel = PET_STATUS_LABELS[pet.status] || pet.status;
  return textMessage(
    [
      `แจ้งสถานะสัตว์: ${pet.petName}`,
      `สถานะปัจจุบัน: ${statusLabel}`,
      "",
      "เลือกสถานะที่ต้องการแจ้ง",
      "การแจ้งสูญหาย พบแล้ว หรือเสียชีวิต อยู่ในเมนูย่อยนี้ทั้งหมด",
    ].join("\n"),
    quickReply(buildStatusMenuActions(pet)),
  );
}

function servicesMessage() {
  return textMessage([
    "บริการประชาชน ThaPho PET ผ่าน LINE",
    "• ลงทะเบียนสุนัขและแมว",
    "• ส่งตำแหน่งบ้านจากแผนที่ของ LINE",
    "• แนบรูปจากกล้องหรือคลังภาพ",
    "• แจ้งวัคซีนและทำหมัน",
    "• แจ้งสูญหาย เสียชีวิต หรือกลับมาปกติ",
    "• แก้ไขข้อมูลและขอโอนเจ้าของ",
    "• ติดตาม ส่งข้อมูลเพิ่ม และยกเลิกคำขอ",
    "• รับผลตรวจสอบและการแจ้งเตือนผ่าน LINE",
  ].join("\n"), quickReply([
    postbackAction("เริ่มลงทะเบียน", "action=register", "ลงทะเบียนสัตว์เลี้ยง"),
    uriAction("เมนูหลัก", { view: "home" }),
  ]));
}

function contactMessage() {
  return textMessage([
    "ติดต่อเจ้าหน้าที่ ThaPho PET",
    "กรุณาใช้ช่องทางติดต่อทางการที่แสดงในโปรไฟล์ LINE Official Account นี้",
    "เพื่อความปลอดภัย กรุณาอย่าส่งรหัสผ่าน รหัส OTP หรือข้อมูลบัตรประชาชนในแชต",
  ].join("\n"), quickReply([
    postbackAction("คำขอของฉัน", "action=requests", "ดูคำขอของฉัน"),
    uriAction("เมนูหลัก", { view: "home" }),
  ]));
}

async function handleAction(event, state, params) {
  const lineUserId = event.source?.userId || "";
  const action = params.action;

  if (action === "menu") {
    return {
      messages: [
        buildCitizenStatusFlex(state),
        nativeMenuMessage(state),
      ],
    };
  }

  if (action === "action_center") {
    return {
      messages: [
        buildCitizenStatusFlex(state),
        actionCenterMessage(state),
      ],
    };
  }

  if (action === "health_menu") {
    await assertOwner(lineUserId);
    return { messages: [healthMenuMessage()] };
  }

  if (action === "owner_menu") {
    await assertOwner(lineUserId);
    return { messages: [ownerMenuMessage()] };
  }

  if (action === "status_menu") {
    return {
      messages: await showPetPicker(
        lineUserId,
        "status_menu_pet",
        Number(params.page || 0),
      ),
    };
  }

  if (action === "status_menu_pet") {
    const pet = await loadPet(lineUserId, params.petId);
    if (!pet) {
      throw new Error("ไม่พบสัตว์เลี้ยงหรือไม่มีสิทธิ์ดำเนินการ");
    }
    return { messages: [statusMenuMessage(pet)] };
  }

  if (action === "status_set") {
    const nextStatus = String(params.value || "");
    if (!["MISSING", "ACTIVE", "DECEASED"].includes(nextStatus)) {
      throw new Error("สถานะสัตว์ไม่ถูกต้อง");
    }

    const pet = await loadPet(lineUserId, params.petId);
    if (!pet) {
      throw new Error("ไม่พบสัตว์เลี้ยงหรือไม่มีสิทธิ์ดำเนินการ");
    }

    const allowedActions = buildStatusMenuActions(pet)
      .map((item) => parsePostbackData(item.data))
      .some((item) =>
        item.action === "status_set" &&
        item.value === nextStatus,
      );

    if (!allowedActions) {
      throw new Error("สถานะนี้ไม่สามารถเลือกจากสถานะปัจจุบันได้");
    }

    return {
      messages: await startPetStatus(
        lineUserId,
        params.petId,
        nextStatus,
      ),
    };
  }

  if (action === "register") {
    return { messages: await startRegistration(lineUserId, state) };
  }
  if (action === "link") {
    return { messages: await startReferenceFlow(lineUserId, "LINK") };
  }
  if (action === "track") {
    return { messages: await startReferenceFlow(lineUserId, "TRACK") };
  }
  if (action === "services") {
    return { messages: [servicesMessage()] };
  }
  if (action === "contact") {
    return { messages: [contactMessage()] };
  }
  if (action === "requests") {
    return { messages: await listRequests(lineUserId) };
  }
  if (action === "profile") {
    return { messages: [await profileMessage(lineUserId)] };
  }
  if (action === "profile_edit") {
    return {
      messages: await startProfileUpdate(
        lineUserId,
        params.field,
      ),
    };
  }
  if (action === "location") {
    return { messages: await startLocationUpdate(lineUserId) };
  }
  if (action === "pets") {
    return {
      messages: await showPetPicker(
        lineUserId,
        "pet_detail",
        Number(params.page || 0),
      ),
    };
  }
  if (action === "pet_page") {
    return {
      messages: await showPetPicker(
        lineUserId,
        params.target || "pet_detail",
        Number(params.page || 0),
      ),
    };
  }
  if (action === "pet_detail") {
    return {
      messages: await petDetailMessages(
        lineUserId,
        params.petId,
      ),
    };
  }
  if (action === "vaccination") {
    return {
      messages: await showPetPicker(
        lineUserId,
        "vaccination_pet",
      ),
    };
  }
  if (action === "vaccination_pet") {
    return {
      messages: await startVaccination(
        lineUserId,
        params.petId,
      ),
    };
  }
  if (action === "sterilization") {
    return {
      messages: await showPetPicker(
        lineUserId,
        "sterilization_pet",
      ),
    };
  }
  if (action === "sterilization_pet") {
    return {
      messages: await startSterilization(
        lineUserId,
        params.petId,
      ),
    };
  }

  // Compatibility with V4 actions. Route all old status entries
  // through the new parent menu instead of starting a child flow.
  if (["status", "status_missing"].includes(action)) {
    return {
      messages: await showPetPicker(
        lineUserId,
        "status_menu_pet",
      ),
    };
  }
  if (["status_pet", "status_missing_pet"].includes(action)) {
    const pet = await loadPet(lineUserId, params.petId);
    if (!pet) {
      throw new Error("ไม่พบสัตว์เลี้ยงหรือไม่มีสิทธิ์ดำเนินการ");
    }
    return { messages: [statusMenuMessage(pet)] };
  }

  if (action === "pet_update") {
    return {
      messages: await showPetPicker(
        lineUserId,
        "pet_update_pet",
      ),
    };
  }
  if (action === "pet_update_pet") {
    return {
      messages: await startPetUpdate(
        lineUserId,
        params.petId,
      ),
    };
  }
  if (action === "transfer") {
    return {
      messages: await showPetPicker(
        lineUserId,
        "transfer_pet",
      ),
    };
  }
  if (action === "transfer_pet") {
    return {
      messages: await startOwnerTransfer(
        lineUserId,
        params.petId,
      ),
    };
  }
  if (action === "pet_manage") {
    return {
      messages: [
        textMessage(
          "จัดการสัตว์เลี้ยง\nเลือกหมวดการดำเนินการ",
          quickReply([
            postbackAction(
              "แก้ข้อมูลสัตว์",
              `action=pet_update_pet&petId=${params.petId}`,
              "แก้ข้อมูลสัตว์",
            ),
            postbackAction(
              "สุขภาพสัตว์",
              "action=health_menu",
              "เปิดเมนูสุขภาพสัตว์",
            ),
            postbackAction(
              "แจ้งสถานะสัตว์",
              `action=status_menu_pet&petId=${params.petId}`,
              "เปิดเมนูแจ้งสถานะสัตว์",
            ),
            postbackAction(
              "ดูรายละเอียด",
              `action=pet_detail&petId=${params.petId}`,
              "ดูรายละเอียดสัตว์",
            ),
            postbackAction(
              "เมนูหลัก",
              "action=menu",
              "กลับเมนูหลัก",
            ),
          ]),
        ),
      ],
    };
  }
  if (action === "resubmit") {
    if (!params.kind || !params.id) {
      return { messages: await listRequests(lineUserId) };
    }
    return {
      messages: await startResubmit(
        lineUserId,
        params.kind,
        params.id,
      ),
    };
  }
  if (action === "cancel_request") {
    return {
      messages: await cancelRequest(
        lineUserId,
        params.kind,
        params.id,
        false,
      ),
    };
  }
  if (action === "cancel_request_confirm") {
    return {
      refreshState: true,
      messages: await cancelRequest(
        lineUserId,
        params.kind,
        params.id,
        true,
      ),
    };
  }

  return { messages: [nativeMenuMessage(state)] };
}

function commandToAction(command) {
  if (
    ["เมนู", "help", "ช่วยเหลือ", "สวัสดี", "เริ่มต้น", "สถานะของฉัน"]
      .some((word) => command.includes(word))
  ) {
    return "menu";
  }

  if (
    ["ลงทะเบียน", "ขึ้นทะเบียน", "เพิ่มสัตว์"]
      .some((word) => command.includes(word))
  ) {
    return "register";
  }

  if (
    ["เชื่อมทะเบียน", "ผูกทะเบียน"]
      .some((word) => command.includes(word))
  ) {
    return "link";
  }

  if (
    ["ติดตาม", "คำขอของฉัน", "สถานะคำขอ"]
      .some((word) => command.includes(word))
  ) {
    return "requests";
  }

  if (
    ["สุขภาพสัตว์", "ข้อมูลสุขภาพ"]
      .some((word) => command.includes(word))
  ) {
    return "health_menu";
  }

  if (
    ["วัคซีน", "ฉีดยา"]
      .some((word) => command.includes(word))
  ) {
    return "vaccination";
  }

  if (command.includes("ทำหมัน")) {
    return "sterilization";
  }

  if (
    ["สูญหาย", "พบแล้ว", "เสียชีวิต", "แจ้งสถานะ", "สถานะสัตว์"]
      .some((word) => command.includes(word))
  ) {
    return "status_menu";
  }

  if (
    ["สัตว์ของฉัน", "สัตว์เลี้ยงของฉัน", "ข้อมูลสัตว์"]
      .some((word) => command.includes(word))
  ) {
    return "pets";
  }

  if (
    ["ข้อมูลเจ้าของ", "ข้อมูลของฉัน", "แก้ไขข้อมูลเจ้าของ"]
      .some((word) => command.includes(word))
  ) {
    return "owner_menu";
  }

  if (
    ["ตำแหน่ง", "พิกัด", "ที่อยู่"]
      .some((word) => command.includes(word))
  ) {
    return "location";
  }

  if (
    ["ติดต่อ", "เบอร์โทร"]
      .some((word) => command.includes(word))
  ) {
    return "contact";
  }

  return "";
}

async function dispatchSession(event, session, params) {
  if (session.flowType === "REGISTER") return handleRegistrationSession(event, session, params);
  if (["LINK", "TRACK"].includes(session.flowType)) return handleReferenceFlow(event, session, params);
  if (session.flowType === "VACCINATION") return handleVaccinationSession(event, session, params);
  if (session.flowType === "STERILIZATION") return handleSterilizationSession(event, session, params);
  if (session.flowType === "PET_STATUS") return handlePetStatusSession(event, session, params);
  if (session.flowType === "PET_UPDATE") return handlePetUpdateSession(event, session, params);
  if (session.flowType === "OWNER_TRANSFER") return handleOwnerTransferSession(event, session, params);
  if (session.flowType === "LOCATION") return handleLocationSession(event, session, params);
  if (session.flowType === "PROFILE_UPDATE") return handleProfileSession(event, session, params);
  if (session.flowType === "RESUBMIT") return handleResubmitSession(event, session, params);
  await clearSession(session.lineUserId);
  return { messages: [textMessage("รายการเดิมไม่รองรับแล้ว กรุณาเริ่มใหม่", quickReply([uriAction("เมนูหลัก", { view: "home" })]))] };
}

export async function handleNativeCitizenEvent(event, suppliedState = null) {
  const lineUserId = String(event?.source?.userId || "").trim();
  if (!lineUserId) return { handled: false, messages: [] };
  const state = suppliedState || await loadCitizenExperienceByLineUserId(lineUserId);
  const params = event.type === "postback" ? parsePostbackData(event.postback?.data) : {};
  const textCommand = event.message?.type === "text"
    ? normalizeNativeCommand(event.message.text)
    : "";
  let session = await loadSession(lineUserId);

  if (params.session === "cancel" || ["ยกเลิก", "cancel", "หยุด"].includes(textCommand)) {
    await clearSession(lineUserId);
    return { handled: true, messages: [textMessage("ยกเลิกรายการที่ค้างอยู่แล้ว", quickReply([uriAction("เมนูหลัก", { view: "home" })]))] };
  }

  if (session && params.session === "resume") {
    const prompts = {
      REGISTER: registrationPrompt,
      VACCINATION: vaccinationPrompt,
      STERILIZATION: sterilizationPrompt,
      PET_STATUS: petStatusPrompt,
      PET_UPDATE: petUpdatePrompt,
      OWNER_TRANSFER: ownerTransferPrompt,
      RESUBMIT: resubmitPrompt,
    };
    const prompt = prompts[session.flowType];
    if (prompt) return { handled: true, messages: await prompt(session) };
    if (["LINK", "TRACK"].includes(session.flowType)) {
      return { handled: true, messages: [textMessage(session.currentStep === "REFERENCE" ? "พิมพ์เลขอ้างอิง" : "พิมพ์เบอร์โทรศัพท์", cancelQuickReply())] };
    }
    if (session.flowType === "LOCATION") return { handled: true, messages: [locationPrompt()] };
    if (session.flowType === "PROFILE_UPDATE") {
      if (session.draft?.field === "villageId") {
        return { handled: true, messages: [textMessage("เลือกหมู่บ้านใหม่", await villageQuickReply("session=profile_village"))] };
      }
      return { handled: true, messages: [textMessage("กรุณาพิมพ์ข้อมูลใหม่", cancelQuickReply())] };
    }
  }

  let requestedAction = params.action || commandToAction(textCommand);
  if (requestedAction === "requests" && !state.linked) requestedAction = "track";
  if (session && requestedAction) {
    return {
      handled: true,
      messages: [textMessage(
        `คุณมีรายการ “${FLOW_LABELS[session.flowType] || session.flowType}” ที่ยังไม่เสร็จ ต้องการทำต่อหรือยกเลิกก่อนเริ่มเมนูใหม่`,
        resumeQuickReply(),
      )],
    };
  }

  if (session) {
    const result = await dispatchSession(event, session, params);
    return { handled: true, ...result };
  }

  if (requestedAction) {
    const result = await handleAction(event, state, { ...params, action: requestedAction });
    return { handled: true, ...result };
  }

  if (event.type === "message" && ["image", "location"].includes(event.message?.type)) {
    return { handled: true, messages: [textMessage("ยังไม่มีรายการที่รอรับข้อมูลนี้ กรุณาเลือกบริการจากเมนูก่อน", quickReply([uriAction("เมนูหลัก", { view: "home" })]))] };
  }

  return { handled: true, messages: [nativeMenuMessage(state)] };
}

export async function refreshNativeCitizenMenu(lineUserId) {
  const state = await loadCitizenExperienceByLineUserId(lineUserId);
  await syncRichMenuForLineUser(lineUserId, state);
  return state;
}

export async function cleanupNativeLineState() {
  const [attachments] = await pool.execute(
    `SELECT id, storage_path AS storagePath
     FROM line_native_attachments
     WHERE expires_at IS NOT NULL AND expires_at <= NOW()
     LIMIT 100`,
  );

  for (const attachment of attachments) {
    const absolutePath = path.resolve(config.privateStorageDir, attachment.storagePath);
    const storagePrefix = `${path.resolve(config.privateStorageDir)}${path.sep}`;
    if (absolutePath.startsWith(storagePrefix)) {
      await fs.unlink(absolutePath).catch((error) => {
        if (error?.code !== "ENOENT") throw error;
      });
    }
    await pool.execute("DELETE FROM line_native_attachments WHERE id = ?", [attachment.id]);
  }

  const [sessions] = await pool.execute(
    "DELETE FROM line_conversation_sessions WHERE expires_at <= NOW()",
  );
  const [events] = await pool.execute(
    "DELETE FROM line_webhook_events WHERE received_at < DATE_SUB(NOW(), INTERVAL 30 DAY)",
  );

  return {
    attachments: attachments.length,
    sessions: Number(sessions.affectedRows || 0),
    events: Number(events.affectedRows || 0),
  };
}

function nativeHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  error.expose = true;
  return error;
}

export async function applyNativeOwnerTransfer(db, submission, reviewerId) {
  if (submission.subjectType !== "OWNER_TRANSFER") return false;
  const proposed = parseJson(submission.proposedPayload, {});

  await ensureVillage(db, proposed.newVillageId);

  const [petRows] = await db.execute(
    "SELECT owner_id AS ownerId, status FROM pets WHERE id = ? AND deleted_at IS NULL LIMIT 1 FOR UPDATE",
    [submission.petId],
  );
  const pet = petRows[0];
  if (!pet) throw nativeHttpError(404, "ไม่พบสัตว์เลี้ยง");

  const [ownerRows] = await db.execute(
    `SELECT id, household_id AS householdId
     FROM owners
     WHERE deleted_at IS NULL AND phone = ? AND full_name = ?
     ORDER BY created_at ASC LIMIT 1 FOR UPDATE`,
    [proposed.newOwnerPhone, proposed.newOwnerName],
  );

  let newOwnerId = ownerRows[0]?.id || null;
  if (newOwnerId === pet.ownerId) {
    throw nativeHttpError(422, "เจ้าของใหม่ต้องไม่ใช่เจ้าของปัจจุบัน");
  }

  if (!newOwnerId) {
    const householdId = crypto.randomUUID();
    newOwnerId = crypto.randomUUID();
    await db.execute(
      `INSERT INTO households
        (id, house_no, village_id, address_detail, latitude, longitude)
       VALUES (?, ?, ?, NULLIF(?, ''), ?, ?)`,
      [householdId, proposed.newHouseNo, proposed.newVillageId, proposed.newAddressDetail || "", proposed.newLatitude, proposed.newLongitude],
    );
    await db.execute(
      `INSERT INTO owners (id, household_id, full_name, phone, consent_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [newOwnerId, householdId, proposed.newOwnerName, proposed.newOwnerPhone],
    );
  } else {
    await db.execute(
      `UPDATE households
       SET house_no = ?, village_id = ?, address_detail = NULLIF(?, ''),
           latitude = ?, longitude = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [
        proposed.newHouseNo,
        proposed.newVillageId,
        proposed.newAddressDetail || "",
        proposed.newLatitude,
        proposed.newLongitude,
        ownerRows[0].householdId,
      ],
    );
  }

  await db.execute(
    "UPDATE pets SET owner_id = ?, status = 'ACTIVE' WHERE id = ? AND deleted_at IS NULL",
    [newOwnerId, submission.petId],
  );
  await db.execute(
    `INSERT INTO pet_owner_history
      (id, pet_id, previous_owner_id, new_owner_id, transferred_at, reason, recorded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [crypto.randomUUID(), submission.petId, pet.ownerId, newOwnerId, proposed.transferredAt, proposed.reason, reviewerId],
  );
  if (pet.status !== "ACTIVE") {
    await db.execute(
      `INSERT INTO pet_status_history
        (id, pet_id, old_status, new_status, effective_at, note, recorded_by)
       VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?)`,
      [crypto.randomUUID(), submission.petId, pet.status, proposed.transferredAt, `กลับเป็นสถานะปกติหลังอนุมัติโอนเจ้าของ: ${proposed.reason}`, reviewerId],
    );
  }
  return true;
}

export async function listNativeAttachments(entityType, entityId) {
  const aliases = entityType === "CITIZEN_SUBMISSION"
    ? ["CITIZEN_SUBMISSION", "SUBMISSION"]
    : [entityType];
  const placeholders = aliases.map(() => "?").join(",");
  const [rows] = await pool.execute(
    `SELECT id, file_name AS fileName, mime_type AS mimeType,
            file_size AS fileSize, uploaded_at AS uploadedAt
     FROM line_native_attachments
     WHERE entity_type IN (${placeholders}) AND entity_id = ?
     ORDER BY uploaded_at`,
    [...aliases, entityId],
  );
  return rows;
}

export async function findNativeAttachmentForAdmin(attachmentId, villageId = null) {
  const [rows] = await pool.execute(
    `SELECT a.id, a.file_name AS fileName, a.storage_path AS storagePath,
            a.mime_type AS mimeType, a.entity_id AS entityId,
            a.entity_type AS entityType
     FROM line_native_attachments a
     LEFT JOIN registrations r
       ON a.entity_type = 'REGISTRATION' AND r.id = a.entity_id
     LEFT JOIN citizen_submissions s
       ON a.entity_type IN ('CITIZEN_SUBMISSION','SUBMISSION') AND s.id = a.entity_id
     INNER JOIN owners o ON o.id = COALESCE(r.owner_id, s.owner_id)
     INNER JOIN households h ON h.id = o.household_id
     WHERE a.id = ? AND (? IS NULL OR h.village_id = ?)
     LIMIT 1`,
    [attachmentId, villageId, villageId],
  );
  return rows[0] || null;
}
