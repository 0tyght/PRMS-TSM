import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHouseholdVaccinationMessage,
  groupVaccinationReminderRows,
  shouldSendRealtimeStatusNotification,
} from "../src/lineNotifications.js";

test("sends only actionable status notifications without delaying final results", () => {
  assert.equal(shouldSendRealtimeStatusNotification("UNDER_REVIEW"), false);
  assert.equal(shouldSendRealtimeStatusNotification("NEED_MORE_INFO"), true);
  assert.equal(shouldSendRealtimeStatusNotification("APPROVED"), true);
  assert.equal(shouldSendRealtimeStatusNotification("REJECTED"), true);
});

test("groups vaccination reminders by LINE recipient and household immediately", () => {
  const groups = groupVaccinationReminderRows([
    {
      ownerId: "owner-1",
      householdId: "house-1",
      lineUserId: "U123",
      houseNo: "99",
      villageNo: 4,
      petId: "pet-1",
      petName: "โบ้",
      nextDueAt: "2026-08-10",
      reminderType: "DUE_SOON",
      reminderCode: "VACCINE_DUE_SOON_20260810",
    },
    {
      ownerId: "owner-1",
      householdId: "house-1",
      lineUserId: "U123",
      houseNo: "99",
      villageNo: 4,
      petId: "pet-2",
      petName: "มะลิ",
      nextDueAt: "2026-08-01",
      reminderType: "OVERDUE",
      reminderCode: "VACCINE_OVERDUE_20260801",
    },
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].items.length, 2);
  assert.equal(groups[0].items[0].petName, "มะลิ");
});

test("builds one readable LINE message for multiple pets in the household", () => {
  const message = buildHouseholdVaccinationMessage({
    ownerId: "owner-1",
    householdId: "house-1",
    lineUserId: "U123",
    houseNo: "99",
    villageNo: 4,
    items: [
      {
        petId: "pet-1",
        petName: "โบ้",
        nextDueAt: "2026-08-10",
        reminderType: "DUE_SOON",
      },
      {
        petId: "pet-2",
        petName: "มะลิ",
        nextDueAt: "2026-08-01",
        reminderType: "OVERDUE",
      },
    ],
  });

  assert.match(message, /มีสัตว์ที่ต้องดำเนินการ 2 ตัว/);
  assert.match(message, /โบ้/);
  assert.match(message, /มะลิ/);
  assert.ok(message.length <= 5_000);
});
