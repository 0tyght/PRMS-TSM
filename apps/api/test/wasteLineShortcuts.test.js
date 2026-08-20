import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCitizenChargesMessage,
  buildCitizenScheduleMessage,
  buildDriverJobsMessage,
  buildWasteLineTextCard,
} from "../src/modules/line/wasteLine.js";
import { WasteLineShortcutCatalog } from "../src/modules/waste/application/WasteLineShortcutCatalog.js";

const catalog = new WasteLineShortcutCatalog();

function actionsOf(message) {
  return (message.quickReply?.items || []).map((item) => item.action);
}

function cardActionsOf(message) {
  const bubbles = message.contents?.type === "carousel" ? message.contents.contents : [message.contents];
  return bubbles.flatMap((bubble) => bubble?.footer?.contents || []).map((item) => item.action).filter(Boolean);
}

function assertValidActions(actions) {
  assert.ok(actions.length > 0, "every tested reply must offer a next action");
  assert.ok(actions.length <= 13, "LINE supports at most 13 quick replies");
  for (const action of actions) {
    assert.ok(["postback", "message", "location", "uri"].includes(action.type));
    assert.ok(action.label.length > 0 && action.label.length <= 20);
    if (action.type === "postback") {
      assert.ok(action.data.length <= 300);
      assert.ok(action.displayText, "postback selections must be visible in chat");
    }
  }
}

test("covers every citizen waste menu with visible postback shortcuts", () => {
  const actions = catalog.menu({ citizen: { id: "citizen-1" } });
  assertValidActions(actions);
  assert.deepEqual(
    actions.filter((action) => action.type === "postback").map((action) => action.data),
    ["waste=citizen_schedule", "waste=citizen_location", "waste=citizen_charges", "smart=menu"],
  );
});

test("keeps driver shortcuts separate from citizen and Smart Tha Pho menus", () => {
  assert.deepEqual(
    catalog.driverGuest().map((action) => action.data),
    ["waste=driver_link"],
  );
  assert.deepEqual(
    catalog.driverMenu().map((action) => action.data),
    ["waste=driver_jobs", "waste=driver_jobs_today", "waste=driver_jobs_upcoming", "waste=driver_help", "waste=menu"],
  );
  assert.ok(catalog.menu({ citizen: { id: "citizen-1" } }).every((action) => !String(action.data).includes("driver_")));
});

test("covers every registration step with cancel plus contextual shortcuts", () => {
  for (const step of ["FULL_NAME", "PHONE", "HOUSE_NO", "VILLAGE_NO", "ADDRESS", "LOCATION", "CONFIRM"]) {
    const actions = catalog.registration(step);
    assertValidActions(actions);
    assert.ok(actions.some((action) => action.type === "message" && action.text === "ยกเลิกบริการขยะ"));
  }
  assert.ok(catalog.registration("ADDRESS").some((action) => action.text === "ข้าม"));
  assert.ok(catalog.registration("LOCATION").some((action) => action.type === "location"));
  assert.ok(catalog.registration("CONFIRM").some((action) => action.text === "ยืนยัน"));
});

test("covers active driver work without exceeding LINE limits", () => {
  const plan = { id: "plan-active", planNo: "WST-20260813-001", status: "IN_PROGRESS" };
  const actions = catalog.activePlan(plan);
  assertValidActions(actions);
  const commands = actions.filter((action) => action.type === "postback").map((action) => action.data);
  for (const command of ["driver_gps", "driver_location", "driver_stops", "driver_incident", "driver_complete", "driver_jobs", "menu"]) {
    assert.ok(commands.some((value) => value.includes(`waste=${command}`)), `missing ${command}`);
  }
  assertValidActions(catalog.incidentTypes(plan));
  assert.ok(
    catalog.incidentTypes(plan).some((action) => String(action.data || "").includes("driver_incident_type") && String(action.data || "").includes("VEHICLE_BREAKDOWN")),
    "FR13 must let the driver identify the incident type before entering its description",
  );
  assert.match(catalog.registrationProgress("LOCATION"), /ขั้นตอน 6\/7/);
});

