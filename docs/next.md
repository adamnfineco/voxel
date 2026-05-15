# Voxel — Next Steps, History, and Open Questions

_Last updated: 2026-05-15_

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

10. **"You cannot default to spacebar, it breaks typing."** — Switched default PTT to `` ` `` (Backquote). Zero typing conflicts. Also fixed modifier combo capture — `Ctrl+A`, `Alt+1` etc. now work as PTT keys.

11. **"Stina connected to the same server but we didn't find each other."** — Root cause: sidecar spawns a local server on each machine. Two `localhost:8080` instances that never talk. Fixed by deploying `voxel-signal` on `dfn01.damnfine.xyz:8080` as the shared rendezvous. Domain `voxel.damnfine.xyz` being set up.

12. **"You cannot bind multi keys with modifiers (e.g. Ctrl+A)."** — Fixed. `eventToTauriKey()` captures the full modifier combo during keybind setup. Pure modifier presses are ignored — waits for an actual key.

---

## Architecture Decisions (why things are the way they are)

Full ADR records in `docs/adr/` — this is the condensed version.

| Decision | What we chose | Why we rejected the alternatives |
|---|---|---|
| Platform | Tauri v2 + SolidJS | Electron = RAM hog. Swift = pixel art UX nightmare. |
| Audio | WebRTC mesh (peer-to-peer) | SFU/LiveKit = audio through a server = privacy risk. |
| State | Local SQLite + gossip | Central DB violates zero-cloud goal. CRDT overkill. |
| Trust | Shared server key + HMAC | Per-user keypairs add complexity without user benefit. |
| Rendezvous | Hidden, auto-started sidecar + hosted fallback | Exposing a URL field broke the product feel. |
| E2EE | AES-GCM 256 via HKDF | Transport encryption (DTLS-SRTP) already existed. App layer gives stronger guarantees. |
| Key storage | AES-GCM encrypted in SQLite | Plaintext keys in a backup = anyone can join your rooms. |
| macOS UX | Regular activation (Dock + Cmd+Tab + tray) | Pure Accessory = hidden from app switcher, felt broken. |
| Icons | Inline SVGs | React icon libraries crash Solid apps at runtime. |
| Naming | "Group" not "Server" | Every client is a mesh node, not a server. |
| PTT default | Backquote (`` ` ``) | Space breaks typing. CapsLock unreliable at OS level. |

---

## Current Infrastructure

### Rendezvous server

- Running on `voxel.damnfine.xyz` — dedicated Virtualmin account on dfn01
- Binary: `/home/voxel/bin/voxel-signal` — built from `signal/` in the repo
- Managed by systemd: `systemctl status voxel-signal`
- Logs: `journalctl -u voxel-signal -f`
- Binds to `127.0.0.1:8765`, Apache proxies `wss://voxel.damnfine.xyz` → it
- Restart: `systemctl restart voxel-signal`
- Redeploy: `./scripts/deploy-signal.sh` (cross-compiles locally, SCPs binary, restarts)
- `DEFAULT_SIGNAL_URL` in `src/runtime/config.ts` is `wss://voxel.damnfine.xyz` ✓

### Signal URL is now user-configurable

Settings → About → Rendezvous Server. Defaults to `wss://voxel.damnfine.xyz`. Persisted in `app_prefs` SQLite table. Self-hosters can point it at their own instance. Takes effect on next connect.

---

## What's Built

