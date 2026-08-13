import assert from "node:assert/strict";
import test from "node:test";

import { SmartThaPhoLineMenu } from "../src/modules/line/SmartThaPhoLineMenu.js";

const menu = new SmartThaPhoLineMenu();

test("starts LINE at the Smart Tha Pho four-system selector", () => {
  const message = menu.message();
  const actions = message.quickReply.items.map((item) => item.action);

  assert.deepEqual(actions.map((action) => action.label), [
    "ทะเบียนสัตว์เลี้ยง",
    "รถเก็บขยะ",
    "บรรเทาสาธารณภัย",
    "การประปา",
  ]);
  assert.equal(actions.every((action) => action.type === "postback" && action.displayText), true);
});

test("recognizes follow, typed home commands, and system selections", () => {
  assert.deepEqual(menu.parse({ type: "follow" }), { action: "menu" });
  assert.deepEqual(menu.parse({ type: "message", message: { type: "text", text: "เมนูหลัก" } }), { action: "menu" });
  assert.deepEqual(menu.parse({ type: "postback", postback: { data: "smart=waste" } }), { action: "system", system: "waste" });
  assert.equal(menu.parse({ type: "message", message: { type: "text", text: "ข้อมูลอื่น" } }), null);
});
