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
    const allStops = [...existingStops, candidateStop];
    if (allStops.length > this.maximumStops) throw new Error("TOO_MANY_STOPS");
    if (allStops.some((stop) => !Number.isFinite(stop.latitude) || !Number.isFinite(stop.longitude))) throw new Error("STOPS_MISSING_LOCATION");

    if (allStops.length === 1) {
      const geometry = route.routeGeojson?.geometry;
      if (geometry?.type !== "LineString" || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2) {
        throw new Error("INSUFFICIENT_STOPS");
      }

      const firstCoordinate = geometry.coordinates[0];
      const lastCoordinate = geometry.coordinates.at(-1);
      const routeAnchors = [
        { id: `route-start:${routeId}`, latitude: Number(firstCoordinate?.[1]), longitude: Number(firstCoordinate?.[0]) },
        candidateStop,
        { id: `route-end:${routeId}`, latitude: Number(lastCoordinate?.[1]), longitude: Number(lastCoordinate?.[0]) },
      ];
      if (routeAnchors.some((stop) => !Number.isFinite(stop.latitude) || !Number.isFinite(stop.longitude))) {
        throw new Error("INSUFFICIENT_STOPS");
      }

      const optimized = await this.routeOptimizer.optimize(routeAnchors, { returnToStart: false });
      const proposal = new WasteRouteProposal({
        routeId,
        stops: allStops,
        geometry: optimized.geometry,
        distanceMeters: optimized.distanceMeters,
        durationSeconds: optimized.durationSeconds,
      });
      return this.routeRepository.saveProposal(proposal);
    }

    const optimized = await this.routeOptimizer.optimize(allStops.map((stop) => ({
      id: stop.id,
      latitude: stop.latitude,
      longitude: stop.longitude,
    })), { returnToStart: true });
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
