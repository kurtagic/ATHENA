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
  const sx = p.x * 0.5 + 64;
  const sy = p.y * 0.5 - 64;
  const lng = sx * (360 / 256) - 180;
  const n = Math.PI * (1 + sy / 128);
  const lat = Math.atan(Math.sinh(n)) * DEG;
  return [lng, lat];
}

export function lngLatToMapPoint(lng: number, lat: number): MapPoint {
  const sx = (lng + 180) / 360 * 256;
  const latRad = lat * RAD;
  const sy = -128 * (1 - Math.log(Math.tan(Math.PI / 4 + latRad / 2)) / Math.PI);
  const x = (sx - 64) * 2;
  const y = (sy + 64) * 2;
  return { x, y };
}

export function pointInPolygon(px: number, py: number, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function mapPointDistance(a: MapPoint, b: MapPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}
