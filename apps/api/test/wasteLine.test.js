import assert from "node:assert/strict";
import test from "node:test";

import {
  isExplicitWasteCommand,
  normalizeWasteCommand,
  parseWastePostback,
} from "../src/modules/line/wasteLine.js";

test("recognizes explicit waste service commands without intercepting pet messages", () => {
  assert.equal(isExplicitWasteCommand({ type: "message", message: { type: "text", text: "  เมนูขยะ " } }), true);
  assert.equal(isExplicitWasteCommand({ type: "message", message: { type: "text", text: "สัตว์ของฉัน" } }), false);
  assert.equal(isExplicitWasteCommand({ type: "message", message: { type: "location", latitude: 16.7, longitude: 100.2 } }), false);
});

test("recognizes waste postbacks and parses identifiers", () => {
  const event = { type: "postback", postback: { data: "waste=driver_start&planId=abc" } };
  assert.equal(isExplicitWasteCommand(event), true);
  assert.deepEqual(parseWastePostback(event.postback.data), { waste: "driver_start", planId: "abc" });
});

test("normalizes spacing in Thai waste commands", () => {
  assert.equal(normalizeWasteCommand("  งานเก็บขยะ   ของฉัน  "), "งานเก็บขยะ ของฉัน");
});
