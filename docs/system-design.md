# Voxel — System Design

## Overview

Voxel is a retro voice chat app inspired by Ventrilo. Mesh WebRTC audio, 8-bit pixel art UI, zero cloud dependency at runtime. Audio never leaves the peer-to-peer mesh. No accounts, no tracking, no central audio server.

## Product Goal

Replace Ventrilo with a modern, anonymous, voice-only app for small teams. The UX should be: open the app, enter a server key, pick a name, talk. Nothing else.

## How We Got Here

Started from a conversation about building a 1:1 Ventrilo clone with retro UI. Evolved into a serverless mesh design after discussing trust models, SQLite local state, vector clock sync, and the desire for zero cloud dependency.

Key inflection points:
- Chose Tauri v2 over Electron (RAM), over native Swift (pixel art in web is easier)
- Chose SolidJS over React (smaller, faster, no vDOM)
- Chose mesh WebRTC over SFU/LiveKit (no central audio server, privacy-first)
- Chose local SQLite + gossip over any central DB for room state
- Chose shared server key as root of trust (simple, no accounts)
- Kept a rendezvous layer for public-internet peer discovery, but hid it from the user
- Moved to tray-first UX on macOS — app lives in the menu bar

## Current Architecture

```
User sees:                    Under the hood:
                              
  Name: ____                    ┌─ Tauri v2 App ────────────────────┐
  Key:  ____                    │                                    │
  [Connect]                     │  SolidJS UI ←→ Rust backend       │
                                │       │              │             │
  ┌─────────────────┐           │  WebRTC mesh    SQLite local DB   │
  │ # Lobby      (3)│           │       │              │             │
  │   Alice  ●      │           │  Web Audio API   tauri-plugin-sql │
  │   Bob    ●      │           │  (ducking, VAD,  (channels, roles,│
  │   Charlie       │           │   mic level,      vector clock,   │
  │ # AFK           │           │   synth sounds)   change log)     │
  │ Z Dave          │           │       │              │             │
  └─────────────────┘           │  WebSocket gossip ←→ HMAC signing │
  [🎤] [🔊] [PTT] #Lobby      │                                    │
                                └────────────┬───────────────────────┘
                                             │
                                    WebSocket (signaling only)
                                             │
                                ┌────────────▼───────────────────────┐
                                │  Rendezvous Layer (hidden)          │
                                │  - Peer discovery                   │
                                │  - ICE candidate exchange           │
                                │  - Name dedup + room cap (14)       │
                                │  - Gossip relay                     │
                                │  - NO audio transport               │
                                │  - NO room state interpretation     │
                                └─────────────────────────────────────┘
```

## Client Responsibilities

The client is the product. It does everything:

- **Identity**: generates a UUID on first launch, stores in SQLite. Display names are session-scoped (first-come-first-served per room).
- **Audio capture**: getUserMedia → shared AudioContext → WebRTC peer connections
- **Audio playback**: remote streams → per-peer GainNode → duck GainNode → speakers
- **Push-to-talk**: Tauri global-shortcut plugin, works when app is backgrounded
- **Voice activation**: Web Audio AnalyserNode with configurable threshold + silence hold
- **Ducking**: GainNode ramps remote audio to 15% when transmitting
- **Speaking detection**: per-peer RMS analysis via requestAnimationFrame loop with cancellation
- **Mic level**: separate AnalyserNode feeding a scaleX CSS meter (GPU accelerated)
- **Sound events**: procedurally synthesised via Web Audio oscillators (no WAV files)
- **TTS**: browser SpeechSynthesis API for join/leave announcements
- **State persistence**: SQLite via tauri-plugin-sql (channels, roles, prefs, vector clock, change log)
- **State sync**: WebSocket gossip with HMAC-signed changes and vector clock ordering
- **Role enforcement**: owner/admin/member checked locally before applying privileged gossip changes
- **AFK**: idle timer → auto-move to AFK channel + auto-mute
- **Queued channels**: one speaker at a time, enforced client-side
- **Kick**: broadcast HMAC-signed kick message, target disconnects on receipt

## Rendezvous Layer Responsibilities

The rendezvous layer is internal plumbing. Users never see it.

It does:
- Peer discovery: "who else is in room X?"
- ICE candidate relay: helps WebRTC peers establish direct connections
- Name deduplication: rejects duplicate display names per room
- Room cap enforcement: max 14 peers per room
- Gossip relay: forwards state-sync messages between peers
- Message size limits: 64KB signal, 128KB gossip

It does NOT:
- Touch audio
- Store room state
- Interpret gossip payloads
- Hold user identity beyond the session

Currently implemented as a standalone Rust binary (tokio + tungstenite). Future: embed as a sidecar in the Tauri app so the first peer in a room auto-hosts discovery.

## Data Model

All state is local SQLite. No central database.

