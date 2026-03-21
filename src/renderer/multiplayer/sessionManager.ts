import type {
  ClientMessage,
  ServerMessage,
  Entity,
  EntityType,
  CrewType,
  CrewStatus,
} from './protocol';
import { PROTOCOL_VERSION } from './protocol';
import { useSessionStore } from '../stores/sessionStore';
import { useCrewStore } from '../stores/crewStore';
import { debugLog } from '../stores/debugStore';

type MessageHandler = (msg: ServerMessage) => void;

const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_MS = 1000;
const MAX_RECONNECT_MS = 30000;

export class SessionManager {
  private ws: WebSocket | null = null;
  private messageHandler: MessageHandler | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;
  private lastUrl = '';
  private lastDisplayName = '';

  onMessage(handler: MessageHandler) {
    this.messageHandler = handler;
  }

  connect(url: string, displayName: string): void {
    this.intentionalClose = false;
    this.lastUrl = url;
    this.lastDisplayName = displayName;
    this.reconnectAttempts = 0;

    useSessionStore.getState().setStatus('connecting');
    useSessionStore.getState().setError(null);
    debugLog('ws', `Connecting to ${url}`);

    this.openWebSocket(url, displayName);
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.clearReconnectTimer();
    if (this.ws) {
      this.ws.close(1000, 'user disconnect');
      this.ws = null;
    }
    debugLog('ws', 'Disconnected (user)');
    useSessionStore.getState().reset();
  }

  send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  get connected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  // ── Lobby methods ──

  createLobby(name: string, password?: string): void {
    this.send({ type: 'create-lobby', name, password });
  }

  joinLobby(lobbyId: string, password?: string): void {
    const displayName = useSessionStore.getState().displayName;
    this.send({ type: 'join-lobby', lobbyId, password, displayName });
  }

  leaveLobby(): void {
    this.send({ type: 'leave-lobby' });
    const store = useSessionStore.getState();
    store.setLobby(null, null);
    store.setMembers([]);
    store.setOfficerIds([]);
    store.setPendingApprovals([]);
    store.setIsOwner(false);
    store.setOwnerId(null);
    useCrewStore.getState().reset();
  }

  closeLobby(): void {
    this.send({ type: 'close-lobby' });
  }

  approveJoin(requestId: string): void {
    this.send({ type: 'approve-join', requestId });
  }

  denyJoin(requestId: string): void {
    this.send({ type: 'deny-join', requestId });
  }

  kickMember(memberId: string): void {
    this.send({ type: 'kick-member', memberId });
  }

  transferOwnership(targetMemberId: string): void {
    this.send({ type: 'transfer-ownership', targetMemberId });
  }

  setOfficer(memberId: string, officer: boolean): void {
    this.send({ type: 'set-officer', memberId, officer });
  }

  // ── Entity sync ──

  sendEntityCreate(entity: Omit<Entity, 'authorId'>): void {
    this.send({ type: 'entity-create', entity });
  }

  sendEntityDelete(hexId: string, entityId: string): void {
    this.send({ type: 'entity-delete', hexId, entityId });
  }

  sendEntityUpdate(hexId: string, entityId: string, entityType: EntityType, changes: Record<string, unknown>): void {
    this.send({ type: 'entity-update', hexId, entityId, entityType, changes });
  }

  sendEntityClear(hexId: string, entityType?: EntityType): void {
    this.send({ type: 'entity-clear', hexId, entityType });
  }

  // ── Voice signaling ──

  sendVoiceJoin(): void {
    this.send({ type: 'voice-join' });
  }

  sendVoiceLeave(): void {
    this.send({ type: 'voice-leave' });
  }

  sendVoiceOffer(targetId: string, sdp: string): void {
    this.send({ type: 'voice-offer', targetId, sdp });
  }

  sendVoiceAnswer(targetId: string, sdp: string): void {
    this.send({ type: 'voice-answer', targetId, sdp });
  }

  sendVoiceIce(targetId: string, candidate: string): void {
    this.send({ type: 'voice-ice', targetId, candidate });
  }

  // ── Command banner ──

  sendCommandBanner(command: 'fire' | 'stop'): void {
    this.send({ type: 'command-banner', command });
  }

  // ── Custom notifications ──

  sendCustomNotification(text: string, target?: import('./protocol').NotificationTarget): void {
    this.send({ type: 'custom-notification', text, ...(target ? { target } : {}) });
  }

  // ── Crew methods ──

  createCrew(name: string, crewType: CrewType): void {
    this.send({ type: 'crew-create', name, crewType });
  }

  joinCrew(crewId: string): void {
    this.send({ type: 'crew-join', crewId });
  }

  leaveCrew(): void {
    this.send({ type: 'crew-leave' });
  }

  disbandCrew(): void {
    this.send({ type: 'crew-disband' });
  }

  crewKick(memberId: string): void {
    this.send({ type: 'crew-kick', memberId });
  }

  setCrewStatus(status: CrewStatus): void {
    this.send({ type: 'crew-set-status', status });
  }

