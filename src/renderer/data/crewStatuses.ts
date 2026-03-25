import type { CrewStatus, CrewType } from '../multiplayer/protocol';

export interface StatusDef {
  id: CrewStatus;
  label: string;
  color: string;
}

export const ALL_CREW_STATUSES: StatusDef[] = [
  { id: 'afk',            label: 'AFK',            color: '#78909c' },
  { id: 'standby',        label: 'Standby',        color: '#29b6f6' },
  { id: 'withdraw',       label: 'Withdrawing',    color: '#ffa726' },
  { id: 'prepping',       label: 'Prepping',       color: '#66bb6a' },
  { id: 'engaging',       label: 'Engaging',       color: '#ef5350' },
  { id: 'reposition',     label: 'Repositioning',  color: '#ffca28' },
  { id: 'at',             label: 'AT',             color: '#f44336' },
  { id: 'pve',            label: 'PvE',            color: '#7e57c2' },
  { id: 'refuel-rearm',   label: 'Refuel Rearm',   color: '#26c6da' },
  { id: 'downed',         label: 'Downed',         color: '#e53935' },
  { id: 'repairing',      label: 'Repairing',      color: '#ab47bc' },
  { id: 'armour-repair',  label: 'Armour Repair',  color: '#8d6e63' },
  { id: 'out-of-ammo',    label: 'Out Of Ammo',    color: '#ff7043' },
  { id: 'turret-damaged', label: 'Turret Damaged', color: '#ec407a' },
  { id: 'large-hole',     label: 'Large Hole',     color: '#d32f2f' },
];

const GENERIC_IDS: CrewStatus[] = ['afk', 'standby', 'withdraw', 'prepping', 'engaging', 'reposition'];

const EXTRA_BY_TYPE: Record<CrewType, CrewStatus[]> = {
  infantry:  ['at', 'pve'],
  air:       ['refuel-rearm', 'downed', 'repairing'],
  tank:      ['refuel-rearm', 'armour-repair'],
  artillery: ['repairing', 'out-of-ammo'],
  naval:     ['refuel-rearm', 'turret-damaged', 'large-hole', 'out-of-ammo'],
};

const statusMap = new Map<CrewStatus, StatusDef>(ALL_CREW_STATUSES.map(s => [s.id, s]));

export function getStatusDef(status: CrewStatus): StatusDef {
  return statusMap.get(status) ?? statusMap.get('afk')!;
}

export function getStatusesForType(type: CrewType): StatusDef[] {
  const ids = [...GENERIC_IDS, ...(EXTRA_BY_TYPE[type] ?? [])];
  return ids.map(id => statusMap.get(id)!);
}

// Backward compat alias
export const CREW_STATUSES = ALL_CREW_STATUSES;
