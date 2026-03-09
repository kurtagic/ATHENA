import { app } from 'electron';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Settings, SettingsPartial } from '../shared/types';

const DEFAULT_SETTINGS: Settings = {
  keybinds: {
    toggleOverlay: '`',
    pushToTalk: 'Y',
  },
  audio: {
    autoSilenceOnVoice: false,
  },
};

let currentSettings: Settings = {
  ...DEFAULT_SETTINGS,
  keybinds: { ...DEFAULT_SETTINGS.keybinds },
  audio: { ...DEFAULT_SETTINGS.audio },
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
    };
  } catch {
    currentSettings = {
      keybinds: { ...DEFAULT_SETTINGS.keybinds },
      audio: { ...DEFAULT_SETTINGS.audio },
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
  saveSettings(currentSettings);
  return currentSettings;
}

export function getSettings(): Settings {
  return currentSettings;
}

export function getDefaultSettings(): Settings {
  return DEFAULT_SETTINGS;
}
