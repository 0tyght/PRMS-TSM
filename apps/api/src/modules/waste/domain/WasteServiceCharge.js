import { DomainRuleViolation } from "../../../domain/common/errors/DomainRuleViolation.js";

const CHARGE_STATUSES =
  Object.freeze([
    "PENDING",
    "PAID",
    "OVERDUE",
    "VOID",
  ]);

const NOTICEABLE_STATUSES =
  Object.freeze([
    "PENDING",
    "OVERDUE",
  ]);

export class WasteServiceCharge {
  #status;

  constructor({
    id = null,
    serviceUserId = null,
    serviceNo = null,
    fullName = null,
    houseNo = null,
    lineUserId = null,
    feeRateId = null,
    rateName = null,
    billingPeriod = null,
    dueDate = null,
    amount,
    status = "PENDING",
    paidAt = null,
    noticeRequestedAt = null,
  }) {
    this.id = id;
    this.serviceUserId =
      serviceUserId;
    this.serviceNo =
      serviceNo;
    this.fullName =
      fullName;
    this.houseNo =
      houseNo;
    this.lineUserId =
      lineUserId;
    this.feeRateId =
      feeRateId;
    this.rateName =
      rateName;
    this.billingPeriod =
      billingPeriod;
    this.dueDate =
      dueDate;
    this.amount =
      Number(amount);
    this.paidAt =
      paidAt;
    this.noticeRequestedAt =
      noticeRequestedAt;

    this.setStatus(status);
  }

  get status() {
    return this.#status;
  }

  setStatus(status) {
    if (
      !CHARGE_STATUSES.includes(
        status,
      )
    ) {
      throw new DomainRuleViolation(
        "WASTE_CHARGE_STATUS_INVALID",
        "สถานะค่าบริการไม่ถูกต้อง",
        { status: 422 },
      );
    }

    this.#status = status;

    return this;
  }

  assertScheduleValid() {
    if (
      this.billingPeriod &&
      this.dueDate &&
      this.dueDate <
        this.billingPeriod
    ) {
      throw new DomainRuleViolation(
        "WASTE_CHARGE_DUE_DATE_INVALID",
        "กำหนดชำระต้องไม่ก่อนรอบค่าบริการ",
        { status: 422 },
      );
    }

    return this;
  }

  changeStatus(
    status,
    now = new Date(),
  ) {
    this.setStatus(status);

    this.paidAt =
      status === "PAID"
        ? now
        : null;

    return this;
  }

  assertNoticeable() {
    if (
      !NOTICEABLE_STATUSES
        .includes(this.#status)
    ) {
      throw new DomainRuleViolation(
        "WASTE_CHARGE_NOTICE_STATUS_INVALID",
        "ส่งแจ้งเตือนได้เฉพาะรายการที่รอชำระหรือค้างชำระ",
        { status: 409 },
      );
    }

    return this;
  }

  assertLineLinked() {
    if (!this.lineUserId) {
      throw new DomainRuleViolation(
        "WASTE_CHARGE_LINE_NOT_LINKED",
        "ผู้ใช้บริการรายนี้ยังไม่ได้เชื่อมบัญชี LINE",
        { status: 422 },
      );
    }

    return this;
  }

  toObject() {
    return {
      id: this.id,
      serviceUserId:
        this.serviceUserId,
      serviceNo:
        this.serviceNo,
      fullName:
        this.fullName,
      houseNo:
        this.houseNo,
      lineUserId:
        this.lineUserId,
      feeRateId:
        this.feeRateId,
      rateName:
        this.rateName,
      billingPeriod:
        this.billingPeriod,
      dueDate:
        this.dueDate,
      amount:
        this.amount,
      status:
        this.#status,
      paidAt:
        this.paidAt,
      noticeRequestedAt:
        this.noticeRequestedAt,
    };
  }
}
