import { DomainRuleViolation } from "../../../domain/common/errors/DomainRuleViolation.js";

const DEFAULT_BOUNDS =
  Object.freeze({
    minLatitude: 16.70,
    maxLatitude: 16.805,
    minLongitude: 100.15,
    maxLongitude: 100.27,
  });

export class WasteRoutePreviewPolicy {
  constructor({
    bounds =
      DEFAULT_BOUNDS,
    minimumWaypoints = 2,
    maximumWaypoints = 50,
  } = {}) {
    this.bounds =
      Object.freeze({
        ...bounds,
      });

    this.minimumWaypoints =
      Number(
        minimumWaypoints,
      );

    this.maximumWaypoints =
      Number(
        maximumWaypoints,
      );
  }

  assertWaypoints(
    waypoints,
  ) {
    if (
      !Array.isArray(
        waypoints,
      ) ||
      waypoints.length <
        this.minimumWaypoints ||
      waypoints.length >
        this.maximumWaypoints
    ) {
      throw new DomainRuleViolation(
        "WASTE_ROUTE_PREVIEW_WAYPOINT_COUNT_INVALID",
        "เส้นทางต้องมีจุดอย่างน้อย 2 จุด และไม่เกิน 50 จุด",
        { status: 422 },
      );
    }

    for (
      const point of waypoints
    ) {
      if (
        !this.isInsideServiceArea(
          point.latitude,
          point.longitude,
        )
      ) {
        throw new DomainRuleViolation(
          "WASTE_ROUTE_PREVIEW_OUTSIDE_SERVICE_AREA",
          "จุดเส้นทางอยู่นอกเขตเทศบาลท่าโพธ์",
          { status: 422 },
        );
      }
    }

    return this;
  }

  isInsideServiceArea(
    latitude,
    longitude,
  ) {
    const lat =
      Number(latitude);

    const lng =
      Number(longitude);

    return (
      lat >=
        this.bounds.minLatitude &&
      lat <=
        this.bounds.maxLatitude &&
      lng >=
        this.bounds.minLongitude &&
      lng <=
        this.bounds.maxLongitude
    );
  }
}
