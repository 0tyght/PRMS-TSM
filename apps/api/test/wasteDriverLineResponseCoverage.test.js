import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildWasteLineTextCard,
  classifyDriverCodeCheckpoint,
  classifyDriverPhoneCheckpoint,
} from "../src/modules/line/wasteLine.js";
import {
  WasteLineShortcutCatalog,
} from "../src/modules/waste/application/WasteLineShortcutCatalog.js";

const catalog = new WasteLineShortcutCatalog();

function driver(overrides = {}) {
  return {
    id: "driver-1",
    driverCode: "EMP-001",
    fullName: "พนักงานทดสอบ",
    phone: "0812345678",
    lineUserId: null,
    isActive: true,
    ...overrides,
  };
}

function accentOf(text) {
  return buildWasteLineTextCard(
    text,
    catalog.driverIdentity(),
  ).contents.header.backgroundColor;
}

test("FR2 validates employee code before asking for phone", () => {
  assert.equal(
    classifyDriverCodeCheckpoint(null, "U-current"),
    "NOT_FOUND",
  );
  assert.equal(
    classifyDriverCodeCheckpoint(
      driver({ isActive: false }),
      "U-current",
    ),
    "INACTIVE",
  );
  assert.equal(
    classifyDriverCodeCheckpoint(
      driver({ lineUserId: "U-other" }),
      "U-current",
    ),
    "DRIVER_USED",
  );
  assert.equal(
    classifyDriverCodeCheckpoint(
      driver({ lineUserId: "U-current" }),
      "U-current",
    ),
    "ALREADY",
  );
  assert.equal(
    classifyDriverCodeCheckpoint(
      driver(),
      "U-current",
    ),
    "PHONE_REQUIRED",
  );
});

test("FR2 phone checkpoint differentiates every identity conflict", () => {
  const base = {
    driver: driver(),
    lineUserId: "U-current",
    phone: "0812345678",
  };

  assert.equal(
    classifyDriverPhoneCheckpoint({
      ...base,
      driver: null,
    }),
    "NOT_FOUND",
  );
  assert.equal(
    classifyDriverPhoneCheckpoint({
      ...base,
      driver: driver({ isActive: false }),
    }),
    "INACTIVE",
  );
  assert.equal(
    classifyDriverPhoneCheckpoint({
      ...base,
      usedByLine: { id: "driver-2" },
    }),
    "LINE_USED",
  );
  assert.equal(
    classifyDriverPhoneCheckpoint({
      ...base,
      driver: driver({ lineUserId: "U-current" }),
    }),
    "ALREADY",
  );
  assert.equal(
    classifyDriverPhoneCheckpoint({
      ...base,
      driver: driver({ lineUserId: "U-other" }),
    }),
    "DRIVER_USED",
  );
  assert.equal(
    classifyDriverPhoneCheckpoint({
      ...base,
      phone: "0899999999",
    }),
    "PHONE_MISMATCH",
  );
  assert.equal(
    classifyDriverPhoneCheckpoint(base),
    "LINK",
  );
});

test("FR2 source checks employee code before moving session to PHONE", () => {
  const source = fs.readFileSync(
    new URL("../src/modules/line/wasteLine.js", import.meta.url),
    "utf8",
  );

  const codeStep =
    source.match(
      /session\.currentStep === "DRIVER_CODE"[\s\S]*?session\.currentStep === "PHONE"/,
    )?.[0] || "";

  assert.match(codeStep, /WHERE driver_code = \?/);
  assert.match(codeStep, /classifyDriverCodeCheckpoint/);
  assert.match(codeStep, /ไม่พบรหัสพนักงาน/);
  assert.match(codeStep, /เชื่อมต่อ LINE แล้ว/);

  const lookupIndex = codeStep.indexOf("WHERE driver_code = ?");
  const phoneSaveIndex = codeStep.indexOf(
    '"DRIVER_LINK",\n        "PHONE"',
  );

  assert.ok(lookupIndex >= 0);
  assert.ok(phoneSaveIndex >= 0);
  assert.ok(
    lookupIndex < phoneSaveIndex,
    "employee code must be verified before the flow moves to PHONE",
  );
});