  // ── Internal ──

  private openWebSocket(url: string, displayName: string): void {
    try {
      this.ws = new WebSocket(url);
    } catch {
      debugLog('error', 'Invalid server URL');
      useSessionStore.getState().setError('Invalid server URL');
      useSessionStore.getState().setStatus('disconnected');
      return;
    }

    this.ws.onopen = () => {
      debugLog('ws', 'WebSocket opened');
      this.reconnectAttempts = 0;
      this.send({ type: 'hello', version: PROTOCOL_VERSION, displayName });
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as ServerMessage;
        this.handleInternalMessage(msg);
        if (this.messageHandler) this.messageHandler(msg);
      } catch {
        debugLog('error', 'Malformed WS message');
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
      debugLog('ws', `WebSocket closed${this.intentionalClose ? ' (intentional)' : ''}`);
      if (!this.intentionalClose) {
        this.attemptReconnect();
      }
    };

    this.ws.onerror = () => {
      debugLog('error', 'WebSocket error');
    };
  }

  private handleInternalMessage(msg: ServerMessage): void {
    const store = useSessionStore.getState();
    // Cast to any for property access since TS can't narrow ServerBroadcast out of the union
    const m = msg as any;

    switch (msg.type) {
      case 'welcome':
        store.setMemberId(m.memberId);
        store.setStatus('connected');
        debugLog('session', `Welcomed as ${m.memberId}`);
        break;
      case 'error':
        store.setError(m.message);
        debugLog('error', `Server error: ${m.message}`);
        break;
      case 'lobby-created':
        store.setLobby(m.lobbyId, m.name);
        store.setIsOwner(true);
        store.setOwnerId(store.memberId);
        store.setOfficerIds([store.memberId!]);
        store.setMembers([{
          id: store.memberId!,
          displayName: store.displayName,
          connectedAt: Date.now(),
          voiceEnabled: false,
          colorIndex: 0,
          isOfficer: true,
        }]);
        debugLog('session', `Lobby created: ${m.name}`);
        break;
      case 'join-accepted':
        store.setLobby(m.lobbyId, m.name);
        store.setMembers(m.members);
        debugLog('session', `Joined lobby: ${m.name}`);
        break;
      case 'join-rejected':
        store.setError(`Join rejected: ${m.reason}`);
        debugLog('error', `Join rejected: ${m.reason}`);
        break;
      case 'peer-joined':
        store.addMember(m.member);
        debugLog('session', `${m.member?.displayName ?? m.memberId} joined`);
        break;
      case 'peer-left':
        store.removeMember(m.memberId);
        debugLog('session', `${m.memberId} left`);
        break;
      case 'officer-changed':
        store.updateOfficer(m.memberId, m.officer);
        break;
      case 'peer-kicked':
        if (m.memberId === store.memberId) {
          store.setLobby(null, null);
          store.setMembers([]);
          store.setOfficerIds([]);
          store.setPendingApprovals([]);
          store.setError('You were kicked from the lobby');
          useCrewStore.getState().reset();
          debugLog('session', 'You were kicked');
        } else {
          store.removeMember(m.memberId);
          debugLog('session', `Kicked: ${m.memberId}`);
        }
        break;
      case 'owner-changed':
        store.setOwnerId(m.newOwnerId);
        break;
      case 'lobby-closed':
        store.setLobby(null, null);
        store.setMembers([]);
        store.setOfficerIds([]);
        store.setPendingApprovals([]);
        store.setIsOwner(false);
        store.setOwnerId(null);
        useCrewStore.getState().reset();
        debugLog('session', 'Lobby closed');
        break;
      case 'full-snapshot':
        store.setMembers(m.members);
        store.setOwnerId(m.ownerId);
        store.setOfficerIds(m.officerIds ?? []);
        useCrewStore.getState().setCrews(m.crews ?? []);
        break;
      case 'join-request':
        store.setPendingApprovals([
          ...store.pendingApprovals,
          { requestId: m.requestId, memberId: '', displayName: m.displayName, requestedAt: Date.now() },
        ]);
        break;
      case 'crew-created':
        useCrewStore.getState().addCrew(m.crew);
        break;
      case 'crew-updated':
        useCrewStore.getState().updateCrew(m.crew);
        break;
      case 'crew-disbanded':
        useCrewStore.getState().removeCrew(m.crewId);
        break;
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      debugLog('error', `Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) exceeded`);
      useSessionStore.getState().setStatus('disconnected');
      useSessionStore.getState().setError('Reconnection failed after maximum attempts');
      return;
    }

    useSessionStore.getState().setStatus('reconnecting');
    const delay = Math.min(BASE_RECONNECT_MS * Math.pow(2, this.reconnectAttempts), MAX_RECONNECT_MS);
    this.reconnectAttempts++;
    debugLog('ws', `Reconnect attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}, delay ${delay}ms`);

    this.reconnectTimer = setTimeout(() => {
      this.openWebSocket(this.lastUrl, this.lastDisplayName);
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

export const session = new SessionManager();
