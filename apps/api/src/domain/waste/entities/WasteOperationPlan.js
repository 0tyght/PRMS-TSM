import { DomainRuleViolation } from "../../common/errors/DomainRuleViolation.js";

const STATUS_TRANSITIONS = Object.freeze({
  SCHEDULED: Object.freeze(["IN_PROGRESS", "CANCELLED"]),
  IN_PROGRESS: Object.freeze(["COMPLETED", "INTERRUPTED", "CANCELLED"]),
  INTERRUPTED: Object.freeze(["IN_PROGRESS", "COMPLETED", "CANCELLED"]),
  COMPLETED: Object.freeze([]),
  CANCELLED: Object.freeze([]),
});

export class WasteOperationPlan {
  #status;

  constructor({ id = null, status = "SCHEDULED", vehicleId = null } = {}) {
    this.id = id;
    this.vehicleId = vehicleId;
    this.#status = status;
  }

  get status() { return this.#status; }

  assertEditable() {
    if (this.#status !== "SCHEDULED") throw new DomainRuleViolation("WASTE_PLAN_NOT_EDITABLE", "แก้ไขได้เฉพาะแผนงานที่ยังไม่เริ่มปฏิบัติงาน");
    return this;
  }

  transitionTo(nextStatus) {
    if (!(STATUS_TRANSITIONS[this.#status] || []).includes(nextStatus)) throw new DomainRuleViolation("WASTE_PLAN_TRANSITION_NOT_ALLOWED", "ไม่สามารถเปลี่ยนสถานะแผนงานตามลำดับนี้ได้");
    this.#status = nextStatus;
    return this;
  }
}

