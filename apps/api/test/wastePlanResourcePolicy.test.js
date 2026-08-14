import assert from "node:assert/strict";
import test from "node:test";

import { WastePlanResourcePolicy } from "../src/modules/waste/domain/WastePlanResourcePolicy.js";

test("WastePlanResourcePolicy centralizes statuses that occupy resources", () => {
  const policy = new WastePlanResourcePolicy();

  assert.deepEqual(
    policy.resourceOccupyingStatuses,
    ["SCHEDULED", "IN_PROGRESS", "INTERRUPTED"],
  );

  assert.equal(
    policy.resourceOccupyingStatuses.includes("COMPLETED"),
    false,
  );

  assert.equal(
    policy.resourceOccupyingStatuses.includes("CANCELLED"),
    false,
  );
});

test("WastePlanResourcePolicy rejects invalid schedule window", () => {
  const policy = new WastePlanResourcePolicy();

  assert.throws(
    () =>
      policy.assertScheduleWindow(
        new Date("2026-08-14T10:00:00+07:00"),
        new Date("2026-08-14T09:00:00+07:00"),
      ),
    { code: "WASTE_PLAN_TIME_RANGE_INVALID" },
  );
});

test("WastePlanResourcePolicy rejects a past operation date", () => {
  const policy =
    new WastePlanResourcePolicy();

  assert.throws(
    () =>
      policy.assertNotPast(
        "2026-08-13",
        new Date(
          "2026-08-13T09:00:00+07:00",
        ),
        new Date(
          "2026-08-14T10:00:00+07:00",
        ),
      ),
    {
      code:
        "WASTE_PLAN_DATE_IN_PAST",
    },
  );
});

test("WastePlanResourcePolicy rejects a start time that already passed", () => {
  const policy =
    new WastePlanResourcePolicy();

  assert.throws(
    () =>
      policy.assertNotPast(
        "2026-08-14",
        new Date(
          "2026-08-14T09:30:00+07:00",
        ),
        new Date(
          "2026-08-14T10:00:00+07:00",
        ),
      ),
    {
      code:
        "WASTE_PLAN_START_IN_PAST",
    },
  );

  assert.doesNotThrow(
    () =>
      policy.assertNotPast(
        "2026-08-14",
        new Date(
          "2026-08-14T10:30:00+07:00",
        ),
        new Date(
          "2026-08-14T10:00:00+07:00",
        ),
      ),
  );
});

test("WastePlanResourcePolicy exposes vehicle availability consistently", () => {
  const policy = new WastePlanResourcePolicy();

  assert.deepEqual(
    policy.vehicleAvailability({
      id: "vehicle-1",
      status: "MAINTENANCE",
    }),
    {
      id: "vehicle-1",
      status: "MAINTENANCE",
      available: false,
      reason: "อยู่ระหว่างซ่อมบำรุง",
    },
  );

  assert.equal(
    policy.vehicleAvailability({
      id: "vehicle-2",
      status: "OUT_OF_SERVICE",
    }).reason,
    "งดใช้งาน",
  );

  assert.equal(
    policy.vehicleAvailability({
      id: "vehicle-3",
      status: "AVAILABLE",
    }).available,
    true,
  );
});

test("WastePlanResourcePolicy formats plan conflicts", () => {
  const policy = new WastePlanResourcePolicy();

  const result = policy.vehicleAvailability(
    { id: "vehicle-1", status: "AVAILABLE" },
    {
      id: "plan-id",
      planNo: "WST-001",
      startTime: "08:00",
      endTime: "10:00",
    },
  );

  assert.equal(result.available, false);
  assert.equal(
    result.reason,
    "ถูกใช้ในแผน WST-001 เวลา 08:00–10:00",
  );
  assert.equal(result.conflictPlanNo, "WST-001");
});
