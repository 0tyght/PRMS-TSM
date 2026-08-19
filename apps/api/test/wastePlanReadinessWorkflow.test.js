import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function source(relativePath) {
  return fs.readFileSync(new URL(`../src/${relativePath}`, import.meta.url), "utf8");
}

function rootSource(relativePath) {
  return fs.readFileSync(new URL(`../../../${relativePath}`, import.meta.url), "utf8");
}

test("waste plan readiness is persisted separately from publication", () => {
  const router = source("modules/waste/waste.router.js");
  const service = source("modules/waste/application/WastePlanService.js");
  const adminRepository = source("modules/waste/infrastructure/MariaDbWastePlanAdminRepository.js");
  const publicationRepository = source("modules/waste/infrastructure/MariaDbWastePlanRepository.js");
  const publish = source("modules/waste/application/PublishWasteOperationPlanUseCase.js");
  const migration = rootSource("database/migrations/029_waste_plan_readiness_confirmation.sql");

  assert.match(router, /\/plans\/:id\/readiness/);
  assert.match(router, /confirmReadiness/);
  assert.match(service, /markReadinessConfirmed/);
  assert.match(service, /function readinessInputsChanged/);
  assert.match(service, /invalidateReadiness:/);
  assert.match(adminRepository, /invalidateReadiness = false/);
  assert.match(adminRepository, /readiness_confirmed_at = NULL/);
  assert.match(adminRepository, /readiness_confirmed_by = NULL/);
  assert.match(adminRepository, /markReadinessConfirmed/);
  assert.doesNotMatch(adminRepository, /const invalidatesReadiness =/);
  assert.match(publicationRepository, /readiness_confirmed_at AS readinessConfirmedAt/);
  assert.match(publish, /WASTE_PLAN_READINESS_NOT_CONFIRMED/);
  assert.match(migration, /readiness_confirmed_at/);
  assert.match(migration, /Migration 029 completed successfully/);
});

test("note-only edits do not use field-presence as readiness invalidation", () => {
  const service = source("modules/waste/application/WastePlanService.js");
  const adminRepository = source("modules/waste/infrastructure/MariaDbWastePlanAdminRepository.js");

  assert.match(service, /input\.scheduledDate !== undefined/);
  assert.match(service, /input\[field\] !== undefined/);
  assert.match(service, /comparableDateTime/);
  assert.doesNotMatch(adminRepository, /entries\.some/);
});
