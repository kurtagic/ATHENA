import React, { useEffect, useState } from 'react';
import { X, Keyboard, Volume2, LogOut, Settings2 } from 'lucide-react';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAppStore } from '../../stores/appStore';
import { GeneralTab } from './GeneralTab';
import { KeybindsTab } from './KeybindsTab';
import { AudioTab } from './AudioTab';

const TABS = [
  { id: 'general' as const, label: 'General', icon: Settings2 },
  { id: 'keybinds' as const, label: 'Keybinds', icon: Keyboard },
  { id: 'audio' as const, label: 'Audio', icon: Volume2 },
];

type TabId = (typeof TABS)[number]['id'];

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('general');
  const setSettingsOpen = useSettingsStore((s) => s.setSettingsOpen);
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);
  const appView = useAppStore((s) => s.appView);
  const returnToMenu = useAppStore((s) => s.returnToMenu);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setSettingsOpen(false);
      }
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [setSettingsOpen]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setSettingsOpen(false)}
      />

      {/* Panel */}
      <div
        className="relative flex w-[720px] h-[520px] rounded-lg border border-white/10 overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, rgba(18,18,22,0.96) 0%, rgba(12,12,14,0.98) 100%)',
          backdropFilter: 'blur(24px)',
        }}
      >
        {/* Sidebar */}
        <div className="w-[180px] flex flex-col border-r border-white/8 py-4 px-3 gap-1">
          <div className="px-2 mb-3">
            <span className="font-bold text-[13px] uppercase tracking-[0.14em] text-[var(--color-gold)]">
              Settings
            </span>
          </div>
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius-sm)] text-left text-[12px] font-medium transition-colors duration-150 border-none cursor-pointer ${
                  isActive
                    ? 'bg-white/10 text-white'
                    : 'bg-transparent text-white/50 hover:bg-white/5 hover:text-white/70'
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={14} className={isActive ? 'text-[var(--color-gold)]' : 'text-white/30'} />
                {tab.label}
              </button>
            );
          })}

          {appView === 'app' && (
            <div className="mt-auto pt-3 border-t border-white/8">
              <button
                className="flex items-center gap-2.5 px-3 py-2 w-full rounded-[var(--radius-sm)] text-left text-[12px] font-medium transition-colors duration-150 border-none cursor-pointer bg-transparent text-red-400/80 hover:bg-red-500/10 hover:text-red-400"
                onClick={() => {
                  setSettingsOpen(false);
                  returnToMenu();
                }}
              >
                <LogOut size={14} />
                Back to Main Menu
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col overflow-y-auto">
          <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/8">
            <span className="text-[11px] uppercase tracking-[0.12em] text-white/30 font-semibold">
              {TABS.find((t) => t.id === activeTab)?.label}
            </span>
            <button
              className="w-6 h-6 flex items-center justify-center rounded-[var(--radius-sm)] bg-transparent border-none text-white/40 cursor-pointer transition-colors duration-150 hover:bg-white/10 hover:text-white/70"
              onClick={() => setSettingsOpen(false)}
            >
              <X size={14} />
            </button>
          </div>
          <div className="flex-1 p-5">
            {activeTab === 'general' && <GeneralTab />}
            {activeTab === 'keybinds' && <KeybindsTab />}
            {activeTab === 'audio' && <AudioTab />}
          </div>
        </div>
      </div>
    </div>
  );
}
