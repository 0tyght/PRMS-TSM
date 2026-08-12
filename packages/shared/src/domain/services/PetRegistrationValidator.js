import { ThaiPhoneNumber } from "../value-objects/ThaiPhoneNumber.js";

export class PetRegistrationValidator {
  constructor({ supportedSpecies }) {
    this.supportedSpecies = new Set(supportedSpecies);
  }

  validate(input = {}) {
    const errors = {};
    if (!String(input.ownerName || "").trim()) errors.ownerName = "กรุณาระบุชื่อเจ้าของสัตว์";
    if (!ThaiPhoneNumber.isValid(input.phone)) errors.phone = "กรุณาระบุหมายเลขโทรศัพท์ 10 หลัก";
    if (!String(input.houseNo || "").trim()) errors.houseNo = "กรุณาระบุเลขที่บ้าน";
    if (!String(input.villageId || "").trim()) errors.villageId = "กรุณาเลือกหมู่บ้าน";
    if (!String(input.petName || "").trim()) errors.petName = "กรุณาระบุชื่อสัตว์";
    if (!this.supportedSpecies.has(input.species)) errors.species = "กรุณาเลือกชนิดสัตว์";
    return Object.freeze({ valid: Object.keys(errors).length === 0, errors: Object.freeze(errors) });
  }
}

