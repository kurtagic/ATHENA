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

export interface AthenaAPI {
  onWarStatus: (callback: (data: WarStatus) => void) => void;
  onHexItems: (callback: (data: HexItemsPayload) => void) => void;
  onStaticLabels: (callback: (data: StaticLabelsPayload) => void) => void;
  setSelectedHexes: (hexes: string[]) => void;
}

declare global {
  interface Window {
    athena: AthenaAPI;
  }
}
