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
  quickControls: string; // e.g. "F2"
}

export interface AudioSettings {
  autoSilenceOnVoice: boolean;
  inputDeviceId: string;   // '' = system default
  outputDeviceId: string;  // '' = system default
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
  distanceM: number | null;
  azimuthDeg: number | null;
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
  onQuickControlsToggle: (callback: () => void) => void;
  onQcRequestArtilleryData: (callback: () => void) => void;
  sendQcArtilleryDataReply: (data: unknown) => void;
  onQcSelectSpotter: (callback: (payload: any) => void) => void;
  onQcSpotterAdjust: (callback: (payload: any) => void) => void;
  sendQcSpotterUpdate: (data: unknown) => void;
  onQcCloseMode: (callback: () => void) => void;
  toggleNotesPip: (show: boolean, text?: string) => void;
  updatePinnedNotes: (text: string) => void;
  onNotesPipTextChange: (callback: (text: string) => void) => void;
  toggleCrewPip: (show: boolean, crews?: unknown[]) => void;
  updateCrewPip: (crews: unknown[]) => void;
  onQcRequestCrewData: (callback: () => void) => void;
  sendQcCrewDataReply: (data: unknown) => void;
  onQcCrewSetStatus: (callback: (status: string) => void) => void;
  onQcTogglePip: (callback: () => void) => void;
  onQcToggleNotesPip: (callback: () => void) => void;
  onQcToggleCrewPip: (callback: () => void) => void;
  onQcRequestPinStates: (callback: () => void) => void;
  sendQcPinStatesReply: (data: { artillery: boolean; notes: boolean; crew: boolean }) => void;
  quit: () => void;
}

declare global {
  interface Window {
    athena: AthenaAPI;
  }
}
