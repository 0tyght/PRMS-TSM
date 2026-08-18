import assert from "node:assert/strict";
import test from "node:test";

import { AssignWasteIncidentReplacementUseCase } from "../src/modules/waste/application/AssignWasteIncidentReplacementUseCase.js";
import { WasteIncident } from "../src/modules/waste/domain/WasteIncident.js";
import { WastePlanExecutionPolicy } from "../src/modules/waste/domain/WastePlanExecutionPolicy.js";

test("WasteIncident requires an explicit replacement resource", () => {
  const incident = new WasteIncident({
    id: "incident-1",
    planId: "plan-1",
    incidentType: "VEHICLE_BREAKDOWN",
    description: "เครื่องยนต์ขัดข้อง",
    happenedAt: new Date(),
  });

  assert.throws(
    () => incident.assignReplacement({}),
    {
      code: "WASTE_INCIDENT_REPLACEMENT_REQUIRED",
    },
  );
});

test("AssignWasteIncidentReplacementUseCase checks resources and resumes the affected plan", async () => {
  const calls = [];
  const incident = {
    id: "incident-1",
    planId: "plan-1",
    incidentType: "VEHICLE_BREAKDOWN",
    status: "REPORTED",
    description: "เครื่องยนต์ขัดข้อง",
    happenedAt: new Date(),
  };

  const repository = {
    transaction: async (work) => work({}),
    findExecutionContext: async () => ({
      id: "plan-1",
      planNo: "WST-001",
      status: "INTERRUPTED",
      publicationStatus: "DRAFT",
      routeId: "route-1",
      vehicleId: "vehicle-old",
      driverId: "driver-old",
    }),
    findVehicleState: async (_db, id) => ({ id, status: "AVAILABLE" }),
    findDriverState: async (_db, id) => ({ id, isActive: true }),
    findActiveResourceConflict: async () => null,
    replaceExecutionResources: async (_db, value) => calls.push(["replace", value]),
    setVehicleStatus: async (_db, id, status) => calls.push(["vehicle", id, status]),
    markVehicleInService: async (_db, id) => calls.push(["in-service", id]),
    enqueueCollectionStatusNotices: async () => 0,
  };
  const incidentRepository = {
    findById: async () => incident,
    assignReplacement: async (_db, id, value) => calls.push(["incident", id, value]),
  };

  const useCase = new AssignWasteIncidentReplacementUseCase({
    incidentRepository,
    planRepository: repository,
    executionPolicy: new WastePlanExecutionPolicy(),
    auditLog: { record: async (value) => calls.push(["audit", value]) },
  });

  const result = await useCase.execute(
    "incident-1",
    {
      replacementVehicleId: "vehicle-new",
      replacementDriverId: "driver-new",
      resumePlan: true,
      resolutionNote: "ประสานรถสำรองแล้ว",
    },
    { userId: "officer-1", ipAddress: "127.0.0.1" },
  );

  assert.equal(result.status, "ACKNOWLEDGED");
  assert.equal(result.resumed, true);
  assert.deepEqual(calls[0], ["replace", {
    id: "plan-1",
    vehicleId: "vehicle-new",
    driverId: "driver-new",
    resumePlan: true,
  }]);
  assert.deepEqual(calls[1], ["vehicle", "vehicle-old", "MAINTENANCE"]);
  assert.deepEqual(calls[2], ["in-service", "vehicle-new"]);
  assert.equal(calls.at(-1)[1].action, "ASSIGN_WASTE_INCIDENT_REPLACEMENT");
});
