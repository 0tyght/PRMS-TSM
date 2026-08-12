import { DomainRuleViolation } from "../../common/errors/DomainRuleViolation.js";

const STATUS_TRANSITIONS = Object.freeze({
  SUBMITTED: Object.freeze(["UNDER_REVIEW", "NEED_MORE_INFO", "APPROVED", "REJECTED"]),
  UNDER_REVIEW: Object.freeze(["NEED_MORE_INFO", "APPROVED", "REJECTED"]),
  NEED_MORE_INFO: Object.freeze(["UNDER_REVIEW", "APPROVED", "REJECTED"]),
});

export class Registration {
  #status;

  constructor({ id = null, status }) {
    this.id = id;
    this.#status = status;
  }

  get status() { return this.#status; }

  transitionTo(nextStatus) {
    if (!(STATUS_TRANSITIONS[this.#status] || []).includes(nextStatus)) throw new DomainRuleViolation("REGISTRATION_TRANSITION_NOT_ALLOWED", "ไม่สามารถเปลี่ยนสถานะข้อมูลตามลำดับงานนี้ได้");
    this.#status = nextStatus;
    return this;
  }
}

