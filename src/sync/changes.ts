/**
 * Applies incoming peer changes to local SQLite state.
 * Validates payload shape before applying — never trust remote data.
 */

import { execute, query } from "../store/db";

// Max lengths to prevent injection / OOM via oversized strings
const MAX_NAME_LEN = 64;
const MAX_ID_LEN = 64;

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function safeId(v: unknown): string | null {
  if (!isString(v) || v.length === 0 || v.length > MAX_ID_LEN) return null;
  // UUIDs only: allow hex + hyphens
  if (!/^[a-zA-Z0-9_\-]+$/.test(v)) return null;
  return v;
}

function safeName(v: unknown): string | null {
  if (!isString(v) || v.trim().length === 0 || v.length > MAX_NAME_LEN) return null;
  return v.trim();
}

function safeBool(v: unknown): boolean {
  return v === 1 || v === true;
}

function safeInt(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function safeTimestamp(): number {
  return Date.now();
}

/** Get the role of a peer on a server from local SQLite */
async function getPeerRole(serverId: string, peerId: string): Promise<string | null> {
  const rows = await query<{ role: string }>(
    "SELECT role FROM roles WHERE server_id = ? AND peer_id = ?",
    [serverId, peerId]
  );
  return rows.length > 0 ? rows[0].role : null;
}

/** Returns true if role can manage channels/roles (owner or admin) */
function canManage(role: string | null): boolean {
  return role === "owner" || role === "admin";
}

/**
 * Apply an incoming peer change to local SQLite.
 * Validates payload shape AND sender permissions before writing.
 * senderId: the peer_id who broadcast this change (from vector clock entry).
 */
export async function applyChange(changeType: string, payloadStr: string, senderId?: string, serverId?: string): Promise<void> {
  let payload: unknown;

  try {
    payload = JSON.parse(payloadStr);
  } catch {
    console.warn("[changes] invalid JSON payload, skipping:", changeType);
    return;
  }

  if (typeof payload !== "object" || payload === null) {
    console.warn("[changes] non-object payload, skipping:", changeType);
    return;
  }

  const p = payload as Record<string, unknown>;

  // For privileged operations, check the sender's role
  const privilegedOps = new Set(["channel_create", "channel_update", "channel_delete", "role_set", "name_reserve"]);
  if (privilegedOps.has(changeType) && senderId && serverId) {
    const role = await getPeerRole(serverId, senderId);
    if (!canManage(role)) {
      console.warn(`[changes] peer ${senderId.slice(0, 8)} (role=${role}) attempted privileged op: ${changeType} — ignoring`);
      return;
    }
  }

  try {
    switch (changeType) {

      case "channel_create": {
        const id = safeId(p.id);
        const serverId = safeId(p.server_id);
        const name = safeName(p.name);
        if (!id || !serverId || !name) {
          console.warn("[changes] channel_create: missing required fields");
          return;
        }
        await execute(
          `INSERT OR IGNORE INTO channels
            (id, server_id, parent_id, name, sort_order, is_afk,
             afk_timeout_seconds, is_queued, max_users, created_by, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            serverId,
            safeId(p.parent_id) ?? null,
            name,
            safeInt(p.sort_order, 0),
            safeBool(p.is_afk) ? 1 : 0,
            safeInt(p.afk_timeout_seconds, 300),
            safeBool(p.is_queued) ? 1 : 0,
            p.max_users != null ? safeInt(p.max_users) : null,
            safeId(p.created_by) ?? null,
            safeTimestamp(),
          ]
        );
        break;
      }

      case "channel_update": {
        const id = safeId(p.id);
        const name = safeName(p.name);
        if (!id || !name) {
          console.warn("[changes] channel_update: missing required fields");
          return;
        }
        await execute(
          `UPDATE channels SET
            name = ?, parent_id = ?, sort_order = ?, is_afk = ?,
            afk_timeout_seconds = ?, is_queued = ?, max_users = ?, updated_at = ?
           WHERE id = ?`,
          [
            name,
            safeId(p.parent_id) ?? null,
            safeInt(p.sort_order, 0),
            safeBool(p.is_afk) ? 1 : 0,
            safeInt(p.afk_timeout_seconds, 300),
            safeBool(p.is_queued) ? 1 : 0,
            p.max_users != null ? safeInt(p.max_users) : null,
            safeTimestamp(),
            id,
          ]
        );
        break;
      }

      case "channel_delete": {
        const id = safeId(p.id);
        if (!id) {
          console.warn("[changes] channel_delete: invalid id");
          return;
        }
        await execute("DELETE FROM channels WHERE id = ?", [id]);
        break;
      }

      case "role_set": {
        const serverId = safeId(p.server_id);
        const peerId = safeId(p.peer_id);
        const role = isString(p.role) && ["owner", "admin", "member"].includes(p.role) ? p.role : null;
        const displayName = safeName(p.display_name);
        const grantedBy = safeId(p.granted_by);

        if (!serverId || !peerId || !role) {
          console.warn("[changes] role_set: invalid fields");
          return;
        }
        await execute(
          `INSERT OR REPLACE INTO roles
            (server_id, peer_id, role, display_name, granted_by, granted_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [serverId, peerId, role, displayName ?? null, grantedBy ?? null, safeTimestamp()]
        );
        break;
      }

      case "user_mute": {
        const serverId = safeId(p.server_id);
        const peerId = safeId(p.peer_id);
        if (!serverId || !peerId) return;
        await execute(
          "INSERT OR REPLACE INTO muted_users (server_id, peer_id, muted_at) VALUES (?, ?, ?)",
          [serverId, peerId, safeTimestamp()]
        );
        break;
      }

      case "user_unmute": {
        const serverId = safeId(p.server_id);
        const peerId = safeId(p.peer_id);
        if (!serverId || !peerId) return;
        await execute(
          "DELETE FROM muted_users WHERE server_id = ? AND peer_id = ?",
          [serverId, peerId]
        );
        break;
      }

      case "name_reserve": {
        const serverId = safeId(p.server_id);
        const name = safeName(p.name);
        if (!serverId || !name) return;
        await execute(
          `INSERT OR REPLACE INTO reserved_names
            (server_id, name, peer_id, reserved_at)
           VALUES (?, ?, ?, ?)`,
          [serverId, name, safeId(p.peer_id) ?? null, safeTimestamp()]
        );
        break;
      }

      default:
        console.debug("[changes] unknown changeType, ignoring:", changeType);
    }
  } catch (e) {
    console.error("[changes] DB error applying change:", changeType, e);
  }
}
