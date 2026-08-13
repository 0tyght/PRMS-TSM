import assert from "node:assert/strict";
import test from "node:test";

import { WasteRouteProposal } from "../src/modules/waste/domain/WasteRouteProposal.js";
import { ProposeWasteRouteUseCase } from "../src/modules/waste/application/ProposeWasteRouteUseCase.js";
import { ConfirmWasteRouteProposalUseCase } from "../src/modules/waste/application/ConfirmWasteRouteProposalUseCase.js";
import { OsrmTripRouteOptimizer } from "../src/modules/waste/infrastructure/OsrmTripRouteOptimizer.js";

const stops = [
  { id: "a", serviceUserId: "ua", stopName: "บ้าน ก", latitude: 16.75, longitude: 100.19 },
  { id: "b", serviceUserId: "ub", stopName: "บ้าน ข", latitude: 16.76, longitude: 100.20 },
  { id: "c", serviceUserId: "uc", stopName: "บ้าน ค", latitude: 16.77, longitude: 100.21 },
];

test("OSRM Trip adapter maps optimized waypoint order back to stop IDs", async () => {
  const optimizer = new OsrmTripRouteOptimizer({
    baseUrl: "https://router.test",
    fetchImpl: async (url) => {
      assert.match(String(url), /\/trip\/v1\/driving\//);
      assert.match(String(url), /roundtrip=true/);
      return new Response(JSON.stringify({
        code: "Ok",
        trips: [{ distance: 4200.4, duration: 700.2, geometry: { type: "LineString", coordinates: [[100.19, 16.75], [100.21, 16.77]] } }],
        waypoints: [{ waypoint_index: 0 }, { waypoint_index: 2 }, { waypoint_index: 1 }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });
  const result = await optimizer.optimize(stops);
  assert.deepEqual(result.orderedStopIds, ["a", "c", "b"]);
  assert.equal(result.distanceMeters, 4200);
});

test("OSRM Trip adapter fixes a separately selected start and finish", async () => {
  const optimizer = new OsrmTripRouteOptimizer({
    baseUrl: "https://router.test",
    fetchImpl: async (url) => {
      assert.match(String(url), /roundtrip=false/);
      assert.match(String(url), /source=first/);
      assert.match(String(url), /destination=last/);
      return new Response(JSON.stringify({
        code: "Ok",
        trips: [{ distance: 3000, duration: 500, geometry: { type: "LineString", coordinates: [[100.19, 16.75], [100.21, 16.77]] } }],
        waypoints: [{ waypoint_index: 0 }, { waypoint_index: 1 }, { waypoint_index: 2 }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });
  const result = await optimizer.optimize(stops, { returnToStart: false });
  assert.deepEqual(result.orderedStopIds, ["a", "b", "c"]);
});

test("proposal use case keeps selected start and finish at the ends", async () => {
  const repository = {
    findById: async () => ({ id: "route-1" }),
    listActiveStops: async () => stops,
    saveProposal: async (proposal) => proposal,
  };
  const optimizer = {
    optimize: async (input, options) => {
      assert.deepEqual(input.map((stop) => stop.id), ["c", "b", "a"]);
      assert.equal(options.returnToStart, false);
      return { orderedStopIds: ["c", "b", "a"], geometry: { type: "LineString", coordinates: [[100.21, 16.77], [100.19, 16.75]] }, distanceMeters: 3000, durationSeconds: 500 };
    },
  };
  const useCase = new ProposeWasteRouteUseCase({ routeRepository: repository, routeOptimizer: optimizer });
  const proposal = await useCase.execute({ routeId: "route-1", startStopId: "c", endStopId: "a" });
  assert.deepEqual(proposal.stopIds, ["c", "b", "a"]);
});

test("proposal use case loads registered stops and persists the optimized proposal", async () => {
  let saved;
  const repository = {
    findById: async () => ({ id: "route-1" }),
    listActiveStops: async () => stops,
    saveProposal: async (proposal) => { saved = proposal; return new WasteRouteProposal({ ...proposal, id: "proposal-1", expiresAt: new Date(Date.now() + 60_000) }); },
  };
  const optimizer = { optimize: async () => ({ orderedStopIds: ["a", "c", "b"], geometry: { type: "LineString", coordinates: [[100.19, 16.75], [100.21, 16.77]] }, distanceMeters: 4200, durationSeconds: 700 }) };
  const useCase = new ProposeWasteRouteUseCase({ routeRepository: repository, routeOptimizer: optimizer });
  const proposal = await useCase.execute({ routeId: "route-1" });
  assert.deepEqual(proposal.stopIds, ["a", "c", "b"]);
  assert.equal(saved.stops[1].stopName, "บ้าน ค");
});

test("confirmation rejects a stale proposal when registered stops changed", async () => {
  const proposal = new WasteRouteProposal({ id: "proposal-1", routeId: "route-1", stops, geometry: { type: "LineString", coordinates: [[100.19, 16.75], [100.21, 16.77]] }, distanceMeters: 4200, durationSeconds: 700, expiresAt: new Date(Date.now() + 60_000) });
  const repository = {
    findProposal: async () => proposal,
    listActiveStops: async () => stops.slice(0, 2),
  };
  const useCase = new ConfirmWasteRouteProposalUseCase({ routeRepository: repository });
  await assert.rejects(() => useCase.execute({ routeId: "route-1", proposalId: "proposal-1", confirmedBy: "officer" }), /ROUTE_STOPS_CHANGED/);
});

test("confirmation rejects a proposal when a stop location changed", async () => {
  const proposal = new WasteRouteProposal({ id: "proposal-1", routeId: "route-1", stops, geometry: { type: "LineString", coordinates: [[100.19, 16.75], [100.21, 16.77]] }, distanceMeters: 4200, durationSeconds: 700, expiresAt: new Date(Date.now() + 60_000) });
  const movedStops = stops.map((stop) => stop.id === "b" ? { ...stop, latitude: stop.latitude + 0.001 } : stop);
  const repository = { findProposal: async () => proposal, listActiveStops: async () => movedStops };
  const useCase = new ConfirmWasteRouteProposalUseCase({ routeRepository: repository });
  await assert.rejects(() => useCase.execute({ routeId: "route-1", proposalId: "proposal-1", confirmedBy: "officer" }), /ROUTE_STOPS_CHANGED/);
});
