export class ConfirmWasteRouteProposalUseCase {
  constructor({ routeRepository }) {
    if (!routeRepository) throw new TypeError("ConfirmWasteRouteProposalUseCase requires routeRepository");
    this.routeRepository = routeRepository;
  }

  async execute({ routeId, proposalId, confirmedBy, ipAddress }) {
    const proposal = await this.routeRepository.findProposal(proposalId);
    if (!proposal || proposal.expiresAt <= new Date()) throw new Error("PROPOSAL_EXPIRED");
    if (proposal.routeId !== routeId) throw new Error("PROPOSAL_ROUTE_MISMATCH");
    const activeStops = await this.routeRepository.listActiveStops(routeId);
    const activeById = new Map(activeStops.map((stop) => [stop.id, stop]));
    const stopsChanged = proposal.stopIds.length !== activeById.size || proposal.stops.some((proposedStop) => {
      const activeStop = activeById.get(proposedStop.id);
      return !activeStop
        || Math.abs(activeStop.latitude - proposedStop.latitude) > 0.0000001
        || Math.abs(activeStop.longitude - proposedStop.longitude) > 0.0000001;
    });
    if (stopsChanged) {
      throw new Error("ROUTE_STOPS_CHANGED");
    }
    await this.routeRepository.confirmProposal({
      proposalId,
      routeId,
      orderedStopIds: proposal.stopIds,
      routeGeojson: proposal.toGeoJson((await this.routeRepository.findById(routeId))?.routeGeojson?.properties || {}),
      confirmedBy,
      ipAddress,
    });
    return proposal;
  }
}
