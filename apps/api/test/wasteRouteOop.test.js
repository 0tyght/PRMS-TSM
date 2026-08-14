import assert from "node:assert/strict";
import test from "node:test";

import { WasteRoute } from "../src/modules/waste/domain/WasteRoute.js";
import { WasteRouteStopSequence } from "../src/modules/waste/domain/WasteRouteStopSequence.js";
import { WasteRouteService } from "../src/modules/waste/application/WasteRouteService.js";

function routeRecord(overrides = {}) {
  return {
    id: "route-1",
    routeCode: "THP-01",
    routeName: "เส้นทางทดสอบ",
    description: null,
    routeGeojson: null,
    isActive: true,
    stopCount: 0,
    serviceUserCount: 0,
    ...overrides,
  };
}

test("WasteRoute prevents deactivation while active work exists", () => {
  const route =
    new WasteRoute(routeRecord());

  assert.throws(
    () =>
      route.assertCanDeactivate({
        activePlanCount: 1,
        activeUserCount: 0,
      }),
    {
      code:
        "WASTE_ROUTE_HAS_ACTIVE_DEPENDENCIES",
    },
  );
});

test("WasteRoute prevents deletion when historical references exist", () => {
  const route =
    new WasteRoute(routeRecord());

  assert.throws(
    () =>
      route.assertDeletable({
        planCount: 1,
        userCount: 0,
      }),
    {
      code:
        "WASTE_ROUTE_HAS_HISTORY",
    },
  );
});

test("WasteRoute rejects manual route geometry updates", () => {
  const route =
    new WasteRoute(routeRecord());

  assert.throws(
    () =>
      route.update({
        routeGeojson: null,
      }),
    {
      code:
        "WASTE_ROUTE_GEOMETRY_MANUAL_UPDATE_NOT_ALLOWED",
    },
  );
});

test("WasteRouteStopSequence rejects duplicated service users and sequence numbers", () => {
  assert.throws(
    () =>
      new WasteRouteStopSequence([
        {
          serviceUserId: "user-1",
          sequenceNo: 1,
        },
        {
          serviceUserId: "user-1",
          sequenceNo: 2,
        },
      ]),
    {
      code:
        "WASTE_ROUTE_STOP_SERVICE_USER_DUPLICATED",
    },
  );

  assert.throws(
    () =>
      new WasteRouteStopSequence([
        {
          serviceUserId: "user-1",
          sequenceNo: 1,
        },
        {
          serviceUserId: "user-2",
          sequenceNo: 1,
        },
      ]),
    {
      code:
        "WASTE_ROUTE_STOP_SEQUENCE_DUPLICATED",
    },
  );
});

test("WasteRouteService creates route through repository and audit abstraction", async () => {
  const calls = [];

  const service =
    new WasteRouteService({
      repository: {
        create: async (value) =>
          calls.push([
            "create",
            value,
          ]),
      },
      auditLog: {
        record: async (value) =>
          calls.push([
            "audit",
            value,
          ]),
      },
      idFactory:
        () => "route-1",
    });

  const result =
    await service.create(
      {
        routeCode: "THP-01",
        routeName: "เส้นทางทดสอบ",
        description: null,
        routeGeojson: null,
        isActive: true,
      },
      {
        userId: "officer-1",
        ipAddress: "127.0.0.1",
      },
    );

  assert.equal(
    result.id,
    "route-1",
  );

  assert.equal(
    calls[0][0],
    "create",
  );

  assert.equal(
    calls[1][1].action,
    "CREATE_WASTE_ROUTE",
  );
});

test("WasteRouteService refuses invalid route stop membership", async () => {
  const service =
    new WasteRouteService({
      repository: {
        replaceStops:
          async () => ({
            status:
              "INVALID_SERVICE_USERS",
            stopCount: 0,
          }),
      },
      auditLog: {
        record: async () => {},
      },
    });

  await assert.rejects(
    () =>
      service.replaceStops(
        "route-1",
        {
          stops: [
            {
              serviceUserId:
                "user-1",
              sequenceNo: 1,
            },
          ],
        },
        {
          userId: "officer-1",
          ipAddress: null,
        },
      ),
    {
      code:
        "WASTE_ROUTE_STOP_SERVICE_USER_INVALID",
    },
  );
});
