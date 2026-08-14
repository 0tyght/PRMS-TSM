import assert from "node:assert/strict";
import test from "node:test";

import { WasteDriverLineLinkService } from "../src/modules/waste/application/WasteDriverLineLinkService.js";
import { WasteRoutePreviewPolicy } from "../src/modules/waste/domain/WasteRoutePreviewPolicy.js";
import { WasteRoutePreviewService } from "../src/modules/waste/application/WasteRoutePreviewService.js";
import { OsrmRoutePreviewProvider } from "../src/modules/waste/infrastructure/OsrmRoutePreviewProvider.js";

test("WasteDriverLineLinkService retries a duplicate code and audits the generated link", async () => {
  const calls = [];
  const codes = [
    "111111",
    "222222",
  ];

  const service =
    new WasteDriverLineLinkService({
      repository: {
        findDriver:
          async () => ({
            id:
              "driver-1",
            fullName:
              "สมชาย ทดสอบ",
            isActive:
              true,
          }),

        activeCodeExists:
          async (hash) =>
            hash ===
            "hash-111111",

        transaction:
          async (work) =>
            work({}),

        replaceActiveCode:
          async (
            _db,
            input,
          ) =>
            calls.push([
              "replace",
              input,
            ]),
      },

      auditLog: {
        record:
          async (input) =>
            calls.push([
              "audit",
              input,
            ]),
      },

      codeSecurity: {
        generateCode:
          () =>
            codes.shift(),

        hash:
          (code) =>
            `hash-${code}`,
      },

      idFactory:
        () =>
          "link-code-1",
    });

  const result =
    await service.createLinkCode(
      "driver-1",
      {
        userId:
          "officer-1",
        ipAddress:
          "127.0.0.1",
      },
    );

  assert.equal(
    result.code,
    "222222",
  );

  assert.equal(
    result.driverName,
    "สมชาย ทดสอบ",
  );

  assert.equal(
    result.expiresInMinutes,
    15,
  );

  assert.equal(
    calls[0][1].codeHash,
    "hash-222222",
  );

  assert.equal(
    calls[1][1].action,
    "CREATE_WASTE_DRIVER_LINE_CODE",
  );
});

test("WasteDriverLineLinkService rejects an unknown driver", async () => {
  const service =
    new WasteDriverLineLinkService({
      repository: {
        findDriver:
          async () =>
            null,
      },

      auditLog: {
        record:
          async () => {},
      },

      codeSecurity: {
        generateCode:
          () =>
            "123456",

        hash:
          () =>
            "hash",
      },
    });

  await assert.rejects(
    () =>
      service.createLinkCode(
        "missing",
        {
          userId:
            "officer-1",
          ipAddress:
            null,
        },
      ),
    {
      code:
        "WASTE_DRIVER_NOT_FOUND",
    },
  );
});

test("WasteRoutePreviewPolicy keeps municipal bounds outside Presentation", () => {
  const policy =
    new WasteRoutePreviewPolicy();

  assert.doesNotThrow(
    () =>
      policy.assertWaypoints([
        {
          latitude:
            16.75,
          longitude:
            100.20,
        },
        {
          latitude:
            16.76,
          longitude:
            100.21,
        },
      ]),
  );

  assert.throws(
    () =>
      policy.assertWaypoints([
        {
          latitude:
            16.75,
          longitude:
            100.20,
        },
        {
          latitude:
            18,
          longitude:
            100.21,
        },
      ]),
    {
      code:
        "WASTE_ROUTE_PREVIEW_OUTSIDE_SERVICE_AREA",
    },
  );
});

test("WasteRoutePreviewService shapes provider data without HTTP knowledge", async () => {
  const service =
    new WasteRoutePreviewService({
      policy:
        new WasteRoutePreviewPolicy(),

      provider: {
        preview:
          async () => ({
            geometry: {
              type:
                "LineString",

              coordinates: [
                [
                  100.20,
                  16.75,
                ],
                [
                  100.21,
                  16.76,
                ],
              ],
            },

            distanceMeters:
              1200,

            durationSeconds:
              300,

            snappedWaypoints:
              [],
          }),
      },
    });

  const result =
    await service.preview([
      {
        latitude:
          16.75,
        longitude:
          100.20,
      },
      {
        latitude:
          16.76,
        longitude:
          100.21,
      },
    ]);

  assert.equal(
    result.distanceMeters,
    1200,
  );

  assert.equal(
    result.routeGeojson.type,
    "Feature",
  );

  assert.equal(
    result.routeGeojson
      .properties.source,
    "OpenStreetMap / OSRM",
  );
});

test("WasteRoutePreviewService converts provider failures into application errors", async () => {
  const service =
    new WasteRoutePreviewService({
      policy:
        new WasteRoutePreviewPolicy(),

      provider: {
        preview:
          async () => {
            throw new Error(
              "ROUTING_SERVICE_UNAVAILABLE",
            );
          },
      },
    });

  await assert.rejects(
    () =>
      service.preview([
        {
          latitude:
            16.75,
          longitude:
            100.20,
        },
        {
          latitude:
            16.76,
          longitude:
            100.21,
        },
      ]),
    {
      code:
        "ROUTING_SERVICE_UNAVAILABLE",
      status:
        502,
    },
  );
});

test("OsrmRoutePreviewProvider maps OSRM route response", async () => {
  let requestedUrl = "";

  const provider =
    new OsrmRoutePreviewProvider({
      baseUrl:
        "https://routing.test",

      fetchImpl:
        async (url) => {
          requestedUrl =
            String(url);

          return {
            ok: true,

            json:
              async () => ({
                code: "Ok",

                routes: [
                  {
                    distance:
                      1234.4,

                    duration:
                      321.2,

                    geometry: {
                      type:
                        "LineString",

                      coordinates:
                        [],
                    },
                  },
                ],

                waypoints: [
                  {
                    name:
                      "A",

                    location: [
                      100.20,
                      16.75,
                    ],

                    distance: 2,
                  },
                ],
              }),
          };
        },
    });

  const result =
    await provider.preview([
      {
        latitude:
          16.75,
        longitude:
          100.20,
      },
      {
        latitude:
          16.76,
        longitude:
          100.21,
      },
    ]);

  assert.match(
    requestedUrl,
    /\/route\/v1\/driving\//,
  );

  assert.equal(
    result.distanceMeters,
    1234,
  );

  assert.equal(
    result.durationSeconds,
    321,
  );
});
