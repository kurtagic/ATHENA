import React, { useState, useMemo } from 'react';
import type maplibregl from 'maplibre-gl';
import { Crosshair, Target, Flame, Trash2, Shield } from 'lucide-react';
import { useArtilleryStore } from '../../stores/artilleryStore';
import { useMapStore } from '../../stores/mapStore';
import { ARTILLERY_PLATFORMS, platformDisplayName } from '../../data/artilleryPlatforms';
import { setPlacementMode, clearAll, clearTarget, clearImpact, setMainGun, removeArtillery, renameGun, setPlatformFromUI, setGunPlatform } from '../../map/artillery';
import type { PlacementMode } from '../../stores/artilleryStore';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '../ui/select';

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 mt-1">
      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-gold)] whitespace-nowrap">{label}</span>
      <div className="flex-1 h-px bg-gradient-to-r from-[var(--color-gold-dim)] to-transparent" />
    </div>
  );
}

function ActionButton({
  id,
  icon,
  label,
  mode,
  currentMode,
  danger,
  colSpan,
  onClick,
}: {
  id: string;
  icon?: React.ReactNode;
  label: string;
  mode?: PlacementMode;
  currentMode: PlacementMode;
  danger?: boolean;
  colSpan?: boolean;
  onClick: () => void;
}) {
  const isActive = mode !== undefined && currentMode === mode;
  return (
    <button
      id={id}
      className={`flex items-center justify-center bg-[var(--color-navy)] text-white/70 border border-[var(--color-border-tactical)] py-2 px-2.5 rounded-[var(--radius-sm)] font-semibold text-[11px] uppercase tracking-[0.08em] cursor-pointer shadow-[0_1px_3px_rgba(0,0,0,0.3)] transition-all duration-150 hover:bg-[var(--color-navy-light)] hover:text-white active:scale-[0.97]${
        isActive ? ' active-mode' : ''
      }${danger ? ' arty-danger-btn hover:!bg-[var(--color-destructive-dim)] hover:!border-[rgba(239,83,80,0.4)] hover:!text-[var(--color-destructive)]' : ''}${
        colSpan ? ' col-span-2' : ''
      }`}
      onClick={onClick}
    >
      {icon && <span className="mr-1.5 opacity-70">{icon}</span>}
      {label}
    </button>
  );
}

function RenameCell({ label, posIndex }: { label: string; posIndex: number }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(label);
  const map = useMapStore((s) => s.mapInstance);

  if (editing) {
    return (
      <td className="arty-col-num">
        <input
          type="text"
          className="arty-rename-input"
          value={value}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => {
            const trimmed = value.trim();
            if (trimmed && trimmed !== label && map) {
              renameGun(posIndex, trimmed, map);
            }
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') { setValue(label); setEditing(false); }
          }}
        />
      </td>
    );
  }

  return (
    <td
      className="arty-col-num"
      title="Double-click to rename"
      style={{ cursor: 'pointer' }}
      onDoubleClick={() => { setValue(label); setEditing(true); }}
    >
      {label}
    </td>
  );
}

function factionColor(faction: string): string {
  if (faction === 'WARDEN') return 'arty-faction-warden';
  if (faction === 'COLONIAL') return 'arty-faction-colonial';
  return 'arty-faction-both';
}

function platformShortName(index: number): string {
  const p = ARTILLERY_PLATFORMS[index];
  if (!p) return '?';
  if (p.nickname) return p.nickname;
  // Use first word of name as short label
  const first = p.name.split(' ')[0];
  return first.length > 10 ? first.slice(0, 9) + '…' : first;
}

function PlatformCell({
  platformIndex,
  posIndex,
  groups,
  map,
}: {
  platformIndex: number;
  posIndex: number;
  groups: [string, { platform: typeof ARTILLERY_PLATFORMS[number]; index: number }[]][];
  map: maplibregl.Map | null;
}) {
  return (
    <td className="arty-col-plat">
      <Select
        value={String(platformIndex)}
        onValueChange={(v) => { if (map) setGunPlatform(posIndex, Number(v), map); }}
      >
        <SelectTrigger className="bg-transparent border-none shadow-none h-auto p-0 text-[11px] text-white/60 hover:text-white/90 cursor-pointer min-w-0 [&>svg]:hidden">
          <span className="truncate" title={ARTILLERY_PLATFORMS[platformIndex]?.name}>
            {platformShortName(platformIndex)}
          </span>
        </SelectTrigger>
        <SelectContent className="bg-[#1a1a1e] border-[var(--color-border-tactical)] text-white">
          {groups.map(([type, platforms], gi) => (
            <React.Fragment key={type}>
              {gi > 0 && <SelectSeparator className="bg-white/10 my-1.5" />}
              <SelectGroup>
                <SelectLabel className="text-[var(--color-gold)]/70 text-[14px] font-medium uppercase tracking-[0.1em] mb-0.5">{type}</SelectLabel>
                {platforms.map(({ platform, index }) => (
                  <SelectItem key={index} value={String(index)} className="text-[12px] focus:bg-white/10 focus:text-white">
                    <span className={factionColor(platform.faction)}>{platformDisplayName(platform)}</span>
                  </SelectItem>
                ))}
              </SelectGroup>
            </React.Fragment>
          ))}
        </SelectContent>
      </Select>
    </td>
  );
}

