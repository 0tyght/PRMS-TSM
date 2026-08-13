import assert from "node:assert/strict";
import test from "node:test";
import { wasteBillingPolicy } from "../src/domain/WasteBillingPolicy.js";
import { wasteDashboardPolicy } from "../src/domain/WasteDashboardPolicy.js";
import { wasteReportPolicy } from "../src/domain/WasteReportPolicy.js";
import { wasteServiceUserPolicy } from "../src/domain/WasteServiceUserPolicy.js";
import { wastePlanPolicy } from "../src/domain/WastePlanPolicy.js";

test("WasteDashboardPolicy resolves routes and bounded progress", () => {
  const routes = [{ id: "r1", routeGeojson: null }, { id: "r2", routeGeojson: {} }];
  assert.equal(wasteDashboardPolicy.routeWithoutGeometryCount(routes), 1);
  assert.equal(wasteDashboardPolicy.resolveSelectedRouteId(routes, [], "missing"), "r1");
  assert.equal(wasteDashboardPolicy.planProgress({ collectedStops: 6, stopTotal: 8 }), 75);
});

test("WasteReportPolicy summarizes operational completeness", () => {
  const summary = wasteReportPolicy.summarize([
    { status: "COMPLETED", stopTotal: 10, collectedStops: 10 },
    { status: "IN_PROGRESS", stopTotal: 10, collectedStops: 5 },
  ]);
  assert.deepEqual(summary, { totalPlans: 2, completedPlans: 1, totalStops: 20, collectedStops: 15, completionPercent: 75 });
});

test("WasteBillingPolicy calculates outstanding charges", () => {
  const summary = wasteBillingPolicy.summarize(
    [{ status: "PENDING", amount: 50 }, { status: "PAID", amount: 100 }, { status: "OVERDUE", amount: 25 }],
    [{ isActive: true }, { isActive: false }],
  );
  assert.deepEqual(summary, { chargeCount: 3, outstandingAmount: 75, activeRateCount: 1 });
});

test("WasteServiceUserPolicy filters by route and summarizes readiness", () => {
  const users = [
    { serviceNo: "A", fullName: "สมชาย", isActive: true, routeId: null, lineUserId: "U1" },
    { serviceNo: "B", fullName: "สมหญิง", isActive: true, routeId: "r1", lineUserId: null },
    { serviceNo: "C", fullName: "สมปอง", isActive: false, routeId: "r1", lineUserId: "U2" },
  ];
  assert.equal(wasteServiceUserPolicy.filter(users).length, 2);
  assert.equal(wasteServiceUserPolicy.filter(users, { routeId: "UNASSIGNED" }).length, 1);
  assert.deepEqual(wasteServiceUserPolicy.summarize(users), { total: 2, unassigned: 1, linkedToLine: 1 });
});

test("WastePlanPolicy resolves the official municipal schedule and publication readiness", () => {
  const route = { routeGeojson: { properties: { officialSchedules: [{ day: 4, label: "วันพฤหัสบดี", time: "03:00-10:00", areas: ["บ้านสวน"] }] } } };
  assert.deepEqual(wastePlanPolicy.timeRange(route, "2026-08-13"), { start: "03:00", end: "10:00" });
  assert.equal(wastePlanPolicy.readiness({ scheduledDate: "2026-08-13", scheduledStartAt: "start", scheduledEndAt: "end", vehicleId: "v", driverId: "d", stopTotal: 2 }).ready, true);
  assert.equal(wastePlanPolicy.readiness({ scheduledDate: "2026-08-13", vehicleId: "v", driverId: "d", stopTotal: 2 }).ready, false);
});

