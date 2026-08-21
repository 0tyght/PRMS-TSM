export class WasteReportPolicy {
  summarize(operations = []) {
    const summary = operations.reduce((result, operation) => {
      result.totalPlans += 1;
      if (operation.status === "COMPLETED") result.completedPlans += 1;
      result.totalStops += Number(operation.stopTotal || 0);
      result.collectedStops += Number(operation.collectedStops || 0);
      return result;
    }, { totalPlans: 0, completedPlans: 0, totalStops: 0, collectedStops: 0 });
    summary.completionPercent = summary.totalStops
      ? Math.max(0, Math.min(100, Math.round((summary.collectedStops / summary.totalStops) * 100)))
      : null;
    return Object.freeze(summary);
  }

  filterOperations(
    operations = [],
    {
      status = "ALL",
      search = "",
    } = {},
  ) {
    const normalizedSearch =
      String(search || "")
        .trim()
        .toLocaleLowerCase("th-TH");

    return operations.filter((operation) => {
      const matchesStatus =
        status === "ALL" ||
        operation.status === status;

      if (!matchesStatus) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const searchableText = [
        operation.planNo,
        operation.routeName,
        operation.vehicleCode,
        operation.driverName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("th-TH");

      return searchableText.includes(
        normalizedSearch,
      );
    });
  }

  statusBreakdown(operations = []) {
    return Object.freeze({
      scheduled:
        operations.filter(
          (operation) =>
            operation.status ===
            "SCHEDULED",
        ).length,
      inProgress:
        operations.filter(
          (operation) =>
            operation.status ===
            "IN_PROGRESS",
        ).length,
      completed:
        operations.filter(
          (operation) =>
            operation.status ===
            "COMPLETED",
        ).length,
      interrupted:
        operations.filter(
          (operation) =>
            operation.status ===
            "INTERRUPTED",
        ).length,
    });
  }

  billingSummary(billing = []) {
    return Object.freeze(
      billing.reduce(
        (summary, item) => {
          const amount =
            Number(item.amount || 0);
          const count =
            Number(item.count || 0);

          summary.totalAmount += amount;
          summary.totalCount += count;

          if (item.status === "PAID") {
            summary.paidAmount += amount;
            summary.paidCount += count;
          }

          if (item.status === "PENDING") {
            summary.pendingAmount += amount;
            summary.pendingCount += count;
          }

          if (item.status === "OVERDUE") {
            summary.overdueAmount += amount;
            summary.overdueCount += count;
          }

          return summary;
        },
        {
          totalAmount: 0,
          totalCount: 0,
          paidAmount: 0,
          paidCount: 0,
          pendingAmount: 0,
          pendingCount: 0,
          overdueAmount: 0,
          overdueCount: 0,
        },
      ),
    );
  }

  isValidDateRange(
    from = "",
    to = "",
  ) {
    return !from || !to || from <= to;
  }

  billingPeriodDate(month = "") {
    return /^\d{4}-\d{2}$/.test(month)
      ? `${month}-01`
      : "";
  }
}

export const wasteReportPolicy = new WasteReportPolicy();
