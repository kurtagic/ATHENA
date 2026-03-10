import React, { useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { ensureConnected } from '../../multiplayer/connectionHelper';
import { session } from '../../multiplayer/sessionManager';
import { useSessionStore } from '../../stores/sessionStore';
import { useAppStore } from '../../stores/appStore';

interface Props {
  onBack: () => void;
}

export function JoinLobbyScreen({ onBack }: Props) {
  const [name, setName] = useState(
    useSessionStore.getState().displayName || `Player${Math.floor(Math.random() * 1000)}`
  );
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleJoin = async () => {
    if (!name.trim() || joinCode.length < 4) return;
    setBusy(true);
    setError(null);
    try {
      await ensureConnected(name.trim());
      session.joinLobby(joinCode);

      // Wait for lobby join
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
            Join Lobby
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
              Lobby Code
            </label>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
              className="w-full bg-white/[0.06] border border-white/10 rounded px-3 py-2 text-[15px] text-white/80 outline-none focus:border-white/25 transition-colors font-mono tracking-[0.3em] text-center uppercase"
              placeholder="XXXXXX"
              maxLength={6}
              disabled={busy}
            />
          </div>

          {/* Join Button */}
          <button
            onClick={handleJoin}
            disabled={busy || !name.trim() || joinCode.length < 4}
            className="mt-4 flex items-center justify-center gap-2 w-full px-4 py-3 bg-indigo-600/50 hover:bg-indigo-600/70 disabled:opacity-30 disabled:cursor-not-allowed border border-indigo-400/25 rounded-[var(--radius-md)] text-[13px] text-white font-semibold uppercase tracking-[0.1em] transition-colors"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            Join Lobby
          </button>
        </div>
      </div>
    </div>
  );
}
