import { DomainRuleViolation } from "../../../domain/common/errors/DomainRuleViolation.js";

export class WasteRouteStopSequence {
  constructor(stops = []) {
    this.stops = stops.map((stop) => ({
      serviceUserId: stop.serviceUserId,
      sequenceNo: Number(stop.sequenceNo),
    }));

    this.validate();
  }

  validate() {
    const serviceUserIds =
      this.stops.map(
        (stop) => stop.serviceUserId,
      );

    if (
      new Set(serviceUserIds).size !==
      serviceUserIds.length
    ) {
      throw new DomainRuleViolation(
        "WASTE_ROUTE_STOP_SERVICE_USER_DUPLICATED",
        "ผู้ใช้บริการแต่ละรายต้องอยู่ในจุดเก็บเพียงหนึ่งตำแหน่ง",
        { status: 422 },
      );
    }

    const sequenceNumbers =
      this.stops.map(
        (stop) => stop.sequenceNo,
      );

    if (
      new Set(sequenceNumbers).size !==
      sequenceNumbers.length
    ) {
      throw new DomainRuleViolation(
        "WASTE_ROUTE_STOP_SEQUENCE_DUPLICATED",
        "ลำดับจุดเก็บต้องไม่ซ้ำกัน",
        { status: 422 },
      );
    }

    return this;
  }

  ordered() {
    return this.stops
      .slice()
      .sort(
        (left, right) =>
          left.sequenceNo - right.sequenceNo,
      );
  }

  toArray() {
    return this.stops.map(
      (stop) => ({ ...stop }),
    );
  }

  get count() {
    return this.stops.length;
  }
}
