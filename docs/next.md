# Voxel — Next Steps, History, and Open Questions

_Last updated: 2026-05-14_

---

## How We Got Here

### The ask

Mark wanted a Ventrilo clone. Not an app that was _like_ Ventrilo — a faithful recreation of the specific product: chunky pixel art UI, server tree, channel list, speaking indicators, PTT. The retro aesthetic was explicit and intentional.

Then the question came: can we make it serverless? The whole thing is mesh, everyone is a node. That became the design spine.

### Key conversations

1. **"Can we build a Ventrilo-like app that uses Slack huddles in the backend?"** — No, Slack's API doesn't expose huddles. Decided to build the real thing instead.

2. **"I want the entire UX and UI for Ventrilo"** — Faithful recreation plus 8/16-bit twist. Pixel art, CGA palette, the tree.

3. **"Is there a way to flip it on its head — mesh, no server?"** — Yes. SQLite locally, WebSocket gossip for sync, WebRTC for audio, tiny Rust rendezvous server just for matchmaking. This is the architecture.

4. **"Can it be open source?"** — Yes. MIT. Repo: `adamnfineco/voxel`.

5. **"Can the audio be end-to-end encrypted? We have the keys anyway."** — Yes. HKDF-SHA256 from the room key → AES-GCM 256 on every audio frame via RTCRtpScriptTransform.

6. **"Why can't I Cmd+Tab to it? Signal URL in settings feels weird."** — Fixed the activation policy. Removed Signal URL from UX entirely. The app feels like a product now, not a dev tool.

7. **"It should be seamless — just enter a key and you're in."** — Renamed "server" to "group". Added Create Group / Join Group. Auto-generated readable keys (echo-golf-491). Sidecar auto-spawns when no rendezvous is reachable.

8. **"There's no way to create a server / no way to see server info."** — Added Group Info modal (key display + copy, rename, delete with confirmation). Auto-join Lobby on connect.

9. **"We can't call it v0.1 until it actually works."** — Agreed. Tagged `v0.1.0-alpha.1`. v0.1.0 gets tagged when two real people talk to each other successfully.

---

## Architecture Decisions (why things are the way they are)

Full ADR records in `docs/adr/` — this is the condensed version.

| Decision | What we chose | Why we rejected the alternatives |
|---|---|---|
| Platform | Tauri v2 + SolidJS | Electron = RAM hog. Swift = pixel art UX nightmare. |
| Audio | WebRTC mesh (peer-to-peer) | SFU/LiveKit = audio through a server = privacy risk. |
| State | Local SQLite + gossip | Central DB violates zero-cloud goal. CRDT overkill. |
| Trust | Shared server key + HMAC | Per-user keypairs add complexity without user benefit. |
| Rendezvous | Hidden, auto-started sidecar | Exposing a URL field broke the product feel. |
| E2EE | AES-GCM 256 via HKDF | Transport encryption (DTLS-SRTP) already existed. App layer gives stronger guarantees. |
| Key storage | AES-GCM encrypted in SQLite | Plaintext keys in a backup = anyone can join your rooms. |
| macOS UX | Regular activation (Dock + Cmd+Tab + tray) | Pure Accessory = hidden from app switcher, felt broken. |
| Icons | Inline SVGs | React icon libraries crash Solid apps at runtime. |
| Naming | "Group" not "Server" | Every client is a mesh node, not a server. |

---

## What's Built

### Core loop (fully implemented)
- Create a group → auto-generated readable key (`echo-golf-491`)
- Join a group → enter key, pick a name, land immediately in Lobby
- Channel tree: nested channels, sub-channels, users under their channel
- PTT (global hotkey, works backgrounded) + voice activation
- Speaking indicators, mic level meter, audio ducking
- AFK channel auto-move + auto-mute on idle
- Queued channels: one speaker at a time, floor enforced
- Channel passwords (SHA-256 hash, prompted on join)
- Max users per channel, enforced on join

### Security
- App-layer E2EE: HKDF → AES-GCM 256 → RTCRtpScriptTransform worker
- Key-at-rest: room keys encrypted in SQLite via UUID-derived local key
- HMAC-signed gossip changes with vector clock ordering
- Role enforcement: privileged ops checked locally before applying

### Infrastructure
- Rust rendezvous server hidden from users
- Embedded sidecar binary in the app bundle — auto-spawns if no external server reachable
- HMAC auth on gossip, message size limits, input validation, room isolation
- 21-test integration suite: `npm test`

### UX polish
- Group Info modal: see key, copy, rename, delete with confirmation
- Settings re-enumerates devices after mic permission granted
- Connection status dot (green/amber/red) in header
- Peer count in header
- Font sizes bumped ~28% across the board
- CRT scanline overlay, pixel art borders, Press Start 2P font
- System tray icon, click to toggle window, close = hide not quit
- Fatal error overlay (shows real error instead of black screen)

