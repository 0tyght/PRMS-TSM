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

test("accepts every visible driver menu label as a typed command", () => {
  const cases = [
    ["ดูแผนปฏิบัติงานเก็บขยะที่ได้รับมอบหมาย", "งานเก็บขยะของฉัน"],
    ["ดูงานเก็บขยะวันนี้", "งานวันนี้"],
    ["ดูงานเก็บขยะล่วงหน้า", "งานล่วงหน้า"],
    ["วิธีใช้งานระบบพนักงานประจำรถขยะ", "วิธีใช้งานพนักงาน"],
  ];
  for (const [visibleText, command] of cases) {
    assert.equal(normalizeWasteCommand(visibleText, "DRIVER"), command);
    assert.equal(
      isExplicitWasteCommand({ type: "message", message: { type: "text", text: visibleText } }, "DRIVER"),
      true,
      visibleText,
    );
  }
});

test("LINE postback actions take precedence over a pending input step", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../src/modules/line/wasteLine.js", import.meta.url), "utf8"));
  assert.match(
    source,
    /event\.type === "postback" && postbackParams\.waste[\s\S]*?clearSession\(lineUserId, audience\)[\s\S]*?handleWasteAction\(postbackParams, lineUserId, actors, audience\)/,
  );
});

test("successful LINE registration replies with the citizen menu automatically", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../src/modules/line/wasteLine.js", import.meta.url), "utf8"));
  assert.match(
    source,
    /ลงทะเบียนสำเร็จ[\s\S]*?wasteMenu\(nextActors, "CITIZEN"\)/,
  );
});
