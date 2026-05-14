/**
 * Signaling client — WebRTC peer discovery + ICE exchange.
 * Connects to /signal endpoint on the voxel signal server.
 * Handles: peer_list, peer_joined, peer_left, offer, answer, ice, channel_change.
 */

import {
  connectToPeer,
  handleOffer,
  handleAnswer,
  handleIceCandidate,
  removePeer,
  onIceCandidate,
  onOffer,
  onAnswer,
} from "../audio/mesh";
import { updatePeer, removePeer as removeStatePeer } from "../store/appState";
import { playSound, speak, speakLeave } from "../audio/sounds";

export interface SignalMessage {
  type: string;
  from: string;
  to?: string;
  serverId: string;
  displayName?: string;
  channelId?: string | null;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  names?: Array<{ peerId: string; displayName: string; channelId: string | null }>;
}

let _ws: WebSocket | null = null;
let _peerId = "";
let _serverId = "";
let _displayName = "";
let _channelId: string | null = null;
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let _reconnectArgs: Parameters<typeof connect> | null = null;
let _connected = false;
let _intentionalDisconnect = false;

let _onChannelChange: ((peerId: string, channelId: string | null) => void) | null = null;
let _onNameTaken: (() => void) | null = null;
let _onServerError: ((msg: string) => void) | null = null;
let _onReconnecting: (() => void) | null = null;

export function onReconnecting(cb: () => void): void {
  _onReconnecting = cb;
}

export function onChannelChange(cb: (peerId: string, channelId: string | null) => void): void {
  _onChannelChange = cb;
}

export function onNameTaken(cb: () => void): void {
  _onNameTaken = cb;
}

export function onServerError(cb: (msg: string) => void): void {
  _onServerError = cb;
}

export function isConnected(): boolean {
  return _connected;
}

// Wire up WebRTC signal→mesh callbacks once at module load
onIceCandidate((peerId, candidate) => {
  send({ type: "ice", from: _peerId, to: peerId, serverId: _serverId, candidate });
});

onOffer((peerId, offer) => {
  send({ type: "offer", from: _peerId, to: peerId, serverId: _serverId, displayName: _displayName, offer });
});

onAnswer((peerId, answer) => {
  send({ type: "answer", from: _peerId, to: peerId, serverId: _serverId, answer });
});

// ─── Connection ───────────────────────────────────────────────────────────────

export async function connect(
  signalUrl: string,
  serverId: string,
  peerId: string,
  displayName: string,
  serverKey: string
): Promise<void> {
  _peerId = peerId;
  _serverId = serverId;
  _displayName = displayName;
  _intentionalDisconnect = false;
  _reconnectArgs = [signalUrl, serverId, peerId, displayName, serverKey];

  if (_ws) {
    _ws.onclose = null; // prevent auto-reconnect on explicit close
    _ws.close();
    _ws = null;
  }

  // Signal endpoint: /signal
  const url = buildUrl(signalUrl, "/signal", { server: serverId, peer: peerId, key: serverKey });
  _ws = new WebSocket(url);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      _ws?.close();
      reject(new Error("Signal server connection timed out"));
    }, 10_000);

    _ws!.onopen = () => {
      clearTimeout(timeout);
      _connected = true;

      // Announce ourselves with join message
      send({
        type: "join",
        from: peerId,
        serverId,
        displayName,
        channelId: _channelId,
      });

      resolve();
    };

    _ws!.onmessage = async (event) => {
      // Guard: ignore oversized messages (basic DoS protection)
      if (typeof event.data === "string" && event.data.length > 64_000) {
        console.warn("[signal] oversized message discarded");
        return;
      }
      try {
        const msg: SignalMessage = JSON.parse(event.data);
        await handleMessage(msg);
      } catch (e) {
        console.error("[signal] message handling error:", e);
      }
    };

    _ws!.onclose = (evt) => {
      clearTimeout(timeout);
      _connected = false;

      if (!_intentionalDisconnect && _reconnectArgs) {
        console.info(`[signal] disconnected (${evt.code}), reconnecting in 3s…`);
        _onReconnecting?.();
        scheduleReconnect();
      }
    };

    _ws!.onerror = () => {
      clearTimeout(timeout);
      // onerror is always followed by onclose — handle there
    };
  });
}

