export class LocationHistoryPolicy {
  constructor({ maximumGapMinutes = 5 } = {}) {
    this.maximumGapMs = maximumGapMinutes * 60 * 1000;
  }

  createContinuousSegments(points = []) {
    const validPoints = points
      .map((point) => ({ ...point, latitude: Number(point.latitude), longitude: Number(point.longitude) }))
      .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && Number.isFinite(new Date(point.recordedAt).getTime()))
      .sort((left, right) => new Date(left.recordedAt) - new Date(right.recordedAt));
    const segments = [];
    let current = [];
    for (const point of validPoints) {
      const previous = current.at(-1);
      const gapMs = previous ? new Date(point.recordedAt) - new Date(previous.recordedAt) : 0;
      if (previous && gapMs > this.maximumGapMs) {
        if (current.length > 1) segments.push(current);
        current = [];
      }
      current.push(point);
    }
    if (current.length > 1) segments.push(current);
    return Object.freeze(segments.map((segment) => Object.freeze(segment)));
  }
}
