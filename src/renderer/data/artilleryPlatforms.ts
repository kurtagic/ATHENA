export interface ArtilleryPlatform {
  name: string;
  nickname: string;
  type: string;
  faction: 'WARDEN' | 'COLONIAL' | 'BOTH';
  minRange: number;
  maxRange: number;
  minInaccuracy: number;
  maxInaccuracy: number;
}

export const ARTILLERY_PLATFORMS: ArtilleryPlatform[] = [
  { name: '74b-1 Ronan Gunship', nickname: '', type: 'Mortar', faction: 'WARDEN', minRange: 75, maxRange: 100, minInaccuracy: 2.5, maxInaccuracy: 14.5 },
  { name: 'Type C - "Charon"', nickname: 'Charon', type: 'Mortar', faction: 'COLONIAL', minRange: 75, maxRange: 100, minInaccuracy: 2.5, maxInaccuracy: 14.5 },
  { name: 'Devitt-Caine Mk. IV MMR', nickname: '', type: 'Mortar', faction: 'WARDEN', minRange: 45, maxRange: 80, minInaccuracy: 2.5, maxInaccuracy: 9.45 },
  { name: 'HH-d "Peltast"', nickname: 'Peltast', type: 'Mortar', faction: 'COLONIAL', minRange: 45, maxRange: 80, minInaccuracy: 2.5, maxInaccuracy: 9.45 },
  { name: 'Niska-Rycker Mk. IX Skycaller', nickname: '', type: '4C-Fire Rocket', faction: 'WARDEN', minRange: 275, maxRange: 350, minInaccuracy: 37.5, maxInaccuracy: 60 },
  { name: 'T13 "Deioneus" Rocket Battery', nickname: 'Deioneus', type: '4C-Fire Rocket', faction: 'COLONIAL', minRange: 350, maxRange: 400, minInaccuracy: 41.5, maxInaccuracy: 57.5 },
  { name: 'Rycker 4/3-F Wasp Nest', nickname: '', type: '4C-Fire Rocket', faction: 'WARDEN', minRange: 375, maxRange: 450, minInaccuracy: 37.5, maxInaccuracy: 60 },
  { name: 'DAE 3b-2 "Hades\' Net"', nickname: "Hades' Net", type: '3C-High Explosive Rocket', faction: 'COLONIAL', minRange: 300, maxRange: 575, minInaccuracy: 35, maxInaccuracy: 52 },
  { name: 'R-17 "Retiarius" Skirmisher', nickname: 'Retiarius', type: '3C-High Explosive Rocket', faction: 'COLONIAL', minRange: 375, maxRange: 500, minInaccuracy: 37.5, maxInaccuracy: 51 },
  { name: "O'Brien V.200 Squire", nickname: '', type: '3C-High Explosive Rocket', faction: 'WARDEN', minRange: 375, maxRange: 500, minInaccuracy: 39, maxInaccuracy: 51 },
  { name: 'AC-b "Trident"', nickname: 'Trident', type: '120mm', faction: 'COLONIAL', minRange: 100, maxRange: 225, minInaccuracy: 2.5, maxInaccuracy: 8.5 },
  { name: '120-68 "Koronides" Field Gun', nickname: 'Koronides', type: '120mm', faction: 'COLONIAL', minRange: 100, maxRange: 250, minInaccuracy: 22.5, maxInaccuracy: 30 },
  { name: 'Huber Lariat 120mm', nickname: '', type: '120mm', faction: 'WARDEN', minRange: 100, maxRange: 300, minInaccuracy: 25, maxInaccuracy: 35 },
  { name: 'Conqueror', nickname: '', type: '120mm', faction: 'COLONIAL', minRange: 100, maxRange: 200, minInaccuracy: 2.5, maxInaccuracy: 8.5 },
  { name: 'Titan', nickname: '', type: '120mm', faction: 'COLONIAL', minRange: 100, maxRange: 200, minInaccuracy: 2.5, maxInaccuracy: 8.5 },
  { name: 'Callahan', nickname: '', type: '120mm', faction: 'WARDEN', minRange: 100, maxRange: 200, minInaccuracy: 2.5, maxInaccuracy: 8.5 },
  { name: 'Blacksteele', nickname: '', type: '120mm', faction: 'WARDEN', minRange: 100, maxRange: 200, minInaccuracy: 2.5, maxInaccuracy: 8.5 },
  { name: 'Huber Exalt 150mm', nickname: '', type: '150mm', faction: 'WARDEN', minRange: 100, maxRange: 300, minInaccuracy: 25, maxInaccuracy: 35 },
  { name: 'Lance-46 "Sarissa"', nickname: 'Sarissa', type: '150mm', faction: 'COLONIAL', minRange: 120, maxRange: 250, minInaccuracy: 25, maxInaccuracy: 35 },
  { name: 'Flood Mk. IX Stain', nickname: '', type: '150mm', faction: 'WARDEN', minRange: 120, maxRange: 250, minInaccuracy: 25, maxInaccuracy: 35 },
  { name: '50-500 "Thunderbolt" Cannon', nickname: 'Thunderbolt', type: '150mm', faction: 'COLONIAL', minRange: 200, maxRange: 350, minInaccuracy: 32.5, maxInaccuracy: 40 },
  { name: 'Titan', nickname: '', type: '150mm', faction: 'COLONIAL', minRange: 100, maxRange: 225, minInaccuracy: 2.5, maxInaccuracy: 8.5 },
  { name: 'Callahan', nickname: '', type: '150mm', faction: 'WARDEN', minRange: 100, maxRange: 225, minInaccuracy: 2.5, maxInaccuracy: 8.5 },
  { name: 'Tempest Cannon RA-2', nickname: '', type: '300mm', faction: 'BOTH', minRange: 350, maxRange: 500, minInaccuracy: 50, maxInaccuracy: 50 },
  { name: 'Storm Cannon', nickname: '', type: '300mm', faction: 'BOTH', minRange: 400, maxRange: 1000, minInaccuracy: 50, maxInaccuracy: 50 },
];

export function platformDisplayName(p: ArtilleryPlatform): string {
  if (p.nickname) return `${p.nickname} - ${p.type}`;
  return `${p.name} - ${p.type}`;
}
