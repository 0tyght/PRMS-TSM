import assert from "node:assert/strict";
import test from "node:test";

import { WasteServiceUser } from "../src/modules/waste/domain/WasteServiceUser.js";
import { WasteServiceUserService } from "../src/modules/waste/application/WasteServiceUserService.js";

function userRecord(overrides = {}) {
  return {
    id: "user-1",
    serviceNo: "WSU-001",
    fullName: "สมชาย ทดสอบ",
    phone: "0812345678",
    houseNo: "10",
    villageId: 1,
    villageNo: 1,
    villageName: "บ้านทดสอบ",
    addressDetail: null,
    lineUserId: "U123",
    routeId: "route-1",
    routeName: "เส้นทาง 1",
    routeAssignmentStatus:
      "CONFIRMED",
    routeAssignmentDistanceM:
      100,
    routeAssignedAt: null,
    latitude: 16.75,
    longitude: 100.2,
    isActive: true,
    ...overrides,
  };
}

test("WasteServiceUser clears LINE identity when service is deactivated", () => {
  const user =
    new WasteServiceUser(
      userRecord(),
    );

  user.update({
    isActive: false,
  });

  assert.equal(
    user.isActive,
    false,
  );

  assert.equal(
    user.lineUserId,
    null,
  );
});

test("WasteServiceUser blocks direct route assignment", () => {
  const user =
    new WasteServiceUser(
      userRecord(),
    );

  assert.throws(
    () =>
      user.update({
        routeId: "route-2",
      }),
    {
      code:
        "WASTE_SERVICE_USER_ROUTE_DIRECT_UPDATE_NOT_ALLOWED",
    },
  );
});

test("WasteServiceUser blocks physical deletion after billing or collection history", () => {
  const user =
    new WasteServiceUser(
      userRecord(),
    );

  assert.throws(
    () =>
      user.assertDeletable({
        chargeCount: 1,
        confirmationCount: 0,
      }),
    {
      code:
        "WASTE_SERVICE_USER_HAS_HISTORY",
    },
  );

  assert.doesNotThrow(
    () =>
      user.assertDeletable({
        chargeCount: 0,
        confirmationCount: 0,
      }),
  );
});

test("WasteServiceUser detects location changes accurately", () => {
  const before =
    userRecord({
      latitude: 16.75,
      longitude: 100.2,
    });

  const user =
    new WasteServiceUser(
      before,
    );

  user.update({
    latitude: 16.751,
  });

  assert.equal(
    user.locationChangedFrom(
      before,
    ),
    true,
  );
});

test("WasteServiceUserService creates an unassigned service user and audit event", async () => {
  const calls = [];

  const service =
    new WasteServiceUserService({
      repository: {
        transaction:
          async (work) =>
            work({}),
        create:
          async (_db, value) =>
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
      routeLifecycleService: {
        markForRecalculation:
          () => null,
      },
      routeAssignmentService: {
        suggest:
          () => [],
      },
      idFactory:
        () => "user-1",
    });

  const result =
    await service.create(
      {
        serviceNo: "WSU-001",
        fullName: "สมชาย ทดสอบ",
        phone: "0812345678",
        houseNo: "10",
        villageId: 1,
        addressDetail: null,
        lineUserId: null,
        routeId: "ignored-route",
        latitude: 16.75,
        longitude: 100.2,
        isActive: true,
      },
      {
        userId: "officer-1",
        ipAddress: "127.0.0.1",
      },
    );

  assert.equal(
    result.id,
    "user-1",
  );

  assert.equal(
    result.routeId,
    null,
  );

  assert.equal(
    result.routeAssignmentStatus,
    "UNASSIGNED",
  );

  assert.equal(
    calls[0][0],
    "create",
  );

  assert.equal(
    calls[1][1].action,
    "CREATE_WASTE_SERVICE_USER",
  );
});

test("WasteServiceUserService refuses deletion when history exists", async () => {
  let removed = false;

  const service =
    new WasteServiceUserService({
      repository: {
        transaction:
          async (work) =>
            work({}),
        findById:
          async () =>
            userRecord(),
        historyCounts:
          async () => ({
            chargeCount: 1,
            confirmationCount: 0,
          }),
        remove:
          async () => {
            removed = true;
            return true;
          },
      },
      auditLog: {
        record:
          async () => {},
      },
      routeLifecycleService: {
        markForRecalculation:
          () => null,
      },
      routeAssignmentService: {
        suggest:
          () => [],
      },
    });

  await assert.rejects(
    () =>
      service.remove(
        "user-1",
        {
          userId: "officer-1",
          ipAddress: null,
        },
      ),
    {
      code:
        "WASTE_SERVICE_USER_HAS_HISTORY",
    },
  );

  assert.equal(
    removed,
    false,
  );
});
