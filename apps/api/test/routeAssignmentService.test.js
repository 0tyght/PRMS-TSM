import assert from "node:assert/strict";
import test from "node:test";

import { RouteAssignmentService } from "../src/modules/waste/domain/RouteAssignmentService.js";

const service = new RouteAssignmentService({ maximumSuggestedDistanceM: 500, maximumAssignableDistanceM: 2_000 });

const route = (id, coordinates) => ({
  id,
  routeCode: id,
  routeName: id,
  routeGeojson: { type: "Feature", geometry: { type: "LineString", coordinates }, properties: {} },
});

test("ranks routes by distance from the service location", () => {
  const suggestions = service.suggest(
    { latitude: 16.7538, longitude: 100.1966 },
    [
      route("far", [[100.23, 16.78], [100.24, 16.79]]),
      route("near", [[100.196, 16.753], [100.197, 16.754]]),
    ],
  );
  assert.equal(suggestions[0].id, "near");
  assert.equal(suggestions[0].recommended, true);
  assert.equal(suggestions[0].eligible, true);
  assert.equal(suggestions[1].eligible, false);
  assert.ok(suggestions[0].distanceMeters < suggestions[1].distanceMeters);
});

test("does not recommend a route when the nearest line is too far away", () => {
  const [suggestion] = service.suggest(
    { latitude: 16.70, longitude: 100.15 },
    [route("route", [[100.20, 16.75], [100.21, 16.76]])],
  );
  assert.equal(suggestion.recommended, false);
  assert.equal(suggestion.eligible, false);
});

test("allows officer review beyond the recommended radius but rejects implausibly distant routes", () => {
  assert.equal(service.isWithinSuggestedDistance(750), false);
  assert.equal(service.isWithinAssignableDistance(750), true);
  assert.equal(service.isWithinAssignableDistance(2_500), false);
});

test("inserts a new stop without reordering existing stops", () => {
  const existingStops = [
    { id: "before", latitude: 16.751, longitude: 100.191 },
    { id: "after", latitude: 16.769, longitude: 100.209 },
  ];
  const candidate = { id: "new", latitude: 16.755, longitude: 100.195 };
  const ordered = service.insertStopInExistingOrder(
    existingStops,
    candidate,
    route("route", [[100.19, 16.75], [100.20, 16.76], [100.21, 16.77]]).routeGeojson,
  );
  assert.deepEqual(ordered.map((stop) => stop.id), ["before", "new", "after"]);
});
