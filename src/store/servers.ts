import { query, execute } from "./db";
import { DEFAULT_SIGNAL_URL, deriveServerName } from "../runtime/config";

export interface Server {
  id: string;
  name: string;
  server_key: string;
  signal_url: string;
  last_connected: number | null;
  created_at: number;
}

export interface Channel {
  id: string;
  server_id: string;
  parent_id: string | null;
  name: string;
  sort_order: number;
  is_afk: boolean;
  afk_timeout_seconds: number;
  is_queued: boolean;
  max_users: number | null;
  password_hash: string | null;
  created_by: string | null;
  updated_at: number;
}

export interface Role {
  server_id: string;
  peer_id: string;
  role: "owner" | "admin" | "member";
  display_name: string | null;
  granted_by: string | null;
  granted_at: number;
}

// ─── Servers ─────────────────────────────────────────────────────────────────

export async function listServers(): Promise<Server[]> {
  return query<Server>("SELECT * FROM servers ORDER BY last_connected DESC, created_at DESC");
}

/**
 * Derive a stable server ID from the plaintext room key.
 * Every peer entering the same room key must land in the same room
 * on the signal server — so the ID must be deterministic, not random.
 * We SHA-256 the plaintext key and take the first 32 hex chars.
 */
export async function deriveServerId(plaintextKey: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(plaintextKey.trim()));
  const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 32); // 128-bit prefix — enough uniqueness
}

export async function addServer(
  name: string | null,
  plaintextKey: string,
  signalUrl: string = DEFAULT_SIGNAL_URL
): Promise<Server> {
  // Derive stable ID from plaintext key so all peers share the same room
  const id = await deriveServerId(plaintextKey);
  const now = Date.now();
  const resolvedName = (name && name.trim()) ? name.trim() : deriveServerName(plaintextKey);

  // Upsert — if same key was joined before, update name/url but keep the record
  await execute(
    `INSERT INTO servers (id, name, server_key, signal_url, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, signal_url=excluded.signal_url`,
    [id, resolvedName, plaintextKey, signalUrl, now]
  );
  return { id, name: resolvedName, server_key: plaintextKey, signal_url: signalUrl, last_connected: null, created_at: now };
}

export async function removeServer(serverId: string): Promise<void> {
  await execute("DELETE FROM servers WHERE id = ?", [serverId]);
}

export async function renameServer(serverId: string, name: string): Promise<void> {
  await execute("UPDATE servers SET name = ? WHERE id = ?", [name.trim(), serverId]);
}

export async function touchServer(serverId: string): Promise<void> {
  await execute("UPDATE servers SET last_connected = ? WHERE id = ?", [Date.now(), serverId]);
}

// ─── Channels ─────────────────────────────────────────────────────────────────

export async function listChannels(serverId: string): Promise<Channel[]> {
  const rows = await query<any>(
    "SELECT * FROM channels WHERE server_id = ? ORDER BY sort_order ASC, name ASC",
    [serverId]
  );
  return rows.map(normalizeChannel);
}

function normalizeChannel(row: any): Channel {
  return {
    ...row,
    is_afk: row.is_afk === 1 || row.is_afk === true,
    is_queued: row.is_queued === 1 || row.is_queued === true,
  };
}

