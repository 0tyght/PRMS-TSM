const EPSILON = 1e-12;

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function coordinatesFromGeometry(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return geometry.coordinates || [];
  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates || []).flat();
  }
  return [];
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
  if (dot < 0) return false;
  return dot <= squaredLength;
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
      .filter(([villageNo]) => Number.isInteger(villageNo) && villageNo > 0),
  );
}

export function findVillageForPoint(point, featureCollection) {
  const features = Array.isArray(featureCollection?.features) ? featureCollection.features : [];
  const feature = features.find((item) => pointInGeometry(point, item?.geometry));
  return feature ? Number(feature.properties?.villageNo) : null;
}

function getBounds(feature) {
  const points = coordinatesFromGeometry(feature?.geometry).flat();
  if (!points.length) return null;

  return points.reduce(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point[0]),
      minY: Math.min(bounds.minY, point[1]),
      maxX: Math.max(bounds.maxX, point[0]),
      maxY: Math.max(bounds.maxY, point[1]),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
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

const interiorPointCache = new WeakMap();

function buildInteriorPointPool(feature) {
  if (!feature) return [];
  const cached = interiorPointCache.get(feature);
  if (cached) return cached;

  const bounds = getBounds(feature);
  if (!bounds) return [];

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

  if (!points.length && largestOuterRing.length) {
    const point = largestOuterRing[Math.floor(largestOuterRing.length / 2)];
    if (point) points.push(point);
  }

  interiorPointCache.set(feature, points);
  return points;
}

function isValidCoordinate(latitude, longitude) {
  return latitude !== null
    && longitude !== null
    && latitude !== 0
    && longitude !== 0
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180;
}

function normalizeVillageNo(value, villageIndex) {
  const villageNo = Number(value);
  return villageIndex.has(villageNo) ? villageNo : null;
}

function coordinateStatusLabel(status) {
  switch (status) {
    case "verified": return "พิกัดตรงกับหมู่ตามทะเบียน";
    case "inferred": return "ระบุหมู่จากพิกัดจริง";
    case "mismatch": return "พิกัดจริงไม่ตรงกับหมู่ในทะเบียน";
    default: return "พิกัดไม่พร้อมแสดงผล";
  }
}

/**
 * ตรวจพิกัดจริงจากฐานข้อมูลกับ Polygon หมู่บ้าน
 * - ไม่สร้างพิกัดจำลอง
 * - ไม่ย้ายพิกัดให้อยู่ในหมู่ตามทะเบียน
 * - จุดที่ไม่มีพิกัดหรืออยู่นอกเขตทั้งหมดจะไม่ถูกแสดงบนแผนที่
 * - หากพิกัดอยู่คนละหมู่กับทะเบียน จะใช้ตำแหน่งจริงบนแผนที่และติดสถานะ mismatch
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
    skipped: 0,
  };
  const pets = [];

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const rowVillageNo = normalizeVillageNo(row?.id ?? row?.villageNo, villageIndex);
    const rowPets = Array.isArray(row?.pets) ? row.pets : [];

    rowPets.forEach((pet) => {
      diagnostics.sourcePets += 1;

      const latitude = toNumber(pet?.latitude);
      const longitude = toNumber(pet?.longitude);
      if (!isValidCoordinate(latitude, longitude)) {
        diagnostics.missingCoordinates += 1;
        diagnostics.skipped += 1;
        return;
      }

      const coordinate = [longitude, latitude];
      const coordinateVillageNo = findVillageForPoint(coordinate, featureCollection);
      if (!coordinateVillageNo) {
        diagnostics.outsideBoundary += 1;
        diagnostics.skipped += 1;
        return;
      }

      const registeredVillageNo = normalizeVillageNo(pet?.villageNo, villageIndex) || rowVillageNo;
      let coordinateStatus = "verified";

      if (!registeredVillageNo) {
        coordinateStatus = "inferred";
      } else if (registeredVillageNo !== coordinateVillageNo) {
        coordinateStatus = "mismatch";
      }

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

export function getVillageLabelPoint(feature) {
  const points = buildInteriorPointPool(feature);
  return points[0] || null;
}

export function isPointInsideVillage(latitude, longitude, villageNo, featureCollection) {
  const feature = createVillageIndex(featureCollection).get(Number(villageNo));
  return Boolean(feature && pointInGeometry([Number(longitude), Number(latitude)], feature.geometry));
}
