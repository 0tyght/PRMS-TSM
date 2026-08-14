import assert from "node:assert/strict";
import test from "node:test";

import { WasteTrackingPolicy } from "../src/modules/waste/domain/WasteTrackingPolicy.js";
import { WasteTrackingService } from "../src/modules/waste/application/WasteTrackingService.js";
import { WasteIncident } from "../src/modules/waste/domain/WasteIncident.js";
import { WasteIncidentService } from "../src/modules/waste/application/WasteIncidentService.js";

test("WasteTrackingPolicy accepts only Tha Pho coordinates", () => {
  const policy =
    new WasteTrackingPolicy();

  assert.equal(
    policy.isInsideServiceArea(
      16.75,
      100.2,
    ),
    true,
  );

  assert.throws(
    () =>
      policy.assertInsideServiceArea(
        18,
        100.2,
      ),
    {
      code:
        "WASTE_TRACKING_OUTSIDE_SERVICE_AREA",
    },
  );
});

test("WasteTrackingPolicy restricts tracking to active work states", () => {
  const policy =
    new WasteTrackingPolicy();

  assert.equal(
    policy.canTrack(
      "IN_PROGRESS",
    ),
    true,
  );

  assert.equal(
    policy.canTrack(
      "INTERRUPTED",
    ),
    true,
  );

  assert.throws(
    () =>
      policy.assertTrackableStatus(
        "COMPLETED",
      ),
    {
      code:
        "WASTE_TRACKING_PLAN_NOT_ACTIVE",
    },
  );
});

test("WasteTrackingPolicy applies seven-second location throttling", () => {
  const policy =
    new WasteTrackingPolicy();

  const previous =
    new Date(
      "2026-08-14T06:00:00.000Z",
    );

  assert.equal(
    policy.isTooFrequent(
      previous,
      new Date(
        "2026-08-14T06:00:06.999Z",
      ),
    ),
    true,
  );

  assert.equal(
    policy.isTooFrequent(
      previous,
      new Date(
        "2026-08-14T06:00:07.000Z",
      ),
    ),
    false,
  );
});

test("WasteTrackingService throttles repeated GPS writes before persistence", async () => {
  let inserted = false;

  const service =
    new WasteTrackingService({
      repository: {
        transaction:
          async (work) =>
            work({}),
        findPlanForClaims:
          async () => ({
            id: "plan-1",
            vehicleId:
              "vehicle-1",
            status:
              "IN_PROGRESS",
          }),
        findLatestLocation:
          async () => ({
            recordedAt:
              new Date(
                "2026-08-14T06:00:00.000Z",
              ),
          }),
        insertLocation:
          async () => {
            inserted = true;
          },
        updateVehicleLocation:
          async () => {},
      },
      policy:
        new WasteTrackingPolicy(),
      now:
        () =>
          new Date(
            "2026-08-14T06:00:05.000Z",
          ),
    });

  const result =
    await service.recordLocation(
      {
        planId: "plan-1",
        driverId: "driver-1",
        lineUserId: "U123",
      },
      {
        latitude: 16.75,
        longitude: 100.2,
        accuracyM: 10,
        speedKph: 20,
      },
    );

  assert.equal(
    result.accepted,
    false,
  );

  assert.equal(
    result.reason,
    "TOO_FREQUENT",
  );

  assert.equal(
    inserted,
    false,
  );
});

test("WasteIncident validates incident status through the domain object", () => {
  const incident =
    new WasteIncident({
      id: "incident-1",
      incidentType:
        "VEHICLE_BREAKDOWN",
      description:
        "เครื่องยนต์ขัดข้อง",
      happenedAt:
        new Date(),
    });

  incident.update({
    status:
      "ACKNOWLEDGED",
    replacementVehicleId:
      null,
    resolutionNote:
      null,
  });

  assert.equal(
    incident.status,
    "ACKNOWLEDGED",
  );

  assert.throws(
    () =>
      incident.changeStatus(
        "INVALID",
      ),
    {
      code:
        "WASTE_INCIDENT_STATUS_INVALID",
    },
  );
});

test("WasteIncidentService creates incident and audit event", async () => {
  const calls = [];

  const service =
    new WasteIncidentService({
      repository: {
        create:
          async (value) =>
            calls.push([
              "create",
              value,
            ]),
      },
      auditLog: {
        record:
          async (value) =>
            calls.push([
              "audit",
              value,
            ]),
      },
      idFactory:
        () =>
          "incident-1",
    });

  const input = {
    planId: null,
    vehicleId:
      "vehicle-1",
    driverId:
      "driver-1",
    incidentType:
      "VEHICLE_BREAKDOWN",
    description:
      "เครื่องยนต์ขัดข้อง",
    happenedAt:
      "2026-08-14T06:00:00.000Z",
  };

  const result =
    await service.create(
      input,
      {
        userId:
          "officer-1",
        ipAddress:
          "127.0.0.1",
      },
    );

  assert.equal(
    result.id,
    "incident-1",
  );

  assert.equal(
    result.status,
    "REPORTED",
  );

  assert.equal(
    calls[0][0],
    "create",
  );

  assert.equal(
    calls[1][1].action,
    "CREATE_WASTE_INCIDENT",
  );
});
