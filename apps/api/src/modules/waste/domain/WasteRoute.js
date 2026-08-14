import { DomainRuleViolation } from "../../../domain/common/errors/DomainRuleViolation.js";

export class WasteRoute {
  #isActive;

  constructor({
    id = null,
    routeCode,
    routeName,
    description = null,
    routeGeojson = null,
    isActive = true,
    stopCount = 0,
    serviceUserCount = 0,
  }) {
    this.id = id;
    this.routeCode = routeCode;
    this.routeName = routeName;
    this.description = description;
    this.routeGeojson = routeGeojson;
    this.#isActive = Boolean(Number(isActive));
    this.stopCount = Number(stopCount || 0);
    this.serviceUserCount =
      Number(serviceUserCount || 0);
  }

  get isActive() {
    return this.#isActive;
  }

  activate() {
    this.#isActive = true;
    return this;
  }

  deactivate() {
    this.#isActive = false;
    return this;
  }

  assertManualGeometryIsNotChanged(changes) {
    if (Object.hasOwn(changes, "routeGeojson")) {
      throw new DomainRuleViolation(
        "WASTE_ROUTE_GEOMETRY_MANUAL_UPDATE_NOT_ALLOWED",
        "แนวถนนแก้ไขด้วยมือไม่ได้ กรุณาใช้คำสั่งคำนวณและยืนยันเส้นทางจากจุดเก็บขยะ",
        { status: 422 },
      );
    }

    return this;
  }

  assertCanDeactivate({
    activePlanCount = 0,
    activeUserCount = 0,
  } = {}) {
    if (
      Number(activePlanCount || 0) > 0 ||
      Number(activeUserCount || 0) > 0
    ) {
      throw new DomainRuleViolation(
        "WASTE_ROUTE_HAS_ACTIVE_DEPENDENCIES",
        "เส้นทางยังมีแผนปฏิบัติงานเก็บขยะหรือจุดเก็บขยะที่เปิดใช้งาน กรุณาย้ายข้อมูลออกก่อนปิดเส้นทาง",
        { status: 409 },
      );
    }

    return this;
  }

  assertDeletable({
    planCount = 0,
    userCount = 0,
  } = {}) {
    if (
      Number(planCount || 0) > 0 ||
      Number(userCount || 0) > 0
    ) {
      throw new DomainRuleViolation(
        "WASTE_ROUTE_HAS_HISTORY",
        "เส้นทางนี้ผูกกับแผนปฏิบัติงานเก็บขยะหรือผู้ใช้บริการแล้ว กรุณายกเลิกการใช้งานแทนการลบ",
        { status: 409 },
      );
    }

    return this;
  }

  update(changes = {}) {
    this.assertManualGeometryIsNotChanged(changes);

    if ("routeCode" in changes) {
      this.routeCode = changes.routeCode;
    }

    if ("routeName" in changes) {
      this.routeName = changes.routeName;
    }

    if ("description" in changes) {
      this.description = changes.description;
    }

    if ("isActive" in changes) {
      if (changes.isActive) {
        this.activate();
      } else {
        this.deactivate();
      }
    }

    return this;
  }

  toObject() {
    return {
      id: this.id,
      routeCode: this.routeCode,
      routeName: this.routeName,
      description: this.description,
      routeGeojson: this.routeGeojson,
      isActive: this.#isActive,
      stopCount: this.stopCount,
      serviceUserCount: this.serviceUserCount,
    };
  }
}
