const OUTSTANDING_STATUSES = Object.freeze(["PENDING", "OVERDUE"]);

export class WasteBillingPolicy {
  summarize(charges = [], rates = []) {
    return Object.freeze({
      chargeCount: charges.length,
      outstandingAmount: charges
        .filter((charge) => OUTSTANDING_STATUSES.includes(charge.status))
        .reduce((sum, charge) => sum + Number(charge.amount || 0), 0),
      activeRateCount: rates.filter((rate) => Boolean(rate.isActive)).length,
    });
  }

  isOutstanding(charge) {
    return OUTSTANDING_STATUSES.includes(charge?.status);
  }
}

export const wasteBillingPolicy = new WasteBillingPolicy();
