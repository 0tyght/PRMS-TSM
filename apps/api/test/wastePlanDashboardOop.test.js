import assert from "node:assert/strict";
import test from "node:test";

import { WastePlanExecutionPolicy } from "../src/modules/waste/domain/WastePlanExecutionPolicy.js";
import { WastePlanService } from "../src/modules/waste/application/WastePlanService.js";
import { WastePlanStatusService } from "../src/modules/waste/application/WastePlanStatusService.js";
import { WasteDashboardQueryService } from "../src/modules/waste/application/WasteDashboardQueryService.js";

test("WastePlanExecutionPolicy requires an available vehicle for a new start", () => {
  const policy =
    new WastePlanExecutionPolicy();

  assert.doesNotThrow(
    () =>
      policy.assertVehicleReady({
        status: "AVAILABLE",
      }),
  );

  assert.throws(
    () =>
      policy.assertVehicleReady({
        status: "MAINTENANCE",
      }),
    {
      code:
        "WASTE_PLAN_VEHICLE_NOT_READY",
    },
  );
});

test("WastePlanExecutionPolicy allows an interrupted plan to resume with its vehicle still in service", () => {
  const policy =
    new WastePlanExecutionPolicy();

  assert.doesNotThrow(
    () =>
      policy.assertVehicleReady(
        {
          status:
            "IN_SERVICE",
        },
        {
          resuming: true,
        },
      ),
  );

  assert.throws(
    () =>
      policy.assertVehicleReady(
        {
          status:
            "IN_SERVICE",
        },
        {
          resuming: false,
        },
      ),
    {
      code:
        "WASTE_PLAN_VEHICLE_NOT_READY",
    },
  );
});

test("WastePlanService refuses editing a published operational plan", async () => {
  let resourceChecked = false;

  const service =
    new WastePlanService({
      repository: {
        transaction:
          async (work) =>
            work({}),

        findEditableContext:
          async () => ({
            id: "plan-1",
            status:
              "SCHEDULED",
            publicationStatus:
              "PUBLISHED",
            publicationVersion:
              1,
            planNo:
              "WST-001",
            scheduledDate:
              "2026-08-14",
            routeId:
              "route-1",
            vehicleId:
              "vehicle-1",
            driverId:
              "driver-1",
            scheduledStartAt:
              null,
            scheduledEndAt:
              null,
          }),
      },

      auditLog: {
        record:
          async () => {},
      },

      planNumberService: {
        next:
          async () =>
            "WST-001",
      },

      resourceServiceFactory:
        () => ({
          assertAssignment:
            async () => {
              resourceChecked = true;
            },
        }),
    });

  await assert.rejects(
    () =>
      service.update(
        "plan-1",
        {
          note:
            "แก้ไขทดสอบ",
        },
        {
          userId:
            "officer-1",
          ipAddress:
            null,
        },
      ),
    {
      code:
        "WASTE_PLAN_PUBLISHED_NOT_EDITABLE",
    },
  );

  assert.equal(
    resourceChecked,
    false,
  );
});

test("WastePlanStatusService starts a published plan and marks the vehicle in service", async () => {
  const calls = [];

  const service =
    new WastePlanStatusService({
      repository: {
        transaction:
          async (work) =>
            work({}),

        findExecutionContext:
          async () => ({
            id: "plan-1",
            status:
              "SCHEDULED",
            publicationStatus:
              "PUBLISHED",
            publicationVersion:
              1,
            vehicleId:
              "vehicle-1",
            driverId:
              "driver-1",
          }),

        findVehicleState:
          async () => ({
            id:
              "vehicle-1",
            status:
              "AVAILABLE",
          }),

        findDriverState:
          async () => ({
            id:
              "driver-1",
            isActive:
              true,
          }),

        findActiveResourceConflict:
          async () =>
            null,

        updateStatus:
          async (
            _db,
            value,
          ) =>
            calls.push([
              "status",
              value,
            ]),

        markVehicleInService:
          async () =>
            calls.push([
              "vehicle",
              "IN_SERVICE",
            ]),

        releaseVehicle:
          async () => {},
      },

      policy:
        new WastePlanExecutionPolicy(),

      auditLog: {
        record:
          async () => {},
      },
    });

  const result =
    await service.updateStatus(
      "plan-1",
      {
        status:
          "IN_PROGRESS",
        note: null,
      },
      {
        userId:
          "officer-1",
        ipAddress:
          null,
      },
    );

  assert.equal(
    result.status,
    "IN_PROGRESS",
  );

  assert.equal(
    calls[0][0],
    "status",
  );

  assert.equal(
    calls[1][1],
    "IN_SERVICE",
  );
});

test("WastePlanStatusService resumes an interrupted plan while the same vehicle remains in service", async () => {
  let markedInService = false;

  const service =
    new WastePlanStatusService({
      repository: {
        transaction:
          async (work) =>
            work({}),

        findExecutionContext:
          async () => ({
            id: "plan-1",
            status:
              "INTERRUPTED",
            publicationStatus:
              "PUBLISHED",
            publicationVersion:
              1,
            vehicleId:
              "vehicle-1",
            driverId:
              "driver-1",
          }),

        findVehicleState:
          async () => ({
            id:
              "vehicle-1",
            status:
              "IN_SERVICE",
          }),

        findDriverState:
          async () => ({
            id:
              "driver-1",
            isActive:
              true,
          }),

        findActiveResourceConflict:
          async () =>
            null,

        updateStatus:
          async () => {},

        markVehicleInService:
          async () => {
            markedInService = true;
          },

        releaseVehicle:
          async () => {},
      },

      policy:
        new WastePlanExecutionPolicy(),

      auditLog: {
        record:
          async () => {},
      },
    });

  const result =
    await service.updateStatus(
      "plan-1",
      {
        status:
          "IN_PROGRESS",
        note:
          "กลับมาปฏิบัติงาน",
      },
      {
        userId:
          "officer-1",
        ipAddress:
          null,
      },
    );

  assert.equal(
    result.status,
    "IN_PROGRESS",
  );

  assert.equal(
    markedInService,
    true,
  );
});

test("WasteDashboardQueryService resolves the default date in Asia Bangkok time", async () => {
  let loadedDate = null;

  const service =
    new WasteDashboardQueryService({
      repository: {
        load:
          async (date) => {
            loadedDate = date;

            return {
              date,
            };
          },
      },

      now:
        () =>
          new Date(
            "2026-08-13T18:30:00.000Z",
          ),
    });

  const result =
    await service.get();

  assert.equal(
    loadedDate,
    "2026-08-14",
  );

  assert.equal(
    result.date,
    "2026-08-14",
  );
});
