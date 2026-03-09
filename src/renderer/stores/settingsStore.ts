import { create } from 'zustand';
import type { Settings, AudioSettings, SettingsPartial } from '../../shared/types';

interface SettingsState {
  settings: Settings | null;
  settingsOpen: boolean;
  error: string | null;
  setSettingsOpen: (open: boolean) => void;
  fetchSettings: () => Promise<void>;
  updateKeybind: (action: keyof Settings['keybinds'], accelerator: string) => Promise<void>;
  updateAudioSetting: <K extends keyof AudioSettings>(key: K, value: AudioSettings[K]) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  settingsOpen: false,
  error: null,

  setSettingsOpen: (open) => set({ settingsOpen: open, error: null }),

  fetchSettings: async () => {
    const settings = await window.athena.getSettings();
    set({ settings });
  },

  updateKeybind: async (action, accelerator) => {
    set({ error: null });
    const result = await window.athena.setSettings({
      keybinds: { [action]: accelerator },
    });
    if (result.error) {
      set({ settings: result.settings, error: result.error });
    } else {
      set({ settings: result.settings, error: null });
    }
  },

  updateAudioSetting: async (key, value) => {
    set({ error: null });
    const result = await window.athena.setSettings({
      audio: { [key]: value },
    });
    if (result.error) {
      set({ settings: result.settings, error: result.error });
    } else {
      set({ settings: result.settings, error: null });
    }
  },
}));
