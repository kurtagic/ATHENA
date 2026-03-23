import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Users, Crown, X, Check, Copy, LogOut, Loader2, Volume2, Phone, PhoneOff, Pin, Plus, Star } from 'lucide-react';
import { useSessionStore } from '../../stores/sessionStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useMapStore } from '../../stores/mapStore';
import { useNotesStore } from '../../stores/notesStore';
import { useCrewStore, getMyCrew } from '../../stores/crewStore';
import { session } from '../../multiplayer/sessionManager';
import { voice } from '../../multiplayer/voiceManager';
import { syncNotesUpdate } from '../../multiplayer/notesSync';
import { acceleratorToDisplay } from '../../lib/keybindUtils';
import { getStatusDef } from '../../data/crewStatuses';
import type { Crew, CrewType } from '../../multiplayer/protocol';

import { ensureConnected, getSavedDisplayName } from '../../multiplayer/connectionHelper';
import { colorByIndex } from '../../data/colorFromUuid';

export function SessionPanel() {
  const status = useSessionStore((s) => s.status);
  const lobbyId = useSessionStore((s) => s.lobbyId);
  const lobbyName = useSessionStore((s) => s.lobbyName);
  const members = useSessionStore((s) => s.members);
  const isOwner = useSessionStore((s) => s.isOwner);
  const ownerId = useSessionStore((s) => s.ownerId);
  const memberId = useSessionStore((s) => s.memberId);
  const officerIds = useSessionStore((s) => s.officerIds);
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
            officerIds={officerIds}
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
      <div className="flex items-center gap-2 mt-1 px-1">
        <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-gold)] whitespace-nowrap">Display Name</label>
        <div className="flex-1 h-px bg-gradient-to-r from-[var(--color-gold-dim)] to-transparent" />
      </div>
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
  officerIds,
  pendingApprovals,
}: {
  lobbyId: string;
  lobbyName: string | null;
  members: { id: string; displayName: string; voiceEnabled: boolean; colorIndex: number; connectedAt: number }[];
  isOwner: boolean;
  ownerId: string | null;
  memberId: string | null;
  officerIds: string[];
  pendingApprovals: { requestId: string; displayName: string }[];
}) {
  const [copied, setCopied] = useState(false);
  const voicePeers = useVoiceStore((s) => s.peers);
  const tttActive = useVoiceStore((s) => s.tttActive);
  const crews = useCrewStore((s) => s.crews);

  const copyCode = () => {
    navigator.clipboard.writeText(lobbyId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const voiceJoined = useVoiceStore((s) => s.joined);

  const officerSet = new Set(officerIds);

  // Sort members: owner first, then officers (by connectedAt), then regular members
  const sortedMembers = [...members].sort((a, b) => {
    if (a.id === ownerId) return -1;
    if (b.id === ownerId) return 1;
    const aOfficer = officerSet.has(a.id);
    const bOfficer = officerSet.has(b.id);
    if (aOfficer && !bOfficer) return -1;
    if (!aOfficer && bOfficer) return 1;
    if (aOfficer && bOfficer) return a.connectedAt - b.connectedAt;
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

      {/* Voice + Actions */}
      <VoiceButton />
      <div className="flex gap-1.5">
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
      <div className="flex items-center gap-2 px-1 mt-1">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-gold)] whitespace-nowrap">Members</span>
        <span className="text-[10px] font-mono font-bold text-white/50 bg-white/[0.08] rounded px-1.5 py-0.5">
          {members.length}/16
        </span>
        <div className="flex-1 h-px bg-gradient-to-r from-[var(--color-gold-dim)] to-transparent" />
      </div>
      <div id="lobby-members" className="flex flex-col gap-0.5 max-h-[150px] overflow-y-auto">
        {sortedMembers.map((m) => {
          const isSelf = m.id === memberId;
          const isMemberOwner = m.id === ownerId;
          const isOfficer = officerSet.has(m.id);
          const voicePeer = voicePeers.find(p => p.id === m.id);
          const isInVoice = isSelf ? voiceJoined : !!voicePeer;
          const isSpeaking = isSelf ? tttActive : voicePeer?.speaking;
          const memberCrew = crews.find(c => c.memberIds.includes(m.id));
          return (
            <div key={m.id} className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-white/[0.04]">
              {isMemberOwner && <Crown size={11} className="text-amber-400 shrink-0 fill-amber-400" />}
              {isOfficer && !isMemberOwner && <Star size={11} className="text-amber-400 shrink-0 fill-amber-400" />}
              <span
                className={`text-[13px] flex-1 truncate ${isSelf ? 'font-medium' : ''}`}
                style={{ color: colorByIndex(m.colorIndex) }}
              >
                {m.displayName}
                {isSelf && ' (you)'}
                {memberCrew && <span className="text-white"> ({memberCrew.name})</span>}
              </span>
              {isInVoice && (
                <Volume2
                  size={11}
                  className={`shrink-0 ${isSpeaking ? 'text-emerald-400 animate-pulse' : 'text-white/60'}`}
                />
              )}
              {isOwner && !isSelf && !isMemberOwner && (
                <button
                  onClick={() => session.setOfficer(m.id, !isOfficer)}
                  className={`p-1 transition-colors ${isOfficer ? 'text-amber-400 hover:text-white/40' : 'text-white/20 hover:text-amber-400'}`}
                  title={isOfficer ? 'Remove officer' : 'Make officer'}
                >
                  <Star size={12} />
                </button>
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

      {/* Crews */}
      <CrewSection memberId={memberId} members={members} />

      {/* Notes */}
      <NotesSection />

      {/* Notifications */}
      <div className="h-px bg-white/[0.08] my-1" />
      <div className="flex items-center gap-2 px-1 py-1">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-gold)] whitespace-nowrap">Notifications</span>
        <div className="flex-1 h-px bg-gradient-to-r from-[var(--color-gold-dim)] to-transparent" />
      </div>
      <NotifKeybindHint />
    </>
  );
}

function NotifKeybindHint() {
  const notifKey = useSettingsStore((s) => s.settings?.keybinds.quickNotification ?? 'F6');
  return (
    <span className="text-[11px] text-white/30 px-2 py-0.5">
      Press <span className="text-white/50 font-medium">{acceleratorToDisplay(notifKey)}</span> to send a notification
    </span>
  );
}

function NotesSection() {
  const detailMode = useMapStore((s) => s.detailMode);
  const text = useNotesStore((s) => s.text);
  const pinned = useNotesStore((s) => s.pinned);

  if (!detailMode) return null;

  const hexId = detailMode.apiName;

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    useNotesStore.getState().setText(newText);
    syncNotesUpdate(hexId, newText);
    if (pinned) {
      window.athena.updatePinnedNotes(newText);
    }
  };

  const togglePin = () => {
    const next = !pinned;
    useNotesStore.getState().setPinned(next);
    window.athena.toggleNotesPip(next, text);
  };

  return (
    <>
      <div className="h-px bg-white/[0.08] my-1" />
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2 px-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-gold)] whitespace-nowrap">Notes</span>
          <div className="flex-1 h-px bg-gradient-to-r from-[var(--color-gold-dim)] to-transparent" />
          <button
            onClick={togglePin}
            className={`p-0.5 transition-all duration-150 ${
              pinned
                ? 'text-[#66bb6a] drop-shadow-[0_0_8px_rgba(102,187,106,0.5)]'
                : 'text-white/30 hover:text-white/60'
            }`}
            title={pinned ? 'Unpin notes' : 'Pin to HUD'}
          >
            <Pin size={12} fill={pinned ? 'currentColor' : 'none'} />
          </button>
        </div>
        <div className="relative">
          <textarea
            rows={5}
            maxLength={2000}
            value={text}
            onChange={handleChange}
            placeholder="Shared notes..."
            className="w-full resize-none rounded-[var(--radius-sm)] border border-[var(--color-border-tactical)] bg-[var(--color-surface-inset)] text-[12px] text-white/80 placeholder:text-white/25 px-2.5 py-2 outline-none transition-colors duration-150 focus:border-[var(--color-border-focus)]"
          />
          <span className="absolute bottom-1.5 right-2 text-[9px] text-white/20">
            {text.length}/2000
          </span>
        </div>
      </div>
    </>
  );
}

function CrewSection({ memberId, members }: { memberId: string | null; members: { id: string; displayName: string }[] }) {
  const crews = useCrewStore((s) => s.crews);
  const pinned = useCrewStore((s) => s.pinned);
  const myCrew = memberId ? crews.find(c => c.memberIds.includes(memberId)) : undefined;
  const [showCreate, setShowCreate] = useState(false);
  const [crewName, setCrewName] = useState('');
  const [crewType, setCrewType] = useState<CrewType>('infantry');

  const TYPE_LABELS: Record<CrewType, string> = { infantry: 'Infantry', air: 'Air', tank: 'Tank', artillery: 'Artillery', naval: 'Naval' };
  const CREW_TYPE_OPTIONS: CrewType[] = ['infantry', 'air', 'tank', 'artillery', 'naval'];

  const togglePin = () => {
    const next = !pinned;
    useCrewStore.getState().setPinned(next);
    window.athena.toggleCrewPip(next, next ? crews : undefined);
  };

  const handleCreate = () => {
    if (!crewName.trim()) return;
    session.createCrew(crewName.trim(), crewType);
    setCrewName('');
    setCrewType('infantry');
    setShowCreate(false);
  };

  const getMemberName = (id: string) => members.find(m => m.id === id)?.displayName ?? id;

  return (
    <>
      <div className="h-px bg-white/[0.08] my-1" />
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 px-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-gold)] whitespace-nowrap">
            {myCrew ? 'Your Crew' : 'Crews'}
          </span>
          <div className="flex-1 h-px bg-gradient-to-r from-[var(--color-gold-dim)] to-transparent" />
          <button
            onClick={togglePin}
            className={`p-0.5 transition-all duration-150 ${
              pinned
                ? 'text-[#66bb6a] drop-shadow-[0_0_8px_rgba(102,187,106,0.5)]'
                : 'text-white/30 hover:text-white/60'
            }`}
            title={pinned ? 'Unpin crews' : 'Pin to HUD'}
          >
            <Pin size={13} fill={pinned ? 'currentColor' : 'none'} />
          </button>
        </div>

        {/* Own crew card */}
        {myCrew && (
          <div className="flex flex-col gap-1.5 px-2.5 py-2 bg-white/[0.04] rounded">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-semibold text-white/90 flex-1 truncate">{myCrew.name}</span>
              <span className="text-[12px] text-white/30">{TYPE_LABELS[myCrew.type]}</span>
              <span
                className="px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-[0.1em] flex-shrink-0"
                style={{
                  background: getStatusDef(myCrew.status).color + '26',
                  borderWidth: 1,
                  borderStyle: 'solid',
                  borderColor: getStatusDef(myCrew.status).color + '80',
                  color: getStatusDef(myCrew.status).color,
                }}
              >{getStatusDef(myCrew.status).label}</span>
            </div>
            {myCrew.memberIds.map((id) => (
              <div key={id} className="flex items-center gap-2 px-1">
                <span className="text-[13px] text-white/60 flex-1 truncate">
                  {getMemberName(id)}
                  {id === memberId && ' (you)'}
                  {id === myCrew.leaderId && ' ★'}
                </span>
                {myCrew.leaderId === memberId && id !== memberId && (
                  <button
                    onClick={() => session.crewKick(id)}
                    className="p-0.5 text-white/20 hover:text-red-400 transition-colors"
                    title="Kick from crew"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
            <div className="flex gap-1.5 mt-0.5">
              <button
                onClick={() => session.leaveCrew()}
                className="flex-1 px-2.5 py-1.5 bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 rounded text-[12px] text-white/50 font-medium transition-colors"
              >
                Leave
              </button>
              {myCrew.leaderId === memberId && (
                <button
                  onClick={() => session.disbandCrew()}
                  className="flex-1 px-2.5 py-1.5 bg-red-600/20 hover:bg-red-600/40 border border-red-400/20 rounded text-[12px] text-white/50 font-medium transition-colors"
                >
                  Disband
                </button>
              )}
            </div>
          </div>
        )}

        {/* Joinable crew list (when not in a crew) */}
        {!myCrew && crews.length > 0 && (
          <div className="flex flex-col gap-1">
            {crews.map((c) => (
              <div key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/[0.04]">
                <span className="text-[13px] text-white/70 flex-1 truncate">{c.name}</span>
                <span className="text-[11px] text-white/25">{c.memberIds.length}/5</span>
                <span className="text-[11px] text-white/25">{TYPE_LABELS[c.type]}</span>
                <span
                  className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-[0.1em] flex-shrink-0"
                  style={{
                    background: getStatusDef(c.status).color + '26',
                    borderWidth: 1,
                    borderStyle: 'solid',
                    borderColor: getStatusDef(c.status).color + '80',
                    color: getStatusDef(c.status).color,
                  }}
                >{getStatusDef(c.status).label}</span>
                {c.memberIds.length < 5 && (
                  <button
                    onClick={() => session.joinCrew(c.id)}
                    className="px-2 py-0.5 text-[11px] font-medium text-blue-400 bg-blue-600/20 border border-blue-400/20 rounded hover:bg-blue-600/40 transition-colors"
                  >
                    Join
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {!myCrew && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center justify-center gap-1.5 w-full px-2.5 py-1.5 bg-[var(--color-gold)]/10 hover:bg-[var(--color-gold)]/20 border border-[var(--color-gold)]/20 rounded text-[12px] text-[var(--color-gold)] font-medium transition-colors"
          >
            <Plus size={13} />
            Create Crew
          </button>
        )}

        {showCreate && !myCrew && createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40"
            onMouseDown={(e) => { if (e.target === e.currentTarget) { setShowCreate(false); setCrewName(''); setCrewType('infantry'); } }}
          >
            <div className="w-72 flex flex-col gap-2.5 p-4 rounded-lg border border-[var(--color-border-glass)] bg-[#1a1a1e] shadow-2xl">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold text-white/60 uppercase tracking-wider">New Crew</span>
                <button onClick={() => { setShowCreate(false); setCrewName(''); setCrewType('infantry'); }} className="p-0.5 text-white/30 hover:text-white/60 transition-colors">
                  <X size={14} />
                </button>
              </div>
              <input
                type="text"
                value={crewName}
                onChange={(e) => setCrewName(e.target.value.slice(0, 24))}
                className="w-full bg-white/[0.06] border border-white/10 rounded px-2.5 py-1.5 text-[13px] text-white/80 outline-none focus:border-white/25"
                placeholder="Crew name"
                maxLength={24}
                autoFocus
              />
              <div className="flex flex-wrap gap-1">
                {CREW_TYPE_OPTIONS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setCrewType(t)}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors ${
                      crewType === t
                        ? 'border-[var(--color-gold)]/40 text-[var(--color-gold)] bg-[var(--color-gold)]/10'
                        : 'border-white/10 text-white/40 hover:text-white/60'
                    }`}
                  >
                    {TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
              <button
                onClick={handleCreate}
                disabled={!crewName.trim()}
                className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-[var(--color-gold)]/20 hover:bg-[var(--color-gold)]/30 disabled:opacity-30 disabled:cursor-not-allowed border border-[var(--color-gold)]/30 rounded text-[13px] text-[var(--color-gold)] font-medium transition-colors"
              >
                Create
              </button>
            </div>
          </div>,
          document.body
        )}

        {!myCrew && crews.length === 0 && !showCreate && (
          <span className="text-[12px] text-white/20 px-2 py-1">No crews yet</span>
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
