import { WasteRouteProposal } from "../domain/WasteRouteProposal.js";

export class ProposeWasteRouteUseCase {
  constructor({ routeRepository, routeOptimizer, maximumStops = 50 }) {
    if (!routeRepository || !routeOptimizer) throw new TypeError("ProposeWasteRouteUseCase requires dependencies");
    this.routeRepository = routeRepository;
    this.routeOptimizer = routeOptimizer;
    this.maximumStops = maximumStops;
  }

  async execute({ routeId, startStopId = null, endStopId = null }) {
    const route = await this.routeRepository.findById(routeId);
    if (!route) throw new Error("ROUTE_NOT_FOUND");
    const allStops = await this.routeRepository.listActiveStops(routeId);
    const missingLocationStops = allStops.filter((stop) => !Number.isFinite(stop.latitude) || !Number.isFinite(stop.longitude));
    if (missingLocationStops.length) {
      const error = new Error("STOPS_MISSING_LOCATION");
      error.stops = missingLocationStops;
      throw error;
    }
    if (allStops.length < 2) throw new Error("INSUFFICIENT_STOPS");
    if (allStops.length > this.maximumStops) throw new Error("TOO_MANY_STOPS");

    const startStop = startStopId ? allStops.find((stop) => stop.id === startStopId) : allStops[0];
    if (!startStop) throw new Error("START_STOP_NOT_FOUND");
    const endStop = endStopId ? allStops.find((stop) => stop.id === endStopId) : null;
    if (endStopId && !endStop) throw new Error("END_STOP_NOT_FOUND");
    if (endStop?.id === startStop.id) throw new Error("START_END_STOP_MUST_DIFFER");
    const intermediateStops = allStops.filter((stop) => stop.id !== startStop.id && stop.id !== endStop?.id);
    const routingStops = [startStop, ...intermediateStops, ...(endStop ? [endStop] : [])];

    const optimized = await this.routeOptimizer.optimize(routingStops.map((stop) => ({
      id: stop.id,
      latitude: stop.latitude,
      longitude: stop.longitude,
    })), { returnToStart: !endStop });
    const byId = new Map(allStops.map((stop) => [stop.id, stop]));
    const orderedStops = optimized.orderedStopIds.map((id) => byId.get(id)).filter(Boolean);
    const proposal = new WasteRouteProposal({
      routeId,
      stops: orderedStops,
      geometry: optimized.geometry,
      distanceMeters: optimized.distanceMeters,
      durationSeconds: optimized.durationSeconds,
    });
    return this.routeRepository.saveProposal(proposal);
  }
}
