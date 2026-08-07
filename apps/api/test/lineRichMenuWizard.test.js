import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMainWizardDefinition,
  buildQuickReplyItemsFromWizardPage,
  buildStaticSubmenuDefinition,
  buildTextEntryWizardDefinition,
  buildWizardMenuMessage,
  buildWizardPage,
  extractWizardChoicesFromMessages,
  fingerprintWizardPage,
  normalizeWizardAction,
  renderWizardMenuImage,
} from "../src/lineRichMenuWizard.js";
import {
  buildMainMenuActions,
  buildRichSubmenuActions,
  commandToAction,
} from "../src/lineNativeCitizen.js";

function actionData(items) {
  return items.map((item) => item?.action?.data || item?.data).filter(Boolean);
}

test("converts device choices into current LINE URL schemes", () => {
  assert.equal(normalizeWizardAction({ type: "camera", label: "ถ่ายรูป" }).uri, "https://line.me/R/nv/camera/");
  assert.equal(normalizeWizardAction({ type: "cameraRoll", label: "เลือกรูป" }).uri, "https://line.me/R/nv/cameraRoll/single");
  assert.equal(normalizeWizardAction({ type: "location", label: "ส่งตำแหน่ง" }).uri, "https://line.me/R/nv/location/");
});

test("supports instant rich-menu switching through aliases", () => {
  const action = normalizeWizardAction({
    type: "richmenuswitch",
    label: "สุขภาพสัตว์",
    richMenuAliasId: "prms-v12-health",
    data: "wizard=switched&target=health",
  });
  assert.equal(action.type, "richmenuswitch");
  assert.equal(action.richMenuAliasId, "prms-v12-health");
});

test("static submenu controls write visible chat selections", () => {
  const page = buildWizardPage(buildStaticSubmenuDefinition("health"), 0, false);
  assert.equal(page.controlSlots[0].action.type, "postback");
  assert.equal(page.controlSlots[0].action.data, "wizard=switched&target=main");
  assert.equal(page.controlSlots[0].action.displayText, "ย้อนกลับ");
  assert.equal(page.controlSlots[1].action.type, "postback");
  assert.equal(page.controlSlots[1].action.displayText, "เมนูหลัก");
});

test("reuses one pre-warmed menu for keyboard-only data entry", () => {
  const definition = buildTextEntryWizardDefinition();
  const page = buildWizardPage(definition, 0, true);

  assert.equal(definition.cacheScope, "static");
  assert.equal(definition.staticAlias, "prms-v12-input");
  assert.equal(page.choiceSlots.length, 1);
  assert.equal(page.choiceSlots[0].action.inputOption, "openKeyboard");
  assert.deepEqual(
    page.controlSlots.map((slot) => slot.action.data),
    ["session=back", "wizard=home", "session=cancel"],
  );
});

test("mirrors every visible Rich Menu button above the keyboard", () => {
  const page = buildWizardPage(buildStaticSubmenuDefinition("health"), 0, false);
  const quickReplyItems = buildQuickReplyItemsFromWizardPage(page);
  const message = buildWizardMenuMessage(page, "เปิดเมนูสุขภาพสัตว์แล้ว");

  assert.equal(quickReplyItems.length, page.slots.length);
  assert.deepEqual(
    quickReplyItems.map((item) => item.action.label),
    page.slots.map((slot) => slot.action.label),
  );
  assert.equal(quickReplyItems.some((item) => item.action.type === "richmenuswitch"), false);
  assert.equal(message.type, "text");
  assert.match(message.text, /เปิดเมนูสุขภาพสัตว์แล้ว/);
  assert.equal(message.quickReply.items.length, page.slots.length);
});

test("all standard menu selections include visible chat text", () => {
  const definitions = [
    buildMainWizardDefinition({ linked: false }),
    buildMainWizardDefinition({ linked: true }),
    buildTextEntryWizardDefinition(),
    ...["pets", "health", "status", "requests", "owner"].map(buildStaticSubmenuDefinition),
  ];

  for (const definition of definitions) {
    const page = buildWizardPage(definition, 0, definition.key === "input-v12");
    for (const slot of page.slots) {
      if (slot.action.type === "postback") {
        assert.equal(typeof slot.action.displayText, "string");
        assert.ok(slot.action.displayText.length > 0);
      }
    }
  }
});

test("writes each postback selection into the LINE chat", () => {
  const action = normalizeWizardAction({
    type: "postback",
    label: "เลือกสุนัข",
    data: "session=species&value=DOG",
    displayText: "เลือกสุนัข",
  });
  assert.equal(action.displayText, "เลือกสุนัข");
  assert.equal(action.inputOption, "openRichMenu");
});

