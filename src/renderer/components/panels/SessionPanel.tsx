import React, { useState } from 'react';
import { Users, Crown, X, Check, Copy, LogOut, Loader2, Volume2, Phone, PhoneOff } from 'lucide-react';
import { useSessionStore } from '../../stores/sessionStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { session } from '../../multiplayer/sessionManager';
import { voice } from '../../multiplayer/voiceManager';

const SERVER_URL = 'wss://athena.kurti.si';

export function SessionPanel() {
  const status = useSessionStore((s) => s.status);
  const lobbyId = useSessionStore((s) => s.lobbyId);
  const lobbyName = useSessionStore((s) => s.lobbyName);
  const members = useSessionStore((s) => s.members);
  const isOwner = useSessionStore((s) => s.isOwner);
  const ownerId = useSessionStore((s) => s.ownerId);
  const memberId = useSessionStore((s) => s.memberId);
  const pendingApprovals = useSessionStore((s) => s.pendingApprovals);
  const error = useSessionStore((s) => s.error);

  const isConnecting = status === 'connecting' || status === 'reconnecting';

  return (
    <div className="flex flex-col">
      <div className="panel-header relative px-5 pt-3.5 pb-3 flex items-center gap-2">
        <span className="font-bold text-[13px] uppercase tracking-[0.14em] text-[var(--color-gold)]">Multiplayer</span>
        <span className="ml-auto"><StatusDot status={status} /></span>
      </div>
      <div className="flex flex-col gap-2 px-4 pt-3 pb-3">
        {error && (
          <div className="flex items-start gap-1 text-[11px] text-red-400 bg-red-400/10 rounded px-2 py-1.5">
            <span className="flex-1">{error}</span>
            <button
              className="shrink-0 text-red-300 hover:text-white mt-px"
              onClick={() => useSessionStore.getState().setError(null)}
            >
              <X size={10} />
            </button>
          </div>
        )}

        {isConnecting && <ConnectingView status={status} />}
        {!isConnecting && !lobbyId && <MainView />}
        {status === 'connected' && lobbyId && (
          <LobbyView
            lobbyId={lobbyId}
            lobbyName={lobbyName}
            members={members}
            isOwner={isOwner}
            ownerId={ownerId}
            memberId={memberId}
            pendingApprovals={pendingApprovals}
          />
        )}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'connected' ? 'bg-emerald-400' :
    status === 'connecting' || status === 'reconnecting' ? 'bg-amber-400 animate-pulse' :
    'bg-white/20';
  return <div className={`w-2 h-2 rounded-full ${color}`} />;
}

function ensureConnected(displayName: string): Promise<void> {
  const store = useSessionStore.getState();
  if (store.status === 'connected') return Promise.resolve();

  return new Promise((resolve, reject) => {
    store.setDisplayName(displayName);
    session.connect(SERVER_URL, displayName);

    const unsub = useSessionStore.subscribe((state) => {
      if (state.status === 'connected') {
        unsub();
        resolve();
      } else if (state.status === 'disconnected' && state.error) {
        unsub();
        reject(new Error(state.error));
      }
    });
  });
}

function MainView() {
  const [name, setName] = useState(
    useSessionStore.getState().displayName || `Player${Math.floor(Math.random() * 1000)}`
  );
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await ensureConnected(name.trim());
      session.createLobby(name.trim() + "'s Lobby");
    } catch {
      // error shown via store
    }
    setBusy(false);
  };

  const handleJoin = async () => {
    if (!name.trim() || joinCode.length < 4) return;
    setBusy(true);
    try {
      await ensureConnected(name.trim());
      session.joinLobby(joinCode);
    } catch {
      // error shown via store
    }
    setBusy(false);
  };

  return (
    <>
      <label className="text-[10px] uppercase tracking-[0.12em] text-white/30 font-semibold px-1">
        Display Name
      </label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full bg-white/[0.06] border border-white/10 rounded px-2 py-1.5 text-[12px] text-white/80 outline-none focus:border-white/25 transition-colors"
        placeholder="Your name"
        disabled={busy}
      />

      <button
        onClick={handleCreate}
        disabled={busy || !name.trim()}
        className="mt-1 flex items-center justify-center gap-1.5 w-full px-3 py-1.5 bg-blue-600/40 hover:bg-blue-600/60 disabled:opacity-30 disabled:cursor-not-allowed border border-blue-400/20 rounded text-[12px] text-white font-medium transition-colors"
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Users size={12} />}
        Create Lobby
      </button>

      <div className="flex items-center gap-2 my-1">
        <div className="flex-1 h-px bg-white/[0.06]" />
        <span className="text-[10px] text-white/20 uppercase">or</span>
        <div className="flex-1 h-px bg-white/[0.06]" />
      </div>

      <input
        type="text"
        value={joinCode}
        onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
        className="w-full bg-white/[0.06] border border-white/10 rounded px-2 py-1.5 text-[12px] text-white/80 outline-none focus:border-white/25 transition-colors font-mono tracking-widest text-center"
        placeholder="Lobby code"
        maxLength={6}
        disabled={busy}
      />
      <button
        onClick={handleJoin}
        disabled={busy || !name.trim() || joinCode.length < 4}
        className="flex items-center justify-center gap-1.5 w-full px-3 py-1.5 bg-indigo-600/40 hover:bg-indigo-600/60 disabled:opacity-30 disabled:cursor-not-allowed border border-indigo-400/20 rounded text-[12px] text-white font-medium transition-colors"
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : null}
        Join Lobby
      </button>
    </>
  );
}

