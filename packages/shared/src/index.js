export const ORGANIZATION = Object.freeze({
  shortName: "เทศบาลท่าโพธ์",
  systemName: "ระบบขึ้นทะเบียนและบริหารจัดการข้อมูลสุนัขและแมว",
  productName: "PRMS-TSM",
});

export const PLATFORM = Object.freeze({
  productName: "Smart Tha Pho",
  thaiName: "สมาร์ทท่าโพธ์",
  municipalityName: "เทศบาลท่าโพธ์",
  systemName: "แพลตฟอร์มบริการดิจิทัลเทศบาลท่าโพธ์",
});

export const MUNICIPAL_SYSTEMS = Object.freeze([
  Object.freeze({
    id: "pet",
    productName: "PRMS-TSM",
    name: "ระบบทะเบียนและบริหารจัดการสัตว์เลี้ยง",
    shortName: "ทะเบียนสัตว์เลี้ยง",
    description: "ตรวจสอบการขึ้นทะเบียนสัตว์เลี้ยงและวางแผนบริการสาธารณสุข",
    availability: "ready",
  }),
  Object.freeze({
    id: "waste",
    productName: "Waste Management",
    name: "ระบบบริหารจัดการรถเก็บขยะ",
    shortName: "รถเก็บขยะ",
    description: "ติดตามแผนการเก็บขยะ รถปฏิบัติงาน และการแจ้งเตือนประชาชน",
    availability: "setup",
  }),
  Object.freeze({
    id: "disaster",
    productName: "Disaster Management",
    name: "ระบบบริหารจัดการบรรเทาสาธารณภัย",
    shortName: "บรรเทาสาธารณภัย",
    description: "รับแจ้งเหตุ ประสานกำลัง และติดตามสถานการณ์ฉุกเฉิน",
    availability: "setup",
  }),
  Object.freeze({
    id: "water",
    productName: "Waterworks Management",
    name: "ระบบบริหารจัดการการประปา",
    shortName: "การประปา",
    description: "จัดการผู้ใช้น้ำ มิเตอร์ ค่าบริการ และแจ้งเหตุระบบประปา",
    availability: "setup",
  }),
]);

export function getMunicipalSystem(systemId) {
  return MUNICIPAL_SYSTEMS.find((system) => system.id === systemId) || null;
}

export const SPECIES = Object.freeze({ DOG: "DOG", CAT: "CAT" });
export const SEX = Object.freeze({ MALE: "MALE", FEMALE: "FEMALE", UNKNOWN: "UNKNOWN" });
export const REGISTRATION_STATUS = Object.freeze({
  DRAFT: "DRAFT",
  SUBMITTED: "SUBMITTED",
  UNDER_REVIEW: "UNDER_REVIEW",
  NEED_MORE_INFO: "NEED_MORE_INFO",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
});

export function normalizeThaiPhone(value = "") {
  return String(value).replace(/\D/g, "").slice(0, 10);
}

export function isValidThaiPhone(value) {
  return /^0\d{9}$/.test(normalizeThaiPhone(value));
}

export function validatePetRegistration(input) {
  const errors = {};
  if (!String(input.ownerName || "").trim()) errors.ownerName = "กรุณาระบุชื่อเจ้าของสัตว์";
  if (!isValidThaiPhone(input.phone)) errors.phone = "กรุณาระบุหมายเลขโทรศัพท์ 10 หลัก";
  if (!String(input.houseNo || "").trim()) errors.houseNo = "กรุณาระบุเลขที่บ้าน";
  if (!String(input.villageId || "").trim()) errors.villageId = "กรุณาเลือกหมู่บ้าน";
  if (!String(input.petName || "").trim()) errors.petName = "กรุณาระบุชื่อสัตว์";
  if (!Object.values(SPECIES).includes(input.species)) errors.species = "กรุณาเลือกชนิดสัตว์";
  return { valid: Object.keys(errors).length === 0, errors };
}
