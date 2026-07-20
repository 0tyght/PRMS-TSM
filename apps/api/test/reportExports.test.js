import test from "node:test";
import assert from "node:assert/strict";
import { unzipSync } from "fflate";
import { createVillageReportPdf, createVillageReportXlsx } from "../src/reportExports.js";

const rows = [{ villageNo: 1, villageName: "หมู่ที่ 1", totalPets: 12, dogs: 7, cats: 5, vaccinated: 8, sterilized: 4, pending: 2, openCases: 1 }];

test("creates a valid XLSX package with Thai report content", () => {
  const buffer = createVillageReportXlsx(rows, { cutoffLabel: "17 กรกฎาคม 2569" });
  assert.equal(buffer.subarray(0, 2).toString(), "PK");
  const files = unzipSync(buffer);
  assert.ok(files["xl/workbook.xml"]);
  assert.ok(files["xl/worksheets/sheet1.xml"]);
  assert.match(Buffer.from(files["xl/worksheets/sheet1.xml"]).toString("utf8"), /หมู่ที่ 1/);
});

test("creates a PDF with an embedded Thai font", async () => {
  const buffer = await createVillageReportPdf(rows, { cutoffLabel: "17 กรกฎาคม 2569" });
  assert.equal(buffer.subarray(0, 4).toString(), "%PDF");
  assert.ok(buffer.length > 5000);
});
