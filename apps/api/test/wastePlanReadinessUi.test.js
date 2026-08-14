import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  WastePlanPolicy,
} from "../../waste-management/src/domain/WastePlanPolicy.js";

const here =
  path.dirname(
    fileURLToPath(
      import.meta.url,
    ),
  );

const repoRoot =
  path.resolve(
    here,
    "../../..",
  );

function completePlan(
  overrides = {},
) {
  return {
    status:
      "SCHEDULED",
    publicationStatus:
      "DRAFT",
    scheduledDate:
      "2026-08-15",
    scheduledStartAt:
      "2026-08-15T01:00:00.000Z",
    scheduledEndAt:
      "2026-08-15T03:00:00.000Z",
    vehicleId:
      "vehicle-1",
    driverId:
      "driver-1",
    stopTotal:
      3,
    lineRecipientCount:
      1,
    ...overrides,
  };
}

test(
  "publication readiness accepts a complete future plan",
  () => {
    const policy =
      new WastePlanPolicy();

    const result =
      policy.readiness(
        completePlan(),
        new Date(
          "2026-08-14T10:00:00.000Z",
        ),
      );

    assert.equal(
      result.ready,
      true,
    );

    assert.deepEqual(
      result.blockers,
      [],
    );
  },
);

test(
  "publication readiness blocks an ended operational window",
  () => {
    const policy =
      new WastePlanPolicy();

    const result =
      policy.readiness(
        completePlan({
          scheduledDate:
            "2026-08-14",
          scheduledStartAt:
            "2026-08-14T00:00:00.000Z",
          scheduledEndAt:
            "2026-08-14T01:10:00.000Z",
        }),
        new Date(
          "2026-08-14T10:00:00.000Z",
        ),
      );

    assert.equal(
      result.ready,
      false,
    );

    assert.equal(
      result.checks.find(
        (item) =>
          item.key ===
          "schedule-window",
      )?.ready,
      false,
    );
  },
);

test(
  "publication readiness blocks zero LINE recipients",
  () => {
    const policy =
      new WastePlanPolicy();

    const result =
      policy.readiness(
        completePlan({
          lineRecipientCount: 0,
        }),
        new Date(
          "2026-08-14T10:00:00.000Z",
        ),
      );

    assert.equal(
      result.ready,
      false,
    );

    assert.match(
      result.blockers.join(" "),
      /LINE/u,
    );
  },
);

test(
  "publication readiness uses collection-point wording",
  () => {
    const policy =
      new WastePlanPolicy();

    const result =
      policy.readiness(
        completePlan({
          stopTotal: 0,
        }),
        new Date(
          "2026-08-14T10:00:00.000Z",
        ),
      );

    assert.equal(
      result.ready,
      false,
    );

    assert.match(
      result.blockers.join(" "),
      /จุดเก็บขยะ/u,
    );
  },
);

test(
  "plan page keeps action errors inside dialogs",
  async () => {
    const source =
      await fs.readFile(
        path.join(
          repoRoot,
          "apps/waste-management/src/pages/PlansPage.jsx",
        ),
        "utf8",
      );

    assert.match(
      source,
      /setDialogError/u,
    );

    assert.match(
      source,
      /ตรวจความพร้อม/u,
    );

    assert.doesNotMatch(
      source,
      /<option value="SCHEDULED">ตามแผน<\/option>/u,
    );
  },
);

test(
  "core plan domain contains no legacy plan or service-point wording",
  async () => {
    const source =
      await fs.readFile(
        path.join(
          repoRoot,
          "apps/api/src/domain/waste/entities/WasteOperationPlan.js",
        ),
        "utf8",
      );

    assert.doesNotMatch(
      source,
      /จุดรับบริการ/u,
    );

    assert.doesNotMatch(
      source,
      /แผนงาน/u,
    );
  },
);
