/**
 * Push-to-Talk manager.
 * Uses Tauri's global-shortcut plugin — works when app is backgrounded.
 *
 * Default PTT key: Backquote (`) — top-left key, near Escape.
 * Zero conflict with typing. Common gaming PTT key.
 *
 * Key format: Tauri uses "A", "Control+A", "Alt+F4", etc.
 * We capture full combos including modifiers during the listen phase.
 */

import { register, unregister, unregisterAll } from "@tauri-apps/plugin-global-shortcut";
import { setMicMuted } from "./mesh";
import { duck, unduck } from "./ducking";
import { playSound } from "./sounds";

// Default: backtick/tilde key — no typing conflicts, universal reach
let _pttKey = "Backquote";
let _registered = false;
let _pttActive = false;
let _onPttChange: ((active: boolean) => void) | null = null;

export function onPttChange(cb: (active: boolean) => void): void {
  _onPttChange = cb;
}

export function getCurrentKey(): string {
  return _pttKey;
}

// ─── Key format conversion ────────────────────────────────────────────────────

const MODIFIER_CODES = new Set([
  "ControlLeft", "ControlRight",
  "ShiftLeft", "ShiftRight",
  "AltLeft", "AltRight",
  "MetaLeft", "MetaRight",
]);


/**
 * Convert a KeyboardEvent into a Tauri shortcut string.
 * Captures full modifier combos: Ctrl+A, Alt+F4, etc.
 * e.g. KeyboardEvent{ctrlKey, code:"KeyA"} → "Control+A"
 */
export function eventToTauriKey(e: KeyboardEvent): string | null {
  // Pure modifier press — not a valid PTT key alone
  if (MODIFIER_CODES.has(e.code)) return null;

  const key = codeToKey(e.code);
  if (!key) return null;

  const mods: string[] = [];
  if (e.ctrlKey)  mods.push("Control");
  if (e.altKey)   mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  if (e.metaKey)  mods.push("Super");

  return mods.length > 0 ? `${mods.join("+")}+${key}` : key;
}

/** Convert a KeyboardEvent.code to a Tauri key name (no modifiers) */
function codeToKey(code: string): string | null {
  // Function keys F1–F12
  if (/^F(\d{1,2})$/.test(code)) return code;

  // Letter keys: "KeyA" → "A"
  const keyMatch = code.match(/^Key([A-Z])$/);
  if (keyMatch) return keyMatch[1];

  // Digit keys: "Digit1" → "1"
  const digitMatch = code.match(/^Digit(\d)$/);
  if (digitMatch) return digitMatch[1];

  // Numpad
  const numpadMatch = code.match(/^Numpad(\d)$/);
  if (numpadMatch) return `Num${numpadMatch[1]}`;

  const specialMap: Record<string, string> = {
    Backquote:       "Backquote",  // ` / ~ — DEFAULT PTT KEY
    Space:           "Space",
    Enter:           "Return",
    Escape:          "Escape",
    Tab:             "Tab",
    Backspace:       "Backspace",
    Delete:          "Delete",
    Insert:          "Insert",
    Home:            "Home",
    End:             "End",
    PageUp:          "PageUp",
    PageDown:        "PageDown",
    ArrowUp:         "Up",
    ArrowDown:       "Down",
    ArrowLeft:       "Left",
    ArrowRight:      "Right",
    CapsLock:        "CapsLock",
    Minus:           "Minus",
    Equal:           "Equal",
    BracketLeft:     "BracketLeft",
    BracketRight:    "BracketRight",
    Backslash:       "Backslash",
    Semicolon:       "Semicolon",
    Quote:           "Quote",
    Comma:           "Comma",
    Period:          "Period",
    Slash:           "Slash",
    NumpadEnter:     "NumpadEnter",
    NumpadAdd:       "NumpadAdd",
    NumpadSubtract:  "NumpadSubtract",
    NumpadMultiply:  "NumpadMultiply",
    NumpadDivide:    "NumpadDivide",
    NumpadDecimal:   "NumpadDecimal",
    PrintScreen:     "Print",
    ScrollLock:      "ScrollLock",
    Pause:           "Pause",
  };

  return specialMap[code] ?? null;
}

/** Human-readable display label for a Tauri key string */
export function keyDisplayLabel(tauriKey: string): string {
  const labels: Record<string, string> = {
    Backquote: "` (backtick)",
    Space:     "SPACE",
    Return:    "ENTER",
    Escape:    "ESC",
    Control:   "CTRL",
    Shift:     "SHIFT",
    Alt:       "ALT",
    Super:     "CMD",
    Up: "↑", Down: "↓", Left: "←", Right: "→",
    CapsLock:  "CAPS",
  };

  // Handle combos like "Control+A"
  return tauriKey
    .split("+")
    .map(part => labels[part] ?? part.toUpperCase())
    .join(" + ");
}

// ─── Register / unregister ────────────────────────────────────────────────────

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
    setMicMuted(true); // start muted in PTT mode
  } catch (e) {
    console.error("[ptt] failed to register:", tauriKey, e);
    throw e;
  }
}

export async function unregisterPTT(): Promise<void> {
  if (!_registered) return;
  try {
    await unregister(_pttKey);
  } catch {
    try { await unregisterAll(); } catch {}
  }
  _registered = false;
  _pttActive = false;
}

export function isPTTActive(): boolean {
  return _pttActive;
}
