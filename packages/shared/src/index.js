import { MunicipalSystemCatalog } from "./domain/services/MunicipalSystemCatalog.js";
import { PetRegistrationValidator } from "./domain/services/PetRegistrationValidator.js";
import { ThaiPhoneNumber } from "./domain/value-objects/ThaiPhoneNumber.js";

export { MunicipalSystemCatalog, PetRegistrationValidator, ThaiPhoneNumber };

export const ORGANIZATION = Object.freeze({
  shortName: "เทศบาลท่าโพธ์",
  systemName: "ระบบบริหารจัดการทะเบียนสัตว์เลี้ยง",
  productName: "Pet Registration Management",
  systemCode: "PRMS-TSM",
});

export const PLATFORM = Object.freeze({
  productName: "Smart Tha Pho",
  thaiName: "สมาร์ทท่าโพธ์",
  municipalityName: "เทศบาลท่าโพธ์",
  systemName: "แพลตฟอร์มบริการดิจิทัลเทศบาลท่าโพธ์",
});

const SYSTEM_DEFINITIONS = [
  Object.freeze({
    id: "pet",
    productName: "Pet Registration Management",
    systemCode: "PRMS-TSM",
    name: "ระบบบริหารจัดการทะเบียนสัตว์เลี้ยง",
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
    availability: "ready",
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
];

export const municipalSystemCatalog = new MunicipalSystemCatalog(SYSTEM_DEFINITIONS);
export const MUNICIPAL_SYSTEMS = municipalSystemCatalog.list();

export function getMunicipalSystem(systemId) {
  return municipalSystemCatalog.findById(systemId);
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
  return ThaiPhoneNumber.normalize(value);
}

export function isValidThaiPhone(value) {
  return ThaiPhoneNumber.isValid(value);
}

export const petRegistrationValidator = new PetRegistrationValidator({
  supportedSpecies: Object.values(SPECIES),
});

export function validatePetRegistration(input) {
  return petRegistrationValidator.validate(input);
}
