/**
 * Audio ducking — lowers remote audio when transmitting.
 * Must be initialised with the shared AudioContext before use.
 * The duck GainNode sits between all remote sources and destination.
 */

let _ctx: AudioContext | null = null;
let _duckGain: GainNode | null = null;
let _enabled = true;
let _isDucked = false;

const DUCK_LEVEL   = 0.15; // 15% volume when ducked
const NORMAL_LEVEL = 1.0;
const RAMP_TIME    = 0.08; // 80ms ramp — fast but not jarring

export function initDucking(ctx: AudioContext): GainNode {
  _ctx = ctx;
  _duckGain = ctx.createGain();
  _duckGain.gain.setValueAtTime(NORMAL_LEVEL, ctx.currentTime);
  _duckGain.connect(ctx.destination);
  return _duckGain;
}

export function getDuckNode(): GainNode | null {
  return _duckGain;
}

export function setDuckingEnabled(enabled: boolean): void {
  _enabled = enabled;
  if (!enabled && _isDucked) unduck();
}

export function duck(): void {
  if (!_enabled || !_ctx || !_duckGain || _isDucked) return;
  _isDucked = true;
  _duckGain.gain.setTargetAtTime(DUCK_LEVEL, _ctx.currentTime, RAMP_TIME);
}

export function unduck(): void {
  if (!_ctx || !_duckGain || !_isDucked) return;
  _isDucked = false;
  _duckGain.gain.setTargetAtTime(NORMAL_LEVEL, _ctx.currentTime, RAMP_TIME);
}

export function isDucking(): boolean {
  return _isDucked;
}
