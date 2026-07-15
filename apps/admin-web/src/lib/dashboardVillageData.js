import { THA_PHO_VILLAGES } from "./thaPhoVillageMapData.js";

const ACTIVE_REGISTRATION_STATUSES = new Set([
  "SUBMITTED",
  "UNDER_REVIEW",
  "NEED_MORE_INFO",
]);

const ACTIVE_CASE_STATUSES = new Set([
  "RECEIVED",
  "ASSIGNED",
  "IN_PROGRESS",
]);

export const DASHBOARD_METRICS = Object.freeze({
  total: Object.freeze({
    id: "total",
    label: "จำนวนสัตว์",
    detail: "สัตว์ขึ้นทะเบียนทั้งหมด",
    unit: "ตัว",
    icon: "●",
  }),
  vaccination: Object.freeze({
    id: "vaccination",
    label: "ความครอบคลุมวัคซีน",
    detail: "สัดส่วนสัตว์ที่มีประวัติวัคซีนภายใน 1 ปี",
    unit: "%",
    icon: "+",
  }),
  sterilization: Object.freeze({
    id: "sterilization",
    label: "ความครอบคลุมทำหมัน",
    detail: "สัดส่วนสัตว์ที่มีประวัติการทำหมัน",
    unit: "%",
    icon: "◇",
  }),
  pending: Object.freeze({
    id: "pending",
    label: "คำขอรอตรวจ",
    detail: "คำขอที่ยังต้องดำเนินการ",
    unit: "คำขอ",
    icon: "⌁",
  }),
  cases: Object.freeze({
    id: "cases",
    label: "เหตุที่กำลังดำเนินการ",
    detail: "เหตุแจ้งที่ยังไม่ปิดงาน",
    unit: "เหตุ",
    icon: "!",
  }),
});

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function groupByVillage(rows = []) {
  const grouped = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const villageNo = toNumber(row?.villageNo);
    if (!villageNo) continue;
    const current = grouped.get(villageNo) || [];
    current.push(row);
    grouped.set(villageNo, current);
  }

  return grouped;
}

export function getCoverage(numerator, denominator) {
  const total = toNumber(denominator);
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((toNumber(numerator) * 100) / total)));
}

export function buildVillageRows({ villages = [], items = [], requests = [], cases = [] } = {}) {
  const reportByVillage = new Map(
    (Array.isArray(villages) ? villages : []).map((row) => [toNumber(row?.villageNo), row]),
  );
  const petsByVillage = groupByVillage(items);
  const requestsByVillage = groupByVillage(requests);
  const casesByVillage = groupByVillage(cases);

  return THA_PHO_VILLAGES.map((shape) => {
    const report = reportByVillage.get(shape.id) || {};
    const pets = petsByVillage.get(shape.id) || [];
    const villageRequests = requestsByVillage.get(shape.id) || [];
    const villageCases = casesByVillage.get(shape.id) || [];

    const totalPets = toNumber(report.totalPets) || pets.length;
    const dogs = toNumber(report.dogs) || pets.filter((item) => item?.species === "DOG").length;
    const cats = toNumber(report.cats) || pets.filter((item) => item?.species === "CAT").length;
    const vaccinated = toNumber(report.vaccinated) || pets.filter((item) => Boolean(item?.vaccinated)).length;
    const sterilized = toNumber(report.sterilized) || pets.filter((item) => Boolean(item?.sterilized)).length;
    const pending = villageRequests.filter((item) => ACTIVE_REGISTRATION_STATUSES.has(item?.status)).length;
    const openCases = villageCases.filter((item) => ACTIVE_CASE_STATUSES.has(item?.status)).length;

    return {
      ...shape,
      villageName: report.villageName || shape.name,
      totalPets,
      dogs,
      cats,
      vaccinated,
      sterilized,
      vaccinationCoverage: getCoverage(vaccinated, totalPets),
      sterilizationCoverage: getCoverage(sterilized, totalPets),
      pending,
      openCases,
      pets,
      requests: villageRequests,
      cases: villageCases,
    };
  });
}

export function getMetricValue(row, metric = "total") {
  if (!row) return 0;

  switch (metric) {
    case "vaccination":
      return toNumber(row.vaccinationCoverage);
    case "sterilization":
      return toNumber(row.sterilizationCoverage);
    case "pending":
      return toNumber(row.pending);
    case "cases":
      return toNumber(row.openCases);
    case "total":
    default:
      return toNumber(row.totalPets);
  }
}

export function getMetricMaximum(rows = [], metric = "total") {
  if (metric === "vaccination" || metric === "sterilization") return 100;
  return Math.max(1, ...rows.map((row) => getMetricValue(row, metric)));
}

export function formatMetricValue(row, metric = "total") {
  const value = getMetricValue(row, metric);
  const unit = DASHBOARD_METRICS[metric]?.unit || "";
  return unit === "%" ? `${value}%` : `${value.toLocaleString("th-TH")} ${unit}`;
}

export function summarizeVillageRows(rows = []) {
  const summary = rows.reduce(
    (result, row) => ({
      totalPets: result.totalPets + toNumber(row.totalPets),
      dogs: result.dogs + toNumber(row.dogs),
      cats: result.cats + toNumber(row.cats),
      vaccinated: result.vaccinated + toNumber(row.vaccinated),
      sterilized: result.sterilized + toNumber(row.sterilized),
      pending: result.pending + toNumber(row.pending),
      openCases: result.openCases + toNumber(row.openCases),
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
      openCases: 0,
      pets: [],
    },
  );

  return {
    ...summary,
    vaccinationCoverage: getCoverage(summary.vaccinated, summary.totalPets),
    sterilizationCoverage: getCoverage(summary.sterilized, summary.totalPets),
  };
}
