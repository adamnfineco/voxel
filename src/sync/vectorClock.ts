import { query, execute } from "../store/db";

export interface VectorClockEntry {
  server_id: string;
  peer_id: string;
  seq: number;
}

/** Get current seq for a peer on a server */
export async function getSeq(serverId: string, peerId: string): Promise<number> {
  const rows = await query<VectorClockEntry>(
    "SELECT seq FROM vector_clock WHERE server_id = ? AND peer_id = ?",
    [serverId, peerId]
  );
  return rows.length > 0 ? rows[0].seq : 0;
}

/** Increment and return next seq for this peer */
export async function nextSeq(serverId: string, peerId: string): Promise<number> {
  const current = await getSeq(serverId, peerId);
  const next = current + 1;
  await execute(
    "INSERT OR REPLACE INTO vector_clock (server_id, peer_id, seq) VALUES (?, ?, ?)",
    [serverId, peerId, next]
  );
  return next;
}

/** Update seq for a remote peer (when receiving their changes) */
export async function updatePeerSeq(serverId: string, peerId: string, seq: number): Promise<void> {
  const current = await getSeq(serverId, peerId);
  if (seq > current) {
    await execute(
      "INSERT OR REPLACE INTO vector_clock (server_id, peer_id, seq) VALUES (?, ?, ?)",
      [serverId, peerId, seq]
    );
  }
}

/** Get the full clock state for a server (used for initial sync) */
export async function getFullClock(serverId: string): Promise<Record<string, number>> {
  const rows = await query<VectorClockEntry>(
    "SELECT peer_id, seq FROM vector_clock WHERE server_id = ?",
    [serverId]
  );
  const clock: Record<string, number> = {};
  for (const row of rows) {
    clock[row.peer_id] = row.seq;
  }
  return clock;
}

/** Check if a change should be applied (seq is newer than what we know) */
export async function shouldApply(serverId: string, peerId: string, seq: number): Promise<boolean> {
  const current = await getSeq(serverId, peerId);
  return seq > current;
}
