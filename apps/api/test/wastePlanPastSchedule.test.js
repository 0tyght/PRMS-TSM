import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  WastePlanResourcePolicy,
} from "../src/modules/waste/domain/WastePlanResourcePolicy.js";

import {
  WastePlanResourceService,
} from "../src/modules/waste/application/WastePlanResourceService.js";

const here =
  path.dirname(
    fileURLToPath(
      import.meta.url,
    ),
  );

const repositoryRoot =
  path.resolve(
    here,
    "../../..",
  );

test(
  "WastePlanResourceService rejects a past date before repository access",
  async () => {
    let repositoryTouched =
      false;

    const service =
      new WastePlanResourceService({
        repository: {
          findRouteContext:
            async () => {
              repositoryTouched =
                true;

              return null;
            },

          findVehicle:
            async () => null,

          findDriver:
            async () => null,

          findAssignmentConflict:
            async () => null,
        },

        policy:
          new WastePlanResourcePolicy(),

        routeLifecycleService: {},

        now:
          () =>
            new Date(
              "2026-08-14T10:00:00+07:00",
            ),
      });

    await assert.rejects(
      () =>
        service.assertAssignment({
          scheduledDate:
            "2026-08-13",

          scheduledStartAt:
            "2026-08-13T08:00:00+07:00",

          scheduledEndAt:
            "2026-08-13T10:00:00+07:00",

          routeId:
            "route-1",

          vehicleId:
            "vehicle-1",

          driverId:
            "driver-1",
        }),
      {
        code:
          "WASTE_PLAN_DATE_IN_PAST",
      },
    );

    assert.equal(
      repositoryTouched,
      false,
    );
  },
);

test(
  "WastePlanResourceService rejects a past start time on the current date",
  async () => {
    const service =
      new WastePlanResourceService({
        repository: {},

        policy:
          new WastePlanResourcePolicy(),

        routeLifecycleService: {},

        now:
          () =>
            new Date(
              "2026-08-14T10:00:00+07:00",
            ),
      });

    await assert.rejects(
      () =>
        service.assertAssignment({
          scheduledDate:
            "2026-08-14",

          scheduledStartAt:
            "2026-08-14T09:30:00+07:00",

          scheduledEndAt:
            "2026-08-14T11:00:00+07:00",

          routeId:
            "route-1",

          vehicleId:
            "vehicle-1",

          driverId:
            "driver-1",
        }),
      {
        code:
          "WASTE_PLAN_START_IN_PAST",
      },
    );
  },
);

test(
  "WastePlanResourcePolicy accepts a future start time on the current date",
  () => {
    const policy =
      new WastePlanResourcePolicy();

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
  },
);

test(
  "plan form prevents selecting past dates",
  async () => {
    const source =
      await fs.readFile(
        path.join(
          repositoryRoot,
          "apps/waste-management/src/pages/PlansPage.jsx",
        ),
        "utf8",
      );

    assert.equal(
      source.includes(
        "min={minimumDate}",
      ),
      true,
    );

    assert.equal(
      source.includes(
        "minimumStartTime",
      ),
      true,
    );

    assert.equal(
      source.includes(
        "min={`",
      ),
      false,
    );
  },
);

test(
  "demo data no longer creates operation plans",
  async () => {
    const source =
      await fs.readFile(
        path.join(
          repositoryRoot,
          "database/demo/waste_demo_data.sql",
        ),
        "utf8",
      );

    assert.equal(
      source.includes(
        "INSERT INTO waste_operation_plans",
      ),
      false,
    );
  },
);