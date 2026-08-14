import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { createWasteManagementServices } from "../src/composition-root/createWasteManagementServices.js";
import { WasteHttpModule } from "../src/modules/waste/waste.router.js";
import { WastePlanPublicationService } from "../src/modules/waste/application/WastePlanPublicationService.js";

function fakeDatabase() {
  const database = {
    execute:
      async () => [[]],

    query:
      async () => [[]],

    transaction:
      async (work) =>
        work(database),
  };

  return database;
}

test("waste composition root wires the complete application graph", () => {
  const services =
    createWasteManagementServices({
      database:
        fakeDatabase(),

      config: {
        jwtSecret:
          "composition-root-test-secret",

        routingApiBaseUrl:
          "https://routing.test",
      },
    });

  assert.equal(
    Object.isFrozen(
      services,
    ),
    true,
  );

  const required = [
    "trackingTokenService",
    "wastePlanResourceService",
    "wasteVehicleService",
    "wasteDriverService",
    "wasteRouteService",
    "wasteServiceUserService",
    "wasteTrackingService",
    "wasteIncidentService",
    "wastePlanService",
    "wastePlanStatusService",
    "wasteDashboardQueryService",
    "wasteBillingService",
    "wasteReportQueryService",
    "wasteDriverLineLinkService",
    "wasteRoutePreviewService",
    "wasteRouteOptimization",
    "wastePlanPublicationService",
  ];

  for (
    const name of required
  ) {
    assert.ok(
      services[name],
      `${name} must be wired`,
    );
  }

  const module =
    new WasteHttpModule({
      services,
    });

  assert.equal(
    typeof module
      .getRouter(),
    "function",
  );
});

test("waste router is a Presentation adapter without database or infrastructure construction", async () => {
  const source =
    await fs.readFile(
      new URL(
        "../src/modules/waste/waste.router.js",
        import.meta.url,
      ),
      "utf8",
    );

  const forbidden = [
    "../../core/db.js",
    "../../core/config.js",
    "/infrastructure/",
    "./application/",
    "./domain/",
    "new MariaDb",
    "new Waste",
    "SELECT ",
    "INSERT INTO",
    "DELETE FROM waste_",
    "UPDATE waste_",
    "req.app.locals.waste",
  ];

  for (
    const pattern of forbidden
  ) {
    assert.equal(
      source.includes(
        pattern,
      ),
      false,
      `waste.router.js must not contain ${pattern}`,
    );
  }

  assert.match(
    source,
    /createWasteRouter/,
  );

  assert.match(
    source,
    /WasteHttpModule/,
  );
});

test("WastePlanPublicationService keeps publication audit outside Presentation", async () => {
  const calls = [];

  const service =
    new WastePlanPublicationService({
      publishUseCase: {
        execute:
          async () => ({
            publicationStatus:
              "PUBLISHED",
            publicationVersion:
              1,
            recipientCount:
              3,
          }),
      },

      withdrawUseCase: {
        execute:
          async () => null,
      },

      repository: {
        publicationDeliverySummary:
          async () => ({
            sent: 3,
          }),
      },

      auditLog: {
        record:
          async (value) =>
            calls.push(value),
      },
    });

  const result =
    await service.publish(
      "plan-1",
      {
        publicNote:
          "ทดสอบประกาศ",
      },
      {
        userId:
          "officer-1",
        ipAddress:
          "127.0.0.1",
      },
    );

  assert.equal(
    result.id,
    "plan-1",
  );

  assert.equal(
    result.publicationStatus,
    "PUBLISHED",
  );

  assert.equal(
    calls[0].action,
    "PUBLISH_WASTE_PLAN",
  );
});

test("WastePlanPublicationService reports a missing plan through application error", async () => {
  const service =
    new WastePlanPublicationService({
      publishUseCase: {
        execute:
          async () => null,
      },

      withdrawUseCase: {
        execute:
          async () => null,
      },

      repository: {
        publicationDeliverySummary:
          async () => null,
      },

      auditLog: {
        record:
          async () => {},
      },
    });

  await assert.rejects(
    () =>
      service.publish(
        "missing-plan",
        {
          publicNote:
            null,
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
        "WASTE_PLAN_NOT_FOUND",
      status:
        404,
    },
  );
});