test("anchors workflow controls and keeps pager outside data choices", () => {
  const choices = Array.from({ length: 14 }, (_, index) => ({
    label: `รายการ ${index + 1}`,
    action: { type: "postback", data: `choice=${index + 1}` },
  }));
  const first = buildWizardPage({ title: "รายการ", choices }, 0, true);
  assert.equal(first.choiceSlots.length, 6);
  assert.deepEqual(first.controlSlots.map((slot) => slot.action.data), ["session=back", "wizard=home", "session=cancel"]);
  assert.deepEqual(first.pagerSlots.map((slot) => slot.label), ["หน้าถัดไป"]);
  const second = buildWizardPage({ title: "รายการ", choices }, 6, true);
  assert.deepEqual(second.pagerSlots.map((slot) => slot.label), ["หน้าก่อน", "หน้าถัดไป"]);
});

test("paginates every choice exactly once", () => {
  const choices = Array.from({ length: 22 }, (_, index) => ({
    label: `รายการ ${index + 1}`,
    action: { type: "postback", data: `choice=${index + 1}` },
  }));
  const visited = [];
  for (let offset = 0; offset < choices.length; offset += 6) {
    const page = buildWizardPage({ title: "รายการ", choices }, offset, false);
    visited.push(...page.choiceSlots.map((slot) => slot.action.data));
  }
  assert.deepEqual(visited, choices.map((choice) => choice.action.data));
});

test("extracts all wizard items even when LINE quick reply shows only 13", () => {
  const all = Array.from({ length: 30 }, (_, index) => ({
    type: "action",
    action: { type: "postback", label: `หมู่ ${index + 1}`, data: `village=${index + 1}` },
  }));
  const choices = extractWizardChoicesFromMessages([{
    type: "text",
    text: "เลือกหมู่บ้าน",
    quickReply: { items: all.slice(0, 13), _wizardItems: all },
  }]);
  assert.equal(choices.length, 30);
  assert.equal(choices.at(-1).action.data, "village=30");
});

test("uses stable fingerprints for cached rich menus", () => {
  const definition = buildStaticSubmenuDefinition("health");
  const a = fingerprintWizardPage(buildWizardPage(definition, 0, false));
  const b = fingerprintWizardPage(buildWizardPage(structuredClone(definition), 0, false));
  assert.equal(a, b);
});

test("builds streamlined owner main menu without duplicate add-pet shortcut", () => {
  const definition = buildMainWizardDefinition({ linked: true });
  assert.deepEqual(
    definition.choices.slice(0, 5).map((choice) => [choice.action.type, choice.action.data, choice.action.displayText]),
    [
      ["postback", "wizard=switched&target=pets", "สัตว์ของฉัน"],
      ["postback", "wizard=switched&target=health", "สุขภาพสัตว์"],
      ["postback", "wizard=switched&target=status", "แจ้งสถานะสัตว์"],
      ["postback", "wizard=switched&target=requests", "คำขอของฉัน"],
      ["postback", "wizard=switched&target=owner", "ข้อมูลเจ้าของ"],
    ],
  );
  assert.equal(definition.choices[5].action.data, "action=action_center");
  assert.deepEqual(buildMainMenuActions({ linked: true }), definition.choices.map((choice) => ({ ...choice.action, displayText: choice.label })));
});

test("keeps each static submenu focused on one real-world task group", () => {
  assert.deepEqual(actionData(buildStaticSubmenuDefinition("pets").choices), ["action=pets", "action=register", "action=pet_update"]);
  assert.deepEqual(actionData(buildStaticSubmenuDefinition("health").choices), ["action=vaccination", "action=sterilization", "action=pets"]);
  assert.deepEqual(actionData(buildStaticSubmenuDefinition("status").choices), ["action=status_pick_MISSING", "action=status_pick_ACTIVE", "action=status_pick_DECEASED", "action=transfer_select"]);
  assert.deepEqual(actionData(buildStaticSubmenuDefinition("owner").choices), ["action=profile", "action=location", "action=contact"]);
});

test("legacy environment submenu helper resolves to the same V12 definitions", () => {
  assert.deepEqual(actionData(buildRichSubmenuActions("LINE_RICH_MENU_HEALTH_ID")), actionData(buildStaticSubmenuDefinition("health").choices));
});

test("specific menu commands win over the generic word menu", () => {
  assert.equal(commandToAction("เปิดเมนูสุขภาพสัตว์", { linked: true }), "health_menu");
  assert.equal(commandToAction("เปิดเมนูคำขอของฉัน", { linked: true }), "requests_menu");
  assert.equal(commandToAction("คำขอของฉัน", { linked: false }), "track");
  assert.equal(commandToAction("เมนู", { linked: true }), "menu");
});

test("renders a readable PNG within LINE size limit", async () => {
  const page = buildWizardPage(buildMainWizardDefinition({ linked: true }), 0, false);
  const image = await renderWizardMenuImage(page);
  assert.ok(Buffer.isBuffer(image));
  assert.ok(image.length > 1000);
  assert.ok(image.length <= 1024 * 1024);
});
