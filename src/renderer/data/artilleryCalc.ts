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
  windDrift: [number, number];
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

export function interpolateWindDrift(platform: ArtilleryPlatformRange, distanceM: number): number {
  const rangeSpan = platform.maxRange - platform.minRange;
  if (rangeSpan <= 0) return platform.windDrift[1];
  const t = Math.max(0, Math.min(1, (distanceM - platform.minRange) / rangeSpan));
  return platform.windDrift[0] + t * (platform.windDrift[1] - platform.windDrift[0]);
}

export function windOffset(
  windDirection: number,
  windStrength: number,
  platform: ArtilleryPlatformRange,
  distanceM: number,
): { dx: number; dy: number } {
  const baseDrift = interpolateWindDrift(platform, distanceM);
  const driftMeters = baseDrift * (windStrength / 5);
  const dirRad = (windDirection * Math.PI) / 180;
  const dxMeters = Math.sin(dirRad) * driftMeters;
  const dyMeters = Math.cos(dirRad) * driftMeters;
  return {
    dx: dxMeters / METERS_PER_CRS_UNIT,
    dy: dyMeters / METERS_PER_CRS_UNIT,
  };
}

export function windCompensatedTarget(
  target: MapPoint,
  windDirection: number,
  windStrength: number,
  platform: ArtilleryPlatformRange,
  distanceM: number,
): MapPoint {
  const offset = windOffset(windDirection, windStrength, platform, distanceM);
  return {
    x: target.x - offset.dx,
    y: target.y - offset.dy,
  };
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
