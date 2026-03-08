import { writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_BASE = 'https://war-service-live.foxholeservices.com/api/worldconquest';
const CONQUERABLE = new Set([27, 45, 46, 47, 56, 57, 58]);

function pointInPolygon(px: number, py: number, polygon: [number, number][]): boolean {
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

async function fetchJson(url: string): Promise<unknown> {
  const resp = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  return resp.json();
}

interface MapItem {
  teamId: string;
  iconType: number;
  x: number;
  y: number;
  flags: number;
}

interface VoronoiRegion {
  notes: string;
  coordinates: [number, number][];
}

// Output: for each hex, an array parallel to voronoi regions with the [x, y] of the matched structure (or null)
type VoronoiOwnerMap = Record<string, ([number, number] | null)[]>;

async function main(): Promise<void> {
  const voronoiPath = path.join(__dirname, '..', 'static', 'voronoi.json');
  const voronoiData: Record<string, VoronoiRegion[]> = JSON.parse(readFileSync(voronoiPath, 'utf-8'));

  console.log('Fetching hex list...');
  const hexNames = (await fetchJson(`${API_BASE}/maps`)) as string[];
  console.log(`  ${hexNames.length} hexes`);

  const result: VoronoiOwnerMap = {};
  let totalRegions = 0;
  let matchedRegions = 0;

  for (let i = 0; i < hexNames.length; i++) {
    const mapName = hexNames[i];
    const regions = voronoiData[mapName];
    if (!regions || regions.length === 0) continue;

    process.stdout.write(`  [${i + 1}/${hexNames.length}] ${mapName}... `);

    const data = (await fetchJson(`${API_BASE}/maps/${mapName}/dynamic/public`)) as {
      mapItems?: MapItem[];
    };
    const items = data.mapItems ?? [];
    const conquerables = items.filter(it => CONQUERABLE.has(it.iconType));

    const owners: ([number, number] | null)[] = regions.map((region) => {
      for (const item of conquerables) {
        if (pointInPolygon(item.x, item.y, region.coordinates)) {
          return [item.x, item.y];
        }
      }
      return null;
    });

    const matched = owners.filter(o => o !== null).length;
    totalRegions += regions.length;
    matchedRegions += matched;
    console.log(`${matched}/${regions.length} regions matched`);
    result[mapName] = owners;
  }

  const outPath = path.join(__dirname, '..', 'static', 'voronoi_owners.json');
  writeFileSync(outPath, JSON.stringify(result), 'utf-8');
  console.log(`\nWrote ${outPath}`);
  console.log(`Total: ${matchedRegions}/${totalRegions} regions matched to conquerable structures`);
}

main().catch(console.error);
