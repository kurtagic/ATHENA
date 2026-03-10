import React, { useState } from 'react';
import { Users, LogIn, Settings, X } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { CreateLobbyScreen } from './CreateLobbyScreen';
import { JoinLobbyScreen } from './JoinLobbyScreen';
import logoUrl from '../../../../athena.png';

type Screen = 'main' | 'create' | 'join';

export function MainMenu() {
  const [screen, setScreen] = useState<Screen>('main');
  const enterApp = useAppStore((s) => s.enterApp);
  const setSettingsOpen = useSettingsStore((s) => s.setSettingsOpen);

  if (screen === 'create') {
    return <CreateLobbyScreen onBack={() => setScreen('main')} />;
  }

  if (screen === 'join') {
    return <JoinLobbyScreen onBack={() => setScreen('main')} />;
  }

  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen select-none"
      style={{
        background: `radial-gradient(ellipse at center, rgba(74,158,255,0.04), transparent 70%), var(--color-background)`,
      }}
    >
      {/* Logo & Title */}
      <div className="flex flex-col items-center mb-20">
        <img
          src={logoUrl}
          alt="Athena"
          className="w-40 h-40 mb-8 opacity-80"
          style={{ filter: 'brightness(0.85) sepia(1) hue-rotate(10deg) saturate(3)' }}
        />
        <h1
          className="text-7xl font-bold uppercase tracking-[0.3em] text-[var(--color-gold)]"
          style={{ textShadow: '0 0 30px rgba(var(--gold-rgb, 212,175,55), 0.3)' }}
        >
          ATHENA
        </h1>
        <p className="mt-4 text-[16px] text-white/30 tracking-[0.15em]">
          v{__APP_VERSION__}
        </p>
      </div>

      {/* Buttons */}
      <div className="flex flex-col gap-4 w-[420px]">
        <button
          onClick={() => setScreen('create')}
          className="group flex items-center justify-center gap-3 w-full px-8 py-5 bg-blue-600/40 hover:bg-blue-600/55 border border-blue-400/20 hover:border-blue-400/40 rounded-[var(--radius-md)] text-[18px] text-white font-semibold uppercase tracking-[0.12em] transition-all hover:shadow-[0_0_20px_rgba(59,130,246,0.15)]"
        >
          <Users size={22} className="opacity-70 group-hover:opacity-100 transition-opacity" />
          Create Lobby
        </button>

        <button
          onClick={() => setScreen('join')}
          className="group flex items-center justify-center gap-3 w-full px-8 py-5 bg-indigo-600/40 hover:bg-indigo-600/55 border border-indigo-400/20 hover:border-indigo-400/40 rounded-[var(--radius-md)] text-[18px] text-white font-semibold uppercase tracking-[0.12em] transition-all hover:shadow-[0_0_20px_rgba(99,102,241,0.15)]"
        >
          <LogIn size={22} className="opacity-70 group-hover:opacity-100 transition-opacity" />
          Join Lobby
        </button>

        <button
          onClick={enterApp}
          className="group flex items-center justify-center gap-3 w-full px-8 py-5 bg-transparent hover:bg-white/[0.04] border border-white/10 hover:border-white/20 rounded-[var(--radius-md)] text-[18px] text-white/60 hover:text-white/80 font-semibold uppercase tracking-[0.12em] transition-all"
        >
          Solo
        </button>

        <button
          onClick={() => setSettingsOpen(true)}
          className="group flex items-center justify-center gap-3 w-full px-8 py-4 bg-transparent hover:bg-white/[0.04] border border-white/10 hover:border-white/20 rounded-[var(--radius-md)] text-[16px] text-white/40 hover:text-white/60 font-semibold uppercase tracking-[0.12em] transition-all"
        >
          <Settings size={20} className="opacity-60 group-hover:opacity-80 transition-opacity" />
          Settings
        </button>

        <button
          onClick={() => window.athena.quit()}
          className="group flex items-center justify-center gap-3 w-full px-8 py-4 bg-transparent hover:bg-red-500/10 border border-red-500/15 hover:border-red-500/30 rounded-[var(--radius-md)] text-[16px] text-red-400/60 hover:text-red-400/90 font-semibold uppercase tracking-[0.12em] transition-all"
        >
          <X size={20} className="opacity-60 group-hover:opacity-80 transition-opacity" />
          Exit
        </button>
      </div>
    </div>
  );
}
