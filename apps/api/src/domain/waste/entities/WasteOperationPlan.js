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
  #publicationStatus;
  #publicationVersion;

  constructor({ id = null, status = "SCHEDULED", publicationStatus = "DRAFT", publicationVersion = 0, vehicleId = null } = {}) {
    this.id = id;
    this.vehicleId = vehicleId;
    this.#status = status;
    this.#publicationStatus = publicationStatus;
    this.#publicationVersion = Number(publicationVersion || 0);
  }

  get status() { return this.#status; }
  get publicationStatus() { return this.#publicationStatus; }
  get publicationVersion() { return this.#publicationVersion; }

  assertEditable() {
    if (this.#status !== "SCHEDULED") throw new DomainRuleViolation("WASTE_PLAN_NOT_EDITABLE", "แก้ไขได้เฉพาะแผนปฏิบัติงานเก็บขยะที่ยังไม่เริ่มปฏิบัติงาน");
    if (this.#publicationStatus === "PUBLISHED") throw new DomainRuleViolation("WASTE_PLAN_PUBLISHED_NOT_EDITABLE", "แผนนี้ประกาศให้ประชาชนแล้ว กรุณาถอนประกาศก่อนแก้ไข");
    return this;
  }

  publish({ hasSchedule, activeStopCount }) {
    if (this.#status !== "SCHEDULED") throw new DomainRuleViolation("WASTE_PLAN_PUBLICATION_STATUS_INVALID", "ประกาศได้เฉพาะแผนที่ยังไม่เริ่มปฏิบัติงาน");
    if (this.#publicationStatus === "PUBLISHED") throw new DomainRuleViolation("WASTE_PLAN_ALREADY_PUBLISHED", "แผนนี้ประกาศให้ประชาชนแล้ว");
    if (!hasSchedule) throw new DomainRuleViolation("WASTE_PLAN_SCHEDULE_REQUIRED", "กรุณาระบุเวลาเริ่มและเวลาสิ้นสุดก่อนประกาศตารางกำหนดการเก็บขยะประจำพื้นที่", { status: 422 });
    if (Number(activeStopCount || 0) < 1) throw new DomainRuleViolation("WASTE_PLAN_STOP_REQUIRED", "เส้นทางนี้ยังไม่มีจุดเก็บขยะ จึงยังประกาศตารางกำหนดการเก็บขยะประจำพื้นที่ไม่ได้", { status: 422 });
    this.#publicationStatus = "PUBLISHED";
    this.#publicationVersion += 1;
    return this;
  }

  withdraw() {
    if (this.#status !== "SCHEDULED") throw new DomainRuleViolation("WASTE_PLAN_WITHDRAW_STATUS_INVALID", "ถอนได้เฉพาะประกาศของแผนที่ยังไม่เริ่มปฏิบัติงาน");
    if (this.#publicationStatus !== "PUBLISHED") throw new DomainRuleViolation("WASTE_PLAN_NOT_PUBLISHED", "แผนนี้ยังไม่ได้ประกาศให้ประชาชน");
    this.#publicationStatus = "WITHDRAWN";
    return this;
  }

  assertStartable() {
    if (this.#publicationStatus !== "PUBLISHED") throw new DomainRuleViolation("WASTE_PLAN_MUST_BE_PUBLISHED", "กรุณาตรวจความพร้อมและประกาศตารางกำหนดการเก็บขยะประจำพื้นที่ก่อนเริ่มปฏิบัติงาน");
    return this;
  }

  transitionTo(nextStatus) {
    if (nextStatus === "IN_PROGRESS") this.assertStartable();
    if (nextStatus === "CANCELLED" && this.#publicationStatus === "PUBLISHED") {
      throw new DomainRuleViolation("WASTE_PLAN_WITHDRAW_BEFORE_CANCEL", "กรุณาถอนประกาศและแจ้งประชาชนก่อนยกเลิกแผนปฏิบัติงานเก็บขยะ");
    }
    if (!(STATUS_TRANSITIONS[this.#status] || []).includes(nextStatus)) throw new DomainRuleViolation("WASTE_PLAN_TRANSITION_NOT_ALLOWED", "ไม่สามารถเปลี่ยนสถานะแผนปฏิบัติงานเก็บขยะตามลำดับนี้ได้");
    this.#status = nextStatus;
    return this;
  }
}
