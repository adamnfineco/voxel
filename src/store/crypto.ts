/**
 * Client-side crypto utilities.
 * Channel passwords are hashed with SHA-256 before storage.
 * We don't need a strong password hash (bcrypt/argon2) here because:
 * - The hash is stored locally (SQLite), not on a server
 * - An attacker with local DB access already has full access to the machine
 * - The purpose is to prevent casual snooping, not brute-force resistance
 *
 * For the gossip broadcast of channel password changes, we broadcast the
 * hash (not the raw password) so peers can verify without sharing secrets.
 */

export async function hashPassword(password: string): Promise<string> {
  if (!password.trim()) return "";
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(password.trim()));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!hash) return true; // no password set — always allow
  if (!password.trim()) return false;
  const computed = await hashPassword(password);
  return computed === hash;
}
