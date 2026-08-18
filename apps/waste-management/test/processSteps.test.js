import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function source(relativePath) {
  return fs.readFileSync(new URL(`../src/${relativePath}`, import.meta.url), "utf8");
}

function assertWorkflow(sourceText, labels) {
  let offset = 0;
  for (const label of labels) {
    const position = sourceText.indexOf(`\"${label}\"`, offset);
    assert.notEqual(position, -1, `missing process step: ${label}`);
    offset = position + label.length;
  }
}

test("waste operation workflows present the approved Process Steps in order", () => {
  assertWorkflow(source("components/RouteOptimizationManager.jsx"), [
    "ตรวจจุดเก็บขยะ",
    "เลือกจุดเริ่มต้น/จุดสิ้นสุด",
    "คำนวณเส้นทาง",
    "ตรวจสอบแผนที่",
    "ยืนยันเส้นทาง",
  ]);

  assertWorkflow(source("pages/ServiceUsersPage.jsx"), [
    "ตรวจสอบพิกัดสถานที่รับบริการ",
    "เลือกเส้นทางเก็บขยะ",
    "คำนวณเส้นทางหลังเพิ่มจุดเก็บขยะ",
    "เปรียบเทียบเส้นทาง",
    "ยืนยันการกำหนดเส้นทาง",
  ]);

  assertWorkflow(source("pages/PlansPage.jsx"), [
    "จัดทำแผน",
    "ตรวจความพร้อม",
    "ประกาศ",
    "ปฏิบัติงาน",
    "เสร็จสิ้น",
  ]);

  assertWorkflow(source("pages/ServiceUsersPage.jsx"), [
    "กรอกข้อมูลผู้ใช้บริการ",
    "ระบุสถานที่รับบริการและพิกัด",
    "ตรวจสอบข้อมูล",
    "บันทึกทะเบียน",
  ]);
});