### Docs
- `docs/system-design.md` — full architecture reference
- `docs/adr/` — 11 ADRs, one per major decision
- `AGENTS.md` — session ramp-up for future AI sessions
- `CONTRIBUTING.md` — setup, commands, versioning, ADR practice
- `README.md` — product-focused
- `scripts/release.sh` — full release automation

---

## What's Left To Do

### Must-have before v0.1.0

These block calling it "works":

- [ ] **End-to-end voice validated** — two real people on different machines, talking to each other. Nothing else matters until this works.
- [ ] **Sidecar connects two machines** — the auto-spawn flow needs to work over a real network, not just localhost.
- [ ] **PTT confirmed backgrounded** — global hotkey fires correctly when Voxel is in the background and another app is focused.
- [ ] **Channel switch sound events actually play** — sounds are synthesised but AudioContext may be suspended at play time in some flows.

### High priority (v0.1.x patch work)

- [ ] **Promote/demote admin in UI** — the gossip layer supports it, the right-click menu has it, but it needs testing end-to-end.
- [ ] **Reconnect UX** — show "reconnecting..." in UI when signaling drops. Currently shows stale "connected" state.
- [ ] **Name-taken UX** — the server sends `name_taken`, the frontend handles it, but it needs testing with two clients.
- [ ] **AFK channel sync** — when peer A moves user B to AFK, does B's client actually receive the gossip and reflect it? Untested.
- [ ] **Channel password sync** — created with a password, synced via gossip, enforced on join. Works locally but needs multi-peer test.

### Medium priority (v0.2.0 features)

- [ ] **Sidecar address sharing** — encode the auto-hosted rendezvous address in the group key so peers can find each other without a hosted server. Format: `word-word-NNN@host:port`. See ADR-011.
- [ ] **WSS/TLS in production** — the signal server is plain WS. Need nginx/caddy reverse proxy + cert for any real deployment. Guide is in README, implementation is external.
- [ ] **Hosted rendezvous** — a `voxel.*` domain running the signal server so zero config is actually zero config for users who don't self-host.
- [ ] **Key rotation** — if a room key leaks, there's no way to rotate it without creating a new group. Need "regenerate key" in Group Info.
- [ ] **User comment field** — Ventrilo had per-user comments visible to others in the channel. Simple gossip message, adds presence richness.
- [ ] **Forward secrecy** — current E2EE has no forward secrecy. If the room key leaks, old recordings could be decrypted. Signal-style ratchet is the upgrade path but complex.
- [ ] **macOS Keychain storage** — room keys currently encrypted via UUID-derived key (better than plaintext, but not as strong as OS keychain). `tauri-plugin-stronghold` when it stabilises.

### Low priority / polish

- [ ] **Custom app icon** — still using default Tauri icons. Need a real pixel art Voxel icon in `.icns` format.
- [ ] **Windows/Linux build** — Tauri supports it, the code is cross-platform, but untested. Probably needs minor audio API adjustments.
- [ ] **QR code for group join** — generate a QR from the group key so mobile users can join without typing the key.
- [ ] **In-channel user comments** — right-click → set comment, visible to all peers in channel tree.
- [ ] **Peer connection quality** — RTCPeerConnection stats API can give round-trip time and packet loss. Surface as a small indicator per user.
- [ ] **Channel reorder** — sort_order field exists in DB, no UI to drag-reorder channels yet.
- [ ] **Test: E2EE frame encryption** — need a unit test that verifies audio frames are actually encrypted, not just that the code path runs.

---

## Things We Need To Explore

### Technical unknowns

1. **WKWebView and RTCRtpScriptTransform under real conditions** — E2EE uses Insertable Streams which require macOS 12.3+ (WebKit 615+). Haven't tested this on a real audio call with encryption enabled. If WKWebView has a bug with script transforms, we may need a fallback path.

2. **Gossip sync under real network conditions** — the vector clock + HMAC gossip works in tests and on localhost. On real networks with packet loss, reconnects, and clock skew, there may be edge cases. Specifically: what happens if peer A creates a channel while peer B is briefly disconnected? Does B catch up correctly on reconnect?

3. **14-peer mesh scalability** — we capped at 14 based on theoretical analysis. Actual CPU/bandwidth at 14 peers with E2EE encryption on every frame is untested. May need to lower the cap.

4. **Sidecar NAT traversal** — the embedded rendezvous sidecar binds to 127.0.0.1. For peers on different machines to find each other through it, they'd need to know the creator's public IP. The current sidecar plan only works on LAN or if the address is encoded in the key. Need to validate this assumption.

