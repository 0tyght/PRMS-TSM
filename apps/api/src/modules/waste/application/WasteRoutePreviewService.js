import { DomainRuleViolation } from "../../../domain/common/errors/DomainRuleViolation.js";

const PROVIDER_ERRORS =
  Object.freeze({
    ROUTING_SERVICE_UNAVAILABLE: {
      status: 502,
      message:
        "ไม่สามารถเชื่อมต่อบริการคำนวณเส้นทางได้ในขณะนี้",
    },

    ROUTING_SERVICE_FAILED: {
      status: 502,
      message:
        "ไม่สามารถคำนวณเส้นทางตามถนนได้ในขณะนี้",
    },

    ROUTE_NOT_FOUND_BY_PROVIDER: {
      status: 422,
      message:
        "ไม่พบถนนที่เชื่อมต่อระหว่างจุดที่เลือก",
    },
  });

export class WasteRoutePreviewService {
  constructor({
    policy,
    provider,
  }) {
    if (!policy) {
      throw new TypeError(
        "WasteRoutePreviewService requires policy",
      );
    }

    if (!provider) {
      throw new TypeError(
        "WasteRoutePreviewService requires provider",
      );
    }

    this.policy =
      policy;

    this.provider =
      provider;
  }

  async preview(
    waypoints,
  ) {
    this.policy
      .assertWaypoints(
        waypoints,
      );

    let result;

    try {
      result =
        await this.provider
          .preview(
            waypoints,
          );
    } catch (error) {
      const mapped =
        PROVIDER_ERRORS[
          error?.message
        ];

      if (!mapped) {
        throw error;
      }

      throw new DomainRuleViolation(
        error.message,
        mapped.message,
        {
          status:
            mapped.status,
        },
      );
    }

    return {
      routeGeojson: {
        type: "Feature",

        properties: {
          waypoints,
          distanceMeters:
            result.distanceMeters,
          durationSeconds:
            result.durationSeconds,
          source:
            "OpenStreetMap / OSRM",
        },

        geometry:
          result.geometry,
      },

      distanceMeters:
        result.distanceMeters,

      durationSeconds:
        result.durationSeconds,

      snappedWaypoints:
        result.snappedWaypoints,
    };
  }
}
