import React, { useState, useEffect } from 'react';
import { Users, Crown, X, Check, Copy, LogOut, Loader2, Volume2, Phone, PhoneOff } from 'lucide-react';
import { useSessionStore } from '../../stores/sessionStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { session } from '../../multiplayer/sessionManager';
import { voice } from '../../multiplayer/voiceManager';
import { acceleratorToDisplay } from '../../lib/keybindUtils';

import { ensureConnected, getSavedDisplayName } from '../../multiplayer/connectionHelper';
import { uuidToColor } from '../../data/colorFromUuid';

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
        <span className="font-bold text-[13px] uppercase tracking-[0.14em] text-[var(--color-gold)]">
          {lobbyId && lobbyName ? lobbyName : 'Multiplayer'}
        </span>
        <span className="ml-auto"><StatusDot status={status} error={error} /></span>
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

function StatusDot({ status, error }: { status: string; error: string | null }) {
  const color =
    error ? 'bg-red-400' :
    status === 'connected' ? 'bg-emerald-400' :
    status === 'connecting' || status === 'reconnecting' ? 'bg-amber-400 animate-pulse' :
    status === 'disconnected' ? 'bg-red-400' :
    'bg-white/20';
  return <div className={`w-2 h-2 rounded-full ${color}`} />;
}

function MainView() {
  const [name, setName] = useState(
    useSessionStore.getState().displayName || `Player${Math.floor(Math.random() * 1000)}`
  );
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);

  // Load saved display name from settings on mount
  useEffect(() => {
    getSavedDisplayName().then((saved) => {
      if (saved) setName(saved);
    });
  }, []);

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
  const tttActive = useVoiceStore((s) => s.tttActive);

  const copyCode = () => {
    navigator.clipboard.writeText(lobbyId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const voiceJoined = useVoiceStore((s) => s.joined);

  // Sort members: owner first, then rest in original order
  const sortedMembers = [...members].sort((a, b) => {
    if (a.id === ownerId) return -1;
    if (b.id === ownerId) return 1;
    return 0;
  });

  return (
    <>
      {/* Lobby code — large and prominent */}
      <div className="flex items-center justify-center gap-2 py-1">
        <span className="text-[18px] font-mono font-bold tracking-[0.3em] text-white/90">{lobbyId}</span>
        <button
          onClick={copyCode}
          className="p-1 bg-white/[0.06] hover:bg-white/[0.12] rounded text-white/50 hover:text-white/80 transition-colors"
          title="Copy lobby code"
        >
          {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
        </button>
      </div>

      {/* Divider */}
      <div className="h-px bg-white/[0.08] my-1" />

      {/* Pending join requests (owner only) */}
      {isOwner && pendingApprovals.length > 0 && (
        <div className="flex flex-col gap-1 mt-1 border-l-2 border-amber-400/40 pl-2">
          <span className="text-[10px] uppercase tracking-[0.12em] text-amber-400/80 font-semibold">
            Pending Approval ({pendingApprovals.length})
          </span>
          {pendingApprovals.map((p) => (
            <div key={p.requestId} className="flex items-center gap-1.5 px-2 py-1.5 bg-amber-400/[0.08] rounded">
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
      <div className="flex items-center gap-1.5 px-1 mt-1">
        <span className="text-[10px] uppercase tracking-[0.12em] text-white/30 font-semibold">
          Members
        </span>
        <span className="text-[10px] font-mono font-bold text-white/50 bg-white/[0.08] rounded px-1.5 py-0.5">
          {members.length}/16
        </span>
      </div>
      <div className="flex flex-col gap-0.5 max-h-[150px] overflow-y-auto">
        {sortedMembers.map((m) => {
          const isSelf = m.id === memberId;
          const isMemberOwner = m.id === ownerId;
          const voicePeer = voicePeers.find(p => p.id === m.id);
          const isSpeaking = isSelf ? tttActive : voicePeer?.speaking;
          return (
            <div key={m.id} className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-white/[0.04]">
              {isMemberOwner && <Crown size={11} className="text-amber-400 shrink-0 fill-amber-400" />}
              <span
                className={`text-[13px] flex-1 truncate ${isSelf ? 'font-medium' : ''}`}
                style={{ color: uuidToColor(m.id) }}
              >
                {m.displayName}
                {isSelf && ' (you)'}
              </span>
              {isSpeaking && (
                <Volume2 size={11} className="text-emerald-400 shrink-0 animate-pulse" />
              )}
              {isOwner && !isSelf && (
                <>
                  <button
                    onClick={() => session.transferOwnership(m.id)}
                    className="p-1 text-white/20 hover:text-amber-400 transition-colors"
                    title="Transfer ownership"
                  >
                    <Crown size={12} />
                  </button>
                  <button
                    onClick={() => session.kickMember(m.id)}
                    className="p-1 text-white/20 hover:text-red-400 transition-colors"
                    title="Kick"
                  >
                    <X size={14} />
                  </button>
                </>
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
  const tttActive = useVoiceStore((s) => s.tttActive);
  const tttKey = useSettingsStore((s) => s.settings?.keybinds.toggleToTalk ?? 'Y');

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
          {tttActive && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
        </>
      ) : (
        <>
          <Phone size={11} />
          Join Voice (TTT: {acceleratorToDisplay(tttKey)})
        </>
      )}
    </button>
  );
}
