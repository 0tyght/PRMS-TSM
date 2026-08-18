import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { WasteDriverService } from "../src/modules/waste/application/WasteDriverService.js";
import { buildDriverJobsMessage } from "../src/modules/line/wasteLine.js";

const read = (relative) => fs.readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

test("FR2 API never accepts generic lineUserId and exposes audited unlink recovery", () => {
  const router = read("src/modules/waste/waste.router.js");
  const repository = read("src/modules/waste/infrastructure/MariaDbWasteDriverRepository.js");
  assert.match(router, /driverCreateSchema[\s\S]*driverCode/);
  assert.doesNotMatch(router.match(/const driverCreateSchema[\s\S]*?\.strict\(\);/)?.[0] || "", /lineUserId/);
  assert.match(router, /\/drivers\/:id\/line-link/);
  assert.doesNotMatch(repository.match(/const UPDATE_FIELDS[\s\S]*?\}\);/)?.[0] || "", /lineUserId/);
});

test("FR2 identity differentiates mismatch and suspended account and retires six-digit flow", () => {
  const line = read("src/modules/line/wasteLine.js");
  assert.match(line, /รหัสพนักงานหรือหมายเลขโทรศัพท์ไม่ตรง/);
  assert.match(line, /ถูกระงับหรือยกเลิกการใช้งาน/);
  assert.match(line, /LINK_WASTE_DRIVER_LINE/);
  assert.doesNotMatch(line, /รหัสเชื่อมบัญชี.*6 หลัก/);
  assert.doesNotMatch(line, /waste_driver_link_codes/);
});

test("FR2 unlink is audited by application service", async () => {
  const events = [];
  const repository = {
    async findById() { return { id: "d1", driverCode: "EMP-01", fullName: "A", phone: "0990000000", lineUserId: "U1", isActive: true }; },
    async unlinkLine() { return true; },
  };
  const service = new WasteDriverService({ repository, auditLog: { async record(event) { events.push(event); } } });
  const result = await service.unlinkLine("d1", { userId: "admin", ipAddress: "127.0.0.1" });
  assert.equal(result.lineUserId, null);
  assert.equal(events[0].action, "UNLINK_WASTE_DRIVER_LINE");
});

test("FR10 assigned job summary includes date round vehicle route and stop count", () => {
  const result = buildDriverJobsMessage([{
    id: "p1",
    planNo: "WP-001",
    status: "SCHEDULED",
    scheduledDate: "2026-08-19",
    scheduledStartAt: "2026-08-19T03:00:00+07:00",
    scheduledEndAt: "2026-08-19T05:30:00+07:00",
    vehicleCode: "W-01",
    routeName: "เส้นทางหมู่ 1",
    stopTotal: 12,
  }]);
  assert.equal(result.type, "flex");
  const card = JSON.stringify(result.contents);
  assert.match(card, /เวลา/);
  assert.match(card, /W-01/);
  assert.match(card, /เส้นทางหมู่ 1/);
  assert.match(card, /12 จุด/);
});

test("FR10 plan details support ordered stops and current collection status", () => {
  const line = read("src/modules/line/wasteLine.js");
  assert.match(line, /จุดเก็บขยะตามลำดับ/);
  assert.match(line, /ORDER BY s\.sequence_no/);
  assert.match(line, /collectionStatus/);
  assert.match(line, /driver_jobs_today/);
  assert.match(line, /driver_jobs_upcoming/);
});

test("FR13 exposes an incident shortcut and requires an incident type before the description", () => {
  const catalog = read("src/modules/waste/application/WasteLineShortcutCatalog.js");
  const activePlan = catalog.match(/activePlan\(plan\) \{[\s\S]*?\n  \}/)?.[0] || "";
  assert.match(activePlan, /driver_incident/);
  assert.match(catalog, /incidentTypes\(plan\)/);
  assert.match(catalog, /VEHICLE_BREAKDOWN/);
});
