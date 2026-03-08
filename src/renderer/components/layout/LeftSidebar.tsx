import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { useMapStore } from '../../stores/mapStore';
import { LayersPanel } from '../panels/LayersPanel';

export function LeftSidebar() {
  const detailMode = useMapStore((s) => s.detailMode);
  const layersSidebarOpen = useMapStore((s) => s.layersSidebarOpen);
  const setLayersSidebarOpen = useMapStore((s) => s.setLayersSidebarOpen);

  if (!detailMode || !layersSidebarOpen) return null;

  return (
    <div
      id="ide-sidebar-left"
      className="fixed top-[42px] left-0 bottom-[68px] w-[240px] z-40 overflow-hidden border-r border-white/5 transition-transform duration-200 ease-in-out"
      style={{
        background: 'linear-gradient(180deg, rgba(18,18,22,0.95) 0%, rgba(12,12,14,0.98) 100%)',
      }}
    >
      <div className="flex items-center justify-between px-5 pt-3.5 pb-0">
        <span />
        <button
          className="text-white/40 hover:text-white/70 transition-colors cursor-pointer bg-transparent border-none p-0"
          title="Collapse sidebar"
          onClick={() => setLayersSidebarOpen(false)}
        >
          <ChevronLeft size={16} />
        </button>
      </div>
      <LayersPanel />
    </div>
  );
}
