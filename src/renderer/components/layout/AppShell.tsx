import React, { useCallback } from 'react';
import { Layers, ChevronRight } from 'lucide-react';
import { useMapStore } from '../../stores/mapStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { setShellElement } from '../../map/detailView';
import { TopBar } from './TopBar';
import { LeftSidebar } from './LeftSidebar';
import { MapPanel } from './MapPanel';
import { RightSidebar } from './RightSidebar';
import { BottomBar } from './BottomBar';
import { SessionPanel } from '../panels/SessionPanel';
import { SettingsPage } from '../settings/SettingsPage';
import { CommandBanner } from '../artillery/CommandBanner';
import { NotificationStack } from '../notifications/NotificationStack';
import { DebugPanel } from '../panels/DebugPanel';


export function AppShell() {
  const detailMode = useMapStore((s) => s.detailMode);
  const layersSidebarOpen = useMapStore((s) => s.layersSidebarOpen);
  const setLayersSidebarOpen = useMapStore((s) => s.setLayersSidebarOpen);
  const settingsOpen = useSettingsStore((s) => s.settingsOpen);

  const shellRef = useCallback((el: HTMLDivElement | null) => {
    if (el) setShellElement(el);
  }, []);

  return (
    <>
      <div
        ref={shellRef}
        id="ide-shell"
        className={`w-screen h-screen grid grid-cols-[1fr] ${
          detailMode
            ? `grid-rows-[42px_1fr_68px] detail-mode`
            : 'grid-rows-[42px_1fr_0px]'
        }`}
        style={{
          gridTemplateAreas: `
            "topbar"
            "map"
            "bottom"
          `,
        }}
      >
        <TopBar />
        <MapPanel />
        <BottomBar />

        {/* Floating left-side stack: multiplayer panel + layers toggle (when sidebar closed) */}
        <div
          className={`fixed top-12 w-[280px] z-50 flex flex-col gap-2 transition-[left] duration-200 ease-in-out ${
            detailMode && layersSidebarOpen ? 'left-[252px]' : 'left-3'
          }`}
        >
          <div
            className="rounded-lg border border-white/10 backdrop-blur-xl overflow-hidden"
            style={{
              background: 'linear-gradient(180deg, rgba(18,18,22,0.92) 0%, rgba(12,12,14,0.96) 100%)',
            }}
          >
            <SessionPanel />
          </div>
          {detailMode && !layersSidebarOpen && (
            <button
              className="flex items-center gap-1.5 px-3 py-2 rounded-[var(--radius-sm)] border border-[var(--color-border-tactical)] text-[var(--color-gold)] text-[11px] font-bold uppercase tracking-[0.1em] cursor-pointer transition-all duration-150 hover:bg-[var(--color-gold-dim)] hover:border-[var(--color-gold)] self-start"
              style={{ background: 'rgba(18,18,22,0.92)', backdropFilter: 'blur(12px)' }}
              onClick={() => setLayersSidebarOpen(true)}
            >
              <ChevronRight size={12} className="mr-0.5 opacity-60" />
              <Layers size={13} />
              Layers
            </button>
          )}
        </div>
      </div>
      <LeftSidebar />
      <RightSidebar />
      {settingsOpen && <SettingsPage />}
      <CommandBanner />
      <NotificationStack />
<DebugPanel />
    </>
  );
}
