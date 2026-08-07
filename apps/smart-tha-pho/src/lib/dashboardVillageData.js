const ACTIVE_REGISTRATION_STATUSES = new Set([
  "SUBMITTED",
  "UNDER_REVIEW",
  "NEED_MORE_INFO",
]);

export const THA_PHO_VILLAGES = Object.freeze(
  Array.from({ length: 11 }, (_, index) => Object.freeze({
    id: index + 1,
    name: `หมู่ที่ ${index + 1}`,
  })),
);

export const DASHBOARD_METRICS = Object.freeze({
  total: Object.freeze({ id: "total", label: "จำนวนสัตว์เลี้ยง", unit: "ตัว" }),
  vaccination: Object.freeze({ id: "vaccination", label: "ความครอบคลุมวัคซีน", unit: "%" }),
  sterilization: Object.freeze({ id: "sterilization", label: "ความครอบคลุมทำหมัน", unit: "%" }),
  pending: Object.freeze({ id: "pending", label: "ข้อมูลรอตรวจสอบ", unit: "รายการ" }),
});

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeVillageNo(value) {
  const villageNo = Number(value);
  return Number.isInteger(villageNo) && villageNo >= 1 && villageNo <= 11
    ? villageNo
    : null;
}

function hasField(object, field) {
  return Boolean(object && Object.prototype.hasOwnProperty.call(object, field));
}

function groupByVillage(rows = []) {
  const grouped = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const villageNo = normalizeVillageNo(row?.villageNo);
    if (!villageNo) continue;
    const current = grouped.get(villageNo) || [];
    current.push({ ...row, villageNo });
    grouped.set(villageNo, current);
  }

  return grouped;
}

export function getCoverage(numerator, denominator) {
  const total = toNumber(denominator);
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((toNumber(numerator) * 100) / total)));
}

/**
 * สถิติรายหมู่ใช้ endpoint รายงานเป็นแหล่งหลัก
 * รายการ map ใช้เฉพาะสำหรับหมุดและรายละเอียด ไม่เอามาปั้นยอดทับรายงานที่มีค่า 0 จริง
 */
export function buildVillageRows({ villages = [], items = [], requests = [] } = {}) {
  const reportByVillage = new Map(
    (Array.isArray(villages) ? villages : [])
      .map((row) => [normalizeVillageNo(row?.villageNo), row])
      .filter(([villageNo]) => villageNo),
  );
  const petsByVillage = groupByVillage(items);
  const requestsByVillage = groupByVillage(requests);

  return THA_PHO_VILLAGES.map((village) => {
    const report = reportByVillage.get(village.id) || null;
    const pets = petsByVillage.get(village.id) || [];
    const villageRequests = requestsByVillage.get(village.id) || [];

    const totalPets = hasField(report, "totalPets") ? toNumber(report.totalPets) : pets.length;
    const dogs = hasField(report, "dogs")
      ? toNumber(report.dogs)
      : pets.filter((item) => item?.species === "DOG").length;
    const cats = hasField(report, "cats")
      ? toNumber(report.cats)
      : pets.filter((item) => item?.species === "CAT").length;
    const vaccinated = hasField(report, "vaccinated")
      ? toNumber(report.vaccinated)
      : pets.filter((item) => Boolean(item?.vaccinated)).length;
    const sterilized = hasField(report, "sterilized")
      ? toNumber(report.sterilized)
      : pets.filter((item) => Boolean(item?.sterilized)).length;
    const pending = hasField(report, "pending")
      ? toNumber(report.pending)
      : villageRequests.filter((item) => ACTIVE_REGISTRATION_STATUSES.has(item?.status)).length;

    return {
      ...village,
      villageNo: village.id,
      villageName: report?.villageName || village.name,
      totalPets,
      dogs,
      cats,
      vaccinated,
      sterilized,
      vaccinationCoverage: getCoverage(vaccinated, totalPets),
      sterilizationCoverage: getCoverage(sterilized, totalPets),
      pending,
      pets,
      requests: villageRequests,
      mapRecordCount: pets.length,
      missingMapRecordCount: Math.max(0, totalPets - pets.length),
    };
  });
}

export function getMetricValue(row, metric = "total") {
  if (!row) return 0;

  switch (metric) {
    case "vaccination": return toNumber(row.vaccinationCoverage);
    case "sterilization": return toNumber(row.sterilizationCoverage);
    case "pending": return toNumber(row.pending);
    case "total":
    default: return toNumber(row.totalPets);
  }
}

export function formatMetricValue(row, metric = "total") {
  const value = getMetricValue(row, metric);
  const unit = DASHBOARD_METRICS[metric]?.unit || "";
  return unit === "%" ? `${value}%` : `${value.toLocaleString("th-TH")} ${unit}`;
}

export function summarizeVillageRows(rows = []) {
  const summary = (Array.isArray(rows) ? rows : []).reduce(
    (result, row) => ({
      ...result,
      totalPets: result.totalPets + toNumber(row.totalPets),
      dogs: result.dogs + toNumber(row.dogs),
      cats: result.cats + toNumber(row.cats),
      vaccinated: result.vaccinated + toNumber(row.vaccinated),
      sterilized: result.sterilized + toNumber(row.sterilized),
      pending: result.pending + toNumber(row.pending),
      mapRecordCount: result.mapRecordCount + toNumber(row.mapRecordCount),
      missingMapRecordCount: result.missingMapRecordCount + toNumber(row.missingMapRecordCount),
      pets: result.pets.concat(row.pets || []),
    }),
    {
      id: null,
      name: "ทุกหมู่บ้าน",
      villageName: "ภาพรวมเทศบาลท่าโพธ์",
      totalPets: 0,
      dogs: 0,
      cats: 0,
      vaccinated: 0,
      sterilized: 0,
      pending: 0,
      mapRecordCount: 0,
      missingMapRecordCount: 0,
      pets: [],
    },
  );

  return {
    ...summary,
    vaccinationCoverage: getCoverage(summary.vaccinated, summary.totalPets),
    sterilizationCoverage: getCoverage(summary.sterilized, summary.totalPets),
  };
}