5. **AudioContext autoplay policy** — browsers (and WKWebView) require a user gesture before an AudioContext can start. We resume on connect, which is user-initiated. But if the context suspends again mid-session (background tab behaviour), sounds and ducking would stop working silently.

### Product unknowns

1. **The right group key UX** — `echo-golf-491` is readable and shareable. But does it feel right? Should there be a shorter numeric PIN option? Should the key be visible in the tray menu?

2. **First-time user flow** — there's no onboarding. A brand new user opens the app, sees "VOXEL", two buttons, and a name field. Is that enough? Or do we need a quick "here's how this works" screen?

3. **The "I'm already talking to someone" problem** — if you're in a queued channel and someone else starts talking, your mic is muted. There's no visual indication to _you_ that this happened. You might think PTT is broken.

4. **Hosted vs. self-hosted rendezvous** — should we run a public `voxel.damnfine.xyz` rendezvous server? That changes the product from "zero infrastructure" to "we run one thing but it's just matchmaking and we can't hear you." That might actually be the right call for a v1 product.

5. **Mobile** — Tauri has iOS/Android support. The whole architecture (SQLite, WebRTC, PTT) works on mobile with adjustments. Worth exploring for v0.3.

---

## Known Bugs (open at time of writing)

| Bug | Severity | Notes |
|---|---|---|
| Sounds may not play if AudioContext suspended | Medium | Browser autoplay policy. Need to call resume() at the moment of first sound. |
| Gossip sync with peer channels may lag on first join | Low | The peer list comes from signaling, channel info from gossip. Brief mismatch. |
| Group info modal shows peer/channel count as 0 in recent groups list | Low | Counts only meaningful when connected. Fine for saved-groups context. |
| Settings output device dropdown present but not wired | Low | WebRTC output routing is browser-controlled, not easily scriptable. |

---

## Versioning Plan

```
v0.1.0-alpha.1   ← current (architecture built, not yet end-to-end validated)
v0.1.0-alpha.N   ← incremental fixes as testing surfaces issues
v0.1.0-beta.1    ← when voice works between two people reliably
v0.1.0           ← stable, battle-tested on real conditions
v0.1.x           ← patch releases
v0.2.0           ← sidecar address sharing + hosted rendezvous + key rotation
v1.0.0           ← production-grade, full E2EE verification, multiple platforms tested
```

---

## File Map (things to know for the next session)

```
src/App.tsx                    orchestration — audio lifecycle, connect flow, channel management
src/audio/e2ee.ts              E2EE: HKDF key derivation + RTCRtpScriptTransform worker
src/audio/mesh.ts              WebRTC mesh: up to 14 peers, speaking detection, device switch
src/audio/ptt.ts               PTT: key format conversion, global shortcut, duck/unduck
src/audio/vad.ts               Voice activation: RMS threshold + silence hold
src/components/GroupConnect.tsx connect screen: create/join/recent groups
src/components/GroupInfoModal.tsx group info: key display, rename, delete confirm
src/components/ChannelTree.tsx  channel tree with icons, user rows, context menus
src/components/ChannelModal.tsx channel create/edit: name, password, AFK, queued, max-users
src/components/icons.tsx        ALL icons — inline SVGs, no external library (see ADR-007)
src/runtime/sidecar.ts         sidecar probe + auto-spawn
src/runtime/config.ts          DEFAULT_SIGNAL_URL, deriveServerName
src/runtime/bridge.ts          breaks App↔Settings circular import
src/store/keyring.ts           room key AES-GCM encryption at rest
src/store/crypto.ts            channel password SHA-256 hashing
src/store/appState.ts          all SolidJS signals
src/store/servers.ts           SQLite queries for servers/channels/roles/mutes
src/sync/signaling.ts          WebRTC signaling client (/signal endpoint)
src/sync/gossip.ts             gossip layer (/gossip endpoint)
src/sync/changes.ts            validated change application (role enforcement)
src-tauri/src/sidecar.rs       sidecar process spawn/kill
src-tauri/src/tray.rs          system tray
src-tauri/Info.plist           NSMicrophoneUsageDescription (critical for mic on macOS)
src-tauri/capabilities/        Tauri ACL — if something is blocked, add permission here
signal/src/server.rs           rendezvous server: /signal and /gossip endpoints
test-signal.mjs                21-test integration suite
docs/adr/                      11 architectural decision records
scripts/release.sh             build automation
```

---

## The One Thing That Matters Right Now

Get two people talking.

Everything else — E2EE, key-at-rest, sidecar, group info, admin roles, ADRs — none of it matters until voice actually flows between two machines. That's the definition of v0.1.0. Everything above is in service of that moment.
