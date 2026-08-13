export class OsrmTripRouteOptimizer {
  constructor({ baseUrl, fetchImpl = (...args) => globalThis.fetch(...args), timeoutMs = 20_000 }) {
    this.baseUrl = String(baseUrl || "").replace(/\/$/, "");
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async optimize(stops, { returnToStart = true } = {}) {
    const coordinates = stops.map((stop) => `${stop.longitude.toFixed(7)},${stop.latitude.toFixed(7)}`).join(";");
    const query = new URLSearchParams({
      roundtrip: String(returnToStart),
      source: "first",
      destination: returnToStart ? "any" : "last",
      overview: "full",
      geometries: "geojson",
      steps: "false",
    });
    let response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/trip/v1/driving/${coordinates}?${query}`, {
        headers: { Accept: "application/json", "User-Agent": "Smart-Tha-Pho/1.0" },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new Error("ROUTING_SERVICE_UNAVAILABLE");
    }
    if (!response.ok) throw new Error("ROUTING_SERVICE_FAILED");
    const result = await response.json();
    const trip = result.trips?.[0];
    if (result.code !== "Ok" || !trip?.geometry) throw new Error("ROUTE_NOT_FOUND_BY_PROVIDER");

    const orderedStopIds = result.waypoints
      .map((waypoint, inputIndex) => ({ inputIndex, order: Number(waypoint.waypoint_index) }))
      .sort((left, right) => left.order - right.order)
      .map(({ inputIndex }) => stops[inputIndex].id);
    return {
      orderedStopIds,
      geometry: trip.geometry,
      distanceMeters: Math.round(trip.distance || 0),
      durationSeconds: Math.round(trip.duration || 0),
    };
  }
}
