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
  toggleOverlay: string; // Electron accelerator, e.g. "N", "F1", "CommandOrControl+Shift+O"
  toggleToTalk: string; // e.g. "Y", "F2"
  quickNotification: string; // e.g. "F6"
}

export interface AudioSettings {
  autoSilenceOnVoice: boolean;
}

export interface GeneralSettings {
  windowedMode: boolean;
  displayName: string;
}

export interface Settings {
  keybinds: KeybindSettings;
  audio: AudioSettings;
  general: GeneralSettings;
}

export type SettingsPartial = {
  [K in keyof Settings]?: Partial<Settings[K]>;
};

export interface PinnedSolution {
  label: string;
  distanceM: number;
  azimuthDeg: number;
  inRange: boolean;
}

export interface AthenaAPI {
  onWarStatus: (callback: (data: WarStatus) => void) => void;
  onHexItems: (callback: (data: HexItemsPayload) => void) => void;
  onStaticLabels: (callback: (data: StaticLabelsPayload) => void) => void;
  setSelectedHexes: (hexes: string[]) => void;
  setAppSilence: (mute: boolean) => void;
  onTttToggle: (callback: () => void) => void;
  getSettings: () => Promise<Settings>;
  setSettings: (partial: SettingsPartial) => Promise<{ settings: Settings; error?: string }>;
  updatePinnedArtillery: (data: PinnedSolution[]) => void;
  showCommandBanner: (command: 'fire' | 'stop') => void;
  showCustomNotification: (text: string, senderName: string) => void;
  onSendQuickNotification: (callback: (text: string) => void) => void;
  onCheckLobbyStatus: (callback: () => void) => void;
  sendLobbyStatusResult: (inLobby: boolean) => void;
  togglePip: (show: boolean) => void;
  sendPipLobbyStatus: (connected: boolean) => void;
  onPipCommand: (callback: (command: string) => void) => void;
  quit: () => void;
}

declare global {
  interface Window {
    athena: AthenaAPI;
  }
}
