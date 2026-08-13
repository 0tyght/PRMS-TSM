export class ConfirmWasteServiceUserRouteAssignmentUseCase {
  constructor({ routeRepository }) {
    if (!routeRepository) throw new TypeError("ConfirmWasteServiceUserRouteAssignmentUseCase requires routeRepository");
    this.routeRepository = routeRepository;
  }

  async execute({ serviceUserId, proposalId, confirmedBy, ipAddress }) {
    const proposal = await this.routeRepository.findProposal(proposalId);
    if (!proposal || proposal.expiresAt <= new Date()) throw new Error("PROPOSAL_EXPIRED");
    const candidate = proposal.stops.find((stop) => stop.assignmentCandidate === true);
    if (!candidate || candidate.serviceUserId !== serviceUserId) throw new Error("ASSIGNMENT_PROPOSAL_MISMATCH");

    const [serviceUser, activeStops, route] = await Promise.all([
      this.routeRepository.findActiveServiceUserById(serviceUserId),
      this.routeRepository.listActiveStops(proposal.routeId),
      this.routeRepository.findById(proposal.routeId),
    ]);
    if (!serviceUser) throw new Error("SERVICE_USER_NOT_FOUND");
    if (!route) throw new Error("ROUTE_NOT_FOUND");
    if ((serviceUser.routeId || null) !== (candidate.previousRouteId || null)) throw new Error("SERVICE_USER_ROUTE_CHANGED");
    if (Math.abs(serviceUser.latitude - candidate.latitude) > 0.0000001 || Math.abs(serviceUser.longitude - candidate.longitude) > 0.0000001) {
      throw new Error("SERVICE_USER_LOCATION_CHANGED");
    }

    const activeById = new Map(activeStops.filter((stop) => stop.serviceUserId !== serviceUserId).map((stop) => [stop.id, stop]));
    const regularStops = proposal.stops.filter((stop) => !stop.assignmentCandidate);
    const stopsChanged = regularStops.length !== activeById.size || regularStops.some((proposedStop) => {
      const activeStop = activeById.get(proposedStop.id);
      return !activeStop
        || Math.abs(activeStop.latitude - proposedStop.latitude) > 0.0000001
        || Math.abs(activeStop.longitude - proposedStop.longitude) > 0.0000001;
    });
    if (stopsChanged) throw new Error("ROUTE_STOPS_CHANGED");

    const inheritedProperties = route.routeGeojson?.properties || {};
    const routeGeojson = proposal.toGeoJson(inheritedProperties);
    routeGeojson.properties.geometryStatus = proposal.stops.length < 2 ? "RECALCULATION_REQUIRED" : "CONFIRMED_OSRM_OPTIMIZED";
    if (proposal.stops.length < 2) routeGeojson.properties.recalculationReason = "ROUTE_REQUIRES_SECOND_SERVICE_POINT";
    await this.routeRepository.confirmServiceUserAssignment({
      proposal,
      serviceUser,
      routeGeojson,
      confirmedBy,
      ipAddress,
    });
    return proposal;
  }
}
