export const ORGANIZATION = Object.freeze({
  shortName: "เทศบาลท่าโพธ์",
  systemName: "ระบบขึ้นทะเบียนและบริหารจัดการข้อมูลสุนัขและแมว",
  productName: "PRMS-TSM",
});

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
