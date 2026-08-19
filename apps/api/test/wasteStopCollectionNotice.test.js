import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const migrationUrl = new URL("../../../database/migrations/027_waste_stop_collected_notice.sql", import.meta.url);
const runtimeUrl = new URL("../src/composition-root/createApiRuntime.js", import.meta.url);

const migration = fs.readFileSync(migrationUrl, "utf8");
const runtime = fs.readFileSync(runtimeUrl, "utf8");

test("FR19 queues one citizen notification for the exact collected stop", () => {
  assert.match(migration, /AFTER INSERT ON waste_stop_confirmations/);
  assert.match(migration, /IF NEW\.status = 'COLLECTED'/);
  assert.match(migration, /su\.id = rs\.service_user_id/);
  assert.match(migration, /rs\.id = NEW\.stop_id/);
  assert.match(migration, /su\.line_user_id IS NOT NULL/);
  assert.match(migration, /p\.publication_status = 'PUBLISHED'/);
  assert.match(migration, /เก็บขยะที่จุดของคุณเรียบร้อยแล้ว/);
});

test("FR19 does not wait for all route stops and does not notify every route member", () => {
  assert.doesNotMatch(migration, /WHERE\s+su\.route_id\s*=/);
  assert.doesNotMatch(migration, /COUNT\(\*\).*waste_route_stops/is);
  assert.match(migration, /service_user_id[\s\S]*stop_id[\s\S]*COLLECTION_STATUS/);
});

test("FR19 deduplicates repeated confirmation of the same plan stop", () => {
  assert.match(migration, /uk_waste_stop_collected_notice[\s\S]*plan_id, stop_id, notification_type/);
  assert.match(migration, /INSERT IGNORE INTO waste_line_notifications/);
  assert.match(migration, /AFTER UPDATE ON waste_stop_confirmations/);
  assert.match(migration, /OLD\.status <> 'COLLECTED'/);
});

test("waste LINE queue processes per-stop notice within about two seconds", () => {
  assert.match(runtime, /name: "line-notification"[\s\S]{0,200}?intervalMs: 2_000/);
});