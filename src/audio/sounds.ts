/**
 * Event sound playback + TTS.
 *
 * Uses the shared AudioContext from App.tsx.
 * Sounds are synthesised procedurally — no external WAV files needed.
 * Each event has a distinct character recognisable without visual feedback.
 *
 * Initialise with: initSounds(audioContext)
 */

type SoundEvent =
  | "connect"
  | "disconnect"
  | "user_join"
  | "user_leave"
  | "channel_join"
  | "ptt_start"
  | "ptt_end"
  | "ptt_blocked"
  | "error"
  | "message";

let _ctx: AudioContext | null = null;
let _enabled = true;
let _volume = 0.5;
let _ttsEnabled = true;
let _ttsRate = 1.0;

// ─── Init ─────────────────────────────────────────────────────────────────────

export function initSounds(audioContext: AudioContext): void {
  _ctx = audioContext;
}

// ─── Synthesis helpers ────────────────────────────────────────────────────────

function masterGain(): GainNode {
  const g = _ctx!.createGain();
  g.gain.value = _volume;
  g.connect(_ctx!.destination);
  return g;
}

function tone(
  freq: number,
  type: OscillatorType,
  startTime: number,
  duration: number,
  gainVal: number,
  out: AudioNode,
  fadeOut = true
): void {
  const osc = _ctx!.createOscillator();
  const g   = _ctx!.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  g.gain.setValueAtTime(gainVal, startTime);
  if (fadeOut) g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(g);
  g.connect(out);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.01);
}

// ─── Sound definitions ────────────────────────────────────────────────────────
// All synthesised: distinct, short, not annoying.

function playConnect(): void {
  if (!_ctx) return;
  const now = _ctx.currentTime;
  const mg = masterGain();
  tone(440, "sine", now,        0.12, 0.4, mg);
  tone(660, "sine", now + 0.10, 0.18, 0.4, mg);
}

function playDisconnect(): void {
  if (!_ctx) return;
  const now = _ctx.currentTime;
  const mg = masterGain();
  tone(440, "sine", now,        0.12, 0.4, mg);
  tone(294, "sine", now + 0.10, 0.20, 0.35, mg);
}

function playUserJoin(): void {
  if (!_ctx) return;
  const now = _ctx.currentTime;
  const mg = masterGain();
  tone(880, "sine", now,        0.08, 0.3, mg);
  tone(880, "sine", now + 0.10, 0.08, 0.2, mg);
}

function playUserLeave(): void {
  if (!_ctx) return;
  const now = _ctx.currentTime;
  const mg = masterGain();
  const osc = _ctx.createOscillator();
  const g = _ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(660, now);
  osc.frequency.exponentialRampToValueAtTime(330, now + 0.2);
  g.gain.setValueAtTime(0.3, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
  osc.connect(g);
  g.connect(mg);
  osc.start(now);
  osc.stop(now + 0.25);
}

function playChannelJoin(): void {
  if (!_ctx) return;
  const now = _ctx.currentTime;
  tone(523, "sine", now, 0.10, 0.25, masterGain());
}

function playPttStart(): void {
  if (!_ctx) return;
  const now = _ctx.currentTime;
  tone(1200, "square", now, 0.025, 0.15, masterGain());
}

function playPttEnd(): void {
  if (!_ctx) return;
  const now = _ctx.currentTime;
  tone(900, "square", now, 0.025, 0.12, masterGain());
}

function playPttBlocked(): void {
  if (!_ctx) return;
  const now = _ctx.currentTime;
  const mg = masterGain();
  // Flat, deflated — descending short blip, no energy
  const osc = _ctx.createOscillator();
  const g = _ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(300, now);
  osc.frequency.exponentialRampToValueAtTime(180, now + 0.08);
  g.gain.setValueAtTime(0.18, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
  osc.connect(g);
  g.connect(mg);
  osc.start(now);
  osc.stop(now + 0.1);
}

function playError(): void {
  if (!_ctx) return;
  const now = _ctx.currentTime;
  const mg = masterGain();
  tone(200, "sawtooth", now,        0.08, 0.4,  mg);
  tone(180, "sawtooth", now + 0.09, 0.08, 0.35, mg);
}

function playMessage(): void {
  if (!_ctx) return;
  const now = _ctx.currentTime;
  tone(660, "sine", now, 0.10, 0.3, masterGain());
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function playSound(event: SoundEvent): void {
  if (!_enabled || !_ctx) return;

  // Resume AudioContext if suspended (browser autoplay policy).
  // Await the resume before scheduling oscillators — starting nodes
  // on a suspended context is a no-op in some WebView versions.
  if (_ctx.state === "suspended") {
    _ctx.resume().then(() => playSound(event)).catch(() => {});
    return;
  }

  switch (event) {
    case "connect":     return playConnect();
    case "disconnect":  return playDisconnect();
    case "user_join":   return playUserJoin();
    case "user_leave":  return playUserLeave();
    case "channel_join":return playChannelJoin();
    case "ptt_start":   return playPttStart();
    case "ptt_end":     return playPttEnd();
    case "ptt_blocked": return playPttBlocked();
    case "error":       return playError();
    case "message":     return playMessage();
  }
}

export function setSoundsEnabled(enabled: boolean): void {
  _enabled = enabled;
}

export function setSoundVolume(vol: number): void {
  _volume = Math.max(0, Math.min(1, vol));
}

// ─── TTS ──────────────────────────────────────────────────────────────────────

export function setTTSEnabled(enabled: boolean): void {
  _ttsEnabled = enabled;
}

export function setTTSRate(rate: number): void {
  _ttsRate = Math.max(0.5, Math.min(2.0, rate));
}

export function speak(text: string): void {
  if (!_ttsEnabled || !window.speechSynthesis) return;
  // Cancel current speech so we don't queue up
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.rate = _ttsRate;
  utt.volume = _volume;
  window.speechSynthesis.speak(utt);
}

export function speakJoinedGroup(displayName: string): void {
  speak(`${displayName} has joined the group`);
}

export function speakLeftGroup(displayName: string): void {
  speak(`${displayName} has left the group`);
}

export function speakJoinedChannel(displayName: string, channelName: string): void {
  speak(`${displayName} has joined channel ${channelName}`);
}

export function speakLeftChannel(displayName: string, channelName: string): void {
  speak(`${displayName} has left channel ${channelName}`);
}

export function speakYouMovedToChannel(channelName: string): void {
  speak(`You have been moved to channel ${channelName}`);
}

export function speakConnected(): void {
  speak("Connection established");
}

export function speakDisconnected(): void {
  speak("Connection lost");
}
