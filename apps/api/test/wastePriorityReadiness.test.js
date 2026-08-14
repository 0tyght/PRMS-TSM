import assert from "node:assert/strict";
import test from "node:test";

import { WasteCitizenScheduleService } from "../src/modules/waste/application/WasteCitizenScheduleService.js";
import { WastePlanNumberService } from "../src/modules/waste/application/WastePlanNumberService.js";
import { WasteTrackingTokenService } from "../src/modules/waste/application/WasteTrackingTokenService.js";

test("creates collision-safe daily waste plan numbers", async () => {
  const calls = [];
  const connection = {
    async execute(sql, values) {
      calls.push({ sql, values });
      return calls.length === 1 ? [{ insertId: 7 }] : [[]];
    },
  };
  const service = new WastePlanNumberService();
  assert.equal(await service.next(connection, "2026-08-13"), "WST-20260813-007");
  assert.match(calls[0].sql, /LAST_INSERT_ID\(last_number \+ 1\)/);
  assert.deepEqual(calls[0].values, ["2026-08-13"]);
  assert.deepEqual(calls[1].values, ["WST-20260813-007"]);
});

test("loads only the registered citizen route and returns a clear LINE schedule", async () => {
  let query = "";
  const database = {
    async execute(sql, values) {
      query = sql;
      assert.deepEqual(values, ["route-1"]);
      return [[{
        planNo: "WST-20260813-001",
        scheduledDate: "2026-08-13",
        scheduledStartAt: "2026-08-13T01:30:00.000Z",
        status: "SCHEDULED",
        routeCode: "R-01",
        routeName: "หมู่ 1–3",
      }]];
    },
  };
  const service = new WasteCitizenScheduleService({ database });
  const result = await service.upcomingFor({ routeId: "route-1" });
  assert.equal(result.state, "READY");
  assert.match(query, /publication_status = 'PUBLISHED'/);
  assert.match(service.toLineText(result), /R-01 หมู่ 1–3/);
  assert.match(service.toLineText(result), /สถานะ: ยังไม่เริ่มปฏิบัติงาน/);
});

test("issues short-lived driver tracking tokens scoped to one driver and plan", () => {
  const service = new WasteTrackingTokenService({ secret: "test-secret-at-least-for-unit-tests", expiresIn: "5m" });
  const token = service.issue({ planId: "plan-1", driverId: "driver-1", lineUserId: "U123" });
  assert.deepEqual(
    (({ planId, driverId, lineUserId }) => ({ planId, driverId, lineUserId }))(service.verify(token)),
    { planId: "plan-1", driverId: "driver-1", lineUserId: "U123" },
  );
  assert.throws(
    () => new WasteTrackingTokenService({ secret: "different-secret" }).verify(token),
    /invalid signature/,
  );
});
