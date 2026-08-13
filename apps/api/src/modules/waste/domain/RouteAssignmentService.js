const EARTH_RADIUS_M = 6_371_000;

function radians(value) {
  return value * Math.PI / 180;
}

function haversineMeters(a, b) {
  const latitudeDelta = radians(b.latitude - a.latitude);
  const longitudeDelta = radians(b.longitude - a.longitude);
  const latitude1 = radians(a.latitude);
  const latitude2 = radians(b.latitude);
  const sinLatitude = Math.sin(latitudeDelta / 2);
  const sinLongitude = Math.sin(longitudeDelta / 2);
  const h = sinLatitude ** 2 + Math.cos(latitude1) * Math.cos(latitude2) * sinLongitude ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function pointToSegmentMeters(point, start, end) {
  const referenceLatitude = radians((point.latitude + start.latitude + end.latitude) / 3);
  const scaleX = EARTH_RADIUS_M * Math.cos(referenceLatitude);
  const scaleY = EARTH_RADIUS_M;
  const project = (candidate) => ({
    x: radians(candidate.longitude - point.longitude) * scaleX,
    y: radians(candidate.latitude - point.latitude) * scaleY,
  });
  const a = project(start);
  const b = project(end);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx ** 2 + dy ** 2;
  if (!lengthSquared) return haversineMeters(point, start);
  const t = Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / lengthSquared));
  return Math.hypot(a.x + t * dx, a.y + t * dy);
}

function routeCoordinates(routeGeojson) {
  const geometry = routeGeojson?.type === "Feature" ? routeGeojson.geometry : routeGeojson;
  if (geometry?.type !== "LineString" || !Array.isArray(geometry.coordinates)) return [];
  return geometry.coordinates
    .map(([longitude, latitude]) => ({ latitude: Number(latitude), longitude: Number(longitude) }))
    .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
}

function sameCoordinate(left, right) {
  return left?.[0] === right?.[0] && left?.[1] === right?.[1];
}

export class RouteAssignmentService {
  constructor({ maximumSuggestedDistanceM = 1_000 } = {}) {
    this.maximumSuggestedDistanceM = maximumSuggestedDistanceM;
  }

  distanceToRouteMeters(location, routeGeojson) {
    const coordinates = routeCoordinates(routeGeojson);
    if (!coordinates.length) return null;
    if (coordinates.length === 1) return haversineMeters(location, coordinates[0]);
    let minimum = Number.POSITIVE_INFINITY;
    for (let index = 1; index < coordinates.length; index += 1) {
      minimum = Math.min(minimum, pointToSegmentMeters(location, coordinates[index - 1], coordinates[index]));
    }
    return minimum;
  }

  planStopInsertion(location, routeGeojson) {
    const coordinates = routeCoordinates(routeGeojson);
    if (coordinates.length < 2) throw new Error("ROUTE_GEOMETRY_MISSING");

    let nearestSegmentIndex = 0;
    let nearestDistanceMeters = Number.POSITIVE_INFINITY;
    for (let index = 1; index < coordinates.length; index += 1) {
      const distanceMeters = pointToSegmentMeters(location, coordinates[index - 1], coordinates[index]);
      if (distanceMeters < nearestDistanceMeters) {
        nearestDistanceMeters = distanceMeters;
        nearestSegmentIndex = index - 1;
      }
    }

    const start = coordinates[nearestSegmentIndex];
    const end = coordinates[nearestSegmentIndex + 1];
    return Object.freeze({
      segmentIndex: nearestSegmentIndex,
      nearestDistanceMeters,
      replacedDistanceMeters: haversineMeters(start, end),
      start: Object.freeze({ ...start }),
      end: Object.freeze({ ...end }),
    });
  }

  mergeStopDetour(routeGeojson, insertionPlan, detourGeometry) {
    const baselineCoordinates = routeGeojson?.geometry?.coordinates;
    const detourCoordinates = detourGeometry?.coordinates;
    if (!Array.isArray(baselineCoordinates) || baselineCoordinates.length < 2 || !Array.isArray(detourCoordinates) || detourCoordinates.length < 2) {
      throw new Error("ROUTE_GEOMETRY_MISSING");
    }

    const before = baselineCoordinates.slice(0, insertionPlan.segmentIndex + 1);
    const after = baselineCoordinates.slice(insertionPlan.segmentIndex + 1);
    const merged = [...before];
    for (const coordinate of detourCoordinates) {
      if (!sameCoordinate(merged.at(-1), coordinate)) merged.push(coordinate);
    }
    for (const coordinate of after) {
      if (!sameCoordinate(merged.at(-1), coordinate)) merged.push(coordinate);
    }
    return Object.freeze({ type: "LineString", coordinates: merged });
  }

  suggest(location, routes, limit = 3) {
    if (!Number.isFinite(location?.latitude) || !Number.isFinite(location?.longitude)) return [];
    return routes
      .map((route) => ({ ...route, distanceMeters: this.distanceToRouteMeters(location, route.routeGeojson) }))
      .filter((route) => route.distanceMeters != null)
      .sort((left, right) => left.distanceMeters - right.distanceMeters)
      .slice(0, limit)
      .map((route, index) => ({
        ...route,
        distanceMeters: Math.round(route.distanceMeters),
        recommended: index === 0 && route.distanceMeters <= this.maximumSuggestedDistanceM,
      }));
  }
}