### Core loop (fully implemented)
- Create a group → auto-generated readable key (`echo-golf-491`)
- Join a group → enter key, pick a name, land immediately in Lobby
- Channel tree: nested channels, sub-channels, users under their channel
- PTT (`` ` `` default, global hotkey, works backgrounded, modifier combos supported) + voice activation
- Speaking indicators, mic level meter, audio ducking
- AFK channel auto-move + auto-mute on idle
- Queued channels: one speaker at a time, floor enforced
- Channel passwords (SHA-256 hash, prompted on join)
- Max users per channel, enforced on join
- Group info modal: key display + copy, rename, delete with confirmation
- Connection status dot (green/amber/red) + peer count in header

### Security
- App-layer E2EE: HKDF → AES-GCM 256 → RTCRtpScriptTransform worker
- Key-at-rest: room keys encrypted in SQLite via UUID-derived local key
- HMAC-signed gossip changes with vector clock ordering
- Role enforcement: privileged ops checked locally before applying

### Infrastructure
- Rust rendezvous server hidden from users
- Embedded sidecar binary in app bundle — auto-spawns if no external server reachable
- Hosted rendezvous on dfn01 for real-world testing
- HMAC auth on gossip, message size limits, input validation, room isolation
- 21-test integration suite: `npm test`

### UX polish
- Group info modal: key, peer count, channel count, rename, delete with confirmation
- Settings re-enumerates devices after mic permission granted + Refresh button
- Connection status dot (green/amber/red) in header
- Peer count in header
- Font sizes bumped ~28% across the board
- CRT scanline overlay, pixel art borders, Press Start 2P font
- System tray icon, click to toggle window, close = hide not quit
- Fatal error overlay (shows real error instead of black screen)
- xattr fix documented for macOS quarantine on distributed .app

### Docs
- `docs/system-design.md` — full architecture reference
- `docs/adr/` — 11 ADRs, one per major decision
- `docs/next.md` — this file
- `docs/transcript.md` — full session transcript (gitignored, iCloud only)
- `AGENTS.md` — session ramp-up for future AI sessions
- `CONTRIBUTING.md` — setup, commands, versioning, ADR practice
- `README.md` — product-focused
- `scripts/release.sh` — full release automation

---

## What's Left To Do

### Must-have before v0.1.0

- [ ] **End-to-end voice validated** — two real people on different machines, talking to each other. Mark + Stina test. Nothing else matters until this works.
- [x] **`voxel.damnfine.xyz` domain + WebSocket proxy** — Virtualmin account + Apache vhost + systemd + TLS. Done.
- [ ] **PTT confirmed backgrounded** — global hotkey fires correctly when Voxel is in background.
- [ ] **Channel switch sounds actually play** — AudioContext may be suspended at play time in some flows.
- [ ] **xattr documented in README** — so anyone distributing the .app knows about the macOS quarantine issue.

### High priority (v0.1.x patch work)

- [ ] **Reconnect UX** — show "reconnecting..." when signaling drops. Currently shows stale "connected" state.
- [ ] **Name-taken UX** — server sends `name_taken`, frontend handles it, needs real-world test.
- [ ] **AFK channel sync** — when peer A moves user B to AFK, does B's client actually receive the gossip? Untested.
- [ ] **Make rendezvous server resilient** — currently a bare background process on dfn01. Needs: systemd unit file so it auto-restarts on crash/reboot.
- [ ] **Promote/demote admin end-to-end** — gossip layer + right-click menu both work, needs real multi-peer test.

### Medium priority (v0.2.0)

- [ ] **`wss://` + TLS** — once Apache proxy is live, add Let's Encrypt cert via Virtualmin. Moves from `ws://` to `wss://`.
- [ ] **Sidecar address sharing** — encode rendezvous host in group key so LAN/self-hosted works without a central server. Format: `word-word-NNN@host:port`. See ADR-011.
- [ ] **Key rotation** — "regenerate key" in Group Info for when a key leaks.
- [ ] **User comment field** — per-user comments visible to others in channel tree.
- [ ] **Forward secrecy** — current E2EE has no forward secrecy. Signal-style ratchet is the upgrade path.
- [ ] **macOS Keychain storage** — room keys currently encrypted via UUID-derived key. `tauri-plugin-stronghold` when it stabilises.
- [ ] **Systemd service for voxel-signal** — so dfn01 rendezvous survives reboots.

### Low priority / polish

- [ ] **Custom app icon** — still using default Tauri icons. Need a real pixel art Voxel icon.
- [ ] **Windows/Linux build** — Tauri supports it, untested.
- [ ] **QR code for group join** — generate a QR from the group key for mobile sharing.
- [ ] **Peer connection quality** — RTCPeerConnection stats API → round-trip time, packet loss indicator per user.
- [ ] **Channel reorder** — sort_order field exists in DB, no drag UI yet.
- [ ] **Test: E2EE frame encryption** — unit test verifying audio frames are actually encrypted.

---

## Things We Need To Explore

### Technical unknowns

1. **WKWebView + RTCRtpScriptTransform under real conditions** — E2EE uses Insertable Streams (macOS 12.3+). Untested on a real audio call with encryption enabled.

2. **Gossip sync under real network conditions** — works in tests on localhost. On real networks with packet loss and reconnects, edge cases possible. Specifically: peer creates channel while other peer briefly disconnected — does catch-up work?

3. **14-peer mesh scalability** — capped at 14 based on theory. Real CPU/bandwidth at 14 peers with E2EE on every frame is untested.

4. **Sidecar NAT traversal** — embedded rendezvous binds to `127.0.0.1`. For remote peers to use it, they'd need to know the creator's public IP. Sidecar currently only works on LAN or with address encoded in key.

5. **AudioContext autoplay policy** — resumed on connect (user gesture). But may suspend again mid-session in background. Sounds + ducking would stop silently.

### Product unknowns

1. **Hosted vs self-hosted rendezvous** — should `voxel.damnfine.xyz` be the permanent public default? Changes from "zero infrastructure" to "we run matchmaking only, can't hear you." Probably the right call for v1.

2. **First-time user flow** — no onboarding. New user sees "VOXEL" and two buttons. Is that enough or do we need a one-liner "here's how this works"?

3. **The "floor grabbed silently" problem** — in queued channels, if someone else starts talking your mic mutes. No indicator to you that this happened. Feels like PTT is broken.

4. **Mobile** — Tauri has iOS/Android. Worth exploring for v0.3.

---

## Known Bugs (open at time of writing)

| Bug | Severity | Notes |
|---|---|---|
| Sounds may not play if AudioContext suspended | Medium | Need `resume()` at moment of first sound playback |
| Settings output device dropdown not wired | Low | WebRTC output routing is browser-controlled |
| Group info modal shows peer/channel count as 0 in saved groups list | Low | Counts only meaningful when connected — fine for context |
| xattr quarantine blocks install on first open | Medium | `xattr -cr Voxel.app` fixes it. Needs README note. |
| ~~voxel-signal bare bg process~~ | ~~High~~ | Fixed — systemd on voxel.damnfine.xyz, auto-restarts |

---

## Versioning Plan

```
v0.1.0-alpha.1   ← current — architecture complete, rendezvous deployed, not yet voice-validated
v0.1.0-alpha.N   ← incremental fixes as testing surfaces issues  
v0.1.0-beta.1    ← when voice works between two people reliably
v0.1.0           ← stable, battle-tested on real conditions
v0.1.x           ← patch releases
v0.2.0           ← sidecar address sharing + wss:// + key rotation
v1.0.0           ← production-grade, multiple platforms, full E2EE verified
```

---

## Immediate Next Action

1. Set up `voxel.damnfine.xyz` Virtualmin account + Apache WebSocket proxy
2. Test voice between Mark + Stina with the hosted rendezvous
3. If it works → tag `v0.1.0-beta.1`
4. Set up systemd for voxel-signal so dfn01 stays up

---

## File Map (things to know for the next session)

```
src/App.tsx                    orchestration — audio lifecycle, connect flow, channel management
src/audio/e2ee.ts              E2EE: HKDF key derivation + RTCRtpScriptTransform worker
src/audio/mesh.ts              WebRTC mesh: up to 14 peers, speaking detection, device switch
src/audio/ptt.ts               PTT: eventToTauriKey() for combos, Backquote default, duck/unduck
src/audio/vad.ts               Voice activation: RMS threshold + silence hold
src/components/GroupConnect.tsx connect screen: create/join/recent groups
src/components/GroupInfoModal.tsx group info: key display, rename, delete confirm
src/components/ChannelTree.tsx  channel tree with icons, user rows, context menus
src/components/ChannelModal.tsx channel create/edit: name, password, AFK, queued, max-users
src/components/icons.tsx        ALL icons — inline SVGs, no external library (see ADR-007)
src/runtime/sidecar.ts         sidecar probe + auto-spawn
src/runtime/config.ts          DEFAULT_SIGNAL_URL ← change this when voxel.damnfine.xyz is ready
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

Get Mark and Stina's voices through to each other.

`voxel.damnfine.xyz` → Apache proxy → `voxel-signal:8080` → two clients find each other → WebRTC connects → audio flows.

That's v0.1.0-beta.1.
