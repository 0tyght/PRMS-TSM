import { DomainRuleViolation } from "../../../domain/common/errors/DomainRuleViolation.js";

const DEFAULT_BOUNDS = Object.freeze({
  minLatitude: 16.70,
  maxLatitude: 16.805,
  minLongitude: 100.15,
  maxLongitude: 100.27,
});

const TRACKABLE_STATUSES =
  Object.freeze([
    "IN_PROGRESS",
    "INTERRUPTED",
  ]);

export class WasteTrackingPolicy {
  constructor({
    bounds = DEFAULT_BOUNDS,
    minimumIntervalMs = 7_000,
  } = {}) {
    this.bounds = Object.freeze({
      ...bounds,
    });

    this.minimumIntervalMs =
      Number(minimumIntervalMs);
  }

  canTrack(status) {
    return TRACKABLE_STATUSES
      .includes(status);
  }

  isInsideServiceArea(
    latitude,
    longitude,
  ) {
    const lat = Number(latitude);
    const lng = Number(longitude);

    return (
      lat >= this.bounds.minLatitude &&
      lat <= this.bounds.maxLatitude &&
      lng >= this.bounds.minLongitude &&
      lng <= this.bounds.maxLongitude
    );
  }

  assertInsideServiceArea(
    latitude,
    longitude,
  ) {
    if (
      !this.isInsideServiceArea(
        latitude,
        longitude,
      )
    ) {
      throw new DomainRuleViolation(
        "WASTE_TRACKING_OUTSIDE_SERVICE_AREA",
        "ตำแหน่งอยู่นอกเขตเทศบาลเมืองท่าโพธิ์ กรุณาตรวจสอบ GPS ของอุปกรณ์",
        { status: 422 },
      );
    }

    return this;
  }

  assertTrackableStatus(status) {
    if (!this.canTrack(status)) {
      throw new DomainRuleViolation(
        "WASTE_TRACKING_PLAN_NOT_ACTIVE",
        "ส่งตำแหน่งได้เฉพาะแผนที่กำลังปฏิบัติงาน",
        { status: 409 },
      );
    }

    return this;
  }

  isTooFrequent(
    previousRecordedAt,
    now = new Date(),
  ) {
    if (!previousRecordedAt) {
      return false;
    }

    return (
      now.getTime() -
        new Date(
          previousRecordedAt,
        ).getTime() <
      this.minimumIntervalMs
    );
  }
}