```
identity        → app-level UUID + display name
servers         → saved rooms (id, name, key, signal_url, timestamps)
channels        → per-server channel tree (name, parent, sort, is_afk, is_queued, max_users)
roles           → per-server peer roles (owner/admin/member)
user_prefs      → per-server preferences
app_prefs       → global app settings
muted_users     → persistent per-server mute list
reserved_names  → owner-reserved display names
vector_clock    → per-peer sequence numbers for ordering
changes         → change log for gossip sync (type, payload, HMAC, applied flag)
```

## Realtime Flows

### Connect
1. User enters server key + display name
2. Client connects to hidden rendezvous endpoint via WebSocket
3. Rendezvous checks name uniqueness and room cap
4. Client receives peer list
5. Client initiates WebRTC offer to each existing peer
6. Peers exchange SDP offers/answers and ICE candidates via rendezvous relay
7. Direct audio connections established (mesh)
8. Client sends gossip sync_request to get any missed state changes

### Speak (PTT)
1. User holds PTT key (global hotkey, works backgrounded)
2. Mic track enabled on local stream
3. Duck() called → remote audio fades to 15%
4. PTT click sound plays (synthesised)
5. Audio flows to all connected peers via WebRTC
6. User releases key → mic disabled, unduck(), end click sound

### Gossip Change
1. Local change (e.g. channel_create)
2. Increment vector clock sequence for this peer
3. JSON-serialise the change payload
4. HMAC-sign with server key
5. Broadcast to all peers via gossip WebSocket
6. Receiving peers: verify HMAC → check vector clock → check sender role → apply to local SQLite

## Trust and Security Model

- **Room entry**: shared server key (entered once, stored locally)
- **Change authentication**: HMAC-SHA256 signed with server key
- **Change ordering**: vector clock (peer_id + sequence number)
- **Role enforcement**: owner/admin/member checked locally before applying privileged changes
- **Transport encryption**: WebRTC DTLS-SRTP (default, always on)
- **Rendezvous privacy**: no audio passes through, minimal metadata
- **Kick mechanism**: HMAC-signed kick broadcast, verified before acting

What we don't do yet:
- Server key encrypted at rest (currently plaintext in SQLite)
- App-layer E2EE on media frames (transport encryption only for now)
- WSS/TLS on rendezvous (plain WS in dev, TLS via reverse proxy in prod)

## Testing Strategy

### Automated (no user needed)
- `node test-signal.mjs` — 21 integration tests against the rendezvous server
  - join/leave, offer/answer/ICE, name dedup, room cap, gossip relay, room isolation, oversized messages
- `npx tsc --noEmit` — full TypeScript type safety
- `npm run build` — frontend bundle verification
- `cargo tauri build --no-bundle` — full Tauri release binary compilation
- `cargo check --manifest-path signal/Cargo.toml` — rendezvous server compilation

### Manual (developer, no user needed)
- Launch app, verify connect screen renders
- Add a server by key, verify connection flow
- Verify channel tree, settings, tray behavior
- Two-instance test on same machine for peer presence

### User-assisted (real conditions only)
- Real microphone quality + echo behavior
- Global PTT behavior in real desktop workflow
- Multi-peer mesh under real network conditions
- Subjective latency and ducking feel

## Known Constraints

- **14-peer mesh cap**: WebRTC mesh scales O(n²) for connections. 14 is the practical limit before CPU/bandwidth degrades.
- **Client-side role enforcement**: a malicious peer could fork the client and bypass role checks. Acceptable for trusted small teams.
- **No offline mode**: peers must be online simultaneously. State syncs on reconnect via gossip.
- **Single rendezvous**: currently one server. Future: embedded sidecar or distributed discovery.
- **WKWebView WebRTC**: Tauri uses macOS WKWebView. WebRTC works but is at Apple's pace for bug fixes.

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| App shell | Tauri v2 | Low RAM, Rust backend, native tray/hotkeys |
| Frontend | SolidJS | Tiny, reactive, no vDOM, real-time updates |
| Icons | Local inline SVGs | No React dependency in Solid app |
| Audio transport | Browser WebRTC | Mature, audio-only mesh, built into WebView |
| Audio processing | Web Audio API | Shared AudioContext for all processing |
| Database | SQLite (tauri-plugin-sql) | Local, fast, no server dependency |
| State sync | WebSocket gossip | HMAC-signed, vector-clock-ordered |
| Hotkeys | tauri-plugin-global-shortcut | Works when app is backgrounded |
| Rendezvous | Rust (tokio + tungstenite) | Tiny, fast, single binary |
| License | MIT | Open source |

## Open Gaps / Next Milestones

1. Server key encrypted at rest (macOS Keychain or local encryption)
2. WSS/TLS for rendezvous in production
3. Embedded rendezvous sidecar (first peer auto-hosts)
4. App-layer E2EE for media frames (derive media key from server key)
5. Channel password UI enforcement
6. Promote/demote admin from UI
7. Custom pixel art app icon (replace default Tauri icons)
8. Public hosted rendezvous option (voxel.* domain)
