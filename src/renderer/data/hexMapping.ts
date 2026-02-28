import type { HexDefinition } from '../../shared/types';
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
  return `tile:///hexmaps/${hex ? hex.file : `Map${hexId}.png`}`;
}

export function resolveHex(name: string): HexDefinition | undefined {
  const hex = hexLookup[name];
  if (!hex) console.warn(`[hexMapping] resolveHex failed for "${name}" — not in hexLookup`);
  return hex;
}

export function apiToLatLng(hex: HexDefinition, apiX: number, apiY: number): [number, number] {
  const cLng = hex.x + 128;
  const cLat = hex.y - 128;
  return [cLat + H / 2 - apiY * H, cLng - W / 2 + apiX * W];
}
