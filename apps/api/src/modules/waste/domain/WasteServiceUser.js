import { DomainRuleViolation } from "../../../domain/common/errors/DomainRuleViolation.js";

function coordinate(value) {
  return value == null
    ? null
    : Number(value);
}

export class WasteServiceUser {
  #isActive;

  constructor({
    id = null,
    serviceNo,
    fullName,
    phone,
    houseNo,
    villageId,
    villageNo = null,
    villageName = null,
    addressDetail = null,
    lineUserId = null,
    routeId = null,
    routeName = null,
    routeAssignmentStatus = "UNASSIGNED",
    routeAssignmentDistanceM = null,
    routeAssignedAt = null,
    latitude = null,
    longitude = null,
    isActive = true,
  }) {
    this.id = id;
    this.serviceNo = serviceNo;
    this.fullName = fullName;
    this.phone = phone;
    this.houseNo = houseNo;
    this.villageId = villageId;
    this.villageNo = villageNo;
    this.villageName = villageName;
    this.addressDetail = addressDetail;
    this.lineUserId = lineUserId;
    this.routeId = routeId;
    this.routeName = routeName;
    this.routeAssignmentStatus =
      routeAssignmentStatus;
    this.routeAssignmentDistanceM =
      routeAssignmentDistanceM == null
        ? null
        : Number(routeAssignmentDistanceM);
    this.routeAssignedAt = routeAssignedAt;
    this.latitude = coordinate(latitude);
    this.longitude = coordinate(longitude);
    this.#isActive =
      Boolean(Number(isActive));
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
    this.lineUserId = null;

    return this;
  }

  unlinkLine() {
    const unlinked =
      Boolean(this.lineUserId);

    this.lineUserId = null;

    return unlinked;
  }

  assertDirectRouteChangeNotAllowed(
    changes,
  ) {
    if (
      Object.hasOwn(
        changes,
        "routeId",
      )
    ) {
      throw new DomainRuleViolation(
        "WASTE_SERVICE_USER_ROUTE_DIRECT_UPDATE_NOT_ALLOWED",
        "ใช้คำสั่งยืนยันเส้นทางเพื่อเปลี่ยนเส้นทางรับผิดชอบ",
        { status: 422 },
      );
    }

    return this;
  }

  update(changes = {}) {
    this.assertDirectRouteChangeNotAllowed(
      changes,
    );

    const directFields = [
      "serviceNo",
      "fullName",
      "phone",
      "houseNo",
      "villageId",
      "addressDetail",
      "lineUserId",
    ];

    for (const field of directFields) {
      if (field in changes) {
        this[field] = changes[field];
      }
    }

    if ("latitude" in changes) {
      this.latitude =
        coordinate(changes.latitude);
    }

    if ("longitude" in changes) {
      this.longitude =
        coordinate(changes.longitude);
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

  locationChangedFrom(previous) {
    return (
      coordinate(previous.latitude) !==
        coordinate(this.latitude) ||
      coordinate(previous.longitude) !==
        coordinate(this.longitude)
    );
  }

  activeStateChangedFrom(previous) {
    return (
      Boolean(Number(previous.isActive)) !==
      this.#isActive
    );
  }

  assertDeletable({
    chargeCount = 0,
    confirmationCount = 0,
  } = {}) {
    if (
      Number(chargeCount || 0) > 0 ||
      Number(confirmationCount || 0) > 0
    ) {
      throw new DomainRuleViolation(
        "WASTE_SERVICE_USER_HAS_HISTORY",
        "ผู้ใช้บริการรายนี้มีประวัติค่าบริการหรือการจัดเก็บแล้ว กรุณาเปลี่ยนสถานะเป็นปิดบริการแทนการลบ",
        { status: 409 },
      );
    }

    return this;
  }

  toObject() {
    return {
      id: this.id,
      serviceNo: this.serviceNo,
      fullName: this.fullName,
      phone: this.phone,
      houseNo: this.houseNo,
      villageId: this.villageId,
      villageNo: this.villageNo,
      villageName: this.villageName,
      addressDetail: this.addressDetail,
      lineUserId: this.lineUserId,
      routeId: this.routeId,
      routeName: this.routeName,
      routeAssignmentStatus:
        this.routeAssignmentStatus,
      routeAssignmentDistanceM:
        this.routeAssignmentDistanceM,
      routeAssignedAt:
        this.routeAssignedAt,
      latitude: this.latitude,
      longitude: this.longitude,
      isActive: this.#isActive,
    };
  }
}
