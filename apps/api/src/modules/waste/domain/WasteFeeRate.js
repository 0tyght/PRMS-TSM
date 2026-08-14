import { DomainRuleViolation } from "../../../domain/common/errors/DomainRuleViolation.js";

const BILLING_CYCLES =
  Object.freeze([
    "MONTHLY",
    "QUARTERLY",
    "YEARLY",
  ]);

export class WasteFeeRate {
  #isActive;

  constructor({
    id = null,
    rateName,
    amount,
    billingCycle = "MONTHLY",
    isActive = true,
  }) {
    this.id = id;
    this.rateName = rateName;

    this.changeAmount(amount);
    this.changeBillingCycle(
      billingCycle,
    );

    this.#isActive =
      Boolean(Number(isActive));
  }

  get isActive() {
    return this.#isActive;
  }

  changeAmount(amount) {
    const value =
      Number(amount);

    if (
      !Number.isFinite(value) ||
      value <= 0
    ) {
      throw new DomainRuleViolation(
        "WASTE_FEE_RATE_AMOUNT_INVALID",
        "อัตราค่าบริการต้องมากกว่า 0 บาท",
        { status: 422 },
      );
    }

    this.amount = value;

    return this;
  }

  changeBillingCycle(
    billingCycle,
  ) {
    if (
      !BILLING_CYCLES.includes(
        billingCycle,
      )
    ) {
      throw new DomainRuleViolation(
        "WASTE_FEE_RATE_CYCLE_INVALID",
        "รอบการเรียกเก็บค่าบริการไม่ถูกต้อง",
        { status: 422 },
      );
    }

    this.billingCycle =
      billingCycle;

    return this;
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
    if (
      "rateName" in changes
    ) {
      this.rateName =
        changes.rateName;
    }

    if (
      "amount" in changes
    ) {
      this.changeAmount(
        changes.amount,
      );
    }

    if (
      "billingCycle" in changes
    ) {
      this.changeBillingCycle(
        changes.billingCycle,
      );
    }

    if (
      "isActive" in changes
    ) {
      if (changes.isActive) {
        this.activate();
      } else {
        this.deactivate();
      }
    }

    return this;
  }

  toObject() {
    return {
      id: this.id,
      rateName:
        this.rateName,
      amount:
        this.amount,
      billingCycle:
        this.billingCycle,
      isActive:
        this.#isActive,
    };
  }
}
