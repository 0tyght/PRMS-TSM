import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../apps/api/src/db.js";
import {
  getStableInteriorPointForVillage,
  isPointInsideVillage,
} from "../apps/admin-web/src/lib/geoVillageUtils.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const geoJsonPath = path.resolve(
  scriptDirectory,
  "../apps/admin-web/src/assets/maps/tha-pho-villages.geojson",
);
const applyChanges = process.argv.includes("--apply");

const geoJson = JSON.parse(await fs.readFile(geoJsonPath, "utf8"));
const [households] = await pool.query(`
  SELECT
    h.id,
    h.house_no AS houseNo,
    h.latitude,
    h.longitude,
    v.village_no AS villageNo
  FROM households h
  INNER JOIN villages v
    ON v.id = h.village_id
  WHERE h.deleted_at IS NULL
  ORDER BY v.village_no, h.house_no, h.id
`);

const changes = [];
const valid = [];
const skipped = [];

for (const household of households) {
  const villageNo = Number(household.villageNo);
  const latitude = Number(household.latitude);
  const longitude = Number(household.longitude);
  const hasCoordinate = Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude !== 0
    && longitude !== 0;
  const insideVillage = hasCoordinate
    && isPointInsideVillage(latitude, longitude, villageNo, geoJson);

  if (insideVillage) {
    valid.push(household);
    continue;
  }

  const point = getStableInteriorPointForVillage(
    villageNo,
    household.id || `${household.houseNo || "บ้าน"}-${villageNo}`,
    geoJson,
  );

  if (!point) {
    skipped.push(household);
    continue;
  }

  changes.push({
    id: household.id,
    houseNo: household.houseNo,
    villageNo,
    oldLatitude: household.latitude,
    oldLongitude: household.longitude,
    latitude: Number(point[1].toFixed(7)),
    longitude: Number(point[0].toFixed(7)),
  });
}

console.table(changes.map((item) => ({
  บ้าน: item.houseNo || "-",
  หมู่: item.villageNo,
  เดิม: `${item.oldLatitude ?? "NULL"}, ${item.oldLongitude ?? "NULL"}`,
  ใหม่: `${item.latitude}, ${item.longitude}`,
})));

console.log(`พิกัดถูกต้องอยู่แล้ว: ${valid.length} หลังคาเรือน`);
console.log(`ต้องปรับพิกัด: ${changes.length} หลังคาเรือน`);
console.log(`ข้ามเพราะไม่พบ Polygon: ${skipped.length} หลังคาเรือน`);

if (!applyChanges) {
  console.log("\nยังไม่ได้แก้ฐานข้อมูล นี่คือโหมดตรวจสอบเท่านั้น");
  console.log("ใช้คำสั่ง node scripts/fix-demo-map-coordinates.mjs --apply เมื่อต้องการบันทึกข้อมูลจำลอง");
  await pool.end();
  process.exit(0);
}

const connection = await pool.getConnection();
try {
  await connection.beginTransaction();
  for (const item of changes) {
    await connection.execute(
      `
        UPDATE households
        SET latitude = ?,
            longitude = ?
        WHERE id = ?
      `,
      [item.latitude, item.longitude, item.id],
    );
  }
  await connection.commit();
  console.log(`\nบันทึกพิกัดข้อมูลจำลองแล้ว ${changes.length} หลังคาเรือน`);
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  connection.release();
  await pool.end();
}
