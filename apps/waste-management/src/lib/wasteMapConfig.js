export const THA_PHO_SERVICE_BOUNDS = Object.freeze({
  south: 16.70,
  north: 16.805,
  west: 100.15,
  east: 100.27,
});

export const THA_PHO_CENTER = Object.freeze([
  16.7744,
  100.2254,
]);

export function thaPhoLeafletBounds() {
  return [
    [
      THA_PHO_SERVICE_BOUNDS.south,
      THA_PHO_SERVICE_BOUNDS.west,
    ],
    [
      THA_PHO_SERVICE_BOUNDS.north,
      THA_PHO_SERVICE_BOUNDS.east,
    ],
  ];
}

export function isInsideThaPhoServiceBounds(
  latitude,
  longitude,
) {
  const lat = Number(latitude);
  const lng = Number(longitude);

  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= THA_PHO_SERVICE_BOUNDS.south &&
    lat <= THA_PHO_SERVICE_BOUNDS.north &&
    lng >= THA_PHO_SERVICE_BOUNDS.west &&
    lng <= THA_PHO_SERVICE_BOUNDS.east
  );
}

export function routeMapColor(index = 0) {
  const routeIndex =
    Math.max(
      0,
      Number(index) || 0,
    );

  const hue =
    (
      151 +
      routeIndex * 137.508
    ) % 360;

  const saturation =
    68 +
    (routeIndex % 3) * 4;

  const lightness =
    routeIndex % 2 === 0
      ? 36
      : 43;

  return `hsl(${hue.toFixed(1)}, ${saturation}%, ${lightness}%)`;
}