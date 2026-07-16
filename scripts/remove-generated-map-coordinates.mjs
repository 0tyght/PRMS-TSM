import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../apps/api/src/db.js";

const EPSILON = 1e-12;
const TOLERANCE = 0.00000011;
const applyChanges = process.argv.includes("--apply");
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const geoJsonPath = path.resolve(
  scriptDirectory,
  "../apps/admin-web/src/assets/maps/tha-pho-villages.geojson",
);
const geoJson = JSON.parse(await fs.readFile(geoJsonPath, "utf8"));

function pointOnSegment(point, start, end) {
  const [x, y] = point;
  const [x1, y1] = start;
  const [x2, y2] = end;
  const cross = (y - y1) * (x2 - x1) - (x - x1) * (y2 - y1);
  if (Math.abs(cross) > EPSILON) return false;
  const squaredLength = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (squaredLength < EPSILON) return Math.abs(x - x1) < EPSILON && Math.abs(y - y1) < EPSILON;
  const dot = (x - x1) * (x2 - x1) + (y - y1) * (y2 - y1);
  return dot >= 0 && dot <= squaredLength;
}

function pointInRing(point, ring = []) {
  if (!Array.isArray(ring) || ring.length < 3) return false;
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const current = ring[index];
    const prior = ring[previous];
    if (pointOnSegment(point, prior, current)) return true;
    const [x, y] = point;
    const [xi, yi] = current;
    const [xj, yj] = prior;
    const intersects = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || EPSILON) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point, rings = []) {
  if (!rings.length || !pointInRing(point, rings[0])) return false;
  for (let index = 1; index < rings.length; index += 1) {
    if (pointInRing(point, rings[index])) return false;
  }
  return true;
}

function pointInGeometry(point, geometry) {
  if (geometry?.type === "Polygon") return pointInPolygon(point, geometry.coordinates || []);
  if (geometry?.type === "MultiPolygon") {
    return (geometry.coordinates || []).some((polygon) => pointInPolygon(point, polygon));
  }
  return false;
}

function flattenGeometry(geometry) {
  if (geometry?.type === "Polygon") return geometry.coordinates || [];
  if (geometry?.type === "MultiPolygon") return (geometry.coordinates || []).flat();
  return [];
}

function getBounds(feature) {
  const points = flattenGeometry(feature?.geometry).flat();
  return points.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, point[0]),
    minY: Math.min(bounds.minY, point[1]),
    maxX: Math.max(bounds.maxX, point[0]),
    maxY: Math.max(bounds.maxY, point[1]),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
}

function polygonCentroid(ring = []) {
  if (ring.length < 3) return null;
  let signedArea = 0;
  let centroidX = 0;
  let centroidY = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x0, y0] = ring[index];
    const [x1, y1] = ring[index + 1];
    const cross = x0 * y1 - x1 * y0;
    signedArea += cross;
    centroidX += (x0 + x1) * cross;
    centroidY += (y0 + y1) * cross;
  }
  signedArea *= 0.5;
  if (Math.abs(signedArea) < EPSILON) return null;
  return [centroidX / (6 * signedArea), centroidY / (6 * signedArea)];
}

function halton(index, base) {
  let result = 0;
  let fraction = 1 / base;
  let value = index;
  while (value > 0) {
    result += fraction * (value % base);
    value = Math.floor(value / base);
    fraction /= base;
  }
  return result;
}

function buildInteriorPointPool(feature) {
  const bounds = getBounds(feature);
  if (!Number.isFinite(bounds.minX)) return [];
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const points = [];
  const polygons = feature.geometry?.type === "Polygon"
    ? [feature.geometry.coordinates]
    : feature.geometry?.coordinates || [];
  const largestOuterRing = polygons
    .map((polygon) => polygon?.[0] || [])
    .sort((first, second) => second.length - first.length)[0] || [];
  const centroid = polygonCentroid(largestOuterRing);
  if (centroid && pointInGeometry(centroid, feature.geometry)) points.push(centroid);

  for (let index = 1; index <= 1400 && points.length < 280; index += 1) {
    const point = [
      bounds.minX + width * (0.035 + halton(index, 2) * 0.93),
      bounds.minY + height * (0.035 + halton(index, 3) * 0.93),
    ];
    if (pointInGeometry(point, feature.geometry)) points.push(point);
  }
  return points;
}

function stableHash(value) {
  const text = String(value ?? "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const villageIndex = new Map(
  geoJson.features.map((feature) => [Number(feature.properties?.villageNo), feature]),
);

function oldGeneratedPoint(villageNo, key) {
  const feature = villageIndex.get(Number(villageNo));
  if (!feature) return null;
  const pool = buildInteriorPointPool(feature);
  if (!pool.length) return null;
  return pool[stableHash(`${villageNo}|${key}`) % pool.length];
}

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
    AND h.latitude IS NOT NULL
    AND h.longitude IS NOT NULL
  ORDER BY v.village_no, h.house_no, h.id
`);

const matches = [];
for (const household of households) {
  const expected = oldGeneratedPoint(
    Number(household.villageNo),
    household.id || `${household.houseNo || "บ้าน"}-${household.villageNo}`,
  );
  if (!expected) continue;

  const expectedLatitude = Number(expected[1].toFixed(7));
  const expectedLongitude = Number(expected[0].toFixed(7));
  const currentLatitude = Number(household.latitude);
  const currentLongitude = Number(household.longitude);

  if (
    Math.abs(currentLatitude - expectedLatitude) <= TOLERANCE
    && Math.abs(currentLongitude - expectedLongitude) <= TOLERANCE
  ) {
    matches.push({
      id: household.id,
      houseNo: household.houseNo,
      villageNo: Number(household.villageNo),
      latitude: currentLatitude,
      longitude: currentLongitude,
    });
  }
}

console.table(matches.map((item) => ({
  บ้าน: item.houseNo || "-",
  หมู่: item.villageNo,
  ละติจูด: item.latitude,
  ลองจิจูด: item.longitude,
})));
console.log(`พบพิกัดที่ตรงกับอัลกอริทึมสร้างจุดเดิม: ${matches.length} หลังคาเรือน`);

if (!applyChanges) {
  console.log("ยังไม่ได้แก้ฐานข้อมูล ใช้ --apply หลังตรวจรายการแล้วเท่านั้น");
  await pool.end();
  process.exit(0);
}

if (!matches.length) {
  console.log("ไม่มีพิกัดที่ต้องล้าง");
  await pool.end();
  process.exit(0);
}

const connection = await pool.getConnection();
try {
  await connection.beginTransaction();
  for (const item of matches) {
    await connection.execute(
      `UPDATE households SET latitude = NULL, longitude = NULL WHERE id = ?`,
      [item.id],
    );
  }
  await connection.commit();
  console.log(`ล้างพิกัดที่สร้างจากสคริปต์เดิมแล้ว ${matches.length} หลังคาเรือน`);
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  connection.release();
  await pool.end();
}