export function RightSidebar() {
  const placementMode = useArtilleryStore((s) => s.placementMode);
  const platformIndex = useArtilleryStore((s) => s.platformIndex);
  const statusText = useArtilleryStore((s) => s.statusText);
  const solutions = useArtilleryStore((s) => s.solutions);
  const hasTarget = useArtilleryStore((s) => s.hasTarget);
  const map = useMapStore((s) => s.mapInstance);

  const groups = useMemo(() => {
    const map = new Map<string, { platform: typeof ARTILLERY_PLATFORMS[number]; index: number }[]>();
    ARTILLERY_PLATFORMS.forEach((p, i) => {
      const list = map.get(p.type) || [];
      list.push({ platform: p, index: i });
      map.set(p.type, list);
    });
    return Array.from(map.entries());
  }, []);

  const handlePlaceGun = () => {
    setPlacementMode(placementMode === 'placing-arty' ? 'idle' : 'placing-arty');
  };
  const handleSetTarget = () => {
    setPlacementMode(placementMode === 'placing-target' ? 'idle' : 'placing-target');
  };
  const handleMarkImpact = () => {
    setPlacementMode(placementMode === 'placing-impact' ? 'idle' : 'placing-impact');
  };
  const handleClearTarget = () => {
    if (map) clearTarget(map);
  };
  const handleClearImpact = () => {
    if (map) clearImpact(map);
  };
  const handleClearAll = () => {
    if (map) clearAll(map);
  };

  const isPlacing = placementMode !== 'idle';

  return (
    <div
      id="ide-sidebar-right"
      className="overflow-hidden border-l border-white/5"
      style={{
        gridArea: 'right',
        background: 'linear-gradient(180deg, rgba(18,18,22,0.95) 0%, rgba(12,12,14,0.98) 100%)',
      }}
    >
      <div
        id="arty-sidebar"
        className="w-full h-full text-white font-sans flex flex-col overflow-y-auto"
      >
        <div
          id="arty-sidebar-header"
          className="relative px-5 pt-3.5 pb-3 font-bold text-[13px] uppercase tracking-[0.14em] text-white/70 flex items-center gap-2 after:content-[''] after:absolute after:bottom-0 after:left-5 after:right-5 after:h-px after:opacity-40"
        >
          <Shield size={14} className="text-[var(--color-gold)]" />
          <span>Artillery</span>
        </div>
        <div id="arty-sidebar-content" className="px-5 py-4 flex flex-col gap-3.5">
          <label
            htmlFor="arty-platform-dropdown"
            className="font-semibold text-[11px] uppercase tracking-[0.06em] text-white/70"
          >
            Platform
          </label>
          <Select
            value={String(platformIndex)}
            onValueChange={(v) => { if (map) setPlatformFromUI(Number(v), map); }}
          >
            <SelectTrigger className="bg-[var(--color-surface-inset)] border-[var(--color-border-tactical)] text-white text-[13px] h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1a1e] border-[var(--color-border-tactical)] text-white">
              {groups.map(([type, platforms], gi) => (
                <React.Fragment key={type}>
                  {gi > 0 && <SelectSeparator className="bg-white/10 my-1.5" />}
                  <SelectGroup>
                    <SelectLabel className="text-[var(--color-gold)]/70 text-[14px] font-medium uppercase tracking-[0.1em] mb-0.5">{type}</SelectLabel>
                    {platforms.map(({ platform, index }) => (
                      <SelectItem key={index} value={String(index)} className="text-[13px] focus:bg-white/10 focus:text-white">
                        <span className={factionColor(platform.faction)}>{platformDisplayName(platform)}</span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </React.Fragment>
              ))}
            </SelectContent>
          </Select>
          <SectionHeader label="Fire Control" />
          <div id="arty-actions" className="grid grid-cols-1 gap-1.5">
            <ActionButton id="arty-place-gun-btn" icon={<Crosshair size={14} />} label="Place Gun" mode="placing-arty" currentMode={placementMode} onClick={handlePlaceGun} />
            <ActionButton id="arty-set-target-btn" icon={<Target size={14} />} label="Set Target" mode="placing-target" currentMode={placementMode} onClick={handleSetTarget} />
            <ActionButton id="arty-mark-impact-btn" icon={<Flame size={14} />} label="Mark Impact" mode="placing-impact" currentMode={placementMode} onClick={handleMarkImpact} />
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <ActionButton id="arty-clear-target-btn" label="Clear Target" currentMode={placementMode} danger onClick={handleClearTarget} />
            <ActionButton id="arty-clear-impact-btn" label="Clear Impact" currentMode={placementMode} danger onClick={handleClearImpact} />
            <ActionButton id="arty-clear-all-btn" label="Clear All" currentMode={placementMode} danger onClick={handleClearAll} />
          </div>
          {statusText && (
            <div
              id="arty-status-text"
              className={`font-medium text-[11px] tracking-[0.02em] ${isPlacing ? 'text-[var(--color-gold)]' : 'text-[var(--color-muted)]'}`}
            >
              {statusText}
            </div>
          )}
          <SectionHeader label="Solutions" />
          <table
            id="arty-solution-table"
            className="w-full font-mono text-sm"
            style={{ borderCollapse: 'separate', borderSpacing: '0 4px' }}
          >
            <thead>
              <tr>
                <th className="arty-col-star font-semibold text-[10px] uppercase tracking-[0.08em] text-[var(--color-muted)] py-1 px-[5px] text-left" />
                <th className="arty-col-num font-semibold text-[10px] uppercase tracking-[0.08em] text-[var(--color-muted)] py-1 px-[5px] text-left">#</th>
                <th className="arty-col-plat font-semibold text-[10px] uppercase tracking-[0.08em] text-[var(--color-muted)] py-1 px-[5px] text-left">Platform</th>
                <th className="arty-col-dist font-semibold text-[10px] uppercase tracking-[0.08em] text-[var(--color-muted)] py-1 px-[5px] text-left">Distance</th>
                <th className="arty-col-az font-semibold text-[10px] uppercase tracking-[0.08em] text-[var(--color-muted)] py-1 px-[5px] text-left">Azimuth</th>
                <th className="arty-col-reld font-semibold text-[10px] uppercase tracking-[0.08em] text-[var(--color-muted)] py-1 px-[5px] text-left">&Delta; Distance</th>
                <th className="arty-col-relaz font-semibold text-[10px] uppercase tracking-[0.08em] text-[var(--color-muted)] py-1 px-[5px] text-left">&Delta; Azimuth</th>
                <th className="arty-col-del" />
              </tr>
            </thead>
            <tbody>
              {solutions.map((sol) => {
                const rowClass =
                  hasTarget && !sol.inRange ? 'arty-row-oor'
                    : sol.isMain ? 'arty-row-main'
                    : '';

                return (
                  <tr key={sol.posIndex} className={rowClass}>
                    <td className="arty-col-star">
                      <button
                        className={`arty-star-btn${sol.isMain ? ' main-gun' : ''}`}
                        title="Set as main gun"
                        onClick={() => map && setMainGun(sol.posIndex, map)}
                      >
                        {sol.isMain ? '\u2605' : '\u2606'}
                      </button>
                    </td>
                    <RenameCell label={sol.label} posIndex={sol.posIndex} />
                    <PlatformCell platformIndex={sol.platformIndex} posIndex={sol.posIndex} groups={groups} map={map} />
                    {hasTarget ? (
                      <>
                        <td className="arty-col-dist text-white">{sol.distanceM.toFixed(1)}m</td>
                        <td className="arty-col-az text-white">{sol.azimuthDeg.toFixed(1)}&deg;</td>
                        <td className="arty-col-reld text-white">
                          {sol.isMain ? '--' : `${sol.relDist >= 0 ? '+' : ''}${sol.relDist.toFixed(1)}m`}
                        </td>
                        <td className="arty-col-relaz text-white">
                          {sol.isMain ? '--' : `${sol.relAz >= 0 ? '+' : ''}${sol.relAz.toFixed(1)}\u00b0`}
                        </td>
                      </>
                    ) : (
                      <td colSpan={4} className="arty-no-target">NO TARGET</td>
                    )}
                    <td className="arty-col-del">
                      <button
                        className="arty-del-btn"
                        title="Remove gun"
                        onClick={() => map && removeArtillery(sol.posIndex, map)}
                      >
                        &#x2715;
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
