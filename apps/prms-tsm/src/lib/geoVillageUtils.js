const EPSILON = 1e-12;

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pointOnSegment(point, start, end) {
  const [x, y] = point;
  const [x1, y1] = start;
  const [x2, y2] = end;
  const cross = (y - y1) * (x2 - x1) - (x - x1) * (y2 - y1);
  if (Math.abs(cross) > EPSILON) return false;

  const squaredLength = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (squaredLength < EPSILON) {
    return Math.abs(x - x1) < EPSILON && Math.abs(y - y1) < EPSILON;
  }

  const dot = (x - x1) * (x2 - x1) + (y - y1) * (y2 - y1);
  return dot >= 0 && dot <= squaredLength;
}

function pointInRing(point, ring = []) {
  if (!Array.isArray(ring) || ring.length < 3) return false;
  let inside = false;

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const currentPoint = ring[index];
    const previousPoint = ring[previous];

    if (pointOnSegment(point, previousPoint, currentPoint)) return true;

    const [x, y] = point;
    const [xi, yi] = currentPoint;
    const [xj, yj] = previousPoint;
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

export function pointInGeometry(point, geometry) {
  if (!geometry || !Array.isArray(point)) return false;
  if (geometry.type === "Polygon") return pointInPolygon(point, geometry.coordinates || []);
  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates || []).some((polygon) => pointInPolygon(point, polygon));
  }
  return false;
}

export function createVillageIndex(featureCollection) {
  const features = Array.isArray(featureCollection?.features) ? featureCollection.features : [];
  return new Map(
    features
      .map((feature) => [Number(feature?.properties?.villageNo), feature])
      .filter(([villageNo]) => Number.isInteger(villageNo) && villageNo >= 1 && villageNo <= 11),
  );
}

export function findVillageForPoint(point, featureCollection) {
  const features = Array.isArray(featureCollection?.features) ? featureCollection.features : [];
  const feature = features.find((item) => pointInGeometry(point, item?.geometry));
  return feature ? Number(feature.properties?.villageNo) : null;
}

function normalizeVillageNo(value, villageIndex) {
  const villageNo = Number(value);
  return villageIndex.has(villageNo) ? villageNo : null;
}

function coordinateStatusLabel(status) {
  switch (status) {
    case "verified": return "พิกัดอยู่ในหมู่ตามทะเบียน";
    case "inferred": return "ระบุหมู่จากพิกัดจริง";
    case "mismatch": return "พิกัดไม่ตรงหมู่ในทะเบียน";
    default: return "ไม่พร้อมแสดงบนแผนที่";
  }
}

/**
 * ใช้เฉพาะ latitude/longitude ที่มีอยู่จริงในฐานข้อมูล
 * ไม่สุ่ม ไม่สร้าง ไม่เลื่อน และไม่แก้พิกัดบนฝั่งหน้าเว็บ
 */
export function normalizePetsToVillages(rows = [], featureCollection) {
  const villageIndex = createVillageIndex(featureCollection);
  const diagnostics = {
    sourcePets: 0,
    renderedPets: 0,
    verified: 0,
    inferred: 0,
    villageMismatch: 0,
    missingCoordinates: 0,
    outsideBoundary: 0,
  };
  const pets = [];

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const rowVillageNo = normalizeVillageNo(row?.id ?? row?.villageNo, villageIndex);
    const rowPets = Array.isArray(row?.pets) ? row.pets : [];

    rowPets.forEach((pet) => {
      diagnostics.sourcePets += 1;

      const latitude = toFiniteNumber(pet?.latitude);
      const longitude = toFiniteNumber(pet?.longitude);
      const validRange = latitude !== null
        && longitude !== null
        && latitude !== 0
        && longitude !== 0
        && latitude >= -90
        && latitude <= 90
        && longitude >= -180
        && longitude <= 180;

      if (!validRange) {
        diagnostics.missingCoordinates += 1;
        return;
      }

      const coordinateVillageNo = findVillageForPoint([longitude, latitude], featureCollection);
      if (!coordinateVillageNo) {
        diagnostics.outsideBoundary += 1;
        return;
      }

      const registeredVillageNo = normalizeVillageNo(pet?.villageNo, villageIndex) || rowVillageNo;
      let coordinateStatus = "verified";

      if (!registeredVillageNo) coordinateStatus = "inferred";
      else if (registeredVillageNo !== coordinateVillageNo) coordinateStatus = "mismatch";

      if (coordinateStatus === "mismatch") diagnostics.villageMismatch += 1;
      else diagnostics[coordinateStatus] += 1;
      diagnostics.renderedPets += 1;

      pets.push({
        ...pet,
        latitude,
        longitude,
        villageNo: coordinateVillageNo,
        coordinateVillageNo,
        registeredVillageNo,
        coordinateStatus,
        coordinateStatusLabel: coordinateStatusLabel(coordinateStatus),
      });
    });
  });

  return { pets, diagnostics };
}

export function isPointInsideVillage(latitude, longitude, villageNo, featureCollection) {
  const villageIndex = createVillageIndex(featureCollection);
  const feature = villageIndex.get(Number(villageNo));
  const lat = toFiniteNumber(latitude);
  const lng = toFiniteNumber(longitude);
  return Boolean(feature && lat !== null && lng !== null && pointInGeometry([lng, lat], feature.geometry));
}
