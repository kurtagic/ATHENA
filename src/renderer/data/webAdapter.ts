import { API_BASE, ICON_TYPES_OF_INTEREST, POLL_INTERVAL_MS } from '../../shared/constants';
import type { WarStatus, HexItemsPayload, MapItem, StaticLabelsPayload } from '../../shared/types';

const MAX_BACKOFF_MS = 5 * 60_000;

const etags = new Map<string, string>();
const cache = new Map<string, unknown>();

async function fetchWithETag(url: string): Promise<{ data: unknown; changed: boolean }> {
  const headers: Record<string, string> = {};
  const etag = etags.get(url);
  if (etag) headers['If-None-Match'] = etag;

  const resp = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });

  if (resp.status === 304) {
    return { data: cache.get(url) ?? null, changed: false };
  }
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);

  const data = await resp.json();
  const newEtag = resp.headers.get('ETag');
  if (newEtag) {
    etags.set(url, newEtag);
    cache.set(url, data);
  }
  return { data, changed: true };
}

type WarStatusCallback = (data: WarStatus) => void;
type HexItemsCallback = (data: HexItemsPayload) => void;

let warStatusCb: WarStatusCallback | null = null;
let hexItemsCb: HexItemsCallback | null = null;
let selectedHexes = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;
let consecutiveFailures = 0;

function getBackoffInterval(): number {
  if (consecutiveFailures === 0) return POLL_INTERVAL_MS;
  const backoff = POLL_INTERVAL_MS * Math.pow(2, Math.min(consecutiveFailures, 6));
  return Math.min(backoff, MAX_BACKOFF_MS);
}

function scheduleNext(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(poll, getBackoffInterval());
}

async function poll(): Promise<void> {
  try {
    const { data: warData } = await fetchWithETag(`${API_BASE}/war`);
    if (warData && warStatusCb) {
      warStatusCb(warData as WarStatus);
    }

    if (selectedHexes.size === 0) {
      consecutiveFailures = 0;
      scheduleNext();
      return;
    }

    const { data: mapsData } = await fetchWithETag(`${API_BASE}/maps`);
    if (!mapsData || !Array.isArray(mapsData)) {
      consecutiveFailures = 0;
      scheduleNext();
      return;
    }

    const fetchList = (mapsData as string[]).filter((m) => selectedHexes.has(m));
    for (const mapName of fetchList) {
      try {
        const { data: dyn, changed } = await fetchWithETag(`${API_BASE}/maps/${mapName}/dynamic/public`);
        if (!dyn || !changed) continue;

        const items: MapItem[] = [];
        for (const item of (dyn as { mapItems?: MapItem[] }).mapItems ?? []) {
          if (ICON_TYPES_OF_INTEREST.has(item.iconType)) {
            items.push({ ...item, _mapName: mapName });
          }
        }
        if (hexItemsCb) hexItemsCb({ mapName, items });
      } catch (err) {
        console.warn(`[webAdapter] ${mapName}:`, (err as Error).message);
      }
    }

    if (consecutiveFailures > 0) {
      console.log('[webAdapter] API connection restored');
    }
    consecutiveFailures = 0;
  } catch (err) {
    consecutiveFailures++;
    const nextSec = Math.round(getBackoffInterval() / 1000);
    console.warn(`[webAdapter] poll error (retry in ${nextSec}s):`, (err as Error).message);
  }
  scheduleNext();
}

export const webAdapter = {
  onWarStatus(cb: WarStatusCallback) {
    warStatusCb = cb;
  },

  onHexItems(cb: HexItemsCallback) {
    hexItemsCb = cb;
  },

  setSelectedHexes(hexes: string[]) {
    const newSet = new Set(hexes);
    const changed = newSet.size !== selectedHexes.size || [...newSet].some((h) => !selectedHexes.has(h));
    if (changed) {
      selectedHexes = newSet;
      // Immediate poll on change
      poll();
    }
  },

  async loadStaticData(): Promise<Record<string, any[]> | null> {
    try {
      const resp = await fetch('/static_data.json');
      if (!resp.ok) return null;
      return await resp.json();
    } catch {
      return null;
    }
  },

  startPolling() {
    poll();
  },
};
