/**
 * Key-at-rest: encrypt room/group keys before storing in SQLite.
 *
 * Threat model:
 *   Someone with access to the SQLite file (voxel.db) should not be able to
 *   trivially read room keys in plaintext and join rooms without authorization.
 *
 * Approach:
 *   Derive a local machine key from the app's UUID (stored in the identity table)
 *   plus a constant salt using HKDF-SHA256. Use this to AES-GCM encrypt room keys
 *   before writing them to the `servers` table.
 *
 *   This is NOT protection against someone with full machine access — they could
 *   read the UUID and derive the key. It protects against:
 *   - Cloud backup leaks of the database file
 *   - Cross-app access to the SQLite file
 *   - Log/export of the database contents
 *
 *   For stronger protection, macOS Keychain should be used. That's a future
 *   migration once tauri-plugin-stronghold or a native macOS keychain plugin lands
 *   in stable Tauri v2 (see ADR-010).
 *
 * Format: `enc:v1:<base64(IV)>:<base64(ciphertext)>`
 * Unencrypted keys are stored as-is (backwards compatibility).
 */

const SALT = "voxel-keyring-v1";
const INFO = "local-machine-key";

let _localKey: CryptoKey | null = null;

/** Initialize the local machine key from the app's UUID. */
export async function initKeyring(appUuid: string): Promise<void> {
  const enc = new TextEncoder();
  const ikm = await crypto.subtle.importKey(
    "raw", enc.encode(appUuid), "HKDF", false, ["deriveKey"]
  );
  _localKey = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: enc.encode(SALT), info: enc.encode(INFO) },
    ikm,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** Encrypt a room key for storage. Returns the `enc:v1:...` string. */
export async function encryptRoomKey(roomKey: string): Promise<string> {
  if (!_localKey) return roomKey; // not initialized — store plaintext
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    _localKey,
    enc.encode(roomKey)
  );
  const ivB64 = btoa(String.fromCharCode(...iv));
  const ctB64 = btoa(String.fromCharCode(...new Uint8Array(ct)));
  return `enc:v1:${ivB64}:${ctB64}`;
}

/** Decrypt a room key from storage. Handles both encrypted and plaintext formats. */
export async function decryptRoomKey(stored: string): Promise<string> {
  if (!stored.startsWith("enc:v1:")) return stored; // plaintext — passthrough
  if (!_localKey) return stored; // can't decrypt without key — return raw

  try {
    const parts = stored.split(":");
    if (parts.length !== 4) return stored;
    const iv = new Uint8Array(atob(parts[2]).split("").map(c => c.charCodeAt(0)));
    const ct = new Uint8Array(atob(parts[3]).split("").map(c => c.charCodeAt(0)));
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, _localKey, ct);
    return new TextDecoder().decode(pt);
  } catch {
    return stored; // decryption failed — return raw as fallback
  }
}

/** Check if a stored key is encrypted. */
export function isEncrypted(stored: string): boolean {
  return stored.startsWith("enc:v1:");
}
