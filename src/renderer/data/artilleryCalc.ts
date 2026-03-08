import type { MapPoint } from './coords';

// 1 grid cell = 15.625 CRS units = 125 meters -> 1 CRS unit = 8 meters
export const METERS_PER_CRS_UNIT = 8;

export function crsDistanceMeters(a: MapPoint, b: MapPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const crsDist = Math.sqrt(dx * dx + dy * dy);
  return crsDist * METERS_PER_CRS_UNIT;
}

export function crsAzimuth(from: MapPoint, to: MapPoint): number {
  // In our CRS: y = up (north), x = right (east)
  const dy = to.y - from.y;
  const dx = to.x - from.x;
  const rad = Math.atan2(dx, dy);
  return (rad * 180 / Math.PI + 360) % 360;
}

export function metersToRadius(meters: number): number {
  return meters / METERS_PER_CRS_UNIT;
}

export interface ArtilleryPlatformRange {
  minRange: number;
  maxRange: number;
  minInaccuracy: number;
  maxInaccuracy: number;
}

export function interpolateInaccuracy(platform: ArtilleryPlatformRange, distanceM: number): number {
  const rangeSpan = platform.maxRange - platform.minRange;
  if (rangeSpan <= 0) return platform.maxInaccuracy;
  const t = Math.max(0, Math.min(1, (distanceM - platform.minRange) / rangeSpan));
  return platform.minInaccuracy + t * (platform.maxInaccuracy - platform.minInaccuracy);
}

export interface CorrectionResult {
  corrected: MapPoint;
  correctionDistM: number;
  correctionAzDeg: number;
}

export function calculateCorrection(target: MapPoint, impact: MapPoint): CorrectionResult {
  // Mirror: corrected aim = 2 * target - impact
  const corrected: MapPoint = {
    x: 2 * target.x - impact.x,
    y: 2 * target.y - impact.y,
  };
  return {
    corrected,
    correctionDistM: crsDistanceMeters(target, impact),
    correctionAzDeg: crsAzimuth(target, impact),
  };
}