export async function createChannel(
  serverId: string,
  name: string,
  opts: {
    parentId?: string;
    isAfk?: boolean;
    afkTimeoutSeconds?: number;
    isQueued?: boolean;
    maxUsers?: number;
    createdBy?: string;
  } = {}
): Promise<Channel> {
  const id = crypto.randomUUID();
  const now = Date.now();
  await execute(
    `INSERT INTO channels 
      (id, server_id, parent_id, name, sort_order, is_afk, afk_timeout_seconds, is_queued, max_users, created_by, updated_at) 
      VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      serverId,
      opts.parentId ?? null,
      name,
      opts.isAfk ? 1 : 0,
      opts.afkTimeoutSeconds ?? 300,
      opts.isQueued ? 1 : 0,
      opts.maxUsers ?? null,
      opts.createdBy ?? null,
      now,
    ]
  );
  return {
    id, server_id: serverId, parent_id: opts.parentId ?? null,
    name, sort_order: 0,
    is_afk: opts.isAfk ?? false,
    afk_timeout_seconds: opts.afkTimeoutSeconds ?? 300,
    is_queued: opts.isQueued ?? false,
    max_users: opts.maxUsers ?? null,
    password_hash: null,
    created_by: opts.createdBy ?? null,
    updated_at: now,
  };
}

export async function deleteChannel(channelId: string): Promise<void> {
  await execute("DELETE FROM channels WHERE id = ?", [channelId]);
}

export async function updateChannel(channel: Channel): Promise<void> {
  await execute(
    `UPDATE channels SET name=?, parent_id=?, sort_order=?, is_afk=?, 
     afk_timeout_seconds=?, is_queued=?, max_users=?, updated_at=? WHERE id=?`,
    [
      channel.name, channel.parent_id, channel.sort_order,
      channel.is_afk ? 1 : 0, channel.afk_timeout_seconds,
      channel.is_queued ? 1 : 0, channel.max_users,
      Date.now(), channel.id,
    ]
  );
}

// ─── Roles ────────────────────────────────────────────────────────────────────

export async function getRole(serverId: string, peerId: string): Promise<Role | null> {
  const rows = await query<Role>(
    "SELECT * FROM roles WHERE server_id = ? AND peer_id = ?",
    [serverId, peerId]
  );
  return rows.length > 0 ? rows[0] : null;
}

export async function setRole(
  serverId: string,
  peerId: string,
  role: "owner" | "admin" | "member",
  displayName: string | null,
  grantedBy: string
): Promise<void> {
  await execute(
    `INSERT OR REPLACE INTO roles (server_id, peer_id, role, display_name, granted_by, granted_at) 
     VALUES (?, ?, ?, ?, ?, ?)`,
    [serverId, peerId, role, displayName, grantedBy, Date.now()]
  );
}

export async function listRoles(serverId: string): Promise<Role[]> {
  return query<Role>("SELECT * FROM roles WHERE server_id = ?", [serverId]);
}

// ─── Muted Users ──────────────────────────────────────────────────────────────

export async function muteUser(serverId: string, peerId: string): Promise<void> {
  await execute(
    "INSERT OR REPLACE INTO muted_users (server_id, peer_id, muted_at) VALUES (?, ?, ?)",
    [serverId, peerId, Date.now()]
  );
}

export async function unmuteUser(serverId: string, peerId: string): Promise<void> {
  await execute(
    "DELETE FROM muted_users WHERE server_id = ? AND peer_id = ?",
    [serverId, peerId]
  );
}

export async function isMuted(serverId: string, peerId: string): Promise<boolean> {
  const rows = await query<{ peer_id: string }>(
    "SELECT peer_id FROM muted_users WHERE server_id = ? AND peer_id = ?",
    [serverId, peerId]
  );
  return rows.length > 0;
}

export async function listMuted(serverId: string): Promise<string[]> {
  const rows = await query<{ peer_id: string }>(
    "SELECT peer_id FROM muted_users WHERE server_id = ?",
    [serverId]
  );
  return rows.map((r) => r.peer_id);
}

// ─── Prefs ────────────────────────────────────────────────────────────────────

export async function getPref(serverId: string, key: string): Promise<string | null> {
  const rows = await query<{ value: string }>(
    "SELECT value FROM user_prefs WHERE server_id = ? AND key = ?",
    [serverId, key]
  );
  return rows.length > 0 ? rows[0].value : null;
}

export async function setPref(serverId: string, key: string, value: string): Promise<void> {
  await execute(
    "INSERT OR REPLACE INTO user_prefs (server_id, key, value) VALUES (?, ?, ?)",
    [serverId, key, value]
  );
}

// ─── Reserved Names ───────────────────────────────────────────────────────────

export async function reserveName(serverId: string, name: string, peerId?: string): Promise<void> {
  await execute(
    "INSERT OR REPLACE INTO reserved_names (server_id, name, peer_id, reserved_at) VALUES (?, ?, ?, ?)",
    [serverId, name, peerId ?? null, Date.now()]
  );
}

export async function listReservedNames(serverId: string): Promise<string[]> {
  const rows = await query<{ name: string }>(
    "SELECT name FROM reserved_names WHERE server_id = ?",
    [serverId]
  );
  return rows.map((r) => r.name);
}
