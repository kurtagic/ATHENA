import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { debugLog } from '../stores/debugStore';
import { useSettingsStore } from '../stores/settingsStore';
import { resolveServerEndpoints } from './serverUrls';

let doc: Y.Doc | null = null;
let provider: WebsocketProvider | null = null;

export function connectYjs(lobbyId: string): { doc: Y.Doc; provider: WebsocketProvider } {
  disconnectYjs();
  doc = new Y.Doc();
  // Settings are guaranteed loaded here — connectYjs only runs after a lobby
  // join succeeded, which resolved the same address.
  const { yjsUrl } = resolveServerEndpoints(
    useSettingsStore.getState().settings?.general.serverAddress
  );
  provider = new WebsocketProvider(yjsUrl, `lobby-${lobbyId}`, doc, {
    connect: true,
    disableBc: true,
  });

  provider.on('status', ({ status }: { status: string }) => {
    debugLog('yjs', `Connection status: ${status}`);
  });

  (provider as any).on('synced', (synced: boolean | { synced: boolean }) => {
    const isSynced = typeof synced === 'boolean' ? synced : synced?.synced;
    debugLog('yjs', `Synced: ${isSynced}`);
  });

  debugLog('yjs', `Connected to room lobby-${lobbyId}`);
  return { doc, provider };
}

export function disconnectYjs(): void {
  if (provider) {
    provider.destroy();
    debugLog('yjs', 'Provider destroyed');
  }
  if (doc) {
    doc.destroy();
  }
  provider = null;
  doc = null;
}

export function getYjsDoc(): Y.Doc | null { return doc; }
export function getYjsProvider(): WebsocketProvider | null { return provider; }

/** Get a root Y.Map by name (e.g. 'strokes', 'artillery') */
export function getRootMap(name: string): Y.Map<Y.Map<any>> | null {
  return doc?.getMap(name) as Y.Map<Y.Map<any>> ?? null;
}

/** Get or create the Y.Map for a specific hex within a root map */
export function getHexMap(rootName: string, hexId: string): Y.Map<any> | null {
  const root = getRootMap(rootName);
  if (!root) return null;
  if (!root.has(hexId)) {
    root.set(hexId, new Y.Map());
  }
  return root.get(hexId) as Y.Map<any>;
}
