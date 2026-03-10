// Client-side protocol types mirroring athena-server/src/shared/protocol.ts

export const PROTOCOL_VERSION = 2;

// ── Entity type system ──

export type EntityType = 'stroke' | 'artillery-platform' | 'artillery-target' | 'artillery-impact' | 'artillery-wind';

export interface SyncEntity {
  id: string;
  hexId: string;
  entityType: EntityType;
  authorId: string;
}

export interface StrokeEntity extends SyncEntity {
  entityType: 'stroke';
  points: [number, number][];
  color: string;
  weight: number;
  opacity: number;
}

export interface ArtilleryPlatformEntity extends SyncEntity {
  entityType: 'artillery-platform';
  position: [number, number];
  label: string;
  platformIndex?: number;
  isMain: boolean;
}

export interface ArtilleryTargetEntity extends SyncEntity {
  entityType: 'artillery-target';
  position: [number, number];
}

export interface ArtilleryImpactEntity extends SyncEntity {
  entityType: 'artillery-impact';
  position: [number, number];
}

export interface ArtilleryWindEntity extends SyncEntity {
  entityType: 'artillery-wind';
  windDirection: number | null;
  windStrength: number;
}

export type Entity = StrokeEntity | ArtilleryPlatformEntity | ArtilleryTargetEntity | ArtilleryImpactEntity | ArtilleryWindEntity;

// ── Session snapshot ──

export interface SessionSnapshot {
  entities: Record<string, Entity[]>;
}

// ── Server broadcast envelope ──

export interface ServerBroadcast<T = unknown> {
  type: string;
  seq: number;
  senderId: string;
  payload: T;
  timestamp: number;
}

// ── Lobby types ──

export interface LobbyMember {
  id: string;
  displayName: string;
  connectedAt: number;
  voiceEnabled: boolean;
}

export interface PendingJoin {
  requestId: string;
  memberId: string;
  displayName: string;
  requestedAt: number;
}

// ── Client → Server messages ──

export interface HelloMsg {
  type: 'hello';
  version: number;
  displayName: string;
}

export interface CreateLobbyMsg {
  type: 'create-lobby';
  name: string;
  password?: string;
  approvalRequired?: boolean;
}

export interface JoinLobbyMsg {
  type: 'join-lobby';
  lobbyId: string;
  password?: string;
  displayName: string;
}

export interface LeaveLobbyMsg { type: 'leave-lobby'; }
export interface CloseLobbyMsg { type: 'close-lobby'; }

export interface ApproveJoinMsg {
  type: 'approve-join';
  requestId: string;
}

export interface DenyJoinMsg {
  type: 'deny-join';
  requestId: string;
}

export interface KickMemberMsg {
  type: 'kick-member';
  memberId: string;
}

export interface EntityCreateMsg {
  type: 'entity-create';
  entity: Omit<Entity, 'authorId'>;
}

export interface EntityDeleteMsg {
  type: 'entity-delete';
  hexId: string;
  entityId: string;
}

export interface EntityUpdateMsg {
  type: 'entity-update';
  hexId: string;
  entityId: string;
  entityType: EntityType;
  changes: Record<string, unknown>;
}

export interface EntityClearMsg {
  type: 'entity-clear';
  hexId: string;
  entityType?: EntityType;
}

export interface VoiceJoinMsg { type: 'voice-join'; }
export interface VoiceLeaveMsg { type: 'voice-leave'; }

export interface VoiceOfferMsg {
  type: 'voice-offer';
  targetId: string;
  sdp: string;
}

export interface VoiceAnswerMsg {
  type: 'voice-answer';
  targetId: string;
  sdp: string;
}

export interface VoiceIceMsg {
  type: 'voice-ice';
  targetId: string;
  candidate: string;
}

// ── Server → Client messages ──

export interface WelcomeMsg {
  type: 'welcome';
  memberId: string;
  protocolVersion: number;
}

export interface ErrorMsg {
  type: 'error';
  code: string;
  message: string;
}

export interface LobbyCreatedMsg {
  type: 'lobby-created';
  lobbyId: string;
  name: string;
}

export interface JoinAcceptedMsg {
  type: 'join-accepted';
  lobbyId: string;
  name: string;
  members: LobbyMember[];
}

export interface JoinRejectedMsg {
  type: 'join-rejected';
  reason: string;
}

export interface JoinRequestPendingMsg {
  type: 'join-request-pending';
}

export interface JoinRequestMsg {
  type: 'join-request';
  requestId: string;
  displayName: string;
}

export interface PeerJoinedMsg {
  type: 'peer-joined';
  member: LobbyMember;
}

export interface PeerLeftMsg {
  type: 'peer-left';
  memberId: string;
}

export interface PeerKickedMsg {
  type: 'peer-kicked';
  memberId: string;
}

export interface OwnerChangedMsg {
  type: 'owner-changed';
  newOwnerId: string;
}

export interface LobbyClosedMsg {
  type: 'lobby-closed';
}

export interface FullSnapshotMsg {
  type: 'full-snapshot';
  snapshot: SessionSnapshot;
  seq: number;
  members: LobbyMember[];
  ownerId: string;
}

export interface VoicePeerJoinedMsg {
  type: 'voice-peer-joined';
  peerId: string;
  displayName: string;
}

export interface VoicePeerLeftMsg {
  type: 'voice-peer-left';
  peerId: string;
}

export interface VoiceOfferRelayMsg {
  type: 'voice-offer';
  from: string;
  sdp: string;
}

export interface VoiceAnswerRelayMsg {
  type: 'voice-answer';
  from: string;
  sdp: string;
}

export interface VoiceIceRelayMsg {
  type: 'voice-ice';
  from: string;
  candidate: string;
}

// ── Union types ──

export type ClientMessage =
  | HelloMsg
  | CreateLobbyMsg
  | JoinLobbyMsg
  | LeaveLobbyMsg
  | CloseLobbyMsg
  | ApproveJoinMsg
  | DenyJoinMsg
  | KickMemberMsg
  | EntityCreateMsg
  | EntityDeleteMsg
  | EntityUpdateMsg
  | EntityClearMsg
  | VoiceJoinMsg
  | VoiceLeaveMsg
  | VoiceOfferMsg
  | VoiceAnswerMsg
  | VoiceIceMsg;

export type ServerMessage =
  | WelcomeMsg
  | ErrorMsg
  | LobbyCreatedMsg
  | JoinAcceptedMsg
  | JoinRejectedMsg
  | JoinRequestPendingMsg
  | JoinRequestMsg
  | PeerJoinedMsg
  | PeerLeftMsg
  | PeerKickedMsg
  | OwnerChangedMsg
  | LobbyClosedMsg
  | FullSnapshotMsg
  | VoicePeerJoinedMsg
  | VoicePeerLeftMsg
  | VoiceOfferRelayMsg
  | VoiceAnswerRelayMsg
  | VoiceIceRelayMsg
  | ServerBroadcast;
