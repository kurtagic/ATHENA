import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type maplibregl from 'maplibre-gl';
import { Crosshair, Target, Flame, Trash2, Shield, Check, Copy, ChevronRight, ChevronLeft, Pin, Megaphone, ChevronDown } from 'lucide-react';
import { useArtilleryStore } from '../../stores/artilleryStore';
import { useMapStore } from '../../stores/mapStore';
import { ARTILLERY_PLATFORMS, platformDisplayName } from '../../data/artilleryPlatforms';
import { setPlacementMode, clearAll, clearTarget, clearImpact, setMainGun, removeArtillery, renameGun, setPlatformFromUI, setGunPlatform, refreshPinnedData } from '../../map/artillery';
import { WindCompass } from '../artillery/WindCompass';
import { session } from '../../multiplayer/sessionManager';
import { useSessionStore } from '../../stores/sessionStore';
import type { PlacementMode, ArtillerySolution } from '../../stores/artilleryStore';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '../ui/select';

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 mt-1">
      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-gold)] whitespace-nowrap">{label}</span>
      <div className="flex-1 h-px bg-gradient-to-r from-[var(--color-gold-dim)] to-transparent" />
    </div>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'disabled' | 'active';

function ActionButton({
  id,
  icon,
  label,
  variant,
  colSpan,
  onClick,
}: {
  id: string;
  icon?: React.ReactNode;
  label: string;
  variant: ButtonVariant;
  colSpan?: boolean;
  onClick: () => void;
}) {
  const base = 'flex items-center justify-center py-2 px-2.5 rounded-[var(--radius-sm)] font-semibold text-[11px] tracking-[0.08em] cursor-pointer shadow-[0_1px_3px_rgba(0,0,0,0.3)] transition-all duration-150 active:scale-[0.97]';

  let variantClass: string;
  switch (variant) {
    case 'primary':
      variantClass = 'bg-[rgba(76,175,80,0.12)] text-emerald-400 border border-emerald-500/50 hover:bg-[rgba(76,175,80,0.2)] hover:text-emerald-300';
      break;
    case 'secondary':
      variantClass = 'bg-[var(--color-navy)] text-white/50 border border-[var(--color-border-tactical)] hover:bg-[var(--color-navy-light)] hover:text-white/70';
      break;
    case 'disabled':
      variantClass = 'bg-[var(--color-navy)] text-white/30 border border-[var(--color-border-tactical)] opacity-40 pointer-events-none';
      break;
    case 'active':
      variantClass = 'active-mode bg-[var(--color-gold-dim)] border border-[var(--color-gold)] text-[var(--color-gold)]';
      break;
  }

  return (
    <button
      id={id}
      className={`${base} ${variantClass}${colSpan ? ' col-span-2' : ''}`}
      onClick={onClick}
    >
      {icon && <span className="mr-1.5 opacity-70">{icon}</span>}
      {label}
      {variant === 'secondary' && (
        <Check size={10} className="ml-1.5 text-emerald-400" />
      )}
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
        <SelectContent className="bg-[#1a1a1e] border-[var(--color-border-tactical)] text-white max-h-[600px]">
          {groups.map(([type, platforms], gi) => (
            <React.Fragment key={type}>
              {gi > 0 && <SelectSeparator className="bg-white/10 my-1.5" />}
              <SelectGroup>
                <SelectLabel className="text-[var(--color-gold)]/70 text-[14px] font-medium uppercase tracking-[0.1em] mb-0.5">{type}</SelectLabel>
                {platforms.map(({ platform, index }) => (
                  <SelectItem key={index} value={String(index)} className="text-[12px] focus:bg-white/10 focus:text-white">
                    <span className={factionColor(platform.faction)}>{platformDisplayName(platform, type === 'Ships')}</span>
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

function RecommendedSolution({ solution }: { solution: ArtillerySolution }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const text = `${solution.distanceM.toFixed(1)}m / ${solution.azimuthDeg.toFixed(1)}°`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [solution]);

  const borderColor = solution.inRange ? 'var(--color-accent)' : 'var(--color-destructive)';

  return (
    <div
      className="arty-solution-card"
      style={{ borderLeftColor: borderColor }}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[var(--color-gold)] text-[14px] font-bold">&#9733; {solution.label}</span>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 font-mono text-[17px] text-[var(--color-gold)] tabular-nums">
          <span>Fire Solution: {solution.distanceM.toFixed(1)}m, {solution.azimuthDeg.toFixed(1)}&deg;</span>
        </div>
      </div>
      {solution.windDriftM > 0 && (
        <div className="text-[10px] text-white/40 mt-0.5">
          Wind: {solution.windDriftM.toFixed(1)}m drift
        </div>
      )}
      <div className="flex items-center justify-between mt-1.5">
        {solution.inRange ? (
          <span className="arty-badge-inrange">In Range</span>
        ) : (
          <span className="arty-badge-oor">Out of Range</span>
        )}
        <button
          className="flex items-center gap-1.5 text-[13px] text-white/40 hover:text-white/70 transition-colors cursor-pointer bg-transparent border-none"
          onClick={handleCopy}
        >
          <Copy size={13} />
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

export function RightSidebar() {
  const placementMode = useArtilleryStore((s) => s.placementMode);
  const platformIndex = useArtilleryStore((s) => s.platformIndex);
  const statusText = useArtilleryStore((s) => s.statusText);
  const solutions = useArtilleryStore((s) => s.solutions);
  const hasTarget = useArtilleryStore((s) => s.hasTarget);
  const hasImpact = useArtilleryStore((s) => s.hasImpact);
  const pinnedGuns = useArtilleryStore((s) => s.pinnedGuns);
  const pipVisible = useArtilleryStore((s) => s.pipVisible);
  const showWarden = useArtilleryStore((s) => s.showWarden);
  const showColonial = useArtilleryStore((s) => s.showColonial);
  const showShips = useArtilleryStore((s) => s.showShips);
  const toggleShowWarden = useArtilleryStore((s) => s.toggleShowWarden);
  const toggleShowColonial = useArtilleryStore((s) => s.toggleShowColonial);
  const toggleShowShips = useArtilleryStore((s) => s.toggleShowShips);
  const map = useMapStore((s) => s.mapInstance);
  const detailMode = useMapStore((s) => s.detailMode);
  const artSidebarOpen = useMapStore((s) => s.artSidebarOpen);
  const setArtSidebarOpen = useMapStore((s) => s.setArtSidebarOpen);

  const isConnected = useSessionStore((s) => s.lobbyId) !== null;
  const hasGuns = solutions.length > 0;

  const [clearOpen, setClearOpen] = useState(false);
  const clearRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!clearOpen) return;
    const handler = (e: MouseEvent) => {
      if (clearRef.current && !clearRef.current.contains(e.target as Node)) setClearOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [clearOpen]);

  const groups = useMemo(() => {
    const typeOrder = ['120mm', '150mm', '3C-High Explosive Rocket', '4C-Fire Rocket', 'Mortar', '300mm'];
    const factionOrder = (a: { platform: typeof ARTILLERY_PLATFORMS[number] }, b: { platform: typeof ARTILLERY_PLATFORMS[number] }) => {
      const rank = (f: string) => f === 'WARDEN' ? 0 : f === 'BOTH' ? 1 : 2;
      return rank(a.platform.faction) - rank(b.platform.faction);
    };
    const factionVisible = (faction: string) => {
      if (faction === 'BOTH') return showWarden || showColonial;
      if (faction === 'WARDEN') return showWarden;
      if (faction === 'COLONIAL') return showColonial;
      return true;
    };

    const typeMap = new Map<string, { platform: typeof ARTILLERY_PLATFORMS[number]; index: number }[]>();
    const ships: { platform: typeof ARTILLERY_PLATFORMS[number]; index: number }[] = [];

    ARTILLERY_PLATFORMS.forEach((p, i) => {
      if (p.chassis === 'ship') {
        if (showShips) ships.push({ platform: p, index: i });
        return;
      }
      if (!factionVisible(p.faction)) return;
      const list = typeMap.get(p.type) || [];
      list.push({ platform: p, index: i });
      typeMap.set(p.type, list);
    });

    const result: [string, { platform: typeof ARTILLERY_PLATFORMS[number]; index: number }[]][] = [];
    for (const type of typeOrder) {
      const list = typeMap.get(type);
      if (list && list.length > 0) result.push([type, list.sort(factionOrder)]);
    }
    if (showShips && ships.length > 0) {
      result.push(['Ships', ships.sort(factionOrder)]);
    }
    return result;
  }, [showWarden, showColonial, showShips]);

  useEffect(() => {
    if (!map) return;
    const allVisible = groups.flatMap(([, platforms]) => platforms);
    if (allVisible.length > 0 && !allVisible.some(p => p.index === platformIndex)) {
      setPlatformFromUI(allVisible[0].index, map);
    }
  }, [groups, platformIndex, map]);

  useEffect(() => {
    window.athena.onPipCommand((command) => {
      session.sendCommandBanner(command as 'fire' | 'stop');
    });
  }, []);

  useEffect(() => {
    window.athena.sendPipLobbyStatus(isConnected);
  }, [isConnected]);

  const mainSolution = useMemo(() => {
    if (!hasTarget || solutions.length === 0) return null;
    return solutions.find((s) => s.isMain) ?? null;
  }, [solutions, hasTarget]);

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

  // Determine button variants
  const getPlaceGunVariant = (): ButtonVariant => {
    if (placementMode === 'placing-arty') return 'active';
    if (hasGuns) return 'secondary';
    return 'primary';
  };
  const getSetTargetVariant = (): ButtonVariant => {
    if (placementMode === 'placing-target') return 'active';
    if (!hasGuns) return 'disabled';
    if (hasTarget) return 'secondary';
    return 'primary';
  };
  const getMarkImpactVariant = (): ButtonVariant => {
    if (placementMode === 'placing-impact') return 'active';
    if (!hasGuns || !hasTarget) return 'disabled';
    return hasImpact ? 'secondary' : 'primary';
  };

  const isPlacing = placementMode !== 'idle';

  if (!detailMode) return null;

  if (!artSidebarOpen) {
    return (
      <button
        className="fixed top-[52px] right-3 z-50 flex items-center gap-1.5 px-3 py-2 rounded-[var(--radius-sm)] border border-[var(--color-border-tactical)] text-[var(--color-gold)] text-[11px] font-bold uppercase tracking-[0.1em] cursor-pointer transition-all duration-150 hover:bg-[var(--color-gold-dim)] hover:border-[var(--color-gold)]"
        style={{ background: 'rgba(18,18,22,0.92)', backdropFilter: 'blur(12px)' }}
        onClick={() => setArtSidebarOpen(true)}
      >
        <Shield size={13} />
        Artillery
        <ChevronLeft size={12} className="ml-0.5 opacity-60" />
      </button>
    );
  }

  return (
    <div
      id="ide-sidebar-right"
      className="fixed top-[42px] right-0 bottom-[68px] w-[504px] z-40 overflow-hidden border-l border-white/5 transition-transform duration-200 ease-in-out"
      style={{
        background: 'linear-gradient(180deg, rgba(18,18,22,0.95) 0%, rgba(12,12,14,0.98) 100%)',
      }}
    >
      <div
        id="arty-sidebar"
        className="w-full h-full text-white font-sans flex flex-col overflow-y-auto"
      >
        <div className="panel-header relative px-5 pt-3.5 pb-3 flex items-center gap-2">
          <Shield size={14} className="text-[var(--color-gold)]" />
          <span className="font-bold text-[13px] uppercase tracking-[0.14em] text-[var(--color-gold)]">Artillery</span>
          <button
            className={`p-0 bg-transparent border-none cursor-pointer transition-colors ${
              pipVisible ? 'text-[var(--color-gold)]' : 'text-white/30 hover:text-white/50'
            }`}
            title={pipVisible ? 'Unpin Artillery' : 'Pin Artillery'}
            onClick={() => {
              const next = !pipVisible;
              useArtilleryStore.getState().setPipVisible(next);
              window.athena.togglePip(next);
            }}
          >
            <Pin size={13} fill={pipVisible ? 'currentColor' : 'none'} />
          </button>
          <div className="flex-1" />
          <button
            className="text-white/40 hover:text-white/70 transition-colors cursor-pointer bg-transparent border-none p-0"
            title="Collapse sidebar"
            onClick={() => setArtSidebarOpen(false)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div id="arty-sidebar-content" className="px-5 py-4 flex flex-col gap-3.5">
          <SectionHeader label="Platform" />
          <div className="flex items-center gap-1.5">
            {([
              { label: 'Warden', active: showWarden, toggle: toggleShowWarden, activeClass: 'bg-blue-500/15 border-blue-400/60 text-blue-400' },
              { label: 'Colonial', active: showColonial, toggle: toggleShowColonial, activeClass: 'bg-green-500/15 border-green-400/60 text-green-400' },
              { label: 'Ships', active: showShips, toggle: toggleShowShips, activeClass: 'bg-white/10 border-white/50 text-white' },
            ] as const).map(({ label, active, toggle, activeClass }) => (
              <button
                key={label}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-[0.08em] cursor-pointer transition-all duration-150 border ${
                  active
                    ? activeClass
                    : 'bg-transparent border-white/15 text-white/35 hover:border-white/30 hover:text-white/55'
                }`}
                onClick={toggle}
              >
                {label}
              </button>
            ))}
          </div>
          <Select
            value={String(platformIndex)}
            onValueChange={(v) => { if (map) setPlatformFromUI(Number(v), map); }}
          >
            <SelectTrigger className="bg-[var(--color-surface-inset)] border-[var(--color-border-tactical)] text-white text-[13px] h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1a1e] border-[var(--color-border-tactical)] text-white max-h-[600px]">
              {groups.map(([type, platforms], gi) => (
                <React.Fragment key={type}>
                  {gi > 0 && <SelectSeparator className="bg-white/10 my-1.5" />}
                  <SelectGroup>
                    <SelectLabel className="text-[var(--color-gold)]/70 text-[14px] font-medium uppercase tracking-[0.1em] mb-0.5">{type}</SelectLabel>
                    {platforms.map(({ platform, index }) => (
                      <SelectItem key={index} value={String(index)} className="text-[13px] focus:bg-white/10 focus:text-white">
                        <span className={factionColor(platform.faction)}>{platformDisplayName(platform, type === 'Ships')}</span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </React.Fragment>
              ))}
            </SelectContent>
          </Select>
          <SectionHeader label="Fire Control" />
          <div id="arty-actions" className="grid grid-cols-3 gap-1.5">
            <ActionButton id="arty-place-gun-btn" icon={<Crosshair size={14} />} label="Platform" variant={getPlaceGunVariant()} onClick={handlePlaceGun} />
            <ActionButton id="arty-set-target-btn" icon={<Target size={14} />} label="Target" variant={getSetTargetVariant()} onClick={handleSetTarget} />
            <ActionButton id="arty-mark-impact-btn" icon={<Flame size={14} />} label="Impact" variant={getMarkImpactVariant()} onClick={handleMarkImpact} />
          </div>
          {isConnected && (
            <div className="grid grid-cols-2 gap-1.5">
              <button
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-[var(--radius-sm)] font-bold text-[12px] uppercase tracking-[0.1em] cursor-pointer transition-all duration-150 active:scale-[0.97] bg-emerald-950/40 text-emerald-400 border border-emerald-500/50 hover:bg-emerald-950/60 hover:text-emerald-300 hover:border-emerald-400/70 shadow-[0_1px_3px_rgba(0,0,0,0.3)]"
                onClick={() => {
                  session.sendCommandBanner('fire');
                }}
              >
                <Megaphone size={14} />
                Fire
              </button>
              <button
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-[var(--radius-sm)] font-bold text-[12px] uppercase tracking-[0.1em] cursor-pointer transition-all duration-150 active:scale-[0.97] bg-red-950/40 text-red-400 border border-red-500/50 hover:bg-red-950/60 hover:text-red-300 hover:border-red-400/70 shadow-[0_1px_3px_rgba(0,0,0,0.3)]"
                onClick={() => {
                  session.sendCommandBanner('stop');
                }}
              >
                <Megaphone size={14} />
                Stop
              </button>
            </div>
          )}
          <div ref={clearRef} className="relative inline-block">
            <button
              className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-bold uppercase tracking-[0.06em] cursor-pointer transition-all duration-150 border bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20 hover:border-red-400/50 hover:text-red-300"
              onClick={() => setClearOpen((v) => !v)}
            >
              Clear
              <ChevronDown size={10} className={`transition-transform ${clearOpen ? 'rotate-180' : ''}`} />
            </button>
            {clearOpen && (
              <div className="absolute left-0 top-full mt-1 z-50 min-w-[120px] rounded border border-red-500/30 bg-[var(--color-navy)] shadow-lg overflow-hidden">
                <button className="w-full px-3 py-1.5 text-left text-[9px] font-bold uppercase tracking-[0.06em] text-red-400 hover:bg-red-500/20 cursor-pointer" onClick={() => { handleClearTarget(); setClearOpen(false); }}>Clear Target</button>
                <button className="w-full px-3 py-1.5 text-left text-[9px] font-bold uppercase tracking-[0.06em] text-red-400 hover:bg-red-500/20 cursor-pointer" onClick={() => { handleClearImpact(); setClearOpen(false); }}>Clear Impact</button>
                <button className="w-full px-3 py-1.5 text-left text-[9px] font-bold uppercase tracking-[0.06em] text-red-400 hover:bg-red-500/20 cursor-pointer" onClick={() => { handleClearAll(); setClearOpen(false); }}>Clear All</button>
              </div>
            )}
          </div>
          {statusText && (
            <div
              id="arty-status-text"
              className={`font-medium text-[11px] tracking-[0.02em] ${isPlacing ? 'text-[var(--color-gold)]' : 'text-[var(--color-muted)]'}`}
            >
              {statusText}
            </div>
          )}
          <SectionHeader label="Wind" />
          <WindCompass />
          <SectionHeader label="Solutions" />
          {mainSolution && (
            <RecommendedSolution solution={mainSolution} />
          )}
          <table
            id="arty-solution-table"
            className="w-full font-mono text-sm"
            style={{ borderCollapse: 'separate', borderSpacing: '0 4px' }}
          >
            <thead>
              <tr>
                <th className="arty-col-star font-semibold text-[12px] uppercase tracking-[0.08em] text-[var(--color-muted)] py-1.5 px-[6px] text-left" />
                <th className="arty-col-pin font-semibold text-[12px] uppercase tracking-[0.08em] text-[var(--color-muted)] py-1.5 px-[6px] text-left" />
                <th className="arty-col-num font-semibold text-[12px] uppercase tracking-[0.08em] text-[var(--color-muted)] py-1.5 px-[6px] text-left">#</th>
                <th className="arty-col-plat font-semibold text-[12px] uppercase tracking-[0.08em] text-[var(--color-muted)] py-1.5 px-[6px] text-left">Platform</th>
                <th className="arty-col-dist font-semibold text-[12px] uppercase tracking-[0.08em] text-[var(--color-muted)] py-1.5 px-[6px] text-left">Distance</th>
                <th className="arty-col-az font-semibold text-[12px] uppercase tracking-[0.08em] text-[var(--color-muted)] py-1.5 px-[6px] text-left">Azimuth</th>
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
                    <td className="arty-col-pin">
                      <button
                        className={`arty-pin-btn${pinnedGuns.has(sol.posIndex) ? ' pinned' : ''}`}
                        title="Pin to HUD"
                        onClick={() => {
                          useArtilleryStore.getState().togglePin(sol.posIndex);
                          refreshPinnedData();
                        }}
                      >
                        <Pin size={16} fill={pinnedGuns.has(sol.posIndex) ? 'currentColor' : 'none'} />
                      </button>
                    </td>
                    <RenameCell label={sol.label} posIndex={sol.posIndex} />
                    <PlatformCell platformIndex={sol.platformIndex} posIndex={sol.posIndex} groups={groups} map={map} />
                    {hasTarget ? (
                      <>
                        <td className="arty-col-dist text-white text-[13px] tabular-nums">{sol.distanceM.toFixed(1)}m</td>
                        <td className="arty-col-az text-white text-[13px] tabular-nums">{sol.azimuthDeg.toFixed(1)}&deg;</td>
                      </>
                    ) : (
                      <td colSpan={2} className="arty-no-target">NO TARGET</td>
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
