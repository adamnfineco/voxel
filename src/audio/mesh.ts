/**
 * WebRTC mesh audio manager — up to 14 peers, audio-only.
 *
 * Call startAudio(stream, audioContext, duckNode) after acquiring
 * the shared stream + AudioContext from App.tsx.
 * Remote audio is routed: source → gainNode → duckNode → destination
 * This ensures ducking affects all remote peers simultaneously.
 *
 * E2EE: when initE2EE(roomKey) has been called, every sender and receiver
 * gets an RTCRtpScriptTransform that encrypts/decrypts audio frames
 * with AES-GCM 256 derived from the room key via HKDF.
 */
import { attachSenderE2EE, attachReceiverE2EE, isE2EEReady } from "./e2ee";

export type SpeakingCallback = (peerId: string, speaking: boolean) => void;
export type PeerChangeCallback = (peers: string[]) => void;

interface PeerConn {
  peerId: string;
  pc: RTCPeerConnection;
  stream: MediaStream | null;
  gainNode: GainNode | null;
  muted: boolean;
  cancelled: boolean;
}

const MAX_PEERS = 14;

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

let _peers: Map<string, PeerConn> = new Map();
let _localStream: MediaStream | null = null;
let _audioContext: AudioContext | null = null;
let _duckNode: GainNode | null = null; // remote audio destination (through duck)
let _speakingCallbacks: SpeakingCallback[] = [];
let _peerChangeCallbacks: PeerChangeCallback[] = [];
let _onIceCandidate: ((peerId: string, candidate: RTCIceCandidateInit) => void) | null = null;
let _onOffer: ((peerId: string, offer: RTCSessionDescriptionInit) => void) | null = null;
let _onAnswer: ((peerId: string, answer: RTCSessionDescriptionInit) => void) | null = null;
let _mutedPeers: Set<string> = new Set();

// ─── Setup ────────────────────────────────────────────────────────────────────

/**
 * Initialise with the shared stream, AudioContext, and duck GainNode.
 * duckNode: output of ducking.ts initDucking() — remote audio routes through it.
 */
export function startAudio(
  stream: MediaStream,
  audioContext: AudioContext,
  duckNode: GainNode
): void {
  _localStream = stream;
  _audioContext = audioContext;
  _duckNode = duckNode;
}

export async function stopAudio(): Promise<void> {
  for (const peer of _peers.values()) {
    peer.cancelled = true;
    peer.pc.close();
  }
  _peers.clear();
  _localStream = null;
  _audioContext = null;
  _duckNode = null;
  notifyPeerChange();
}

export function setMicMuted(muted: boolean): void {
  if (_localStream) {
    _localStream.getAudioTracks().forEach((t) => (t.enabled = !muted));
  }
}

export function setSoundMuted(muted: boolean): void {
  for (const peer of _peers.values()) {
    if (peer.gainNode) {
      peer.gainNode.gain.value = muted ? 0 : 1;
    }
  }
}

// ─── Callbacks ────────────────────────────────────────────────────────────────

export function onIceCandidate(cb: (peerId: string, candidate: RTCIceCandidateInit) => void): void {
  _onIceCandidate = cb;
}

export function onOffer(cb: (peerId: string, offer: RTCSessionDescriptionInit) => void): void {
  _onOffer = cb;
}

export function onAnswer(cb: (peerId: string, answer: RTCSessionDescriptionInit) => void): void {
  _onAnswer = cb;
}

export function onSpeaking(cb: SpeakingCallback): () => void {
  _speakingCallbacks.push(cb);
  return () => { _speakingCallbacks = _speakingCallbacks.filter((c) => c !== cb); };
}

export function onPeerChange(cb: PeerChangeCallback): () => void {
  _peerChangeCallbacks.push(cb);
  return () => { _peerChangeCallbacks = _peerChangeCallbacks.filter((c) => c !== cb); };
}

export function getPeers(): string[] {
  return Array.from(_peers.keys());
}

function notifyPeerChange(): void {
  const peers = getPeers();
  _peerChangeCallbacks.forEach((cb) => cb(peers));
}

// ─── Peer factory ─────────────────────────────────────────────────────────────

function createPeerConn(peerId: string): PeerConn {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const conn: PeerConn = { peerId, pc, stream: null, gainNode: null, muted: false, cancelled: false };

  // Add local mic tracks so remote peer can hear us
  if (_localStream) {
    _localStream.getTracks().forEach((t) => {
      const sender = pc.addTrack(t, _localStream!);
      // Attach E2EE encryption to the sender if ready
      if (isE2EEReady()) {
        attachSenderE2EE(sender);
      }
    });
  }

  pc.onicecandidate = (event) => {
    if (event.candidate) _onIceCandidate?.(peerId, event.candidate.toJSON());
  };

  pc.ontrack = (event) => {
    if (!_audioContext || !_duckNode) return;
    const stream = event.streams[0];
    if (!stream) return;

    const peerEntry = _peers.get(peerId);
    if (!peerEntry) return;

    // Attach E2EE decryption to the receiver if ready
    if (isE2EEReady()) {
      attachReceiverE2EE(event.receiver);
    }

    peerEntry.stream = stream;

    const source = _audioContext.createMediaStreamSource(stream);

    // Per-peer gain for individual mute
    const gainNode = _audioContext.createGain();
    gainNode.gain.value = _mutedPeers.has(peerId) ? 0 : 1;
    peerEntry.gainNode = gainNode;

    // Analyser for speaking detection
    const analyser = _audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.3;

    // Route: source → perPeerGain → duckNode (→ destination via ducking.ts)
    source.connect(gainNode);
    gainNode.connect(_duckNode);

    // Branch to analyser (doesn't affect audio output)
    source.connect(analyser);

    startSpeakingDetection(peerId, analyser, peerEntry);
  };

  pc.onconnectionstatechange = () => {
    const s = pc.connectionState;
    if (s === "disconnected" || s === "failed" || s === "closed") {
      removePeer(peerId);
    }
  };

  pc.oniceconnectionstatechange = () => {
    if (pc.iceConnectionState === "failed") pc.restartIce();
  };

  return conn;
}

