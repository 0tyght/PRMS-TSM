import assert from "node:assert/strict";
import test from "node:test";

import { WasteRouteProposal } from "../src/modules/waste/domain/WasteRouteProposal.js";
import { ProposeWasteRouteUseCase } from "../src/modules/waste/application/ProposeWasteRouteUseCase.js";
import { ConfirmWasteRouteProposalUseCase } from "../src/modules/waste/application/ConfirmWasteRouteProposalUseCase.js";
import { ProposeWasteServiceUserRouteAssignmentUseCase } from "../src/modules/waste/application/ProposeWasteServiceUserRouteAssignmentUseCase.js";
import { ConfirmWasteServiceUserRouteAssignmentUseCase } from "../src/modules/waste/application/ConfirmWasteServiceUserRouteAssignmentUseCase.js";
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

test("route assignment proposal includes the new service point without changing assignment", async () => {
  let saved;
  const serviceUser = { id: "user-new", routeId: null, fullName: "บ้านใหม่", houseNo: "9", latitude: 16.765, longitude: 100.205 };
  const repository = {
    findActiveServiceUserById: async () => serviceUser,
    findById: async () => ({ id: "route-1", routeGeojson: { type: "Feature", geometry: { type: "LineString", coordinates: [[100.19, 16.75], [100.20, 16.76]] } } }),
    findStopByServiceUserId: async () => null,
    listActiveStops: async () => stops.slice(0, 2),
    saveProposal: async (proposal) => { saved = proposal; return new WasteRouteProposal({ ...proposal, id: "proposal-assign", expiresAt: new Date(Date.now() + 60_000) }); },
  };
  const optimizer = { optimize: async (input) => ({ orderedStopIds: [input[0].id, input[2].id, input[1].id], geometry: { type: "LineString", coordinates: [[100.19, 16.75], [100.205, 16.765], [100.20, 16.76]] }, distanceMeters: 4400, durationSeconds: 720 }) };
  const routeAssignmentService = { distanceToRouteMeters: () => 135 };
  const useCase = new ProposeWasteServiceUserRouteAssignmentUseCase({ routeRepository: repository, routeOptimizer: optimizer, routeAssignmentService });
  const proposal = await useCase.execute({ serviceUserId: serviceUser.id, routeId: "route-1" });
  assert.equal(proposal.stops.find((stop) => stop.serviceUserId === serviceUser.id).assignmentCandidate, true);
  assert.equal(saved.stops.length, 3);
  assert.equal(serviceUser.routeId, null);
});

test("first service point routes from the municipal start through the home to the municipal finish", async () => {
  const baselineGeometry = { type: "LineString", coordinates: [[100.19, 16.75], [100.20, 16.76], [100.21, 16.77]] };
  const serviceUser = { id: "user-first", routeId: null, fullName: "บ้านแรก", houseNo: "1", latitude: 16.755, longitude: 100.195 };
  let optimizerInput;
  let optimizerOptions;
  const repository = {
    findActiveServiceUserById: async () => serviceUser,
    findById: async () => ({ id: "route-empty", routeGeojson: { type: "Feature", properties: { distanceMeters: 3200, durationSeconds: 540 }, geometry: baselineGeometry } }),
    findStopByServiceUserId: async () => null,
    listActiveStops: async () => [],
    saveProposal: async (proposal) => new WasteRouteProposal({ ...proposal, id: "proposal-first", expiresAt: new Date(Date.now() + 60_000) }),
  };
  const optimizedGeometry = { type: "LineString", coordinates: [[100.19, 16.75], [100.195, 16.755], [100.21, 16.77]] };
  const optimizer = { optimize: async (input, options) => {
    optimizerInput = input;
    optimizerOptions = options;
    return {
      orderedStopIds: input.map((stop) => stop.id),
      geometry: optimizedGeometry,
      distanceMeters: 3600,
      durationSeconds: 600,
    };
  } };
  const useCase = new ProposeWasteServiceUserRouteAssignmentUseCase({ routeRepository: repository, routeOptimizer: optimizer, routeAssignmentService: { distanceToRouteMeters: () => 50 } });
  const proposal = await useCase.execute({ serviceUserId: serviceUser.id, routeId: "route-empty" });
  assert.deepEqual(optimizerInput.map(({ id, latitude, longitude }) => ({ id, latitude, longitude })), [
    { id: "route-start:route-empty", latitude: 16.75, longitude: 100.19 },
    { id: "assignment:user-first", latitude: 16.755, longitude: 100.195 },
    { id: "route-end:route-empty", latitude: 16.77, longitude: 100.21 },
  ]);
  assert.equal(optimizerOptions.returnToStart, false);
  assert.equal(proposal.stops.length, 1);
  assert.deepEqual(proposal.geometry, optimizedGeometry);
  assert.equal(proposal.distanceMeters, 3600);
});

test("route assignment confirmation validates state and delegates one atomic save", async () => {
  const candidate = { id: "assignment:user-new", serviceUserId: "user-new", stopName: "บ้าน 9 · บ้านใหม่", latitude: 16.765, longitude: 100.205, assignmentCandidate: true, previousRouteId: null };
  const proposal = new WasteRouteProposal({ id: "proposal-assign", routeId: "route-1", stops: [stops[0], candidate, stops[1]], geometry: { type: "LineString", coordinates: [[100.19, 16.75], [100.205, 16.765], [100.20, 16.76]] }, distanceMeters: 4400, durationSeconds: 720, expiresAt: new Date(Date.now() + 60_000) });
  let confirmed;
  const repository = {
    findProposal: async () => proposal,
    findActiveServiceUserById: async () => ({ id: "user-new", routeId: null, latitude: candidate.latitude, longitude: candidate.longitude }),
    listActiveStops: async () => stops.slice(0, 2),
    findById: async () => ({ id: "route-1", routeGeojson: { properties: { distanceMeters: 4000 } } }),
    confirmServiceUserAssignment: async (input) => { confirmed = input; },
  };
  const useCase = new ConfirmWasteServiceUserRouteAssignmentUseCase({ routeRepository: repository });
  const result = await useCase.execute({ serviceUserId: "user-new", proposalId: proposal.id, confirmedBy: "officer" });
  assert.equal(result.id, proposal.id);
  assert.equal(confirmed.serviceUser.id, "user-new");
  assert.equal(confirmed.routeGeojson.properties.distanceMeters, 4400);
});
