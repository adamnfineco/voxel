/**
 * Voice Activation Detection.
 * Accepts a shared AudioContext — does NOT create its own.
 * Monitors mic input and gates the mic track based on threshold.
 */

import { setMicMuted } from "./mesh";
import { duck, unduck } from "./ducking";

let _running = false;
let _analyser: AnalyserNode | null = null;
let _sourceNode: MediaStreamAudioSourceNode | null = null;
let _threshold = 15;
let _silenceMs = 800;
let _silenceTimer: ReturnType<typeof setTimeout> | null = null;
let _active = false;
let _rafId: number | null = null;
let _onActivity: ((active: boolean) => void) | null = null;

export function onVadActivity(cb: (active: boolean) => void): void {
  _onActivity = cb;
}

export function setThreshold(val: number): void {
  _threshold = Math.max(1, Math.min(128, val));
}

export function setSilenceHold(ms: number): void {
  _silenceMs = Math.max(100, ms);
}

/**
 * Start VAD using the shared stream and AudioContext.
 * Creates its own source node but does NOT close the context.
 */
export function startVAD(stream: MediaStream, audioContext: AudioContext): void {
  stopVAD();

  _sourceNode = audioContext.createMediaStreamSource(stream);
  _analyser = audioContext.createAnalyser();
  _analyser.fftSize = 256;
  _analyser.smoothingTimeConstant = 0.4;
  _sourceNode.connect(_analyser);

  _running = true;
  setMicMuted(true); // start muted, VAD will unmute when speech detected

  loop();
}

export function stopVAD(): void {
  _running = false;

  if (_rafId !== null) {
    cancelAnimationFrame(_rafId);
    _rafId = null;
  }

  if (_silenceTimer) {
    clearTimeout(_silenceTimer);
    _silenceTimer = null;
  }

  // Disconnect source node to release resources — don't close the shared context
  _sourceNode?.disconnect();
  _sourceNode = null;
  _analyser = null;
  _active = false;
}

function loop(): void {
  if (!_running || !_analyser) return;

  const data = new Uint8Array(_analyser.frequencyBinCount);
  _analyser.getByteTimeDomainData(data);

  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const x = data[i] - 128;
    sum += x * x;
  }
  const rms = Math.sqrt(sum / data.length);

  if (rms >= _threshold) {
    if (_silenceTimer) { clearTimeout(_silenceTimer); _silenceTimer = null; }
    if (!_active) {
      _active = true;
      setMicMuted(false);
      duck();
      _onActivity?.(true);
    }
  } else if (_active && !_silenceTimer) {
    _silenceTimer = setTimeout(() => {
      _active = false;
      _silenceTimer = null;
      setMicMuted(true);
      unduck();
      _onActivity?.(false);
    }, _silenceMs);
  }

  _rafId = requestAnimationFrame(loop);
}

export function isVADActive(): boolean {
  return _active;
}
