import test from "node:test";
import assert from "node:assert/strict";
import { WasteRouteLifecycleService } from "../src/modules/waste/domain/WasteRouteLifecycleService.js";

const service = new WasteRouteLifecycleService();
const validRoute = {
  type: "Feature",
  properties: { geometryStatus: "CONFIRMED_OSRM_OPTIMIZED" },
  geometry: { type: "LineString", coordinates: [[100.2, 16.75], [100.21, 16.76]] },
};

test("marks a confirmed route for recalculation without mutating the source", () => {
  const next = service.markForRecalculation(validRoute, "SERVICE_LOCATION_CHANGED", new Date("2026-08-13T00:00:00.000Z"));
  assert.equal(next.properties.geometryStatus, "RECALCULATION_REQUIRED");
  assert.equal(next.properties.recalculationReason, "SERVICE_LOCATION_CHANGED");
  assert.equal(validRoute.properties.geometryStatus, "CONFIRMED_OSRM_OPTIMIZED");
});

test("rejects routes with too few service points", () => {
  assert.deepEqual(service.readiness(validRoute, 1), {
    ready: false,
    reason: "เส้นทางต้องมีจุดรับบริการอย่างน้อย 2 จุด",
  });
});

test("rejects stale geometry and accepts confirmed geometry", () => {
  const stale = service.markForRecalculation(validRoute, "SERVICE_USER_DELETED");
  assert.equal(service.readiness(stale, 3).ready, false);
  assert.deepEqual(service.readiness(validRoute, 3), { ready: true, reason: null });
});
