export class WasteRouteProposal {
  constructor({ id = null, routeId, stops, geometry, distanceMeters, durationSeconds, generatedAt = new Date(), expiresAt = null }) {
    if (!routeId) throw new TypeError("WasteRouteProposal requires routeId");
    if (!Array.isArray(stops) || stops.length < 2) throw new TypeError("WasteRouteProposal requires at least two stops");
    if (geometry?.type !== "LineString" || !Array.isArray(geometry.coordinates)) {
      throw new TypeError("WasteRouteProposal requires LineString geometry");
    }
    this.id = id;
    this.routeId = routeId;
    this.stops = Object.freeze(stops.map((stop) => Object.freeze({ ...stop })));
    this.geometry = Object.freeze(geometry);
    this.distanceMeters = Math.round(Number(distanceMeters || 0));
    this.durationSeconds = Math.round(Number(durationSeconds || 0));
    this.generatedAt = new Date(generatedAt);
    this.expiresAt = expiresAt ? new Date(expiresAt) : null;
    Object.freeze(this);
  }

  get stopIds() {
    return this.stops.map((stop) => stop.id);
  }

  toGeoJson(inheritedProperties = {}) {
    return {
      type: "Feature",
      properties: {
        ...inheritedProperties,
        routingWaypoints: this.stops.map((stop) => ({
          stopId: stop.id,
          serviceUserId: stop.serviceUserId,
          name: stop.stopName,
          latitude: stop.latitude,
          longitude: stop.longitude,
        })),
        distanceMeters: this.distanceMeters,
        durationSeconds: this.durationSeconds,
        source: "OpenStreetMap / OSRM Trip",
        geometryStatus: "PROPOSED_OSRM_OPTIMIZED",
        generatedAt: this.generatedAt.toISOString(),
      },
      geometry: this.geometry,
    };
  }
}
