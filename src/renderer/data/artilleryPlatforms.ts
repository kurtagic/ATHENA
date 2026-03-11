export interface ArtilleryPlatform {
  id: string;
  name: string;
  nickname: string;
  type: string;
  faction: 'WARDEN' | 'COLONIAL' | 'BOTH';
  chassis: 'land' | 'ship';
  minRange: number;
  maxRange: number;
  minInaccuracy: number;
  maxInaccuracy: number;
  windDrift: [number, number];
}

export const ARTILLERY_PLATFORMS: ArtilleryPlatform[] = [
  { id: 'ronan-gunship', name: '74b-1 Ronan Gunship', nickname: '', type: 'Mortar', faction: 'WARDEN', chassis: 'ship', minRange: 75, maxRange: 100, minInaccuracy: 2.5, maxInaccuracy: 14.5, windDrift: [10, 40] },
  { id: 'charon', name: 'Type C - "Charon"', nickname: 'Charon', type: 'Mortar', faction: 'COLONIAL', chassis: 'ship', minRange: 75, maxRange: 100, minInaccuracy: 2.5, maxInaccuracy: 14.5, windDrift: [10, 40] },
  { id: 'mmr', name: 'Devitt-Caine Mk. IV MMR', nickname: '', type: 'Mortar', faction: 'WARDEN', chassis: 'land', minRange: 45, maxRange: 80, minInaccuracy: 2.5, maxInaccuracy: 9.45, windDrift: [10, 40] },
  { id: 'peltast', name: 'HH-d "Peltast"', nickname: 'Peltast', type: 'Mortar', faction: 'COLONIAL', chassis: 'land', minRange: 45, maxRange: 80, minInaccuracy: 2.5, maxInaccuracy: 9.45, windDrift: [10, 40] },
  { id: 'skycaller', name: 'Niska-Rycker Mk. IX Skycaller', nickname: '', type: '4C-Fire Rocket', faction: 'WARDEN', chassis: 'land', minRange: 275, maxRange: 350, minInaccuracy: 37.5, maxInaccuracy: 60, windDrift: [15, 40] },
  { id: 'deioneus', name: 'T13 "Deioneus" Rocket Battery', nickname: 'Deioneus', type: '4C-Fire Rocket', faction: 'COLONIAL', chassis: 'land', minRange: 350, maxRange: 400, minInaccuracy: 41.5, maxInaccuracy: 57.5, windDrift: [15, 40] },
  { id: 'wasp-nest', name: 'Rycker 4/3-F Wasp Nest', nickname: '', type: '4C-Fire Rocket', faction: 'WARDEN', chassis: 'land', minRange: 375, maxRange: 450, minInaccuracy: 37.5, maxInaccuracy: 60, windDrift: [15, 40] },
  { id: 'hades-net', name: 'DAE 3b-2 "Hades\' Net"', nickname: "Hades' Net", type: '3C-High Explosive Rocket', faction: 'COLONIAL', chassis: 'land', minRange: 300, maxRange: 575, minInaccuracy: 35, maxInaccuracy: 52, windDrift: [15, 40] },
  { id: 'retiarius', name: 'R-17 "Retiarius" Skirmisher', nickname: 'Retiarius', type: '3C-High Explosive Rocket', faction: 'COLONIAL', chassis: 'land', minRange: 375, maxRange: 500, minInaccuracy: 37.5, maxInaccuracy: 51, windDrift: [15, 40] },
  { id: 'squire', name: "O'Brien V.200 Squire", nickname: '', type: '3C-High Explosive Rocket', faction: 'WARDEN', chassis: 'land', minRange: 375, maxRange: 500, minInaccuracy: 39, maxInaccuracy: 51, windDrift: [15, 40] },
  { id: 'trident', name: 'AC-b "Trident"', nickname: 'Trident', type: '120mm', faction: 'COLONIAL', chassis: 'land', minRange: 100, maxRange: 225, minInaccuracy: 2.5, maxInaccuracy: 8.5, windDrift: [10, 30] },
  { id: 'koronides', name: '120-68 "Koronides" Field Gun', nickname: 'Koronides', type: '120mm', faction: 'COLONIAL', chassis: 'land', minRange: 100, maxRange: 250, minInaccuracy: 22.5, maxInaccuracy: 30, windDrift: [10, 30] },
  { id: 'huber-lariat', name: 'Huber Lariat 120mm', nickname: '', type: '120mm', faction: 'WARDEN', chassis: 'land', minRange: 100, maxRange: 300, minInaccuracy: 25, maxInaccuracy: 35, windDrift: [10, 30] },
  { id: 'conqueror-120', name: 'Conqueror', nickname: '', type: '120mm', faction: 'COLONIAL', chassis: 'ship', minRange: 100, maxRange: 200, minInaccuracy: 2.5, maxInaccuracy: 8.5, windDrift: [10, 30] },
  { id: 'titan-120', name: 'Titan', nickname: '', type: '120mm', faction: 'COLONIAL', chassis: 'ship', minRange: 100, maxRange: 200, minInaccuracy: 2.5, maxInaccuracy: 8.5, windDrift: [10, 30] },
  { id: 'callahan-120', name: 'Callahan', nickname: '', type: '120mm', faction: 'WARDEN', chassis: 'ship', minRange: 100, maxRange: 200, minInaccuracy: 2.5, maxInaccuracy: 8.5, windDrift: [10, 30] },
  { id: 'blacksteele', name: 'Blacksteele', nickname: '', type: '120mm', faction: 'WARDEN', chassis: 'ship', minRange: 100, maxRange: 200, minInaccuracy: 2.5, maxInaccuracy: 8.5, windDrift: [10, 30] },
  { id: 'huber-exalt', name: 'Huber Exalt 150mm', nickname: '', type: '150mm', faction: 'WARDEN', chassis: 'land', minRange: 100, maxRange: 300, minInaccuracy: 25, maxInaccuracy: 35, windDrift: [15, 40] },
  { id: 'sarissa', name: 'Lance-46 "Sarissa"', nickname: 'Sarissa', type: '150mm', faction: 'COLONIAL', chassis: 'land', minRange: 120, maxRange: 250, minInaccuracy: 25, maxInaccuracy: 35, windDrift: [15, 40] },
  { id: 'flood-stain', name: 'Flood Mk. IX Stain', nickname: '', type: '150mm', faction: 'WARDEN', chassis: 'land', minRange: 120, maxRange: 250, minInaccuracy: 25, maxInaccuracy: 35, windDrift: [15, 40] },
  { id: 'thunderbolt', name: '50-500 "Thunderbolt" Cannon', nickname: 'Thunderbolt', type: '150mm', faction: 'COLONIAL', chassis: 'land', minRange: 200, maxRange: 350, minInaccuracy: 32.5, maxInaccuracy: 40, windDrift: [15, 40] },
  { id: 'titan-150', name: 'Titan', nickname: '', type: '150mm', faction: 'COLONIAL', chassis: 'ship', minRange: 100, maxRange: 225, minInaccuracy: 2.5, maxInaccuracy: 8.5, windDrift: [15, 40] },
  { id: 'callahan-150', name: 'Callahan', nickname: '', type: '150mm', faction: 'WARDEN', chassis: 'ship', minRange: 100, maxRange: 225, minInaccuracy: 2.5, maxInaccuracy: 8.5, windDrift: [15, 40] },
  { id: 'tempest', name: 'Tempest Cannon RA-2', nickname: '', type: '300mm', faction: 'BOTH', chassis: 'land', minRange: 350, maxRange: 500, minInaccuracy: 50, maxInaccuracy: 50, windDrift: [20, 50] },
  { id: 'storm-cannon', name: 'Storm Cannon', nickname: '', type: '300mm', faction: 'BOTH', chassis: 'land', minRange: 400, maxRange: 1000, minInaccuracy: 50, maxInaccuracy: 50, windDrift: [20, 50] },
];

export function platformDisplayName(p: ArtilleryPlatform, showType = false): string {
  if (showType) return `${p.name} - ${p.type}`;
  return p.name;
}

export function platformIndexById(id: string): number {
  return ARTILLERY_PLATFORMS.findIndex((p) => p.id === id);
}

export const DEFAULT_PLATFORM_ID = 'huber-lariat';
export const DEFAULT_PLATFORM_INDEX = platformIndexById(DEFAULT_PLATFORM_ID);
