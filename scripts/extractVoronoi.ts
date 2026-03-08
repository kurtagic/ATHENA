/**
 * Extracts Voronoi subregion boundaries from foxhole-dashboard's static.json
 * and converts them to API-normalized [0,1] coords per hex.
 *
 * Usage: npx tsx scripts/extractVoronoi.ts
 * Output: static/voronoi.json
 */

import fs from 'fs';
import path from 'path';

interface GeoJSONFeature {
  type: 'Feature';
  geometry: { type: 'Polygon'; coordinates: [number, number][][] };
  properties: { notes: string; region: string; type: string };
}

interface GeoJSONCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

const EXTENT_X = 2046;
const EXTENT_Y = 1777;

const SOURCE = path.resolve('C:/development/foxhole/foxhole-dashboard/public/static.json');
const OUTPUT = path.resolve(__dirname, '../static/voronoi.json');

const data: GeoJSONCollection = JSON.parse(fs.readFileSync(SOURCE, 'utf-8'));

// Build region bounding boxes: { regionId -> { minX, maxY } }
const regionBounds: Record<string, { minX: number; maxY: number }> = {};
for (const f of data.features) {
  if (f.properties.type === 'Region') {
    const coords = f.geometry.coordinates[0];
    let minX = Infinity;
    let maxY = -Infinity;
    for (const [x, y] of coords) {
      if (x < minX) minX = x;
      if (y > maxY) maxY = y;
    }
    regionBounds[(f as any).id] = { minX, maxY };
  }
}

// Process voronoi features
const result: Record<string, { notes: string; coordinates: [number, number][] }[]> = {};

for (const f of data.features) {
  if (f.properties.type !== 'voronoi') continue;

  const regionId = f.properties.region;
  const bounds = regionBounds[regionId];
  if (!bounds) {
    console.warn(`No region bounds for ${regionId}, skipping ${f.properties.notes}`);
    continue;
  }

  const worldCoords = f.geometry.coordinates[0];
  const apiCoords: [number, number][] = worldCoords.map(([wx, wy]) => [
    (wx - bounds.minX) / EXTENT_X,
    (bounds.maxY - wy) / EXTENT_Y,
  ]);

  if (!result[regionId]) result[regionId] = [];
  result[regionId].push({
    notes: f.properties.notes,
    coordinates: apiCoords,
  });
}

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2));

const totalRegions = Object.keys(result).length;
const totalPolygons = Object.values(result).reduce((s, a) => s + a.length, 0);
console.log(`Wrote ${totalPolygons} voronoi regions across ${totalRegions} hexes to ${OUTPUT}`);
