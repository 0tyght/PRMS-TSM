import { DomainRuleViolation } from "../../../domain/common/errors/DomainRuleViolation.js";

export class WastePlanResourcePolicy {
  #resourceOccupyingStatuses;

  constructor({
    resourceOccupyingStatuses = [
      "SCHEDULED",
      "IN_PROGRESS",
      "INTERRUPTED",
    ],
  } = {}) {
    this.#resourceOccupyingStatuses = new Set(resourceOccupyingStatuses);
  }

  get resourceOccupyingStatuses() {
    return [...this.#resourceOccupyingStatuses];
  }

  assertScheduleWindow(startAt, endAt) {
    if (startAt && endAt && endAt <= startAt) {
      throw new DomainRuleViolation(
        "WASTE_PLAN_TIME_RANGE_INVALID",
        "เวลาสิ้นสุดตามแผนต้องอยู่หลังเวลาเริ่ม",
        { status: 422 },
      );
    }

    return this;
  }

  assertRoute(route, readiness) {
    if (!route || !Boolean(Number(route.isActive))) {
      throw new DomainRuleViolation(
        "WASTE_ROUTE_NOT_AVAILABLE",
        "เส้นทางที่เลือกถูกปิดใช้งานหรือไม่มีอยู่ในระบบ",
        { status: 422 },
      );
    }

    if (!readiness?.ready) {
      throw new DomainRuleViolation(
        "WASTE_ROUTE_NOT_READY",
        readiness?.reason || "เส้นทางยังไม่พร้อมใช้งาน",
        { status: 422 },
      );
    }

    return this;
  }

  assertVehicle(vehicle) {
    if (!vehicle) {
      throw new DomainRuleViolation(
        "WASTE_VEHICLE_NOT_FOUND",
        "ไม่พบรถเก็บขยะที่เลือก",
        { status: 422 },
      );
    }

    if (vehicle.status === "MAINTENANCE") {
      throw new DomainRuleViolation(
        "WASTE_VEHICLE_MAINTENANCE",
        "รถเก็บขยะที่เลือกอยู่ระหว่างซ่อมบำรุง",
        { status: 422 },
      );
    }

    if (vehicle.status === "OUT_OF_SERVICE") {
      throw new DomainRuleViolation(
        "WASTE_VEHICLE_OUT_OF_SERVICE",
        "รถเก็บขยะที่เลือกงดใช้งาน",
        { status: 422 },
      );
    }

    return this;
  }

  assertDriver(driver) {
    if (!driver || !Boolean(Number(driver.isActive))) {
      throw new DomainRuleViolation(
        "WASTE_DRIVER_NOT_AVAILABLE",
        "คนขับรถเก็บขยะที่เลือกถูกปิดใช้งานหรือไม่มีอยู่ในระบบ",
        { status: 422 },
      );
    }

    return this;
  }

  assertNoConflict(conflict) {
    if (!conflict) return this;

    const resource =
      conflict.conflictType === "VEHICLE"
        ? "รถเก็บขยะ"
        : "คนขับรถเก็บขยะ";

    throw new DomainRuleViolation(
      "WASTE_PLAN_RESOURCE_CONFLICT",
      `${resource}ถูกมอบหมายในแผน ${conflict.planNo} ช่วงเวลาเดียวกันแล้ว`,
      { status: 409 },
    );
  }

  conflictReason(conflict) {
    if (!conflict) return null;

    const time =
      conflict.startTime && conflict.endTime
        ? ` เวลา ${conflict.startTime}–${conflict.endTime}`
        : " ซึ่งยังระบุเวลาไม่ครบ";

    return `ถูกใช้ในแผน ${conflict.planNo}${time}`;
  }

  vehicleAvailability(vehicle, conflict = null) {
    if (vehicle.status === "MAINTENANCE") {
      return {
        ...vehicle,
        available: false,
        reason: "อยู่ระหว่างซ่อมบำรุง",
      };
    }

    if (vehicle.status === "OUT_OF_SERVICE") {
      return {
        ...vehicle,
        available: false,
        reason: "งดใช้งาน",
      };
    }

    if (conflict) {
      return {
        ...vehicle,
        available: false,
        reason: this.conflictReason(conflict),
        conflictPlanId: conflict.id,
        conflictPlanNo: conflict.planNo,
      };
    }

    return {
      ...vehicle,
      available: true,
      reason:
        vehicle.status === "IN_SERVICE"
          ? "กำลังทำงานในช่วงอื่น แต่ช่วงเวลาที่เลือกยังว่าง"
          : "ว่างในช่วงเวลาที่เลือก",
    };
  }

  driverAvailability(driver, conflict = null) {
    if (!Boolean(Number(driver.isActive))) {
      return {
        ...driver,
        available: false,
        reason: "ถูกปิดการใช้งาน",
      };
    }

    if (conflict) {
      return {
        ...driver,
        available: false,
        reason: this.conflictReason(conflict),
        conflictPlanId: conflict.id,
        conflictPlanNo: conflict.planNo,
      };
    }

    return {
      ...driver,
      available: true,
      reason: "ว่างในช่วงเวลาที่เลือก",
    };
  }
}