// ─── Peer operations ──────────────────────────────────────────────────────────

export async function connectToPeer(peerId: string): Promise<void> {
  if (_peers.size >= MAX_PEERS) {
    console.warn(`[mesh] max peers (${MAX_PEERS}) reached`);
    return;
  }
  if (_peers.has(peerId)) return;

  const conn = createPeerConn(peerId);
  _peers.set(peerId, conn);

  const offer = await conn.pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
  await conn.pc.setLocalDescription(offer);
  _onOffer?.(peerId, offer);
  notifyPeerChange();
}

export async function handleOffer(peerId: string, offer: RTCSessionDescriptionInit): Promise<void> {
  if (_peers.size >= MAX_PEERS && !_peers.has(peerId)) {
    console.warn(`[mesh] max peers reached, rejecting offer from ${peerId}`);
    return;
  }

  let conn = _peers.get(peerId);
  if (!conn) {
    conn = createPeerConn(peerId);
    _peers.set(peerId, conn);
    notifyPeerChange();
  }

  await conn.pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await conn.pc.createAnswer();
  await conn.pc.setLocalDescription(answer);
  _onAnswer?.(peerId, answer);
}

export async function handleAnswer(peerId: string, answer: RTCSessionDescriptionInit): Promise<void> {
  const conn = _peers.get(peerId);
  if (!conn) return;
  if (conn.pc.signalingState === "have-local-offer") {
    await conn.pc.setRemoteDescription(new RTCSessionDescription(answer));
  }
}

export async function handleIceCandidate(peerId: string, candidate: RTCIceCandidateInit): Promise<void> {
  const conn = _peers.get(peerId);
  if (!conn) return;
  if (conn.pc.remoteDescription) {
    try {
      await conn.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.debug("[mesh] ICE candidate timing issue (harmless):", e);
    }
  }
}

export function removePeer(peerId: string): void {
  const conn = _peers.get(peerId);
  if (!conn) return;
  conn.cancelled = true;
  conn.pc.close();
  _peers.delete(peerId);
  notifyPeerChange();
  _speakingCallbacks.forEach((cb) => cb(peerId, false));
}

export function setRemotePeerMuted(peerId: string, muted: boolean): void {
  if (muted) _mutedPeers.add(peerId);
  else _mutedPeers.delete(peerId);
  const conn = _peers.get(peerId);
  if (conn?.gainNode) conn.gainNode.gain.value = muted ? 0 : 1;
}

// ─── Speaking detection ───────────────────────────────────────────────────────

const SPEAKING_THRESHOLD = 8;
const SPEAKING_HOLD_MS   = 600;

function startSpeakingDetection(peerId: string, analyser: AnalyserNode, conn: PeerConn): void {
  const data = new Uint8Array(analyser.frequencyBinCount);
  let isSpeaking = false;
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;

  function tick() {
    if (conn.cancelled) {
      if (silenceTimer) clearTimeout(silenceTimer);
      return;
    }

    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const x = data[i] - 128;
      sum += x * x;
    }
    const rms = Math.sqrt(sum / data.length);

    if (rms > SPEAKING_THRESHOLD) {
      if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
      if (!isSpeaking) {
        isSpeaking = true;
        _speakingCallbacks.forEach((cb) => cb(peerId, true));
      }
    } else if (isSpeaking && !silenceTimer) {
      silenceTimer = setTimeout(() => {
        isSpeaking = false;
        silenceTimer = null;
        if (!conn.cancelled) _speakingCallbacks.forEach((cb) => cb(peerId, false));
      }, SPEAKING_HOLD_MS);
    }

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

// ─── Device enumeration ───────────────────────────────────────────────────────

export interface AudioDevice {
  deviceId: string;
  label: string;
  kind: "audioinput" | "audiooutput";
}

export async function listAudioDevices(): Promise<AudioDevice[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === "audioinput" || d.kind === "audiooutput")
    .map((d) => ({
      deviceId: d.deviceId,
      label: d.label || `${d.kind} (${d.deviceId.slice(0, 8)})`,
      kind: d.kind as "audioinput" | "audiooutput",
    }));
}

/**
 * Switch the input device mid-session.
 * Replaces the local stream tracks on all peer connections.
 */
export async function switchInputDevice(deviceId: string): Promise<MediaStream> {
  const newStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: { exact: deviceId },
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: 48_000,
    },
    video: false,
  });

  // Replace tracks on all existing peer connections
  const newTrack = newStream.getAudioTracks()[0];
  for (const conn of _peers.values()) {
    const sender = conn.pc.getSenders().find((s) => s.track?.kind === "audio");
    if (sender && newTrack) {
      await sender.replaceTrack(newTrack);
    }
  }

  // Stop old stream tracks
  _localStream?.getAudioTracks().forEach((t) => t.stop());
  _localStream = newStream;

  return newStream;
}
