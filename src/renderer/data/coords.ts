export interface MapPoint {
  x: number;
  y: number;
}

// ── CRS.Simple ↔ Web Mercator mapping ──────────────────────────
//
// The tile set was generated for Leaflet CRS.Simple where:
//   pixel_x = CRS_x * 2^z,  pixel_y = -CRS_y * 2^z   (y flipped)
//   tile(z, x, y) covers CRS_x [x*256/2^z .. (x+1)*256/2^z]
//
// MapLibre uses Web Mercator tiling with the same tile indices, so
// tile images line up when we convert CRS ↔ lng/lat as follows:
//
//   lng  = CRS_x * 360/256 − 180          (linear, full world width)
//   lat  = atan(sinh(π·(1 + CRS_y/128)))  (Mercator inverse)
//
// Internal game logic (artillery, distances) stays in CRS units
// where 1 unit ≈ 8 m.  The Mercator warp only affects rendering.

const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;

export function toMapPoint(x: number, y: number): MapPoint {
  return { x, y };
}

export function mapPointToLngLat(p: MapPoint): [number, number] {
  const lng = p.x * (360 / 256) - 180;
  const n = Math.PI * (1 + p.y / 128);
  const lat = Math.atan(Math.sinh(n)) * DEG;
  return [lng, lat];
}

export function lngLatToMapPoint(lng: number, lat: number): MapPoint {
  const x = (lng + 180) / 360 * 256;
  const latRad = lat * RAD;
  const pixelY = 128 * (1 - Math.log(Math.tan(Math.PI / 4 + latRad / 2)) / Math.PI);
  const y = -pixelY;
  return { x, y };
}

export function mapPointDistance(a: MapPoint, b: MapPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}
