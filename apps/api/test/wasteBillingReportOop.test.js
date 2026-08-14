import assert from "node:assert/strict";
import test from "node:test";

import { WasteFeeRate } from "../src/modules/waste/domain/WasteFeeRate.js";
import { WasteServiceCharge } from "../src/modules/waste/domain/WasteServiceCharge.js";
import { WasteBillingService } from "../src/modules/waste/application/WasteBillingService.js";
import { WasteReportQueryService } from "../src/modules/waste/application/WasteReportQueryService.js";

test("WasteFeeRate protects invalid amount and billing cycle", () => {
  assert.throws(
    () =>
      new WasteFeeRate({
        rateName:
          "ค่าขยะ",
        amount: 0,
        billingCycle:
          "MONTHLY",
      }),
    {
      code:
        "WASTE_FEE_RATE_AMOUNT_INVALID",
    },
  );

  assert.throws(
    () =>
      new WasteFeeRate({
        rateName:
          "ค่าขยะ",
        amount: 30,
        billingCycle:
          "WEEKLY",
      }),
    {
      code:
        "WASTE_FEE_RATE_CYCLE_INVALID",
    },
  );
});

test("WasteServiceCharge rejects due date before billing period", () => {
  const charge =
    new WasteServiceCharge({
      amount: 30,
      billingPeriod:
        "2026-08-14",
      dueDate:
        "2026-08-13",
      status:
        "PENDING",
    });

  assert.throws(
    () =>
      charge
        .assertScheduleValid(),
    {
      code:
        "WASTE_CHARGE_DUE_DATE_INVALID",
    },
  );
});

test("WasteServiceCharge records paid time through domain state", () => {
  const now =
    new Date(
      "2026-08-14T06:00:00.000Z",
    );

  const charge =
    new WasteServiceCharge({
      amount: 30,
      billingPeriod:
        "2026-08-01",
      dueDate:
        "2026-08-31",
      status:
        "PENDING",
    });

  charge.changeStatus(
    "PAID",
    now,
  );

  assert.equal(
    charge.status,
    "PAID",
  );

  assert.equal(
    charge.paidAt,
    now,
  );
});

test("WasteServiceCharge allows notices only for unpaid linked LINE accounts", () => {
  const charge =
    new WasteServiceCharge({
      amount: 30,
      status:
        "OVERDUE",
      fullName:
        "สมชาย ทดสอบ",
      dueDate:
        "2026-08-31",
      lineUserId:
        "U123",
    });

  assert.doesNotThrow(
    () =>
      charge
        .assertNoticeable()
        .assertLineLinked(),
  );

  charge.changeStatus(
    "PAID",
  );

  assert.throws(
    () =>
      charge
        .assertNoticeable(),
    {
      code:
        "WASTE_CHARGE_NOTICE_STATUS_INVALID",
    },
  );
});

test("WasteBillingService queues notice through repository and audit abstractions", async () => {
  const calls = [];

  const service =
    new WasteBillingService({
      repository: {
        transaction:
          async (work) =>
            work({}),

        findChargeNoticeContext:
          async () => ({
            id:
              "charge-1",
            serviceUserId:
              "user-1",
            fullName:
              "สมชาย ทดสอบ",
            lineUserId:
              "U123",
            dueDate:
              "2026-08-31",
            amount: 30,
            status:
              "PENDING",
          }),

        enqueueChargeNotice:
          async (
            _db,
            input,
          ) =>
            calls.push([
              "notice",
              input,
            ]),

        markNoticeRequested:
          async () =>
            calls.push([
              "marked",
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

      noticeFactory: {
        create:
          () =>
            "notice-message",
      },

      idFactory:
        () =>
          "notification-1",
    });

  const result =
    await service.queueNotice(
      "charge-1",
      {
        userId:
          "officer-1",
        ipAddress:
          null,
      },
    );

  assert.equal(
    result.notificationId,
    "notification-1",
  );

  assert.equal(
    result.status,
    "PENDING",
  );

  assert.equal(
    calls[0][0],
    "notice",
  );

  assert.equal(
    calls[2][1].action,
    "QUEUE_WASTE_CHARGE_NOTICE",
  );
});

test("WasteReportQueryService delegates report queries without SQL knowledge", async () => {
  const calls = [];

  const service =
    new WasteReportQueryService({
      repository: {
        operations:
          async (query) => {
            calls.push([
              "operations",
              query,
            ]);

            return [];
          },

        billing:
          async (query) => {
            calls.push([
              "billing",
              query,
            ]);

            return [];
          },
      },
    });

  await service.operations({
    from:
      "2026-08-01",
  });

  await service.billing({
    billingPeriod:
      "2026-08-01",
  });

  assert.equal(
    calls[0][0],
    "operations",
  );

  assert.equal(
    calls[1][0],
    "billing",
  );
});
