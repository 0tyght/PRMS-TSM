import assert from "node:assert/strict";
import test from "node:test";

import { RouteAssignmentService } from "../src/modules/waste/domain/RouteAssignmentService.js";

const service = new RouteAssignmentService({ maximumSuggestedDistanceM: 500 });

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
  assert.ok(suggestions[0].distanceMeters < suggestions[1].distanceMeters);
});

test("does not recommend a route when the nearest line is too far away", () => {
  const [suggestion] = service.suggest(
    { latitude: 16.70, longitude: 100.15 },
    [route("route", [[100.20, 16.75], [100.21, 16.76]])],
  );
  assert.equal(suggestion.recommended, false);
});
