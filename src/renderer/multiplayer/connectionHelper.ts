import { useSessionStore } from '../stores/sessionStore';
import { useSettingsStore } from '../stores/settingsStore';
import { session } from './sessionManager';
import { resolveServerEndpoints } from './serverUrls';

export async function ensureConnected(displayName: string): Promise<void> {
  // Persist display name to settings
  useSettingsStore.getState().updateGeneralSetting('displayName', displayName);

  const store = useSessionStore.getState();
  if (store.status === 'connected') return;

  let settings = useSettingsStore.getState().settings;
  if (!settings) {
    await useSettingsStore.getState().fetchSettings();
    settings = useSettingsStore.getState().settings;
  }
  let wsUrl: string;
  try {
    ({ wsUrl } = resolveServerEndpoints(settings?.general.serverAddress));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    store.setError(message); // SessionPanel surfaces errors via the store
    throw err;
  }

  return new Promise((resolve, reject) => {
    store.setDisplayName(displayName);
    session.connect(wsUrl, displayName);

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
