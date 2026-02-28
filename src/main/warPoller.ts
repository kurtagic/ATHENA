import { BrowserWindow } from 'electron';
import { getWar, getMaps, getDynamic, NetworkError } from './foxholeApi';
import { ICON_TYPES_OF_INTEREST, POLL_INTERVAL_MS } from '../shared/constants';
import type { MapItem } from '../shared/types';

const MAX_BACKOFF_MS = 5 * 60_000; // 5 minutes

let selectedHexes = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;
let mainWindow: BrowserWindow | null = null;
let consecutiveFailures = 0;

function send(channel: string, data: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

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
    const { data: warData } = await getWar();
    if (warData) {
      send('war-status', warData);
    }

    if (selectedHexes.size === 0) {
      if (consecutiveFailures > 0) {
        console.log('[warPoller] API connection restored');
      }
      consecutiveFailures = 0;
      scheduleNext();
      return;
    }

    const { data: mapsData } = await getMaps();
    if (!mapsData || !Array.isArray(mapsData)) {
      consecutiveFailures = 0;
      scheduleNext();
      return;
    }

    const fetchList = (mapsData as string[]).filter((m) => selectedHexes.has(m));
    for (const mapName of fetchList) {
      try {
        const { data: dyn, changed } = await getDynamic(mapName);
        if (!dyn || !changed) continue;

        const items: MapItem[] = [];
        for (const item of (dyn as { mapItems?: MapItem[] }).mapItems ?? []) {
          if (ICON_TYPES_OF_INTEREST.has(item.iconType)) {
            items.push({ ...item, _mapName: mapName });
          }
        }
        send('hex-items', { mapName, items });
      } catch (err) {
        if (err instanceof NetworkError) {
          console.warn(`[warPoller] ${mapName}: ${err.message}`);
        } else {
          console.error(`[warPoller] ${mapName}:`, err);
        }
      }
    }

    if (consecutiveFailures > 0) {
      console.log('[warPoller] API connection restored');
    }
    consecutiveFailures = 0;
  } catch (err) {
    consecutiveFailures++;
    if (err instanceof NetworkError) {
      const nextSec = Math.round(getBackoffInterval() / 1000);
      console.warn(`[warPoller] ${err.message} (retry in ${nextSec}s)`);
    } else {
      console.error('[warPoller] unexpected error:', err);
    }
  }
  scheduleNext();
}

export function startPoller(win: BrowserWindow): void {
  mainWindow = win;
  poll();
}

export function stopPoller(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

export function setSelectedHexes(hexes: string[]): void {
  const newSet = new Set(hexes);
  if (
    newSet.size !== selectedHexes.size ||
    [...newSet].some((h) => !selectedHexes.has(h))
  ) {
    selectedHexes = newSet;
    // Trigger an immediate poll on change
    poll();
  }
}
