import assert from "node:assert/strict";
import test from "node:test";
import { PublishWasteOperationPlanUseCase } from "../src/modules/waste/application/PublishWasteOperationPlanUseCase.js";
import { WithdrawWasteOperationPlanUseCase } from "../src/modules/waste/application/WithdrawWasteOperationPlanUseCase.js";
import { WastePlanNoticeFactory } from "../src/modules/waste/domain/WastePlanNoticeFactory.js";

function record(overrides = {}) {
  return {
    id: "plan-1", planNo: "WST-20260814-001", scheduledDate: "2026-08-14",
    scheduledStartAt: "2026-08-13T20:00:00.000Z", scheduledEndAt: "2026-08-14T04:30:00.000Z",
    status: "SCHEDULED", publicationStatus: "DRAFT", publicationVersion: 0,
    routeId: "route-1", routeCode: "THP-OFFICIAL-02", routeName: "รถคันที่ 2 – บ้านสวน",
    activeStopCount: 4, ...overrides,
  };
}

test("publishing one operational plan queues LINE notices only for its route", async () => {
  const calls = [];
  const repository = {
    transaction: (work) => work({}),
    findPublicationContext: async () => record(),
    countRecipients: async () => 3,
    markPublished: async (_db, input) => calls.push(["published", input]),
    enqueueRouteNotices: async (_db, input) => { calls.push(["notices", input]); return 3; },
  };
  const useCase = new PublishWasteOperationPlanUseCase({
    repository,
    noticeFactory: new WastePlanNoticeFactory(),
    now: () => new Date("2026-08-14T00:00:00.000Z"),
  });
  const result = await useCase.execute({ planId: "plan-1", officerId: "officer-1", publicNote: "วางขยะก่อนเวลา" });
  assert.deepEqual(result, { publicationStatus: "PUBLISHED", publicationVersion: 1, recipientCount: 3 });
  assert.equal(calls[1][1].type, "SCHEDULE_PUBLISHED");
  assert.match(calls[1][1].message, /เทศบาลเมืองท่าโพธิ์ แจ้งตารางกำหนดการเก็บขยะประจำพื้นที่/);
  assert.equal(calls[1][1].plan.routeId, "route-1");
});

test("withdrawal produces a clear citizen notice before staff edits the plan", async () => {
  const repository = {
    transaction: (work) => work({}),
    findPublicationContext: async () => record({ publicationStatus: "PUBLISHED", publicationVersion: 2 }),
    markWithdrawn: async () => {},
    enqueueRouteNotices: async (_db, input) => { assert.equal(input.type, "SCHEDULE_WITHDRAWN"); assert.match(input.message, /รถขัดข้อง/); return 2; },
  };
  const useCase = new WithdrawWasteOperationPlanUseCase({ repository, noticeFactory: new WastePlanNoticeFactory() });
  assert.deepEqual(await useCase.execute({ planId: "plan-1", officerId: "officer-1", reason: "รถขัดข้อง" }), { publicationStatus: "WITHDRAWN", publicationVersion: 2, recipientCount: 2 });
});
