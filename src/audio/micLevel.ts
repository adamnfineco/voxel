/**
 * Local mic level monitor.
 * Accepts shared stream + AudioContext — does NOT create its own.
 * Provides real-time RMS level (0-1) for the level meter UI.
 */

let _running = false;
let _analyser: AnalyserNode | null = null;
let _sourceNode: MediaStreamAudioSourceNode | null = null;
let _rafId: number | null = null;
let _onLevel: ((level: number) => void) | null = null;

export function onMicLevel(cb: (level: number) => void): () => void {
  _onLevel = cb;
  return () => { _onLevel = null; };
}

/**
 * Start monitoring mic level using the shared stream and AudioContext.
 */
export function startMicMonitor(stream: MediaStream, audioContext: AudioContext): void {
  stopMicMonitor();

  _sourceNode = audioContext.createMediaStreamSource(stream);
  _analyser = audioContext.createAnalyser();
  _analyser.fftSize = 256;
  _analyser.smoothingTimeConstant = 0.5;
  _sourceNode.connect(_analyser);

  _running = true;
  loop();
}

export function stopMicMonitor(): void {
  _running = false;

  if (_rafId !== null) {
    cancelAnimationFrame(_rafId);
    _rafId = null;
  }

  // Disconnect from shared context — don't close it
  _sourceNode?.disconnect();
  _sourceNode = null;
  _analyser = null;

  _onLevel?.(0);
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
  const rms = Math.sqrt(sum / data.length) / 128;
  _onLevel?.(Math.min(1, rms * 5)); // scale up for visibility

  _rafId = requestAnimationFrame(loop);
}
