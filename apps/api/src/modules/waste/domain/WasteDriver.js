import { DomainRuleViolation } from "../../../domain/common/errors/DomainRuleViolation.js";

export class WasteDriver {
  #isActive;

  constructor({
    id = null,
    fullName,
    phone,
    lineUserId = null,
    isActive = true,
  }) {
    this.id = id;
    this.fullName = fullName;
    this.phone = phone;
    this.lineUserId = lineUserId;
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
    if ("fullName" in changes) {
      this.fullName = changes.fullName;
    }

    if ("phone" in changes) {
      this.phone = changes.phone;
    }

    if ("lineUserId" in changes) {
      this.lineUserId = changes.lineUserId;
    }

    if ("isActive" in changes) {
      if (changes.isActive) {
        this.activate();
      } else {
        this.deactivate();
      }
    }

    return this;
  }

  assertDeletable(usageCount) {
    if (Number(usageCount || 0) > 0) {
      throw new DomainRuleViolation(
        "WASTE_DRIVER_HAS_HISTORY",
        "คนขับรายนี้มีประวัติการปฏิบัติงานแล้ว กรุณาปิดการใช้งานแทนการลบ",
        { status: 409 },
      );
    }

    return this;
  }

  toObject() {
    return {
      id: this.id,
      fullName: this.fullName,
      phone: this.phone,
      lineUserId: this.lineUserId,
      isActive: this.#isActive,
    };
  }
}