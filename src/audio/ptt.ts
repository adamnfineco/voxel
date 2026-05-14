/**
 * Push-to-Talk manager.
 * Uses Tauri's global-shortcut plugin — works when app is backgrounded.
 *
 * Key format: Tauri uses strings like "Space", "Alt+F4", "CmdOrControl+Shift+P"
 * We convert from KeyboardEvent.code (e.g. "ControlLeft") to Tauri format.
 */

import { register, unregister, unregisterAll } from "@tauri-apps/plugin-global-shortcut";
import { setMicMuted } from "./mesh";
import { duck, unduck } from "./ducking";
import { playSound } from "./sounds";

let _pttKey = "Space";  // Tauri shortcut string
let _registered = false;
let _pttActive = false;
let _onPttChange: ((active: boolean) => void) | null = null;

export function onPttChange(cb: (active: boolean) => void): void {
  _onPttChange = cb;
}

export function getCurrentKey(): string {
  return _pttKey;
}

export function getCurrentKeyDisplay(): string {
  return _pttKey;
}

/**
 * Convert a KeyboardEvent.code string to a Tauri-compatible shortcut string.
 * e.g. "ControlLeft" → "Control", "KeyA" → "A", "Space" → "Space"
 */
export function codeToTauriKey(code: string): string {
  // Modifier-only keys (Tauri doesn't support bare modifiers as shortcuts)
  const modifierMap: Record<string, string> = {
    ControlLeft:  "Control",
    ControlRight: "Control",
    ShiftLeft:    "Shift",
    ShiftRight:   "Shift",
    AltLeft:      "Alt",
    AltRight:     "Alt",
    MetaLeft:     "Super",
    MetaRight:    "Super",
  };

  if (modifierMap[code]) return modifierMap[code];

  // Function keys
  if (/^F(\d+)$/.test(code)) return code; // F1-F12

  // Letter keys: "KeyA" → "A"
  const keyMatch = code.match(/^Key([A-Z])$/);
  if (keyMatch) return keyMatch[1];

  // Digit keys: "Digit1" → "1"
  const digitMatch = code.match(/^Digit(\d)$/);
  if (digitMatch) return digitMatch[1];

  // Numpad: "Numpad0" → "Num0"
  const numpadMatch = code.match(/^Numpad(\d)$/);
  if (numpadMatch) return `Num${numpadMatch[1]}`;

  // Known special keys
  const specialMap: Record<string, string> = {
    Space:        "Space",
    Enter:        "Return",
    Escape:       "Escape",
    Tab:          "Tab",
    Backspace:    "Backspace",
    Delete:       "Delete",
    Insert:       "Insert",
    Home:         "Home",
    End:          "End",
    PageUp:       "PageUp",
    PageDown:     "PageDown",
    ArrowUp:      "Up",
    ArrowDown:    "Down",
    ArrowLeft:    "Left",
    ArrowRight:   "Right",
    CapsLock:     "CapsLock",
    PrintScreen:  "Print",
    ScrollLock:   "ScrollLock",
    Pause:        "Pause",
    NumpadEnter:  "NumpadEnter",
    NumpadAdd:    "NumpadAdd",
    NumpadSubtract: "NumpadSubtract",
    NumpadMultiply: "NumpadMultiply",
    NumpadDivide:   "NumpadDivide",
    NumpadDecimal:  "NumpadDecimal",
    Minus:        "Minus",
    Equal:        "Equal",
    BracketLeft:  "BracketLeft",
    BracketRight: "BracketRight",
    Backslash:    "Backslash",
    Semicolon:    "Semicolon",
    Quote:        "Quote",
    Comma:        "Comma",
    Period:       "Period",
    Slash:        "Slash",
    Backquote:    "Backquote",
  };

  return specialMap[code] ?? code;
}

/**
 * Human-readable label for a Tauri key string.
 */
export function keyDisplayLabel(tauriKey: string): string {
  const labels: Record<string, string> = {
    Space:   "SPACE",
    Return:  "ENTER",
    Escape:  "ESC",
    Control: "CTRL",
    Shift:   "SHIFT",
    Alt:     "ALT",
    Super:   "CMD",
    Up:      "↑", Down: "↓", Left: "←", Right: "→",
  };
  return labels[tauriKey] ?? tauriKey.toUpperCase();
}

export async function registerPTT(tauriKey: string): Promise<void> {
  if (_registered) await unregisterPTT();

  _pttKey = tauriKey;

  try {
    await register(tauriKey, (event) => {
      if (event.state === "Pressed" && !_pttActive) {
        _pttActive = true;
        setMicMuted(false);
        duck();
        playSound("ptt_start");
        _onPttChange?.(true);
      } else if (event.state === "Released" && _pttActive) {
        _pttActive = false;
        setMicMuted(true);
        unduck();
        playSound("ptt_end");
        _onPttChange?.(false);
      }
    });
    _registered = true;
    setMicMuted(true); // start muted
  } catch (e) {
    console.error("[ptt] failed to register:", tauriKey, e);
    throw e; // propagate so App.tsx can surface the error
  }
}

export async function unregisterPTT(): Promise<void> {
  if (!_registered) return;
  try {
    await unregister(_pttKey);
  } catch {
    // If unregister fails (e.g. already unregistered), try unregisterAll as fallback
    try { await unregisterAll(); } catch {}
  }
  _registered = false;
  _pttActive = false;
}

export function isPTTActive(): boolean {
  return _pttActive;
}
