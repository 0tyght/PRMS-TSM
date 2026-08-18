import { DomainRuleViolation } from "../../../domain/common/errors/DomainRuleViolation.js";

function normalizeDriverCode(value) {
  const code = String(value ?? "").trim();
  return code ? code.toUpperCase() : null;
}

export class WasteDriver {
  #isActive;

  constructor({
    id = null,
    driverCode = null,
    fullName,
    phone,
    lineUserId = null,
    isActive = true,
  }) {
    this.id = id;
    this.driverCode = normalizeDriverCode(driverCode);
    this.fullName = fullName;
    this.phone = phone;
    this.lineUserId = lineUserId || null;
    this.#isActive = Boolean(Number(isActive));
  }

  get isActive() {
    return this.#isActive;
  }

  activate() {
    this.#isActive = true;
    return this;
  }

  deactivate() {
    this.#isActive = false;
    return this;
  }

  update(changes = {}) {
    if ("driverCode" in changes) this.driverCode = normalizeDriverCode(changes.driverCode);
    if ("fullName" in changes) this.fullName = changes.fullName;
    if ("phone" in changes) this.phone = changes.phone;
    if ("isActive" in changes) changes.isActive ? this.activate() : this.deactivate();
    return this;
  }

  assertHasDriverCode() {
    if (!this.driverCode) {
      throw new DomainRuleViolation(
        "WASTE_DRIVER_CODE_REQUIRED",
        "กรุณากำหนดรหัสพนักงานก่อนบันทึกข้อมูล",
        { status: 422 },
      );
    }
    return this;
  }

  assertDeletable(usageCount) {
    if (Number(usageCount || 0) > 0) {
      throw new DomainRuleViolation(
        "WASTE_DRIVER_HAS_HISTORY",
        "พนักงานประจำรถขยะรายนี้มีประวัติการปฏิบัติงานแล้ว กรุณายกเลิกการใช้งานแทนการลบ",
        { status: 409 },
      );
    }
    return this;
  }

  toObject() {
    return {
      id: this.id,
      driverCode: this.driverCode,
      fullName: this.fullName,
      phone: this.phone,
      lineUserId: this.lineUserId,
      isActive: this.#isActive,
    };
  }
}
