const LABELS = Object.freeze({ ACTIVE: "ปกติ", MISSING: "สูญหาย", TRANSFERRED: "ย้ายเจ้าของ", MOVED_OUT: "ย้ายออกจากพื้นที่", DECEASED: "เสียชีวิต" });
const TONES = Object.freeze({ ACTIVE: "active", MISSING: "missing", TRANSFERRED: "transferred", MOVED_OUT: "moved-out", DECEASED: "deceased" });
const TRANSITIONS = Object.freeze({
  ACTIVE: Object.freeze(["MISSING", "MOVED_OUT", "DECEASED"]),
  MISSING: Object.freeze(["ACTIVE", "MOVED_OUT", "DECEASED"]),
  MOVED_OUT: Object.freeze(["ACTIVE"]),
  DECEASED: Object.freeze(["ACTIVE"]),
  TRANSFERRED: Object.freeze(["ACTIVE"]),
});

export class PetStatusPolicy {
  label(status) { return LABELS[status] || "ไม่ระบุ"; }
  tone(status) { return TONES[status] || "unknown"; }
  allowedTransitions(status) { return TRANSITIONS[status] || Object.freeze([]); }

  vaccinationStatus(pet, now = new Date()) {
    if (!pet.lastVaccinatedAt) return Object.freeze({ key: "NONE", label: "ยังไม่มีประวัติ", tone: "none" });
    if (!pet.nextVaccinationDueAt) return Object.freeze({ key: "RECORDED", label: "มีประวัติวัคซีน", tone: "recorded" });
    const dueDate = this.parseDate(pet.nextVaccinationDueAt);
    if (!dueDate) return Object.freeze({ key: "RECORDED", label: "มีประวัติวัคซีน", tone: "recorded" });
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const remainingDays = Math.ceil((dueDate.getTime() - today.getTime()) / 86_400_000);
    if (remainingDays < 0) return Object.freeze({ key: "OVERDUE", label: "เกินกำหนด", tone: "overdue" });
    if (remainingDays <= 30) return Object.freeze({ key: "DUE_SOON", label: `ครบกำหนดใน ${remainingDays} วัน`, tone: "due-soon" });
    return Object.freeze({ key: "CURRENT", label: "ยังไม่ครบกำหนด", tone: "current" });
  }

  parseDate(value) {
    const [year, month, day] = String(value || "").slice(0, 10).split("-").map(Number);
    if (![year, month, day].every(Number.isFinite)) return null;
    return new Date(year, month - 1, day, 12, 0, 0);
  }
}

export const petStatusPolicy = new PetStatusPolicy();