test("driver validation conflict success and prompts render with correct card accents", () => {
  assert.equal(
    accentOf("ไม่พบรหัสพนักงาน EMP-999 ในระบบ"),
    "#B63A32",
  );
  assert.equal(
    accentOf("พนักงานรายนี้เชื่อมต่อ LINE แล้ว"),
    "#B63A32",
  );
  assert.equal(
    accentOf(
      "รูปแบบหมายเลขโทรศัพท์ไม่ถูกต้อง หมายเลขโทรศัพท์ต้องมี 10 หลัก",
    ),
    "#B63A32",
  );
  assert.equal(
    accentOf("กรุณาพิมพ์หมายเลขโทรศัพท์ 10 หลัก"),
    "#B86108",
  );
  assert.equal(
    accentOf("ยืนยันตัวตนพนักงานประจำรถขยะสำเร็จ"),
    "#087F5B",
  );
});

test("generic waste card does not duplicate a multi-line title in body", () => {
  const message =
    buildWasteLineTextCard(
      "ยืนยันตัวตนพนักงานประจำรถขยะ\nกรุณาพิมพ์รหัสพนักงานที่เทศบาลบันทึกไว้",
      catalog.driverIdentity(),
    );

  const title =
    message.contents.header.contents[1].text;
  const body =
    message.contents.body.contents[0].text;

  assert.equal(
    title,
    "ยืนยันตัวตนพนักงานประจำรถขยะ",
  );
  assert.doesNotMatch(
    body,
    /ยืนยันตัวตนพนักงานประจำรถขยะ/,
  );
  assert.match(
    body,
    /กรุณาพิมพ์รหัสพนักงาน/,
  );
});

test("staff guest exposes only identity action before verification", () => {
  const actions = catalog.driverGuest();
  assert.deepEqual(
    actions.map((action) => action.data),
    ["waste=driver_link"],
  );
});

test("driver edge states have distinct replies and global DRIVER recovery uses Flex card", () => {
  const line = fs.readFileSync(
    new URL("../src/modules/line/wasteLine.js", import.meta.url),
    "utf8",
  );
  const bot = fs.readFileSync(
    new URL("../src/modules/line/lineBot.js", import.meta.url),
    "utf8",
  );

  assert.match(line, /เส้นทางนี้ยังไม่มีจุดเก็บขยะ/);
  assert.match(line, /ยืนยันจุดเก็บขยะครบแล้ว/);
  assert.doesNotMatch(
    line,
    /ยืนยันจุดเก็บครบแล้ว หรือเส้นทางนี้ยังไม่มีจุดเก็บ/,
  );

  assert.match(
    line,
    /ไม่ได้อยู่ในสถานะประกาศ จึงไม่มีการส่งแจ้งเตือน/,
  );
  assert.match(
    line,
    /ไม่พบผู้ใช้บริการที่เชื่อม LINE/,
  );
  assert.match(
    line,
    /ถูกจัดคิวแจ้งประชาชนไว้แล้ว/,
  );
  assert.match(
    line,
    /ระบบจัดคิวแจ้งสถานะเสร็จสิ้นให้ประชาชน/,
  );

  assert.match(bot, /buildWasteLineTextCard/);
  assert.match(bot, /const recoveryMessage/);
  assert.match(bot, /channel\.kind === "DRIVER"/);
});
test("driver work is visible only after publication", async () => {
  const source = fs.readFileSync(
    new URL(
      "../src/modules/line/wasteLine.js",
      import.meta.url,
    ),
    "utf8",
  );

  const publishedGuards = source.match(
    /p\.publication_status\s*=\s*'PUBLISHED'/g,
  ) || [];

  assert.ok(
    publishedGuards.length >= 3,
    "driver jobs, plan details, and driver actions must require PUBLISHED",
  );

  assert.match(
    source,
    /WHERE p\.driver_id = \?[\s\S]*?p\.publication_status = 'PUBLISHED'[\s\S]*?p\.status <> 'CANCELLED'/u,
  );

  assert.match(
    source,
    /WHERE p\.id = \?[\s\S]*?p\.driver_id = \?[\s\S]*?p\.publication_status = 'PUBLISHED'[\s\S]*?p\.status IN/u,
  );
});