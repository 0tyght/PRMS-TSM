import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const repository = fs.readFileSync(
  new URL("../src/modules/waste/infrastructure/MariaDbWastePlanAdminRepository.js", import.meta.url),
  "utf8",
);
const statusService = fs.readFileSync(
  new URL("../src/modules/waste/application/WastePlanStatusService.js", import.meta.url),
  "utf8",
);
const wasteLine = fs.readFileSync(
  new URL("../src/modules/line/wasteLine.js", import.meta.url),
  "utf8",
);
const migration = fs.readFileSync(
  new URL("../../../database/migrations/028_waste_no_route_complete_notice.sql", import.meta.url),
  "utf8",
);

test("route-wide collection status notice is only queued when work starts", () => {
  assert.match(
    repository,
    /publicationStatus !== "PUBLISHED" \|\| status !== "IN_PROGRESS"/,
  );
  assert.match(
    statusService,
    /current\.publicationStatus === "PUBLISHED"[\s\S]*?input\.status === "IN_PROGRESS"/,
  );
});

test("driver LINE completion does not broadcast COMPLETED to the whole route", () => {
  const completeSection = wasteLine.match(
    /if \(params\.waste === "driver_complete"\) \{[\s\S]*?if \(params\.waste === "driver_gps"\)/,
  )?.[0] || "";

  assert.ok(completeSection);
  assert.doesNotMatch(
    completeSection,
    /queueCollectionStatusNotices/,
  );
  assert.match(
    completeSection,
    /แจ้งประชาชนตามการยืนยันเก็บขยะรายจุดเท่านั้น/,
  );
});

test("legacy unsent route completion notices are cancelled", () => {
  assert.match(
    migration,
    /delivery_status = 'CANCELLED'/,
  );
  assert.match(
    migration,
    /stop_id IS NULL/,
  );
  assert.match(
    migration,
    /ปฏิบัติงานเสร็จสิ้น/,
  );
});

test("per-stop notification remains independent from old plan-level dedupe", () => {
  assert.match(
    migration,
    /NEW\.plan_id,[\s\S]*?NULL,[\s\S]*?NEW\.stop_id,[\s\S]*?'COLLECTION_STATUS'/,
  );
  assert.match(
    migration,
    /rs\.id = NEW\.stop_id/,
  );
});
