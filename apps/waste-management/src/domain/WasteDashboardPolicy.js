export class WasteDashboardPolicy {
  routeWithoutGeometryCount(routes = []) {
    return routes.filter((route) => !route.routeGeojson || route.routeGeojson.properties?.geometryStatus === "RECALCULATION_REQUIRED").length;
  }

  selectedRoute(routes = [], routeId = "") {
    return routes.find((route) => route.id === routeId) || null;
  }

  resolveSelectedRouteId(routes = [], activePlans = [], currentId = "") {
    if (routes.some((route) => route.id === currentId)) return currentId;
    return activePlans[0]?.routeId || routes[0]?.id || "";
  }

  planProgress(plan = {}) {
    const total = Number(plan.stopTotal || 0);
    const completed = Number(plan.collectedStops || 0);
    return total > 0 ? Math.max(0, Math.min(100, Math.round((completed / total) * 100))) : 0;
  }
}

export const wasteDashboardPolicy = new WasteDashboardPolicy();
