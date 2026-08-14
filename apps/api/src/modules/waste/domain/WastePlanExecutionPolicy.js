import { DomainRuleViolation } from "../../../domain/common/errors/DomainRuleViolation.js";

export class WastePlanExecutionPolicy {
  assertVehicleReady(
    vehicle,
    {
      resuming = false,
    } = {},
  ) {
    if (!vehicle) {
      throw new DomainRuleViolation(
        "WASTE_PLAN_VEHICLE_NOT_FOUND",
        "ไม่พบรถเก็บขยะของแผนปฏิบัติงานเก็บขยะ",
        { status: 409 },
      );
    }

    const allowedStatuses =
      resuming
        ? [
            "AVAILABLE",
            "IN_SERVICE",
          ]
        : [
            "AVAILABLE",
          ];

    if (
      !allowedStatuses.includes(
        vehicle.status,
      )
    ) {
      throw new DomainRuleViolation(
        "WASTE_PLAN_VEHICLE_NOT_READY",
        "รถเก็บขยะไม่อยู่ในสถานะพร้อมใช้งาน จึงยังเริ่มแผนนี้ไม่ได้",
        { status: 409 },
      );
    }

    return this;
  }

  assertDriverReady(driver) {
    if (
      !driver ||
      !Boolean(
        Number(driver.isActive),
      )
    ) {
      throw new DomainRuleViolation(
        "WASTE_PLAN_DRIVER_NOT_READY",
        "พนักงานประจำรถขยะถูกยกเลิกการใช้งาน จึงยังเริ่มแผนนี้ไม่ได้",
        { status: 409 },
      );
    }

    return this;
  }

  assertNoActiveConflict(
    conflict,
  ) {
    if (!conflict) {
      return this;
    }

    const resource =
      conflict.conflictType ===
      "VEHICLE"
        ? "รถเก็บขยะ"
        : "พนักงานประจำรถขยะ";

    throw new DomainRuleViolation(
      "WASTE_PLAN_ACTIVE_RESOURCE_CONFLICT",
      `${resource}กำลังถูกใช้ในแผน ${conflict.planNo}`,
      { status: 409 },
    );
  }
}
