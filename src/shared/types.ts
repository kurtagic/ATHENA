export interface HexDefinition {
  hexId: string;
  name: string;
  x: number;
  y: number;
  file: string;
  apiName: string;
}

export interface MapItem {
  teamId: string;
  iconType: number;
  x: number;
  y: number;
  flags: number;
  _mapName?: string;
}

export interface HexItemsPayload {
  mapName: string;
  items: MapItem[];
}

export interface StaticLabel {
  text: string;
  x: number;
  y: number;
  mapMarkerType: string;
}

export interface StaticLabelsPayload {
  mapName: string;
  labels: StaticLabel[];
}

export interface WarStatus {
  warId: string;
  warNumber: number;
  winner: string;
  conquestStartTime: number;
  conquestEndTime: number | null;
  resistanceStartTime: number | null;
  requiredVictoryTowns: number;
}

export interface KeybindSettings {
  toggleOverlay: string; // Electron accelerator, e.g. "`", "F1", "CommandOrControl+Shift+O"
  pushToTalk: string; // e.g. "Y", "F2"
}

export interface AudioSettings {
  autoSilenceOnVoice: boolean;
}

export interface Settings {
  keybinds: KeybindSettings;
  audio: AudioSettings;
}

export type SettingsPartial = {
  [K in keyof Settings]?: Partial<Settings[K]>;
};

export interface AthenaAPI {
  onWarStatus: (callback: (data: WarStatus) => void) => void;
  onHexItems: (callback: (data: HexItemsPayload) => void) => void;
  onStaticLabels: (callback: (data: StaticLabelsPayload) => void) => void;
  setSelectedHexes: (hexes: string[]) => void;
  setAppSilence: (mute: boolean) => void;
  onPttToggle: (callback: () => void) => void;
  getSettings: () => Promise<Settings>;
  setSettings: (partial: SettingsPartial) => Promise<{ settings: Settings; error?: string }>;
}

declare global {
  interface Window {
    athena: AthenaAPI;
  }
}
