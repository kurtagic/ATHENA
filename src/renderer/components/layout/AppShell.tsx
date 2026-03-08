import React, { useCallback } from 'react';
import { useMapStore } from '../../stores/mapStore';
import { setShellElement } from '../../map/detailView';
import { TopBar } from './TopBar';
import { LeftSidebar } from './LeftSidebar';
import { MapPanel } from './MapPanel';
import { RightSidebar } from './RightSidebar';
import { BottomBar } from './BottomBar';
import { SessionPanel } from '../panels/SessionPanel';

export function AppShell() {
  const detailMode = useMapStore((s) => s.detailMode);

  const shellRef = useCallback((el: HTMLDivElement | null) => {
    if (el) setShellElement(el);
  }, []);

  return (
    <div
      ref={shellRef}
      id="ide-shell"
      className={`w-screen h-screen grid transition-all duration-200 ease-in-out ${
        detailMode
          ? 'grid-rows-[42px_1fr_68px] grid-cols-[240px_1fr_560px] detail-mode'
          : 'grid-rows-[42px_1fr_0px] grid-cols-[0px_1fr_0px]'
      }`}
      style={{
        gridTemplateAreas: `
          "topbar topbar topbar"
          "left   map    right"
          "bottom bottom bottom"
        `,
      }}
    >
      <TopBar />
      <LeftSidebar />
      <MapPanel />
      <RightSidebar />
      <BottomBar />

      {/* Floating multiplayer panel — always visible, top-left; shifts right of sidebar in detail mode */}
      <div
        className={`fixed top-12 w-[220px] z-50 rounded-lg border border-white/10 backdrop-blur-xl overflow-hidden transition-[left] duration-200 ease-in-out ${
          detailMode ? 'left-[252px]' : 'left-3'
        }`}
        style={{
          background: 'linear-gradient(180deg, rgba(18,18,22,0.92) 0%, rgba(12,12,14,0.96) 100%)',
        }}
      >
        <SessionPanel />
      </div>
    </div>
  );
}
