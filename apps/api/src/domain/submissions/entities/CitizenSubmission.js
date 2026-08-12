import { DomainRuleViolation } from "../../common/errors/DomainRuleViolation.js";

const STATUS_TRANSITIONS = Object.freeze({
  SUBMITTED: Object.freeze(["UNDER_REVIEW", "NEED_MORE_INFO", "APPROVED", "REJECTED"]),
  UNDER_REVIEW: Object.freeze(["NEED_MORE_INFO", "APPROVED", "REJECTED"]),
  NEED_MORE_INFO: Object.freeze(["UNDER_REVIEW", "APPROVED", "REJECTED"]),
});

export class CitizenSubmission {
  #status;

  constructor({ id = null, status, version = 1 }) {
    this.id = id;
    this.#status = status;
    this.version = Number(version);
  }

  get status() { return this.#status; }

  assertVersion(expectedVersion) {
    if (this.version !== Number(expectedVersion)) throw new DomainRuleViolation("SUBMISSION_VERSION_CONFLICT", "ข้อมูลถูกแก้ไขโดยผู้ใช้อื่น กรุณาโหลดข้อมูลล่าสุด");
    return this;
  }

  transitionTo(nextStatus) {
    if (!(STATUS_TRANSITIONS[this.#status] || []).includes(nextStatus)) throw new DomainRuleViolation("SUBMISSION_TRANSITION_NOT_ALLOWED", "ไม่สามารถเปลี่ยนสถานะข้อมูลตามลำดับนี้ได้");
    this.#status = nextStatus;
    return this;
  }
}

