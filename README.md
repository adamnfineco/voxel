# Voxel

Retro voice chat. Mesh WebRTC audio, 8-bit pixel art UI, end-to-end encrypted, zero cloud dependency.

[Download for Apple Silicon](https://github.com/adamnfineco/voxel/releases) · [CONTRIBUTING.md](CONTRIBUTING.md) · MIT

---

## What it is

Voice-only. No accounts, no tracking, no central server. Every client is a node in the mesh — audio flows directly between peers and never touches any server.

- **Create a group** — generates a shareable key like `echo-golf-491`. Invite people by sharing the key.
- **Join a group** — enter a key someone gave you. Pick a name. Talk.
- **End-to-end encrypted** — audio is AES-GCM 256 encrypted using a key derived from the room key. The rendezvous layer cannot hear you.
- **Anonymous** — no email, no password, no profile. Names are first-come-first-served per session.
- **Persistent** — channels survive across sessions, stored locally and synced between peers.

---

## How to use

1. Launch Voxel
2. Enter your name
3. **Create a Group** (generates a key) or **Join a Group** (enter a key)
4. Click a channel to join it
5. Hold **Space** to talk (PTT) — or switch to voice activation in Settings

First person to create a group becomes the owner. Owners can create channels, set passwords, promote admins, and kick people.

---

## Features

| | |
|---|---|
| Mesh audio — up to 14 peers | ✅ |
| End-to-end encrypted audio (AES-GCM 256) | ✅ |
| Push-to-talk (global, works backgrounded) | ✅ |
| Voice activation with threshold | ✅ |
| Audio ducking | ✅ |
| Speaking indicators | ✅ |
| AFK channel (auto-move + auto-mute) | ✅ |
| Queued channels (one speaker at a time) | ✅ |
| Sub-channels | ✅ |
| Channel passwords | ✅ |
| Owner / admin / member roles | ✅ |
| Admin promote / demote | ✅ |
| Kick users | ✅ |
| Persistent channels (local SQLite) | ✅ |
| Room keys encrypted at rest | ✅ |
| TTS announcements + synthesised sounds | ✅ |
| System tray (menu bar app on macOS) | ✅ |
| Configurable PTT key | ✅ |
| Pixel art UI — Press Start 2P, CGA palette | ✅ |

---

## Download

macOS (Apple Silicon) — [v0.1.0 releases page](https://github.com/adamnfineco/voxel/releases)

The `.app` is self-contained. Since it's unsigned, first launch: right-click → Open.

---

## How the mesh works

Every Voxel client is a full node. When you join a group:

1. A lightweight rendezvous layer helps you find other peers (like a matchmaker)
2. Your client exchanges WebRTC offers directly with each peer
3. Audio flows peer-to-peer, encrypted end-to-end
4. The rendezvous layer is never in the audio path

The rendezvous server auto-starts as an embedded process if no hosted endpoint is reachable — no external setup needed.

---

## Privacy

- Audio is **end-to-end encrypted** (AES-GCM 256, key derived from room key via HKDF)
- Room keys are **encrypted at rest** in local SQLite
- The rendezvous layer sees: who's connecting to which room key, display names, timestamps
- The rendezvous layer does **not** see: audio content, channel state, messages, decrypted room keys
- No analytics, no telemetry, no accounts

---

## License

MIT — see [LICENSE](LICENSE)

---

→ **Building or contributing?** See [CONTRIBUTING.md](CONTRIBUTING.md)
