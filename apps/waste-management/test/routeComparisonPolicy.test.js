import assert from "node:assert/strict";
import test from "node:test";
import { routeComparisonPolicy } from "../src/application/RouteComparisonPolicy.js";

test("compares a proposed route with the currently confirmed route", () => {
  const comparison = routeComparisonPolicy.compare({
    currentRouteGeojson: { geometry: { type: "LineString", coordinates: [] }, properties: { distanceMeters: 10_000, durationSeconds: 1_200 } },
    proposal: { distanceMeters: 8_500, durationSeconds: 1_050 },
  });
  assert.equal(comparison.hasBaseline, true);
  assert.equal(comparison.distanceDeltaMeters, -1_500);
  assert.equal(comparison.durationDeltaSeconds, -150);
});

test("treats a route without confirmed metrics as its first calculation", () => {
  const comparison = routeComparisonPolicy.compare({ currentRouteGeojson: null, proposal: { distanceMeters: 8_500, durationSeconds: 1_050 } });
  assert.equal(comparison.hasBaseline, false);
  assert.equal(comparison.distanceDeltaMeters, null);
});
