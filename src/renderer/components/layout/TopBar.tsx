import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { useMapStore } from '../../stores/mapStore';
import { exitDetailMode } from '../../map/detailView';

export function TopBar() {
  const detailMode = useMapStore((s) => s.detailMode);

  return (
    <div
      id="ide-topbar"
      className="flex items-center bg-[var(--color-surface-glass)] backdrop-blur-xl border-b border-[var(--color-border-glass)] overflow-hidden z-10"
      style={{ gridArea: 'topbar' }}
    >
      {detailMode && (
        <div className="flex-none flex items-center pl-2">
          <button
            id="back-btn"
            className="flex items-center gap-1 px-3 py-1 bg-white/[0.07] border-none text-white font-semibold text-[13px] rounded-[var(--radius-sm)] cursor-pointer transition-all duration-150 hover:bg-white/[0.13] active:scale-[0.97]"
            onClick={() => exitDetailMode()}
          >
            <ChevronLeft size={14} />
            Back
          </button>
        </div>
      )}
      <div className="flex-1 flex items-center justify-center min-w-0">
        {detailMode && (
          <div
            id="detail-title"
            className="px-4 py-0.5 text-[var(--color-gold)] font-bold text-[13px] uppercase tracking-[0.08em] whitespace-nowrap overflow-hidden text-ellipsis"
          >
            {detailMode.hexName}
          </div>
        )}
      </div>
      <div className="flex-none flex items-center gap-1.5 pr-2">
        <button
          id="quit-btn"
          className="w-7 h-7 p-0 bg-white/[0.07] border-none text-white/70 text-base leading-none rounded-[var(--radius-sm)] cursor-pointer flex items-center justify-center transition-all duration-150 hover:bg-[rgba(180,40,40,0.7)] hover:text-white active:scale-[0.97]"
          onClick={() => (window as any).athena?.quit()}
        >
          &times;
        </button>
      </div>
    </div>
  );
}
