import { DomainRuleViolation } from "../../../domain/common/errors/DomainRuleViolation.js";

const VEHICLE_STATUSES = Object.freeze([
  "AVAILABLE",
  "IN_SERVICE",
  "MAINTENANCE",
  "OUT_OF_SERVICE",
]);

export class WasteVehicle {
  #status;

  constructor({
    id = null,
    vehicleCode,
    registrationNo,
    vehicleType,
    capacityKg = null,
    status = "AVAILABLE",
    note = null,
    lastLatitude = null,
    lastLongitude = null,
    lastGpsAt = null,
  }) {
    this.id = id;
    this.vehicleCode = vehicleCode;
    this.registrationNo = registrationNo;
    this.vehicleType = vehicleType;
    this.capacityKg =
      capacityKg == null ? null : Number(capacityKg);
    this.note = note;
    this.lastLatitude = lastLatitude;
    this.lastLongitude = lastLongitude;
    this.lastGpsAt = lastGpsAt;

    this.changeStatusTo(status);
  }

  get status() {
    return this.#status;
  }

  changeStatusTo(status) {
    if (!VEHICLE_STATUSES.includes(status)) {
      throw new DomainRuleViolation(
        "WASTE_VEHICLE_STATUS_INVALID",
        "สถานะรถเก็บขยะไม่ถูกต้อง",
        { status: 422 },
      );
    }

    this.#status = status;
    return this;
  }

  update(changes = {}) {
    if ("vehicleCode" in changes) {
      this.vehicleCode = changes.vehicleCode;
    }

    if ("registrationNo" in changes) {
      this.registrationNo = changes.registrationNo;
    }

    if ("vehicleType" in changes) {
      this.vehicleType = changes.vehicleType;
    }

    if ("capacityKg" in changes) {
      this.capacityKg =
        changes.capacityKg == null
          ? null
          : Number(changes.capacityKg);
    }

    if ("note" in changes) {
      this.note = changes.note;
    }

    if ("status" in changes) {
      this.changeStatusTo(changes.status);
    }

    return this;
  }

  assertDeletable(usageCount) {
    if (Number(usageCount || 0) > 0) {
      throw new DomainRuleViolation(
        "WASTE_VEHICLE_HAS_HISTORY",
        "รถคันนี้มีประวัติการใช้งานแล้ว กรุณาเปลี่ยนสถานะเป็นงดใช้งานแทนการลบ",
        { status: 409 },
      );
    }

    return this;
  }

  toObject() {
    return {
      id: this.id,
      vehicleCode: this.vehicleCode,
      registrationNo: this.registrationNo,
      vehicleType: this.vehicleType,
      capacityKg: this.capacityKg,
      status: this.#status,
      lastLatitude: this.lastLatitude,
      lastLongitude: this.lastLongitude,
      lastGpsAt: this.lastGpsAt,
      note: this.note,
    };
  }
}