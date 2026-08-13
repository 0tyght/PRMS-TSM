function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export class RouteComparisonPolicy {
  compare({ currentRouteGeojson, proposal }) {
    const currentDistanceMeters = numeric(currentRouteGeojson?.properties?.distanceMeters);
    const currentDurationSeconds = numeric(currentRouteGeojson?.properties?.durationSeconds);
    const proposedDistanceMeters = numeric(proposal?.distanceMeters);
    const proposedDurationSeconds = numeric(proposal?.durationSeconds);

    return Object.freeze({
      hasBaseline: Boolean(currentRouteGeojson?.geometry && currentDistanceMeters && currentDurationSeconds),
      currentDistanceMeters,
      currentDurationSeconds,
      proposedDistanceMeters,
      proposedDurationSeconds,
      distanceDeltaMeters: currentDistanceMeters && proposedDistanceMeters ? proposedDistanceMeters - currentDistanceMeters : null,
      durationDeltaSeconds: currentDurationSeconds && proposedDurationSeconds ? proposedDurationSeconds - currentDurationSeconds : null,
    });
  }
}

export const routeComparisonPolicy = new RouteComparisonPolicy();
