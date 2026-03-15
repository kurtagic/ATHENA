import React, { useCallback, useRef, useMemo, useState } from 'react';
import { Pencil, Eraser, Ruler, Slash, Hash, Square } from 'lucide-react';
import { useDrawStore, type BrushPattern } from '../../stores/drawStore';
import { useMapStore } from '../../stores/mapStore';
import { useSessionStore } from '../../stores/sessionStore';
import { useEnemyMarkerStore } from '../../stores/enemyMarkerStore';
import { uuidToColor } from '../../data/colorFromUuid';
import { ARTILLERY_PLATFORMS, platformDisplayName } from '../../data/artilleryPlatforms';
import { setDrawColor, setDrawWeight, setDrawOpacity, setDrawBrushPattern, toggleEraser } from '../../map/drawing';
import { Toggle } from '../ui/toggle';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { Separator } from '../ui/separator';
import { Slider } from '../ui/slider';
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover';

const SWATCHES = [
  { color: '#ef4444', title: 'Red' },
  { color: '#22c55e', title: 'Green' },
  { color: '#3b82f6', title: 'Blue' },
  { color: '#eab308', title: 'Yellow' },
  { color: '#ffffff', title: 'White' },
];

export function BottomBar() {
  const activeColor = useDrawStore((s) => s.activeColor);
  const activeTool = useDrawStore((s) => s.activeTool);
  const brushPattern = useDrawStore((s) => s.brushPattern);
  const strokeWidth = useDrawStore((s) => s.strokeWidth);
  const strokeOpacity = useDrawStore((s) => s.strokeOpacity);
  const map = useMapStore((s) => s.mapInstance);
  const memberId = useSessionStore((s) => s.memberId);
  const userColor = memberId ? uuidToColor(memberId) : null;
  const customColorRef = useRef('#ff8800');
  const [customColor, setCustomColorState] = useState('#ff8800');

  const [enemyPopoverOpen, setEnemyPopoverOpen] = useState(false);

  const enemyGroups = useMemo(() => {
    const typeOrder = ['120mm', '150mm', '3C-High Explosive Rocket', '4C-Fire Rocket', 'Mortar', '300mm'];
    const factionOrder = (a: { platform: typeof ARTILLERY_PLATFORMS[number] }, b: { platform: typeof ARTILLERY_PLATFORMS[number] }) => {
      const rank = (f: string) => f === 'WARDEN' ? 0 : f === 'BOTH' ? 1 : 2;
      return rank(a.platform.faction) - rank(b.platform.faction);
    };

    const typeMap = new Map<string, { platform: typeof ARTILLERY_PLATFORMS[number]; index: number }[]>();
    const ships: { platform: typeof ARTILLERY_PLATFORMS[number]; index: number }[] = [];

    ARTILLERY_PLATFORMS.forEach((p, i) => {
      if (p.chassis === 'ship') {
        ships.push({ platform: p, index: i });
        return;
      }
      const list = typeMap.get(p.type) || [];
      list.push({ platform: p, index: i });
      typeMap.set(p.type, list);
    });

    const result: [string, { platform: typeof ARTILLERY_PLATFORMS[number]; index: number }[]][] = [];
    for (const type of typeOrder) {
      const list = typeMap.get(type);
      if (list && list.length > 0) result.push([type, list.sort(factionOrder)]);
    }
    if (ships.length > 0) {
      result.push(['Ships', ships.sort(factionOrder)]);
    }
    return result;
  }, []);

  const handleEnemyToggle = useCallback(() => {
    if (activeTool === 'enemy-marker') {
      useEnemyMarkerStore.getState().setPlacingMarker(false);
      useDrawStore.getState().setActiveTool('pen');
      useMapStore.getState().setMapCursor('');
    }
  }, [activeTool]);

  const handleEnemyPlatformSelect = useCallback((index: number) => {
    if (activeTool === 'eraser' && map) {
      toggleEraser(map);
    }
    useEnemyMarkerStore.getState().setSelectedPlatformIndex(index);
    useEnemyMarkerStore.getState().setPlacingMarker(true);
    useDrawStore.getState().setActiveTool('enemy-marker');
    useMapStore.getState().setMapCursor('crosshair');
    setEnemyPopoverOpen(false);
  }, [activeTool, map]);

  const factionColor = (faction: string) => {
    if (faction === 'WARDEN') return 'text-blue-400';
    if (faction === 'COLONIAL') return 'text-green-400';
    return 'text-white/70';
  };

  const handleSwatchClick = useCallback((color: string) => {
    setDrawColor(color);
    useDrawStore.getState().setActiveColor(color);
  }, []);

  const handleCustomColorChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const color = e.target.value;
    customColorRef.current = color;
    setCustomColorState(color);
    setDrawColor(color);
    useDrawStore.getState().setActiveColor(color);
  }, []);

  const handlePenClick = useCallback(() => {
    if (activeTool === 'eraser' && map) {
      toggleEraser(map);
    }
    if (activeTool !== 'pen') {
      useDrawStore.getState().setActiveTool('pen');
      setDrawBrushPattern(undefined);
      // Restore last color if needed
      const state = useDrawStore.getState();
      if (!state.activeColor) {
        useDrawStore.getState().setActiveColor('#ef4444');
        setDrawColor('#ef4444');
      }
    }
  }, [activeTool, map]);

  const handleEraserClick = useCallback(() => {
    if (map) {
      if (activeTool !== 'eraser') {
        toggleEraser(map);
        useDrawStore.getState().setActiveTool('eraser');
      } else {
        toggleEraser(map);
        useDrawStore.getState().setActiveTool('pen');
      }
    }
  }, [activeTool, map]);

  const handleRulerClick = useCallback(() => {
    if (activeTool === 'eraser' && map) {
      toggleEraser(map);
    }
    if (activeTool === 'ruler') {
      useDrawStore.getState().setActiveTool('pen');
    } else {
      useDrawStore.getState().setActiveTool('ruler');
    }
  }, [activeTool, map]);

  const handleAreaPatternClick = useCallback((pattern: BrushPattern) => {
    if (activeTool === 'eraser' && map) {
      toggleEraser(map);
    }
    if (activeTool === 'area' && brushPattern === pattern) {
      // Toggle back to pen
      useDrawStore.getState().setActiveTool('pen');
      setDrawBrushPattern(undefined);
    } else {
      useDrawStore.getState().setActiveTool('area');
      useDrawStore.getState().setBrushPattern(pattern);
      setDrawBrushPattern(pattern);
      // Restore color if coming from eraser
      const state = useDrawStore.getState();
      if (!state.activeColor) {
        useDrawStore.getState().setActiveColor('#ef4444');
        setDrawColor('#ef4444');
      }
    }
  }, [activeTool, brushPattern, map]);

  const handleWidthChange = useCallback((value: number[]) => {
    const w = value[0];
    useDrawStore.getState().setStrokeWidth(w);
    setDrawWeight(w);
  }, []);

  const handleOpacityChange = useCallback((value: number[]) => {
    const pct = value[0];
    useDrawStore.getState().setStrokeOpacity(pct / 100);
    setDrawOpacity(pct / 100);
  }, []);

  const isSwatchSelected = (color: string) =>
    activeColor === color && (activeTool === 'pen' || activeTool === 'area');

  const isCustomSelected =
    (activeTool === 'pen' || activeTool === 'area') &&
    activeColor !== '' &&
    !SWATCHES.some((s) => s.color === activeColor) &&
    activeColor !== userColor;

  return (
    <div
      id="ide-bottombar"
      className="flex items-center bg-[rgba(18,18,20,0.92)] backdrop-blur-xl border-t border-white/[0.06] overflow-hidden z-10"
      style={{ gridArea: 'bottom' }}
    >
      <div className="flex-1" />
      <div className="flex-none flex items-center justify-center">
        <div
          id="draw-toolbar"
          className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.08] rounded-[16px] px-3 py-1.5"
        >
          {/* Enemy Artillery */}
          <TooltipProvider delayDuration={300}>
            <div className="flex items-center gap-1.5">
              <Popover open={enemyPopoverOpen} onOpenChange={setEnemyPopoverOpen}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <Toggle
                        pressed={activeTool === 'enemy-marker'}
                        onPressedChange={() => {
                          if (activeTool === 'enemy-marker') {
                            handleEnemyToggle();
                          } else {
                            setEnemyPopoverOpen(true);
                          }
                        }}
                        className={`h-[34px] w-[34px] bg-transparent hover:bg-white/[0.08] text-white/50 border-b-2 transition-all ${
                          activeTool === 'enemy-marker'
                            ? 'border-b-red-500/80 bg-red-500/[0.12] text-red-400'
                            : 'border-b-transparent'
                        }`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                          <circle cx="12" cy="12" r="10"/>
                          <line x1="12" y1="2" x2="12" y2="6"/>
                          <line x1="12" y1="18" x2="12" y2="22"/>
                          <line x1="2" y1="12" x2="6" y2="12"/>
                          <line x1="18" y1="12" x2="22" y2="12"/>
                        </svg>
                      </Toggle>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="bg-[#1a1a1e] border-[var(--color-border-glass)] text-white text-xs">
                    Enemy Artillery
                  </TooltipContent>
                </Tooltip>
                <PopoverContent side="top" className="w-[240px] p-2 max-h-[400px] overflow-y-auto bg-[#1a1a1e] border-[var(--color-border-tactical)]">
                  {enemyGroups.map(([type, platforms], gi) => (
                    <React.Fragment key={type}>
                      {gi > 0 && <div className="h-px bg-white/10 my-1.5" />}
                      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-gold)]/70 px-2 py-1">{type}</div>
                      {platforms.map(({ platform, index }) => (
                        <button
                          key={index}
                          className="w-full text-left px-2 py-1.5 text-[12px] rounded hover:bg-white/10 transition-colors cursor-pointer"
                          onClick={() => handleEnemyPlatformSelect(index)}
                        >
                          <span className={factionColor(platform.faction)}>{platformDisplayName(platform, type === 'Ships')}</span>
                        </button>
                      ))}
                    </React.Fragment>
                  ))}
                </PopoverContent>
              </Popover>
            </div>

            <Separator orientation="vertical" className="h-5 bg-white/[0.08] mx-1" />

            {/* Tool group */}
            <div className="flex items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Toggle
                    pressed={activeTool === 'pen'}
                    onPressedChange={handlePenClick}
                    className={`h-[34px] w-[34px] bg-transparent hover:bg-white/[0.08] text-white/50 border-b-2 transition-all ${
                      activeTool === 'pen'
                        ? 'border-b-white/80 bg-white/[0.12] text-white'
                        : 'border-b-transparent'
                    }`}
                  >
                    <Pencil size={16} />
                  </Toggle>
                </TooltipTrigger>
                <TooltipContent side="top" className="bg-[#1a1a1e] border-[var(--color-border-glass)] text-white text-xs">
                  Draw (Right-click)
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Toggle
                    pressed={activeTool === 'eraser'}
                    onPressedChange={handleEraserClick}
                    className={`h-[34px] w-[34px] bg-transparent hover:bg-white/[0.08] text-white/50 border-b-2 transition-all ${
                      activeTool === 'eraser'
                        ? 'border-b-[var(--color-destructive)] bg-[var(--color-destructive-dim)] text-[var(--color-destructive)]'
                        : 'border-b-transparent'
                    }`}
                  >
                    <Eraser size={16} />
                  </Toggle>
                </TooltipTrigger>
                <TooltipContent side="top" className="bg-[#1a1a1e] border-[var(--color-border-glass)] text-white text-xs">
                  Eraser (E)
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Toggle
                    pressed={activeTool === 'ruler'}
                    onPressedChange={handleRulerClick}
                    className={`h-[34px] w-[34px] bg-transparent hover:bg-white/[0.08] text-white/50 border-b-2 transition-all ${
                      activeTool === 'ruler'
                        ? 'border-b-white/80 bg-white/[0.12] text-white'
                        : 'border-b-transparent'
                    }`}
                  >
                    <Ruler size={16} />
                  </Toggle>
                </TooltipTrigger>
                <TooltipContent side="top" className="bg-[#1a1a1e] border-[var(--color-border-glass)] text-white text-xs">
                  Ruler (Right-click)
                </TooltipContent>
              </Tooltip>
            </div>

            <Separator orientation="vertical" className="h-5 bg-white/[0.08] mx-1" />

            {/* Area brush group */}
            <div className="flex items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Toggle
                    pressed={activeTool === 'area' && brushPattern === 'diagonal'}
                    onPressedChange={() => handleAreaPatternClick('diagonal')}
                    className={`h-[34px] w-[34px] bg-transparent hover:bg-white/[0.08] text-white/50 border-b-2 transition-all ${
                      activeTool === 'area' && brushPattern === 'diagonal'
                        ? 'border-b-white/80 bg-white/[0.12] text-white'
                        : 'border-b-transparent'
                    }`}
                  >
                    <Slash size={16} />
                  </Toggle>
                </TooltipTrigger>
                <TooltipContent side="top" className="bg-[#1a1a1e] border-[var(--color-border-glass)] text-white text-xs">
                  Diagonal Fill
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Toggle
                    pressed={activeTool === 'area' && brushPattern === 'crosshatch'}
                    onPressedChange={() => handleAreaPatternClick('crosshatch')}
                    className={`h-[34px] w-[34px] bg-transparent hover:bg-white/[0.08] text-white/50 border-b-2 transition-all ${
                      activeTool === 'area' && brushPattern === 'crosshatch'
                        ? 'border-b-white/80 bg-white/[0.12] text-white'
                        : 'border-b-transparent'
                    }`}
                  >
                    <Hash size={16} />
                  </Toggle>
                </TooltipTrigger>
                <TooltipContent side="top" className="bg-[#1a1a1e] border-[var(--color-border-glass)] text-white text-xs">
                  Crosshatch Fill
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Toggle
                    pressed={activeTool === 'area' && brushPattern === 'border'}
                    onPressedChange={() => handleAreaPatternClick('border')}
                    className={`h-[34px] w-[34px] bg-transparent hover:bg-white/[0.08] text-white/50 border-b-2 transition-all ${
                      activeTool === 'area' && brushPattern === 'border'
                        ? 'border-b-white/80 bg-white/[0.12] text-white'
                        : 'border-b-transparent'
                    }`}
                  >
                    <Square size={16} />
                  </Toggle>
                </TooltipTrigger>
                <TooltipContent side="top" className="bg-[#1a1a1e] border-[var(--color-border-glass)] text-white text-xs">
                  Border Only
                </TooltipContent>
              </Tooltip>
            </div>

            <Separator orientation="vertical" className="h-5 bg-white/[0.08] mx-1" />

            {/* Color group */}
            <div className="flex items-center gap-[6px]">
              {userColor && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={`draw-swatch${isSwatchSelected(userColor) ? ' selected' : ''}`}
                      style={{ background: userColor }}
                      onClick={() => handleSwatchClick(userColor)}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="bg-[#1a1a1e] border-[var(--color-border-glass)] text-white text-xs">
                    Your Color
                  </TooltipContent>
                </Tooltip>
              )}
              {SWATCHES.map((s) => (
                <Tooltip key={s.color}>
                  <TooltipTrigger asChild>
                    <div
                      className={`draw-swatch${isSwatchSelected(s.color) ? ' selected' : ''}${s.color === '#ffffff' ? ' light' : ''}`}
                      style={{ background: s.color }}
                      onClick={() => handleSwatchClick(s.color)}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="bg-[#1a1a1e] border-[var(--color-border-glass)] text-white text-xs">
                    {s.title}
                  </TooltipContent>
                </Tooltip>
              ))}

              <Tooltip>
                <TooltipTrigger asChild>
                  <label
                    className={`relative w-6 h-6 rounded-md border cursor-pointer transition-all duration-120 hover:scale-110 ${
                      isCustomSelected
                        ? 'border-white/60 ring-1 ring-white/60 ring-offset-2 ring-offset-[rgba(18,18,20,0.92)]'
                        : 'border-white/20'
                    }`}
                    style={{ background: customColor }}
                    onClick={() => handleSwatchClick(customColorRef.current)}
                  >
                    <input
                      type="color"
                      value={customColor}
                      onChange={handleCustomColorChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </label>
                </TooltipTrigger>
                <TooltipContent side="top" className="bg-[#1a1a1e] border-[var(--color-border-glass)] text-white text-xs">
                  Custom Color
                </TooltipContent>
              </Tooltip>
            </div>

            <Separator orientation="vertical" className="h-5 bg-white/[0.08] mx-1" />

            {/* Brush settings group */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-white/40 uppercase tracking-wider">W</span>
                <Slider
                  className="w-[80px]"
                  value={[strokeWidth]}
                  onValueChange={handleWidthChange}
                  min={1}
                  max={10}
                  step={1}
                />
                <span className="text-[11px] text-white/60 w-4 text-right tabular-nums">{strokeWidth}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-white/40 uppercase tracking-wider">O</span>
                <Slider
                  className="w-[80px]"
                  value={[Math.round(strokeOpacity * 100)]}
                  onValueChange={handleOpacityChange}
                  min={10}
                  max={100}
                  step={10}
                />
                <span className="text-[11px] text-white/60 w-7 text-right tabular-nums">{Math.round(strokeOpacity * 100)}%</span>
              </div>
            </div>

          </TooltipProvider>
        </div>
      </div>
      <div className="flex-1" />
    </div>
  );
}
