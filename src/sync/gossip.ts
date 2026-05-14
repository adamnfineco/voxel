/**
 * WebSocket gossip layer.
 * Peers sync SQLite state diffs via the signaling server relay.
 * The signaling server just routes messages — it doesn't interpret them.
 */

import { signPayload, verifyPayload } from "./hmac";
import { shouldApply, updatePeerSeq, nextSeq } from "./vectorClock";
import { query, execute } from "../store/db";
import { applyChange } from "./changes";

export interface GossipMessage {
  type: "change" | "sync_request" | "sync_response" | "ping" | "pong" | "kick";
  serverId: string;
  peerId: string;
  seq?: number;
  timestamp?: number;
  changeType?: string;
  payload?: string;
  hmac?: string;
  clock?: Record<string, number>;
}

type MessageHandler = (msg: GossipMessage) => void;
type KickHandler = () => void;

let _ws: WebSocket | null = null;
let _serverKey = "";
let _serverId = "";
let _peerId = "";
let _handlers: MessageHandler[] = [];
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let _pingInterval: ReturnType<typeof setInterval> | null = null;
let _intentionalDisconnect = false;
let _reconnectArgs: [string, string, string, string] | null = null;
let _onKick: KickHandler | null = null;

export function onKick(cb: KickHandler): void {
  _onKick = cb;
}

export function onMessage(handler: MessageHandler): () => void {
  _handlers.push(handler);
  return () => {
    _handlers = _handlers.filter((h) => h !== handler);
  };
}

function emit(msg: GossipMessage) {
  for (const h of _handlers) h(msg);
}

export async function connect(
  signalUrl: string,
  serverId: string,
  peerId: string,
  serverKey: string
): Promise<void> {
  _serverId = serverId;
  _peerId = peerId;
  _serverKey = serverKey;
  _intentionalDisconnect = false;
  _reconnectArgs = [signalUrl, serverId, peerId, serverKey];

  if (_ws) {
    _ws.onclose = null;
    _ws.close();
    _ws = null;
  }

  // Gossip endpoint: /gossip
  const base = signalUrl.endsWith("/") ? signalUrl.slice(0, -1) : signalUrl;
  const url = `${base}/gossip?server=${encodeURIComponent(serverId)}&peer=${encodeURIComponent(peerId)}&key=${encodeURIComponent(serverKey)}`;
  _ws = new WebSocket(url);

  _ws.onopen = () => {
    startPing();
    // Request state sync from any online peers
    send({ type: "sync_request", serverId, peerId, clock: {} });
  };

  _ws.onmessage = async (event) => {
    // Guard against oversized messages
    if (typeof event.data === "string" && event.data.length > 128_000) {
      console.warn("[gossip] oversized message discarded");
      return;
    }
    try {
      const msg: GossipMessage = JSON.parse(event.data);
      await handleIncoming(msg);
    } catch (e) {
      console.error("[gossip] message error:", e);
    }
  };

  _ws.onclose = () => {
    stopPing();
    if (!_intentionalDisconnect && _reconnectArgs) {
      scheduleReconnect(..._reconnectArgs);
    }
  };

  _ws.onerror = () => {
    // Always followed by onclose — handled there
  };
}

export function disconnect(): void {
  _intentionalDisconnect = true;

  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
  if (_pingInterval)   { clearInterval(_pingInterval);  _pingInterval = null; }

  if (_ws) {
    _ws.onclose = null;
    _ws.close();
    _ws = null;
  }

  // Clear state so next connect() starts fresh
  _serverId = "";
  _peerId = "";
  _serverKey = "";
}

function scheduleReconnect(signalUrl: string, serverId: string, peerId: string, serverKey: string): void {
  if (_reconnectTimer) clearTimeout(_reconnectTimer);
  _reconnectTimer = setTimeout(() => {
    if (!_intentionalDisconnect) {
      connect(signalUrl, serverId, peerId, serverKey).catch((e) =>
        console.error("[gossip] reconnect failed:", e)
      );
    }
  }, 3_000);
}

function startPing() {
  _pingInterval = setInterval(() => {
    send({ type: "ping", serverId: _serverId, peerId: _peerId });
  }, 15000);
}

function stopPing() {
  if (_pingInterval) clearInterval(_pingInterval);
  _pingInterval = null;
}

function send(msg: GossipMessage) {
  if (_ws?.readyState === WebSocket.OPEN) {
    _ws.send(JSON.stringify(msg));
  }
}

async function handleIncoming(msg: GossipMessage) {
  if (msg.peerId === _peerId) return; // ignore own messages

  switch (msg.type) {
    case "ping":
      send({ type: "pong", serverId: _serverId, peerId: _peerId });
      break;

    case "change":
      await handleChange(msg);
      break;

    case "kick":
      await handleKick(msg);
      break;

    case "sync_request":
      await handleSyncRequest(msg);
      break;

    case "sync_response":
      if (msg.payload) {
        const changes: GossipMessage[] = JSON.parse(msg.payload);
        for (const c of changes) {
          await handleChange(c);
        }
      }
      break;
  }

  emit(msg);
}

