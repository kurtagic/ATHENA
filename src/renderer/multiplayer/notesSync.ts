import * as Y from 'yjs';
import { getRootMap, getHexMap } from './yjsSync';
import { useMapStore } from '../stores/mapStore';
import { useNotesStore } from '../stores/notesStore';
import { debugLog } from '../stores/debugStore';

// Cache for off-screen hex notes
export const hexNotesCache: Record<string, string> = {};

let observer: ((events: Y.YEvent<any>[], tx: Y.Transaction) => void) | null = null;

// ── Outbound sync ──

export function syncNotesUpdate(hexId: string, text: string): void {
  const hexMap = getHexMap('notes', hexId);
  if (!hexMap) return;
  hexMap.set('text', text);
  debugLog('yjs', `Notes updated in ${hexId}`);
}

// ── Observer ──

export function setupNotesObserver(): void {
  teardownNotesObserver();

  const notesMap = getRootMap('notes');
  if (!notesMap) return;

  observer = (events: Y.YEvent<any>[], transaction: Y.Transaction) => {
    if (transaction.local) return;

    const currentHexId = useMapStore.getState().detailMode?.apiName || '';

    for (const event of events) {
      if (!(event instanceof Y.YMapEvent)) continue;

      // Skip root-level hex map additions/removals
      if (event.target === notesMap) continue;

      const hexId = findHexId(notesMap, event.target as Y.Map<any>);
      if (!hexId) continue;

      const text = (event.target as Y.Map<any>).get('text') ?? '';

      if (hexId === currentHexId) {
        useNotesStore.getState().setText(text);
        debugLog('yjs', `Remote notes update for current hex ${hexId}`);
      } else {
        hexNotesCache[hexId] = text;
        debugLog('yjs', `Remote notes update cached for ${hexId}`);
      }

      // Update PIP if pinned
      if (useNotesStore.getState().pinned && hexId === currentHexId) {
        window.athena.updatePinnedNotes(text);
      }
    }
  };

  notesMap.observeDeep(observer);
  debugLog('yjs', 'Notes observer attached');
}

export function teardownNotesObserver(): void {
  if (observer) {
    const notesMap = getRootMap('notes');
    if (notesMap) {
      notesMap.unobserveDeep(observer);
    }
    observer = null;
    debugLog('yjs', 'Notes observer detached');
  }
}

// ── Load function ──

export function loadHexNotes(hexId: string): string {
  const notesMap = getRootMap('notes');
  if (!notesMap || !notesMap.has(hexId)) return '';
  const hexMap = notesMap.get(hexId) as Y.Map<any>;
  return hexMap?.get('text') ?? '';
}

// ── Helpers ──

function findHexId(root: Y.Map<Y.Map<any>>, target: Y.Map<any>): string | null {
  for (const [hexId, hexMap] of root.entries()) {
    if (hexMap === target) return hexId;
  }
  return null;
}
