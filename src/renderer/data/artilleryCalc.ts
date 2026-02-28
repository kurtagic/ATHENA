import L from 'leaflet';

// 1 grid cell = 15.625 CRS units = 125 meters → 1 CRS unit = 8 meters
export const METERS_PER_CRS_UNIT = 8;

export function crsDistanceMeters(a: L.LatLng, b: L.LatLng): number {
  const dlat = b.lat - a.lat;
  const dlng = b.lng - a.lng;
  const crsDist = Math.sqrt(dlat * dlat + dlng * dlng);
  return crsDist * METERS_PER_CRS_UNIT;
}

export function crsAzimuth(from: L.LatLng, to: L.LatLng): number {
  // CRS.Simple: lat = up (north), lng = right (east)
  const dlat = to.lat - from.lat;
  const dlng = to.lng - from.lng;
  const rad = Math.atan2(dlng, dlat);
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
  corrected: L.LatLng;
  correctionDistM: number;
  correctionAzDeg: number;
}

export function calculateCorrection(target: L.LatLng, impact: L.LatLng): CorrectionResult {
  // Mirror: corrected aim = 2 * target - impact
  const corrected = L.latLng(
    2 * target.lat - impact.lat,
    2 * target.lng - impact.lng,
  );
  return {
    corrected,
    correctionDistM: crsDistanceMeters(target, impact),
    correctionAzDeg: crsAzimuth(target, impact),
  };
}