function ConnectingView({ status }: { status: string }) {
  return (
    <div className="flex items-center gap-2 py-2 px-1">
      <Loader2 size={14} className="text-amber-400 animate-spin" />
      <span className="text-[12px] text-white/60">
        {status === 'reconnecting' ? 'Reconnecting...' : 'Connecting...'}
      </span>
      <button
        onClick={() => session.disconnect()}
        className="ml-auto text-[11px] text-white/40 hover:text-white/70 transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}

function LobbyView({
  lobbyId,
  lobbyName,
  members,
  isOwner,
  ownerId,
  memberId,
  pendingApprovals,
}: {
  lobbyId: string;
  lobbyName: string | null;
  members: { id: string; displayName: string; voiceEnabled: boolean }[];
  isOwner: boolean;
  ownerId: string | null;
  memberId: string | null;
  pendingApprovals: { requestId: string; displayName: string }[];
}) {
  const [copied, setCopied] = useState(false);
  const voicePeers = useVoiceStore((s) => s.peers);
  const pttActive = useVoiceStore((s) => s.pttActive);

  const copyCode = () => {
    navigator.clipboard.writeText(lobbyId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const voiceJoined = useVoiceStore((s) => s.joined);

  return (
    <>
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-white/80 font-medium">{lobbyName || 'Lobby'}</span>
        <button
          onClick={copyCode}
          className="flex items-center gap-1 px-2 py-0.5 bg-white/[0.06] hover:bg-white/[0.12] rounded text-[11px] text-white/60 font-mono tracking-widest transition-colors"
          title="Copy lobby code"
        >
          {copied ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
          {lobbyId}
        </button>
      </div>

      {/* Pending join requests (owner only) */}
      {isOwner && pendingApprovals.length > 0 && (
        <div className="flex flex-col gap-1 mt-1">
          <span className="text-[10px] uppercase tracking-[0.12em] text-amber-400/60 font-semibold px-1">
            Pending ({pendingApprovals.length})
          </span>
          {pendingApprovals.map((p) => (
            <div key={p.requestId} className="flex items-center gap-1.5 px-2 py-1 bg-amber-400/5 rounded">
              <span className="text-[11px] text-white/70 flex-1 truncate">{p.displayName}</span>
              <button
                onClick={() => session.approveJoin(p.requestId)}
                className="p-0.5 text-emerald-400 hover:text-emerald-300"
              >
                <Check size={12} />
              </button>
              <button
                onClick={() => session.denyJoin(p.requestId)}
                className="p-0.5 text-red-400 hover:text-red-300"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Member list */}
      <span className="text-[10px] uppercase tracking-[0.12em] text-white/30 font-semibold px-1 mt-1">
        Members ({members.length})
      </span>
      <div className="flex flex-col gap-0.5 max-h-[150px] overflow-y-auto">
        {members.map((m) => {
          const isSelf = m.id === memberId;
          const voicePeer = voicePeers.find(p => p.id === m.id);
          const isSpeaking = isSelf ? pttActive : voicePeer?.speaking;
          return (
            <div key={m.id} className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-white/[0.04]">
              {m.id === ownerId && <Crown size={10} className="text-amber-400 shrink-0" />}
              <span className={`text-[11px] flex-1 truncate ${isSelf ? 'text-white/90 font-medium' : 'text-white/60'}`}>
                {m.displayName}
                {isSelf && ' (you)'}
              </span>
              {isSpeaking && (
                <Volume2 size={11} className="text-emerald-400 shrink-0 animate-pulse" />
              )}
              {isOwner && !isSelf && (
                <button
                  onClick={() => session.kickMember(m.id)}
                  className="p-0.5 text-white/20 hover:text-red-400 transition-colors"
                  title="Kick"
                >
                  <X size={10} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Voice */}
      <VoiceButton />

      {/* Actions */}
      <div className="flex gap-1.5 mt-1">
        <button
          onClick={() => {
            if (useVoiceStore.getState().joined) voice.leaveVoice();
            session.leaveLobby();
            session.disconnect();
          }}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 rounded text-[11px] text-white/60 font-medium transition-colors"
        >
          <LogOut size={10} />
          Leave
        </button>
        {isOwner && (
          <button
            onClick={() => session.closeLobby()}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-red-600/30 hover:bg-red-600/50 border border-red-400/20 rounded text-[11px] text-white/60 font-medium transition-colors"
          >
            Close Lobby
          </button>
        )}
      </div>
    </>
  );
}

function VoiceButton() {
  const joined = useVoiceStore((s) => s.joined);
  const pttActive = useVoiceStore((s) => s.pttActive);

  return (
    <button
      onClick={() => {
        if (joined) voice.leaveVoice();
        else voice.joinVoice();
      }}
      className={`flex items-center justify-center gap-1.5 w-full px-2 py-1.5 rounded text-[11px] font-medium transition-colors ${
        joined
          ? 'bg-emerald-600/30 border border-emerald-400/20 text-emerald-400 hover:bg-red-600/30 hover:text-red-400 hover:border-red-400/20'
          : 'bg-white/[0.06] border border-white/10 text-white/50 hover:bg-emerald-600/20 hover:text-emerald-400 hover:border-emerald-400/20'
      }`}
    >
      {joined ? (
        <>
          <Phone size={11} />
          Voice Connected
          {pttActive && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
        </>
      ) : (
        <>
          <Phone size={11} />
          Join Voice (PTT: Y)
        </>
      )}
    </button>
  );
}