test("renders up to eight driver plans as swipeable LINE cards with one unambiguous action each", () => {
  const plans = [
    { id: "active", planNo: "WST-20260813-001", status: "IN_PROGRESS", scheduledDate: "2026-08-13", routeName: "หมู่ 1", vehicleCode: "W-01" },
    ...Array.from({ length: 7 }, (_, index) => ({
      id: `scheduled-${index + 1}`,
      planNo: `WST-202608${String(index + 14).padStart(2, "0")}-001`,
      status: "SCHEDULED",
      scheduledDate: `2026-08-${String(index + 14).padStart(2, "0")}`,
      routeName: `หมู่ ${index + 2}`,
      vehicleCode: `W-${String(index + 2).padStart(2, "0")}`,
    })),
  ];
  const message = buildDriverJobsMessage(plans);
  assert.equal(message.type, "flex");
  assert.equal(message.contents.type, "carousel");
  assert.equal(message.contents.contents.length, 8);
  assert.match(JSON.stringify(message.contents), /WST-20260813-001/);
  assert.match(JSON.stringify(message.contents), /WST-20260820-001/);
  assertValidActions(actionsOf(message));
  assert.equal(actionsOf(message).length, 5);
  assert.equal(cardActionsOf(message).filter((action) => String(action.data || "").includes("waste=driver_plan")).length, 8);
});

test("renders citizen schedules and charges as concise LINE cards", () => {
  const schedule = buildCitizenScheduleMessage({
    schedules: [{
      routeCode: "THP-01",
      routeName: "หมู่ 1",
      scheduledDate: "2026-08-19",
      scheduledStartAt: "2026-08-19T03:00:00+07:00",
      scheduledEndAt: "2026-08-19T05:00:00+07:00",
      status: "SCHEDULED",
    }],
  }, catalog.citizen());
  const charges = buildCitizenChargesMessage([{
    billingPeriod: "2026-08-01",
    dueDate: "2026-08-31",
    amount: 30,
    status: "PENDING",
  }], catalog.citizen());
  for (const message of [schedule, charges]) {
    assert.equal(message.type, "flex");
    assert.equal(message.contents.type, "carousel");
    assertValidActions(actionsOf(message));
  }
});

test("renders every ordinary waste LINE response as a readable Flex card", () => {
  const message = buildWasteLineTextCard(
    "ขั้นตอน 2/7 · หมายเลขโทรศัพท์\nลงทะเบียนผู้ใช้บริการเก็บขยะ\nกรุณาพิมพ์หมายเลขโทรศัพท์ 10 หลัก",
    catalog.registration("PHONE"),
  );
  assert.equal(message.type, "flex");
  assert.equal(message.contents.type, "bubble");
  assert.match(JSON.stringify(message.contents), /ลงทะเบียนผู้ใช้บริการเก็บขยะ/);
  assertValidActions(actionsOf(message));
});

test("surfaces the next meaningful action on a card instead of hiding it only below the composer", () => {
  const message = buildWasteLineTextCard(
    "ยืนยันตัวตนพนักงานประจำรถขยะ\nกรุณาพิมพ์รหัสพนักงานที่เทศบาลบันทึกไว้",
    catalog.driverGuest(),
  );
  const actions = cardActionsOf(message);
  assert.ok(actions.some((action) => action.data === "waste=driver_link"));
  assert.equal(message.contents.header.backgroundColor, undefined);
  assert.equal(message.contents.body.contents[0].backgroundColor, "#F4F8F5");
});

test("deduplicates repeated shortcuts before sending them to LINE", () => {
  const menu = catalog.driverMenu();
  assert.deepEqual(catalog.normalize([...menu, ...menu]), menu);
});
