import { useSessionStore } from '../stores/sessionStore';
import { session } from './sessionManager';

export const SERVER_URL = 'wss://api.athena.kurti.si';

export function ensureConnected(displayName: string): Promise<void> {
  const store = useSessionStore.getState();
  if (store.status === 'connected') return Promise.resolve();

  return new Promise((resolve, reject) => {
    store.setDisplayName(displayName);
    session.connect(SERVER_URL, displayName);

    const unsub = useSessionStore.subscribe((state) => {
      if (state.status === 'connected') {
        unsub();
        resolve();
      } else if (state.status === 'disconnected' && state.error) {
        unsub();
        reject(new Error(state.error));
      }
    });
  });
}
