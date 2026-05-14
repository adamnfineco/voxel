/**
 * Central reactive state for the app.
 * Uses SolidJS signals — no external state manager needed.
 */

import { createSignal } from "solid-js";
import type { Server, Channel } from "./servers";
import type { Identity } from "./identity";

// ─── Identity ─────────────────────────────────────────────────────────────────

export const [identity, setIdentity] = createSignal<Identity | null>(null);
export const [displayName, setDisplayName] = createSignal<string>("");

// ─── Servers ──────────────────────────────────────────────────────────────────

export const [servers, setServers] = createSignal<Server[]>([]);
export const [activeServer, setActiveServer] = createSignal<Server | null>(null);

// ─── Channels ─────────────────────────────────────────────────────────────────

export const [channels, setChannels] = createSignal<Channel[]>([]);
export const [activeChannel, setActiveChannel] = createSignal<Channel | null>(null);

// ─── Peers ────────────────────────────────────────────────────────────────────

/** Map of peerId -> { displayName, channelId } */
export const [peers, setPeers] = createSignal<Map<string, PeerInfo>>(new Map());

export interface PeerInfo {
  peerId: string;
  displayName: string;
  channelId: string | null;
  speaking: boolean;
  muted: boolean;
  afk: boolean;
}

export function updatePeer(peerId: string, update: Partial<PeerInfo>): void {
  setPeers((prev) => {
    const next = new Map(prev);
    const existing = next.get(peerId) ?? {
      peerId,
      displayName: peerId.slice(0, 8),
      channelId: null,
      speaking: false,
      muted: false,
      afk: false,
    };
    next.set(peerId, { ...existing, ...update });
    return next;
  });
}

export function removePeer(peerId: string): void {
  setPeers((prev) => {
    const next = new Map(prev);
    next.delete(peerId);
    return next;
  });
}

// ─── Audio State ──────────────────────────────────────────────────────────────

export const [micMuted, setMicMuted] = createSignal(true); // start muted
export const [soundMuted, setSoundMuted] = createSignal(false);
export const [pttMode, setPttMode] = createSignal(true); // PTT vs VAD
export const [pttActive, setPttActive] = createSignal(false); // PTT key held
export const [localSpeaking, setLocalSpeaking] = createSignal(false);
export const [micLevel, setMicLevel] = createSignal(0);

// ─── UI State ─────────────────────────────────────────────────────────────────

export const [connected, setConnected] = createSignal(false);
export const [view, setView] = createSignal<"connect" | "main" | "settings">("connect");
export const [settingsTab, setSettingsTab] = createSignal<"audio" | "keybinds" | "general">("audio");

// ─── Roles ────────────────────────────────────────────────────────────────────

export const [myRole, setMyRole] = createSignal<"owner" | "admin" | "member">("member");

// ─── Queued channel state ──────────────────────────────────────────────────────

/** peerId of current speaker in a queued channel, null if floor is free */
export const [queuedSpeaker, setQueuedSpeaker] = createSignal<string | null>(null);

// ─── Connection quality ───────────────────────────────────────────────────────

export type ConnStatus = "disconnected" | "connecting" | "connected" | "reconnecting";
export const [connStatus, setConnStatus] = createSignal<ConnStatus>("disconnected");
