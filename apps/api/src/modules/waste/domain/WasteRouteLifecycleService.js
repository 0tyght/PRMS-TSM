export class WasteRouteLifecycleService {
  markForRecalculation(routeGeojson, reason, requiredAt = new Date()) {
    if (!routeGeojson) return null;
    const next = structuredClone(routeGeojson);
    next.properties ||= {};
    next.properties.geometryStatus = "RECALCULATION_REQUIRED";
    next.properties.recalculationReason = reason;
    next.properties.recalculationRequiredAt = requiredAt.toISOString();
    return next;
  }

  readiness(routeGeojson, activeStopCount) {
    if (Number(activeStopCount) < 2) {
      return { ready: false, reason: "เส้นทางต้องมีจุดรับบริการอย่างน้อย 2 จุด" };
    }
    if (!routeGeojson || routeGeojson.type !== "Feature" || routeGeojson.geometry?.type !== "LineString" || routeGeojson.geometry.coordinates?.length < 2) {
      return { ready: false, reason: "เส้นทางนี้ยังไม่ได้คำนวณแนวถนนจากจุดรับบริการ" };
    }
    if (routeGeojson.properties?.geometryStatus === "RECALCULATION_REQUIRED") {
      return { ready: false, reason: "ข้อมูลจุดรับบริการเปลี่ยนแปลง กรุณาคำนวณและยืนยันเส้นทางใหม่" };
    }
    return { ready: true, reason: null };
  }
}