export function disconnect(): void {
  _intentionalDisconnect = true;
  _connected = false;

  if (_reconnectTimer) {
    clearTimeout(_reconnectTimer);
    _reconnectTimer = null;
  }

  _reconnectArgs = null;

  if (_ws) {
    _ws.onclose = null; // prevent triggering reconnect
    _ws.close();
    _ws = null;
  }

  // Clear all state so a fresh connect() starts clean
  _peerId = "";
  _serverId = "";
  _displayName = "";
  _channelId = null;
}

function scheduleReconnect(): void {
  if (_reconnectTimer) clearTimeout(_reconnectTimer);
  _reconnectTimer = setTimeout(() => {
    if (_reconnectArgs && !_intentionalDisconnect) {
      connect(..._reconnectArgs).catch((e) =>
        console.error("[signal] reconnect failed:", e)
      );
    }
  }, 3_000);
}

function send(msg: SignalMessage): void {
  if (_ws?.readyState === WebSocket.OPEN) {
    _ws.send(JSON.stringify(msg));
  }
}

export function announceChannelJoin(channelId: string | null): void {
  _channelId = channelId;
  send({ type: "channel_change", from: _peerId, serverId: _serverId, channelId });
}

// ─── Message handling ─────────────────────────────────────────────────────────

async function handleMessage(msg: SignalMessage): Promise<void> {
  // Ignore messages from ourselves (can happen on reconnect)
  if (msg.from === _peerId && msg.type !== "peer_list") return;

  switch (msg.type) {
    case "peer_list": {
      // Initial snapshot of who's online — initiate WebRTC to each
      if (!msg.names) break;
      for (const p of msg.names) {
        if (p.peerId === _peerId) continue;
        updatePeer(p.peerId, {
          peerId: p.peerId,
          displayName: p.displayName,
          channelId: p.channelId,
          speaking: false,
          muted: false,
          afk: false,
        });
        // We initiate offers to all existing peers
        await connectToPeer(p.peerId);
      }
      break;
    }

    case "peer_joined": {
      if (!msg.from) break;
      await connectToPeer(msg.from);
      updatePeer(msg.from, {
        peerId: msg.from,
        displayName: msg.displayName ?? msg.from.slice(0, 8),
        channelId: msg.channelId ?? null,
        speaking: false,
        muted: false,
        afk: false,
      });
      playSound("user_join");
      speak(`${msg.displayName ?? "Someone"} joined`);
      break;
    }

    case "peer_left": {
      if (!msg.from) break;
      removePeer(msg.from);
      removeStatePeer(msg.from);
      playSound("user_leave");
      speakLeave(msg.displayName ?? "Someone");
      break;
    }

    case "channel_change": {
      if (!msg.from) break;
      const channelId = msg.channelId ?? null;
      updatePeer(msg.from, { channelId });
      _onChannelChange?.(msg.from, channelId);
      break;
    }

    case "offer": {
      if (!msg.offer || !msg.from) break;
      updatePeer(msg.from, {
        peerId: msg.from,
        displayName: msg.displayName ?? msg.from.slice(0, 8),
        channelId: null,
        speaking: false,
        muted: false,
        afk: false,
      });
      await handleOffer(msg.from, msg.offer);
      break;
    }

    case "answer": {
      if (!msg.answer || !msg.from) break;
      await handleAnswer(msg.from, msg.answer);
      break;
    }

    case "ice": {
      if (!msg.candidate || !msg.from) break;
      await handleIceCandidate(msg.from, msg.candidate);
      break;
    }

    case "name_taken": {
      console.warn("[signal] display name already taken");
      _onNameTaken?.();
      break;
    }

    case "error": {
      const errMsg = (msg as any).message ?? "Unknown server error";
      console.error("[signal] server error:", errMsg);
      _onServerError?.(errMsg);
      break;
    }

    // join is sent by us, not received
    default:
      break;
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function buildUrl(base: string, path: string, params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString();
  // Ensure base doesn't end with slash
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${b}${path}?${qs}`;
}
