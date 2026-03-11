import { useSessionStore } from '../stores/sessionStore';
import { useSettingsStore } from '../stores/settingsStore';
import { session } from './sessionManager';

export const SERVER_URL = 'wss://api.athena.kurti.si';

export function ensureConnected(displayName: string): Promise<void> {
  // Persist display name to settings
  useSettingsStore.getState().updateGeneralSetting('displayName', displayName);

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

export async function getSavedDisplayName(): Promise<string> {
  await useSettingsStore.getState().fetchSettings();
  return useSettingsStore.getState().settings?.general.displayName || '';
}