async function handleChange(msg: GossipMessage) {
  if (!msg.seq || !msg.payload || !msg.hmac || !msg.changeType) return;

  // Verify HMAC
  const payloadStr = JSON.stringify({
    serverId: msg.serverId,
    peerId: msg.peerId,
    seq: msg.seq,
    timestamp: msg.timestamp,
    changeType: msg.changeType,
    payload: msg.payload,
  });

  const valid = await verifyPayload(_serverKey, payloadStr, msg.hmac);
  if (!valid) {
    console.warn("[gossip] invalid HMAC, discarding change from", msg.peerId);
    return;
  }

  // Vector clock check
  const apply = await shouldApply(msg.serverId, msg.peerId, msg.seq);
  if (!apply) return;

  // Apply the change — pass sender identity for role enforcement
  await applyChange(msg.changeType, msg.payload, msg.peerId, msg.serverId);
  await updatePeerSeq(msg.serverId, msg.peerId, msg.seq);

  // Persist change log
  await execute(
    `INSERT OR IGNORE INTO changes (server_id, peer_id, seq, timestamp, change_type, payload, hmac, applied) 
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    [msg.serverId, msg.peerId, msg.seq, msg.timestamp ?? Date.now(), msg.changeType, msg.payload, msg.hmac]
  );
}

async function handleKick(msg: GossipMessage) {
  if (!msg.payload || !msg.hmac) return;

  // Verify HMAC — must be from a trusted peer with the server key
  const payloadStr = JSON.stringify({
    serverId: msg.serverId,
    peerId: msg.peerId,
    seq: msg.seq ?? 0,
    timestamp: msg.timestamp,
    changeType: "kick",
    payload: msg.payload,
  });
  const valid = await verifyPayload(_serverKey, payloadStr, msg.hmac);
  if (!valid) {
    console.warn("[gossip] invalid HMAC on kick, ignoring");
    return;
  }

  const payload = JSON.parse(msg.payload);
  if (payload.targetPeerId === _peerId) {
    console.warn("[gossip] we have been kicked");
    _onKick?.();
  }
}

async function handleSyncRequest(msg: GossipMessage) {
  // Send them any changes they're missing
  const theirClock = msg.clock ?? {};
  const changes = await query<any>(
    "SELECT * FROM changes WHERE server_id = ? ORDER BY peer_id, seq",
    [msg.serverId]
  );

  const missing = changes.filter((c) => {
    const theirSeq = theirClock[c.peer_id] ?? 0;
    return c.seq > theirSeq;
  });

  if (missing.length > 0) {
    send({
      type: "sync_response",
      serverId: _serverId,
      peerId: _peerId,
      payload: JSON.stringify(missing.map((c) => ({
        type: "change",
        serverId: c.server_id,
        peerId: c.peer_id,
        seq: c.seq,
        timestamp: c.timestamp,
        changeType: c.change_type,
        payload: c.payload,
        hmac: c.hmac,
      }))),
    });
  }
}

/** Broadcast a kick message — target peer will disconnect on receipt */
export async function broadcastKick(targetPeerId: string): Promise<void> {
  if (!_ws || _ws.readyState !== WebSocket.OPEN) return;
  const msg: GossipMessage = {
    type: "kick",
    serverId: _serverId,
    peerId: _peerId,
    payload: JSON.stringify({ targetPeerId }),
    hmac: "",
    seq: 0,
    timestamp: Date.now(),
  };
  // Sign the kick
  const payloadStr = JSON.stringify({
    serverId: _serverId,
    peerId: _peerId,
    seq: 0,
    timestamp: msg.timestamp,
    changeType: "kick",
    payload: msg.payload,
  });
  msg.hmac = await signPayload(_serverKey, payloadStr);
  send(msg);
}

/** Broadcast a change to all peers */
export async function broadcastChange(
  changeType: string,
  payload: string
): Promise<void> {
  const seq = await nextSeq(_serverId, _peerId);
  const timestamp = Date.now();

  const payloadStr = JSON.stringify({
    serverId: _serverId,
    peerId: _peerId,
    seq,
    timestamp,
    changeType,
    payload,
  });

  const hmac = await signPayload(_serverKey, payloadStr);

  const msg: GossipMessage = {
    type: "change",
    serverId: _serverId,
    peerId: _peerId,
    seq,
    timestamp,
    changeType,
    payload,
    hmac,
  };

  // Persist locally
  await execute(
    `INSERT OR IGNORE INTO changes (server_id, peer_id, seq, timestamp, change_type, payload, hmac, applied) 
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    [_serverId, _peerId, seq, timestamp, changeType, payload, hmac]
  );

  send(msg);
}
