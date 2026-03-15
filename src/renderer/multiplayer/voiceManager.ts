import { session } from './sessionManager';
import { useVoiceStore } from '../stores/voiceStore';
import { debugLog } from '../stores/debugStore';
import type { ServerBroadcast } from './protocol';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: [
        'turn:api.athena.kurti.si:3478',
        'turn:api.athena.kurti.si:3478?transport=tcp',
      ],
      username: 'athena',
      credential: 'athena-turn-2024',
    },
  ],
};

const SPEAKING_THRESHOLD = 15; // RMS level 0-255
const SPEAKING_POLL_MS = 100;

interface PeerConnection {
  pc: RTCPeerConnection;
  audioEl: HTMLAudioElement;
  analyser: AnalyserNode | null;
  audioCtx: AudioContext | null;
}

export class VoiceManager {
  private localStream: MediaStream | null = null;
  private peers = new Map<string, PeerConnection>();
  private speakingPollTimer: ReturnType<typeof setInterval> | null = null;

  async joinVoice(): Promise<void> {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      debugLog('voice', `Got microphone stream (${this.localStream.getAudioTracks().length} tracks)`);

      // Start muted (TTT)
      for (const track of this.localStream.getAudioTracks()) {
        track.enabled = false;
      }

      session.sendVoiceJoin();
      useVoiceStore.getState().setJoined(true);

      this.startSpeakingDetection();
      debugLog('voice', 'Voice joined, waiting for peers');
    } catch (err) {
      debugLog('voice', `Microphone access failed: ${err}`);
      console.error('Failed to get microphone access:', err);
    }
  }

  leaveVoice(): void {
    this.stopSpeakingDetection();

    for (const [_id, peer] of this.peers) {
      peer.pc.close();
      peer.audioEl.remove();
      if (peer.audioCtx) peer.audioCtx.close();
    }
    this.peers.clear();

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        track.stop();
      }
      this.localStream = null;
    }

    session.sendVoiceLeave();
    useVoiceStore.getState().reset();
    debugLog('voice', 'Voice left');
  }

  setTttActive(active: boolean): void {
    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        track.enabled = active;
      }
      debugLog('voice', `TTT ${active ? 'ON' : 'OFF'}`);
    }
  }

  handleSignaling(msg: ServerBroadcast & { payload?: any }): void {
    switch (msg.type) {
      case 'voice-peer-joined':
        this.onPeerJoined(msg as any);
        break;
      case 'voice-peer-left':
        this.onPeerLeft(msg as any);
        break;
      case 'voice-offer':
        this.onOffer(msg as any);
        break;
      case 'voice-answer':
        this.onAnswer(msg as any);
        break;
      case 'voice-ice':
        this.onIce(msg as any);
        break;
    }
  }

  private async onPeerJoined(msg: { peerId: string; displayName: string }): Promise<void> {
    debugLog('voice', `Peer joined: ${msg.displayName} (${msg.peerId}), hasStream=${!!this.localStream}`);
    if (!this.localStream) return;

    useVoiceStore.getState().addPeer({ id: msg.peerId, name: msg.displayName, speaking: false });

    const pc = this.createPeerConnection(msg.peerId);

    for (const track of this.localStream.getTracks()) {
      pc.addTrack(track, this.localStream);
    }

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    session.sendVoiceOffer(msg.peerId, JSON.stringify(offer));
    debugLog('voice', `Sent offer to ${msg.peerId}`);
  }

  private onPeerLeft(msg: { peerId: string }): void {
    const peer = this.peers.get(msg.peerId);
    if (peer) {
      peer.pc.close();
      peer.audioEl.remove();
      if (peer.audioCtx) peer.audioCtx.close();
      this.peers.delete(msg.peerId);
    }
    useVoiceStore.getState().removePeer(msg.peerId);
    debugLog('voice', `Peer left: ${msg.peerId}`);
  }

  private async onOffer(msg: { from: string; displayName?: string; sdp: string }): Promise<void> {
    debugLog('voice', `Received offer from ${msg.from} (${msg.displayName ?? '?'}), hasStream=${!!this.localStream}`);
    if (!this.localStream) return;

    let peerConn = this.peers.get(msg.from);
    if (!peerConn) {
      const name = msg.displayName ?? msg.from;
      useVoiceStore.getState().addPeer({ id: msg.from, name, speaking: false });
      this.createPeerConnection(msg.from);
      peerConn = this.peers.get(msg.from)!;
    }

    const pc = peerConn.pc;
    for (const track of this.localStream.getTracks()) {
      pc.addTrack(track, this.localStream);
    }

    const offer = JSON.parse(msg.sdp) as RTCSessionDescriptionInit;
    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    session.sendVoiceAnswer(msg.from, JSON.stringify(answer));
    debugLog('voice', `Sent answer to ${msg.from}`);
  }

  private async onAnswer(msg: { from: string; sdp: string }): Promise<void> {
    const peer = this.peers.get(msg.from);
    if (!peer) return;
    const answer = JSON.parse(msg.sdp) as RTCSessionDescriptionInit;
    await peer.pc.setRemoteDescription(new RTCSessionDescription(answer));
    debugLog('voice', `Answer set for ${msg.from}`);
  }

  private async onIce(msg: { from: string; candidate: string }): Promise<void> {
    const peer = this.peers.get(msg.from);
    if (!peer) return;
    const candidate = JSON.parse(msg.candidate) as RTCIceCandidateInit;
    await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
  }

  private createPeerConnection(peerId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const audioEl = document.createElement('audio');
    audioEl.autoplay = true;

    document.body.appendChild(audioEl);

    const peerData: PeerConnection = { pc, audioEl, analyser: null, audioCtx: null };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        session.sendVoiceIce(peerId, JSON.stringify(e.candidate));
      }
    };

    pc.ontrack = (e) => {
      debugLog('voice', `Remote track received from ${peerId}`);
      const stream = e.streams[0] || new MediaStream([e.track]);
      audioEl.srcObject = stream;
      audioEl.play().catch((err) => debugLog('voice', `Audio play failed: ${err}`));

      // Set up audio analyser for speaking detection
      try {
        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.3;
        source.connect(analyser);
        peerData.analyser = analyser;
        peerData.audioCtx = audioCtx;
      } catch {
        // AudioContext may not be available
      }
    };

    pc.onconnectionstatechange = () => {
      debugLog('voice', `Peer ${peerId} connection: ${pc.connectionState}`);
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.onPeerLeft({ peerId });
      }
    };

    this.peers.set(peerId, peerData);
    return pc;
  }

  private startSpeakingDetection(): void {
    this.speakingPollTimer = setInterval(() => {
      const store = useVoiceStore.getState();
      const dataArray = new Uint8Array(128);

      for (const [peerId, peer] of this.peers) {
        if (!peer.analyser) continue;

        peer.analyser.getByteFrequencyData(dataArray);
        // Compute RMS
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / dataArray.length);
        const speaking = rms > SPEAKING_THRESHOLD;

        // Only update store if state changed
        const currentPeer = store.peers.find(p => p.id === peerId);
        if (currentPeer && currentPeer.speaking !== speaking) {
          store.setPeers(store.peers.map(p =>
            p.id === peerId ? { ...p, speaking } : p
          ));
        }
      }
    }, SPEAKING_POLL_MS);
  }

  private stopSpeakingDetection(): void {
    if (this.speakingPollTimer) {
      clearInterval(this.speakingPollTimer);
      this.speakingPollTimer = null;
    }
  }
}

export const voice = new VoiceManager();
