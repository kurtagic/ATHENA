import type { HexDefinition } from '../../shared/types';
import type { MapPoint } from './coords';
import { toMapPoint } from './coords';
import { hexMapUrl } from './assetUrl';
import rawHexes from '../../../static/hexes.json';

// Hex grid constants (fitted to tile imagery: 10 hex-widths span 256 CRS units)
export const W = 256 / 10;
export const H = W * Math.sqrt(3) / 2;

// Build runtime hex definitions from JSON
export const hexes: HexDefinition[] = rawHexes.map(raw => ({
  hexId: raw.hexId,
  name: raw.name,
  x: raw.gx * W,
  y: raw.gy * H,
  file: raw.file,
  apiName: raw.apiName ?? raw.hexId,
}));

// Single lookup: keyed by both hexId and apiName (only differs for 3 hexes)
export const hexLookup: Record<string, HexDefinition> = {};
for (const hex of hexes) {
  hexLookup[hex.hexId] = hex;
  if (hex.apiName !== hex.hexId) hexLookup[hex.apiName] = hex;
}
console.log(`[hexMapping] loaded ${hexes.length} hexes, lookup keys: ${Object.keys(hexLookup).length}`);

export function hexImageUrl(hexId: string): string {
  const hex = hexLookup[hexId];
  return hexMapUrl(hexId, hex?.file ?? '');
}

export function resolveHex(name: string): HexDefinition | undefined {
  const hex = hexLookup[name];
  if (!hex) console.warn(`[hexMapping] resolveHex failed for "${name}" — not in hexLookup`);
  return hex;
}

export function apiToMapPoint(hex: HexDefinition, apiX: number, apiY: number): MapPoint {
  const cx = hex.x + 128;
  const cy = hex.y - 128;
  // x = lng direction, y = lat direction (up)
  return toMapPoint(cx - W / 2 + apiX * W, cy + H / 2 - apiY * H);
}

// Detail view coordinate mapping: API coords -> detail image CRS
// Official hex extents: 218400cm × 189000cm, 8 meters per CRS unit
const IMG_W = 218400 / 100 / 8; // 273
const IMG_H = 189000 / 100 / 8; // 236.25

export function detailMapPoint(apiX: number, apiY: number): MapPoint {
  return toMapPoint(apiX * IMG_W, -apiY * IMG_H);
}
