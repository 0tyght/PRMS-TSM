import { DomainRuleViolation } from "../../common/errors/DomainRuleViolation.js";

const STATUS_TRANSITIONS = Object.freeze({
  ACTIVE: Object.freeze(["MISSING", "MOVED_OUT", "DECEASED"]),
  MISSING: Object.freeze(["ACTIVE", "MOVED_OUT", "DECEASED"]),
  MOVED_OUT: Object.freeze(["ACTIVE"]),
  DECEASED: Object.freeze(["ACTIVE"]),
  TRANSFERRED: Object.freeze(["ACTIVE"]),
});

export class Pet {
  #status;

  constructor({ id = null, ownerId = null, status = "ACTIVE" } = {}) {
    this.id = id;
    this.ownerId = ownerId;
    this.#status = status;
  }

  get status() { return this.#status; }

  changeStatusTo(nextStatus) {
    if (nextStatus === this.#status) throw new DomainRuleViolation("PET_STATUS_UNCHANGED", "สัตว์มีสถานะนี้อยู่แล้ว");
    if (!(STATUS_TRANSITIONS[this.#status] || []).includes(nextStatus)) throw new DomainRuleViolation("PET_STATUS_TRANSITION_NOT_ALLOWED", "ไม่สามารถเปลี่ยนสถานะสัตว์ตามลำดับงานนี้ได้");
    this.#status = nextStatus;
    return this;
  }

  transferTo(nextOwnerId) {
    if (!nextOwnerId) throw new DomainRuleViolation("PET_OWNER_REQUIRED", "กรุณาระบุเจ้าของใหม่", { status: 422 });
    if (nextOwnerId === this.ownerId) throw new DomainRuleViolation("PET_OWNER_UNCHANGED", "เจ้าของใหม่ต้องไม่ใช่เจ้าของปัจจุบัน");
    this.ownerId = nextOwnerId;
    return this;
  }
}

