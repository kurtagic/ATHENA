import { app } from 'electron';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Settings, SettingsPartial } from '../shared/types';

const DEFAULT_SETTINGS: Settings = {
  keybinds: {
    toggleOverlay: 'Shift+N',
    toggleToTalk: 'F5',
    quickNotification: 'F6',
    quickControls: 'F2',
  },
  audio: {
    autoSilenceOnVoice: false,
    inputDeviceId: '',
    outputDeviceId: '',
  },
  general: {
    windowedMode: false,
    displayName: '',
  },
};

let currentSettings: Settings = {
  ...DEFAULT_SETTINGS,
  keybinds: { ...DEFAULT_SETTINGS.keybinds },
  audio: { ...DEFAULT_SETTINGS.audio },
  general: { ...DEFAULT_SETTINGS.general },
};

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

export function loadSettings(): Settings {
  try {
    const raw = readFileSync(settingsPath(), 'utf-8');
    const parsed = JSON.parse(raw);
    currentSettings = {
      keybinds: {
        ...DEFAULT_SETTINGS.keybinds,
        ...(parsed.keybinds || {}),
      },
      audio: {
        ...DEFAULT_SETTINGS.audio,
        ...(parsed.audio || {}),
      },
      general: {
        ...DEFAULT_SETTINGS.general,
        ...(parsed.general || {}),
      },
    };
  } catch {
    currentSettings = {
      keybinds: { ...DEFAULT_SETTINGS.keybinds },
      audio: { ...DEFAULT_SETTINGS.audio },
      general: { ...DEFAULT_SETTINGS.general },
    };
  }
  return currentSettings;
}

export function saveSettings(settings: Settings): void {
  const dir = path.dirname(settingsPath());
  mkdirSync(dir, { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf-8');
}

export function updateSettings(partial: SettingsPartial): Settings {
  if (partial.keybinds) {
    currentSettings.keybinds = { ...currentSettings.keybinds, ...partial.keybinds };
  }
  if (partial.audio) {
    currentSettings.audio = { ...currentSettings.audio, ...partial.audio };
  }
  if (partial.general) {
    currentSettings.general = { ...currentSettings.general, ...partial.general };
  }
  saveSettings(currentSettings);
  return currentSettings;
}

export function getSettings(): Settings {
  return currentSettings;
}

export function getDefaultSettings(): Settings {
  return DEFAULT_SETTINGS;
}
