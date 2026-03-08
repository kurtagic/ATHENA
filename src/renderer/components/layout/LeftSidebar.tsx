import React from 'react';
import { LayersPanel } from '../panels/LayersPanel';

export function LeftSidebar() {
  return (
    <div
      id="ide-sidebar-left"
      className="overflow-hidden border-r border-white/5"
      style={{
        gridArea: 'left',
        background: 'linear-gradient(180deg, rgba(18,18,22,0.95) 0%, rgba(12,12,14,0.98) 100%)',
      }}
    >
      <LayersPanel />
    </div>
  );
}
