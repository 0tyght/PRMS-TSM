import crypto from "node:crypto";

import { DomainRuleViolation } from "../../domain/common/errors/DomainRuleViolation.js";

const PET_SNAPSHOT_FIELDS = Object.freeze([
  "petName",
  "species",
  "sex",
  "breed",
  "color",
  "birthDate",
  "microchipNo",
]);

function parsePayload(value) {
  if (!value) return null;
  return typeof value === "string" ? JSON.parse(value) : value;
}

function normalizeValue(value) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value);
  return /^\d{4}-\d{2}-\d{2}/u.test(text) ? text.slice(0, 10) : text;
}

export class CitizenSubmissionApprovalService {
  constructor({ nativeCitizenService }) {
    if (!nativeCitizenService) throw new TypeError("CitizenSubmissionApprovalService requires nativeCitizenService");
    this.nativeCitizenService = nativeCitizenService;
  }

  async execute({ database, submission, reviewerId }) {
    const proposed = parsePayload(submission.proposedPayload);
    const current = parsePayload(submission.currentPayload);
    const pet = await this.#loadOfficialPet(database, submission);

    if (submission.subjectType === "OWNER_TRANSFER") {
      await this.nativeCitizenService.applyOwnerTransfer(database, submission, reviewerId);
      return;
    }
    if (submission.subjectType === "PET_UPDATE") {
      this.#assertSnapshotUnchanged(pet, current, PET_SNAPSHOT_FIELDS);
      const [result] = await database.execute(
        `UPDATE pets SET name = ?, species = ?, sex = ?, breed = NULLIF(?, ''), color = NULLIF(?, ''),
                         birth_date = NULLIF(?, ''), microchip_no = NULLIF(?, '')
         WHERE id = ? AND owner_id = ? AND registration_no IS NOT NULL
           AND registered_at IS NOT NULL AND deleted_at IS NULL`,
        [proposed.petName, proposed.species, proposed.sex, proposed.breed, proposed.color, proposed.birthDate || "", proposed.microchipNo, submission.petId, submission.ownerId],
      );
      this.#assertSingleWrite(result, "ไม่สามารถปรับปรุงทะเบียนสัตว์เลี้ยงได้ กรุณาโหลดข้อมูลล่าสุด");
      return;
    }
    if (submission.subjectType === "VACCINATION") {
      await this.#assertEvidenceExists(database, submission.id);
      await this.#assertVaccinationIsNew(database, submission.petId, proposed);
      await database.execute(
        `INSERT INTO vaccination_records
          (id, pet_id, vaccine_name, lot_no, vaccinated_at, next_due_at, provider_name, recorded_by)
         VALUES (?, ?, ?, NULLIF(?, ''), ?, NULLIF(?, ''), NULLIF(?, ''), ?)`,
        [crypto.randomUUID(), submission.petId, proposed.vaccineName, proposed.lotNo, proposed.vaccinatedAt, proposed.nextDueAt || "", proposed.providerName, reviewerId],
      );
      return;
    }
    if (submission.subjectType === "STERILIZATION") {
      await this.#assertEvidenceExists(database, submission.id);
      await this.#assertSterilizationIsNew(database, submission.petId);
      await database.execute(
        `INSERT INTO sterilization_records (id, pet_id, sterilized_at, provider_name, note, recorded_by)
         VALUES (?, ?, ?, NULLIF(?, ''), NULLIF(?, ''), ?)`,
        [crypto.randomUUID(), submission.petId, proposed.sterilizedAt, proposed.providerName, proposed.note, reviewerId],
      );
      return;
    }
    if (submission.subjectType === "PET_STATUS") {
      this.#assertSnapshotUnchanged(pet, current, ["status"]);
      const [result] = await database.execute(
        `UPDATE pets SET status = ?
         WHERE id = ? AND owner_id = ? AND status = ?
           AND registration_no IS NOT NULL AND registered_at IS NOT NULL AND deleted_at IS NULL`,
        [proposed.status, submission.petId, submission.ownerId, current?.status],
      );
      this.#assertSingleWrite(result, "สถานะสัตว์เลี้ยงมีการเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลล่าสุด");
      await database.execute(
        `INSERT INTO pet_status_history
          (id, pet_id, old_status, new_status, effective_at, note, recorded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [crypto.randomUUID(), submission.petId, current?.status || null, proposed.status, proposed.effectiveAt, proposed.reason, reviewerId],
      );
      return;
    }

    throw new DomainRuleViolation("SUBMISSION_TYPE_UNSUPPORTED", "ไม่รองรับประเภทข้อมูลที่ต้องการรับรอง", { status: 422 });
  }

  async #loadOfficialPet(database, submission) {
    const [rows] = await database.execute(
      `SELECT p.id, p.owner_id AS ownerId, p.name AS petName, p.species, p.sex,
              COALESCE(p.breed, '') AS breed, COALESCE(p.color, '') AS color,
              DATE_FORMAT(p.birth_date, '%Y-%m-%d') AS birthDate,
              COALESCE(p.microchip_no, '') AS microchipNo, p.status
       FROM pets p
       WHERE p.id = ? AND p.owner_id = ? AND p.registration_no IS NOT NULL
         AND p.registered_at IS NOT NULL AND p.deleted_at IS NULL
       LIMIT 1 FOR UPDATE`,
      [submission.petId, submission.ownerId],
    );
    if (!rows[0]) {
      throw new DomainRuleViolation(
        "OFFICIAL_PET_NOT_FOUND",
        "ไม่พบสัตว์เลี้ยงในทะเบียนทางการหรือเจ้าของข้อมูลไม่ตรงกัน",
      );
    }
    return rows[0];
  }

  #assertSnapshotUnchanged(pet, current, fields) {
    if (!current) return;
    const changedFields = fields.filter((field) => normalizeValue(pet[field]) !== normalizeValue(current[field]));
    if (changedFields.length) {
      throw new DomainRuleViolation(
        "OFFICIAL_PET_CHANGED",
        "ข้อมูลทะเบียนทางการมีการเปลี่ยนแปลงระหว่างรอตรวจสอบ กรุณาโหลดข้อมูลล่าสุดก่อนรับรอง",
        { details: { changedFields } },
      );
    }
  }

  async #assertVaccinationIsNew(database, petId, proposed) {
    const [rows] = await database.execute(
      `SELECT id FROM vaccination_records
       WHERE pet_id = ? AND vaccine_name = ? AND vaccinated_at = ?
       LIMIT 1 FOR UPDATE`,
      [petId, proposed.vaccineName, proposed.vaccinatedAt],
    );
    if (rows[0]) {
      throw new DomainRuleViolation("VACCINATION_DUPLICATE", "มีประวัติวัคซีนชนิดนี้ในวันที่ระบุอยู่แล้ว");
    }
  }

  async #assertEvidenceExists(database, submissionId) {
    const [rows] = await database.execute(
      `SELECT id FROM line_native_attachments
       WHERE entity_type = 'CITIZEN_SUBMISSION' AND entity_id = ?
       LIMIT 1 FOR UPDATE`,
      [submissionId],
    );
    if (!rows[0]) {
      throw new DomainRuleViolation(
        "HEALTH_EVIDENCE_REQUIRED",
        "ยังไม่มีรูปหลักฐานสำหรับข้อมูลสุขภาพ กรุณาขอข้อมูลเพิ่มเติมก่อนรับรอง",
        { status: 422 },
      );
    }
  }

  async #assertSterilizationIsNew(database, petId) {
    const [rows] = await database.execute(
      "SELECT id FROM sterilization_records WHERE pet_id = ? LIMIT 1 FOR UPDATE",
      [petId],
    );
    if (rows[0]) {
      throw new DomainRuleViolation("STERILIZATION_DUPLICATE", "สัตว์เลี้ยงตัวนี้มีประวัติการทำหมันอยู่แล้ว");
    }
  }

  #assertSingleWrite(result, message) {
    if (Number(result?.affectedRows || 0) !== 1) {
      throw new DomainRuleViolation("OFFICIAL_PET_WRITE_CONFLICT", message);
    }
  }
}
