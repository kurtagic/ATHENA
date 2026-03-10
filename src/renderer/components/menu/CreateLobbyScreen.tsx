import React, { useState, useEffect } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { ensureConnected } from '../../multiplayer/connectionHelper';
import { session } from '../../multiplayer/sessionManager';
import { useSessionStore } from '../../stores/sessionStore';
import { useAppStore } from '../../stores/appStore';

interface Props {
  onBack: () => void;
}

export function CreateLobbyScreen({ onBack }: Props) {
  const [name, setName] = useState(
    useSessionStore.getState().displayName || `Player${Math.floor(Math.random() * 1000)}`
  );
  const [lobbyName, setLobbyName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [settings, setSettings] = useState({
    requireApproval: true,
    shareMarkers: true,
    shareDrawings: true,
    shareArtillery: true,
    voiceChat: true,
  });

  // Auto-fill lobby name when display name changes
  useEffect(() => {
    if (name.trim()) {
      setLobbyName(`${name.trim()}'s Lobby`);
    }
  }, [name]);

  const handleCreate = async () => {
    if (!name.trim() || !lobbyName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await ensureConnected(name.trim());
      session.createLobby(lobbyName.trim());

      // Wait for lobby creation
      const unsub = useSessionStore.subscribe((state) => {
        if (state.lobbyId) {
          unsub();
          useAppStore.getState().enterApp();
        } else if (state.error) {
          unsub();
          setError(state.error);
          setBusy(false);
        }
      });
    } catch (e: any) {
      setError(e.message || 'Failed to connect');
      setBusy(false);
    }
  };

  const toggleSetting = (key: keyof typeof settings) => {
    setSettings((s) => ({ ...s, [key]: !s[key] }));
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6">
      <div
        className="w-full max-w-[420px] rounded-[var(--radius-lg)] border border-[var(--color-border-tactical)] backdrop-blur-xl p-8"
        style={{ background: 'var(--color-surface-tactical)' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={onBack}
            disabled={busy}
            className="p-1.5 rounded-md text-white/40 hover:text-white/80 hover:bg-white/[0.06] transition-colors disabled:opacity-30"
          >
            <ArrowLeft size={18} />
          </button>
          <h2 className="text-[var(--color-gold)] text-lg font-bold uppercase tracking-[0.2em]">
            Create Lobby
          </h2>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 text-[12px] text-red-400 bg-red-400/10 rounded px-3 py-2">
            {error}
          </div>
        )}

        {/* Fields */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase tracking-[0.12em] text-white/30 font-semibold px-1">
              Display Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white/[0.06] border border-white/10 rounded px-3 py-2 text-[13px] text-white/80 outline-none focus:border-white/25 transition-colors"
              placeholder="Your name"
              disabled={busy}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase tracking-[0.12em] text-white/30 font-semibold px-1">
              Lobby Name
            </label>
            <input
              type="text"
              value={lobbyName}
              onChange={(e) => setLobbyName(e.target.value)}
              className="w-full bg-white/[0.06] border border-white/10 rounded px-3 py-2 text-[13px] text-white/80 outline-none focus:border-white/25 transition-colors"
              placeholder="Lobby name"
              disabled={busy}
            />
          </div>

          {/* Lobby Settings */}
          <div className="mt-2">
            <span className="text-[10px] uppercase tracking-[0.12em] text-white/30 font-semibold px-1">
              Lobby Settings
            </span>
            <div className="flex flex-col gap-2.5 mt-3">
              <ToggleRow label="Require Approval to Join" value={settings.requireApproval} onChange={() => toggleSetting('requireApproval')} />
              <ToggleRow label="Share Map Markers" value={settings.shareMarkers} onChange={() => toggleSetting('shareMarkers')} />
              <ToggleRow label="Share Drawings" value={settings.shareDrawings} onChange={() => toggleSetting('shareDrawings')} />
              <ToggleRow label="Share Artillery Data" value={settings.shareArtillery} onChange={() => toggleSetting('shareArtillery')} />
              <ToggleRow label="Voice Chat Enabled" value={settings.voiceChat} onChange={() => toggleSetting('voiceChat')} />
            </div>
          </div>

          {/* Create Button */}
          <button
            onClick={handleCreate}
            disabled={busy || !name.trim() || !lobbyName.trim()}
            className="mt-4 flex items-center justify-center gap-2 w-full px-4 py-3 bg-blue-600/50 hover:bg-blue-600/70 disabled:opacity-30 disabled:cursor-not-allowed border border-blue-400/25 rounded-[var(--radius-md)] text-[13px] text-white font-semibold uppercase tracking-[0.1em] transition-colors"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            Create Lobby
          </button>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between px-1">
      <span className="text-[12px] text-white/60">{label}</span>
      <button
        onClick={onChange}
        className={`relative w-[40px] h-[22px] rounded-full transition-colors ${
          value ? 'bg-[var(--color-accent)]' : 'bg-white/10'
        }`}
      >
        <div
          className={`absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white transition-transform ${
            value ? 'left-[20px]' : 'left-[2px]'
          }`}
        />
      </button>
    </div>
  );
}
