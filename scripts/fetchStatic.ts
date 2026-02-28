import { writeFileSync } from 'node:fs';
import path from 'node:path';

const API_BASE = 'https://war-service-live.foxholeservices.com/api/worldconquest';

async function fetchJson(url: string): Promise<unknown> {
  const resp = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  return resp.json();
}

async function main(): Promise<void> {
  console.log('Fetching hex list...');
  const hexNames = (await fetchJson(`${API_BASE}/maps`)) as string[];
  console.log(`  ${hexNames.length} hexes`);

  const staticData: Record<string, unknown[]> = {};

  for (let i = 0; i < hexNames.length; i++) {
    const mapName = hexNames[i];
    process.stdout.write(`  [${i + 1}/${hexNames.length}] ${mapName}... `);
    const data = (await fetchJson(`${API_BASE}/maps/${mapName}/static`)) as {
      mapTextItems?: unknown[];
    };
    const labels = data.mapTextItems ?? [];
    staticData[mapName] = labels;
    console.log(`${labels.length} labels`);
  }

  const outPath = path.join(import.meta.dirname, '..', 'static', 'static_data.json');
  writeFileSync(outPath, JSON.stringify(staticData), 'utf-8');
  console.log(`Wrote ${outPath} (${Object.keys(staticData).length} hexes)`);
}

main().catch(console.error);
