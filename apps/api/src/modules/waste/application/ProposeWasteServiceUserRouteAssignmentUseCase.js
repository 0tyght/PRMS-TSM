import { WasteRouteProposal } from "../domain/WasteRouteProposal.js";

export class ProposeWasteServiceUserRouteAssignmentUseCase {
  constructor({ routeRepository, routeOptimizer, routeAssignmentService, maximumStops = 50 }) {
    if (!routeRepository || !routeOptimizer || !routeAssignmentService) throw new TypeError("ProposeWasteServiceUserRouteAssignmentUseCase requires dependencies");
    this.routeRepository = routeRepository;
    this.routeOptimizer = routeOptimizer;
    this.routeAssignmentService = routeAssignmentService;
    this.maximumStops = maximumStops;
  }

  async execute({ serviceUserId, routeId }) {
    const [serviceUser, route, currentStop, targetStops] = await Promise.all([
      this.routeRepository.findActiveServiceUserById(serviceUserId),
      this.routeRepository.findById(routeId),
      this.routeRepository.findStopByServiceUserId(serviceUserId),
      this.routeRepository.listActiveStops(routeId),
    ]);
    if (!serviceUser) throw new Error("SERVICE_USER_NOT_FOUND");
    if (!route) throw new Error("ROUTE_NOT_FOUND");
    if (!Number.isFinite(serviceUser.latitude) || !Number.isFinite(serviceUser.longitude)) throw new Error("SERVICE_USER_MISSING_LOCATION");

    const existingStops = targetStops.filter((stop) => stop.serviceUserId !== serviceUserId);
    const candidateStop = {
      id: currentStop?.id || `assignment:${serviceUserId}`,
      serviceUserId,
      stopName: `บ้าน ${serviceUser.houseNo} · ${serviceUser.fullName}`,
      latitude: serviceUser.latitude,
      longitude: serviceUser.longitude,
      assignmentCandidate: true,
      previousRouteId: serviceUser.routeId || null,
      routeAssignmentDistanceM: Math.round(this.routeAssignmentService.distanceToRouteMeters(serviceUser, route.routeGeojson) || 0),
    };
    if (!this.routeAssignmentService.isWithinAssignableDistance(candidateStop.routeAssignmentDistanceM)) {
      throw new Error("SERVICE_LOCATION_OUTSIDE_ROUTE");
    }
    const allStops = [...existingStops, candidateStop];
    if (allStops.length > this.maximumStops) throw new Error("TOO_MANY_STOPS");
    if (allStops.some((stop) => !Number.isFinite(stop.latitude) || !Number.isFinite(stop.longitude))) throw new Error("STOPS_MISSING_LOCATION");

    const geometry = route.routeGeojson?.geometry;
    const baselineDistanceMeters = Number(route.routeGeojson?.properties?.distanceMeters);
    const baselineDurationSeconds = Number(route.routeGeojson?.properties?.durationSeconds);
    if (geometry?.type !== "LineString" || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2
      || !Number.isFinite(baselineDistanceMeters) || baselineDistanceMeters <= 0
      || !Number.isFinite(baselineDurationSeconds) || baselineDurationSeconds <= 0) {
      if (allStops.length === 1) {
        const proposal = new WasteRouteProposal({
          routeId,
          stops: allStops,
          geometry: {
            type: "LineString",
            coordinates: [[candidateStop.longitude, candidateStop.latitude], [candidateStop.longitude, candidateStop.latitude]],
          },
          distanceMeters: 0,
          durationSeconds: 0,
        });
        return this.routeRepository.saveProposal(proposal);
      }
      const optimized = await this.routeOptimizer.optimize(allStops, { returnToStart: true });
      const stopsById = new Map(allStops.map((stop) => [stop.id, stop]));
      const proposal = new WasteRouteProposal({
        routeId,
        stops: optimized.orderedStopIds.map((stopId) => stopsById.get(stopId)).filter(Boolean),
        geometry: optimized.geometry,
        distanceMeters: optimized.distanceMeters,
        durationSeconds: optimized.durationSeconds,
      });
      return this.routeRepository.saveProposal(proposal);
    }

    const insertionPlan = this.routeAssignmentService.planStopInsertion(serviceUser, route.routeGeojson);
    const routeAnchors = [
      { id: `route-segment-start:${routeId}`, latitude: insertionPlan.start.latitude, longitude: insertionPlan.start.longitude },
      candidateStop,
      { id: `route-segment-end:${routeId}`, latitude: insertionPlan.end.latitude, longitude: insertionPlan.end.longitude },
    ];
    const detour = await this.routeOptimizer.optimize(routeAnchors, { returnToStart: false });
    const replacedDurationSeconds = Math.round(
      baselineDurationSeconds * (insertionPlan.replacedDistanceMeters / baselineDistanceMeters),
    );
    const additionalDistanceMeters = Math.max(0, detour.distanceMeters - insertionPlan.replacedDistanceMeters);
    const additionalDurationSeconds = Math.max(0, detour.durationSeconds - replacedDurationSeconds);
    const orderedStops = this.routeAssignmentService.insertStopInExistingOrder(
      existingStops,
      candidateStop,
      route.routeGeojson,
    );
    const proposal = new WasteRouteProposal({
      routeId,
      stops: orderedStops,
      geometry: this.routeAssignmentService.mergeStopDetour(route.routeGeojson, insertionPlan, detour.geometry),
      distanceMeters: baselineDistanceMeters + additionalDistanceMeters,
      durationSeconds: baselineDurationSeconds + additionalDurationSeconds,
    });
    return this.routeRepository.saveProposal(proposal);
  }
}
