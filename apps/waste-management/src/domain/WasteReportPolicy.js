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
}

export const wasteReportPolicy = new WasteReportPolicy();
