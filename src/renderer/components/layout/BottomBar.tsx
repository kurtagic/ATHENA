import React from 'react';
import { Pencil, Eraser, Undo2 } from 'lucide-react';
import { useDrawStore } from '../../stores/drawStore';
import { useMapStore } from '../../stores/mapStore';
import { setDrawColor, toggleEraser } from '../../map/drawing';
import { performUndo } from '../../map/undo';
import { getDetailMode } from '../../map/detailView';
import { Toggle } from '../ui/toggle';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { Separator } from '../ui/separator';

const SWATCHES = [
  { color: '#ff0000', title: 'Red' },
  { color: '#00cc00', title: 'Green' },
  { color: '#3388ff', title: 'Blue' },
  { color: '#ffcc00', title: 'Yellow' },
  { color: '#ffffff', title: 'White' },
  { color: '#000000', title: 'Black' },
];

export function BottomBar() {
  const activeColor = useDrawStore((s) => s.activeColor);
  const eraserActive = useDrawStore((s) => s.eraserActive);
  const map = useMapStore((s) => s.mapInstance);

  const handleSwatchClick = (color: string) => {
    setDrawColor(color);
    useDrawStore.getState().setActiveColor(color);
  };

  const handleCustomColor = (e: React.ChangeEvent<HTMLInputElement>) => {
    const color = e.target.value;
    setDrawColor(color);
    useDrawStore.getState().setActiveColor(color);
  };

  const handleEraserClick = () => {
    if (map) {
      toggleEraser(map);
      useDrawStore.getState().toggleEraser();
    }
  };

  const handleUndoClick = () => {
    if (map && getDetailMode()) {
      performUndo(map);
    }
  };

  return (
    <div
      id="ide-bottombar"
      className="flex items-center bg-[var(--color-surface-glass)] backdrop-blur-xl border-t border-[var(--color-border-glass)] overflow-hidden z-10"
      style={{ gridArea: 'bottom' }}
    >
      <div className="flex-1" />
      <div className="flex-none flex items-center justify-center">
        <div
          id="draw-toolbar"
          className="flex items-center gap-2.5 bg-[var(--color-surface-tactical)] border border-[var(--color-border-tactical)] rounded-[var(--radius-md)] px-3 py-1.5 shadow-[0_0_12px_rgba(74,158,255,0.06),inset_0_1px_0_rgba(255,255,255,0.04)]"
        >
          <Pencil size={14} className="text-white/40 shrink-0" />
          <div id="draw-colors" className="flex items-center gap-[5px]">
            {SWATCHES.map((s) => (
              <div
                key={s.color}
                className={`draw-swatch${activeColor === s.color && !eraserActive ? ' selected' : ''}`}
                data-color={s.color}
                style={{ background: s.color }}
                title={s.title}
                onClick={() => handleSwatchClick(s.color)}
              />
            ))}
            <input
              type="color"
              id="draw-custom-color"
              defaultValue="#ff0000"
              title="Custom color"
              className="w-[26px] h-[26px] p-0 border-none cursor-pointer rounded-full overflow-hidden transition-all duration-150 hover:scale-[1.15]"
              style={{
                background: 'conic-gradient(#ff0000, #ff8800, #ffff00, #00cc00, #3388ff, #8833ff, #ff0000)',
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.15)',
              }}
              onInput={handleCustomColor as any}
            />
          </div>
          <Separator orientation="vertical" className="h-5 bg-white/10" />
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Toggle
                  pressed={eraserActive}
                  onPressedChange={handleEraserClick}
                  className="h-8 w-8 bg-white/[0.07] hover:bg-white/[0.13] data-[state=on]:bg-[var(--color-destructive-dim)] data-[state=on]:text-[var(--color-destructive)]"
                >
                  <Eraser size={15} />
                </Toggle>
              </TooltipTrigger>
              <TooltipContent side="top" className="bg-[#1a1a1e] border-[var(--color-border-tactical)] text-white text-xs">
                Eraser
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  id="draw-undo-btn"
                  title="Undo last stroke"
                  className="h-8 w-8 flex items-center justify-center bg-white/[0.07] text-white border-none rounded-[var(--radius-sm)] cursor-pointer transition-all duration-150 hover:bg-white/[0.13] active:scale-[0.97]"
                  onClick={handleUndoClick}
                >
                  <Undo2 size={15} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="bg-[#1a1a1e] border-[var(--color-border-tactical)] text-white text-xs">
                Undo
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
      <div className="flex-1" />
    </div>
  );
}
