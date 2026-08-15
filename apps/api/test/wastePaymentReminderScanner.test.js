import assert from "node:assert/strict";
import test from "node:test";

import {
  WastePaymentReminderScanner,
} from "../src/modules/waste/infrastructure/WastePaymentReminderScanner.js";

test(
  "WastePaymentReminderScanner queues due reminders without duplicates",
  async () => {
    let sql = "";

    const scanner =
      new WastePaymentReminderScanner({
        database: {
          query: async (statement) => {
            sql = statement;

            return [
              {
                affectedRows: 3,
              },
            ];
          },
        },
      });

    const result =
      await scanner.enqueueDueReminders({
        daysBefore: 3,
      });

    assert.equal(
      result.queued,
      3,
    );

    assert.match(
      sql,
      /PAYMENT_REMINDER/,
    );

    assert.match(
      sql,
      /NOT EXISTS/,
    );

    assert.match(
      sql,
      /INTERVAL 3 DAY/,
    );
  },
);