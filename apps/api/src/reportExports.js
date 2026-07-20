import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import { strToU8, zipSync } from "fflate";

const fontPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../assets/fonts/Sarabun-Regular.ttf");

function xmlEscape(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function cell(value, reference, style = 0) {
  if (typeof value === "number") return `<c r="${reference}" s="${style}"><v>${value}</v></c>`;
  return `<c r="${reference}" t="inlineStr" s="${style}"><is><t>${xmlEscape(value)}</t></is></c>`;
}

function columnName(index) {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

export function createTabularReportXlsx({ title, sheetName, headers, rows }, metadata) {
  const reportRows = [[title], [`ข้อมูล ณ วันที่ ${metadata.cutoffLabel}`], [], headers, ...rows];
  const sheetRows = reportRows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => cell(value, `${columnName(columnIndex)}${rowIndex + 1}`, rowIndex === 3 ? 1 : 0)).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  const lastColumn = columnName(Math.max(0, headers.length - 1));
  const widths = headers.map((header, index) => `<col min="${index + 1}" max="${index + 1}" width="${Math.min(36, Math.max(12, String(header).length * 2 + 4))}" customWidth="1"/>`).join("");
  const files = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEscape(String(sheetName).slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Sarabun"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Sarabun"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0B6847"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0" fillId="0"/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`,
    "xl/worksheets/sheet1.xml": `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths}</cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A4:${lastColumn}${reportRows.length}"/></worksheet>`,
  };
  return Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([name, content]) => [name, strToU8(content)])), { level: 6 }));
}

export function createTabularReportPdf({ title, headers, rows }, metadata) {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: "A4", layout: "landscape", margin: 30, info: { Title: title, Author: "เทศบาลท่าโพธ์" } });
    const chunks = [];
    document.on("data", (chunk) => chunks.push(chunk)); document.on("end", () => resolve(Buffer.concat(chunks))); document.on("error", reject);
    document.registerFont("Sarabun", fontPath).font("Sarabun");
    const tableWidth = 782;
    const width = tableWidth / headers.length;
    const drawHeader = () => {
      document.fillColor("#17352b").fontSize(16).text(title, 30, 25);
      document.fillColor("#687e76").fontSize(9).text(`ข้อมูล ณ วันที่ ${metadata.cutoffLabel}`, 30, 48);
      document.rect(30, 70, tableWidth, 28).fill("#0b6847"); document.fillColor("#fff").fontSize(8);
      headers.forEach((header, index) => document.text(String(header), 34 + width * index, 78, { width: width - 8, align: "left" }));
    };
    drawHeader(); let y = 98;
    rows.forEach((row, rowIndex) => {
      if (y > 535) { document.addPage(); drawHeader(); y = 98; }
      document.rect(30, y, tableWidth, 25).fill(rowIndex % 2 ? "#f5f8f6" : "#fff"); document.fillColor("#29463c").fontSize(7.5);
      row.forEach((value, index) => document.text(String(value ?? ""), 34 + width * index, y + 7, { width: width - 8, height: 14, ellipsis: true }));
      y += 25;
    });
    document.end();
  });
}

export function createVillageReportXlsx(rows, metadata) {
  const headers = ["หมู่", "ชื่อหมู่บ้าน", "สัตว์ทั้งหมด", "สุนัข", "แมว", "ฉีดวัคซีน", "ทำหมัน", "คำขอรอตรวจ", "เหตุเปิดอยู่"];
  const values = rows.map((row) => [
    Number(row.villageNo), row.villageName, Number(row.totalPets), Number(row.dogs), Number(row.cats),
    Number(row.vaccinated), Number(row.sterilized), Number(row.pending), Number(row.openCases),
  ]);
  const reportRows = [
    ["PRMS-TSM รายงานทะเบียนสัตว์ เทศบาลท่าโพธ์"],
    [`ข้อมูล ณ วันที่ ${metadata.cutoffLabel}`],
    [],
    headers,
    ...values,
  ];
  const sheetRows = reportRows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => cell(value, `${String.fromCharCode(65 + columnIndex)}${rowIndex + 1}`, rowIndex === 3 ? 1 : 0)).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  const files = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="รายงานรายหมู่บ้าน" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Sarabun"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Sarabun"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0B6847"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0" fillId="0"/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`,
    "xl/worksheets/sheet1.xml": `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="10" customWidth="1"/><col min="2" max="2" width="28" customWidth="1"/><col min="3" max="9" width="15" customWidth="1"/></cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A4:I${reportRows.length}"/></worksheet>`,
  };
  return Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([name, content]) => [name, strToU8(content)])), { level: 6 }));
}

export function createVillageReportPdf(rows, metadata) {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: "A4", layout: "landscape", margin: 34, info: { Title: "PRMS-TSM รายงานทะเบียนสัตว์", Author: "เทศบาลท่าโพธ์" } });
    const chunks = [];
    document.on("data", (chunk) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
    document.registerFont("Sarabun", fontPath).font("Sarabun");

    const columns = [34, 74, 250, 335, 405, 470, 545, 615, 685];
    const widths = [35, 170, 80, 65, 60, 70, 65, 65, 70];
    const labels = ["หมู่", "ชื่อหมู่บ้าน", "ทั้งหมด", "สุนัข", "แมว", "วัคซีน", "ทำหมัน", "รอตรวจ", "เหตุเปิด"];
    const drawHeader = () => {
      document.fillColor("#17352b").fontSize(18).text("PRMS-TSM รายงานทะเบียนสัตว์ เทศบาลท่าโพธ์", 34, 28);
      document.fillColor("#687e76").fontSize(10).text(`ข้อมูล ณ วันที่ ${metadata.cutoffLabel}`, 34, 53);
      document.rect(34, 78, 726, 27).fill("#0b6847");
      document.fillColor("#ffffff").fontSize(10);
      labels.forEach((label, index) => document.text(label, columns[index] + 4, 86, { width: widths[index] - 8, align: index > 1 ? "right" : "left" }));
    };
    drawHeader();
    let y = 105;
    rows.forEach((row, rowIndex) => {
      if (y > 535) { document.addPage(); drawHeader(); y = 105; }
      document.rect(34, y, 726, 25).fill(rowIndex % 2 ? "#f5f8f6" : "#ffffff");
      const values = [row.villageNo, row.villageName, row.totalPets, row.dogs, row.cats, row.vaccinated, row.sterilized, row.pending, row.openCases];
      document.fillColor("#29463c").fontSize(9);
      values.forEach((value, index) => document.text(String(value ?? 0), columns[index] + 4, y + 7, { width: widths[index] - 8, align: index > 1 ? "right" : "left" }));
      y += 25;
    });
    document.fillColor("#687e76").fontSize(8).text("แสดงเฉพาะสัตว์ที่คำขอได้รับอนุมัติแล้ว", 34, y + 14);
    document.end();
  });
}
