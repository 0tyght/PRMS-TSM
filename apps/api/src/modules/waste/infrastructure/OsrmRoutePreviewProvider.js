export class OsrmRoutePreviewProvider {
  constructor({
    baseUrl,
    fetchImpl =
      (...args) =>
        globalThis.fetch(
          ...args,
        ),
    timeoutMs = 15_000,
  }) {
    this.baseUrl =
      String(
        baseUrl || "",
      ).replace(
        /\/$/,
        "",
      );

    this.fetchImpl =
      fetchImpl;

    this.timeoutMs =
      Number(timeoutMs);
  }

  async preview(
    waypoints,
  ) {
    const coordinates =
      waypoints
        .map(
          (point) =>
            `${
              Number(
                point.longitude,
              ).toFixed(7)
            },${
              Number(
                point.latitude,
              ).toFixed(7)
            }`,
        )
        .join(";");

    const query =
      new URLSearchParams({
        overview: "full",
        geometries:
          "geojson",
        steps: "false",
      });

    let response;

    try {
      response =
        await this.fetchImpl(
          `${
            this.baseUrl
          }/route/v1/driving/${
            coordinates
          }?${query}`,
          {
            headers: {
              Accept:
                "application/json",

              "User-Agent":
                "Smart-Tha-Pho/1.0",
            },

            signal:
              AbortSignal.timeout(
                this.timeoutMs,
              ),
          },
        );
    } catch {
      throw new Error(
        "ROUTING_SERVICE_UNAVAILABLE",
      );
    }

    if (!response.ok) {
      throw new Error(
        "ROUTING_SERVICE_FAILED",
      );
    }

    const result =
      await response.json();

    const route =
      result.routes?.[0];

    if (
      result.code !== "Ok" ||
      !route?.geometry
    ) {
      throw new Error(
        "ROUTE_NOT_FOUND_BY_PROVIDER",
      );
    }

    return {
      geometry:
        route.geometry,

      distanceMeters:
        Math.round(
          route.distance || 0,
        ),

      durationSeconds:
        Math.round(
          route.duration || 0,
        ),

      snappedWaypoints:
        (
          result.waypoints ||
          []
        ).map(
          (point) => ({
            name:
              point.name || "",

            longitude:
              point.location?.[0],

            latitude:
              point.location?.[1],

            distanceMeters:
              point.distance,
          }),
        ),
    };
  }
}
