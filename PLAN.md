# Voxel — Retro Voice Chat

A faithful Ventrilo clone with 8-bit pixel art aesthetic, mesh WebRTC audio, and zero cloud dependency.

## Decisions

- **Platform:** Tauri v2 (Rust backend, web frontend)
- **Frontend:** SolidJS + Canvas for pixel art rendering
- **Audio:** Browser WebRTC for mesh peer connections, Web Audio API for monitoring/effects
- **State:** Local SQLite per client, WebSocket gossip for real-time sync
- **Signaling:** Rust binary (separate from client), handles WebRTC peer discovery only
- **Auth:** Per-server shared key (enter once, stored locally). No accounts.
- **Identity:** App-generated UUID on first launch, stored in SQLite. Display names are session-based, first-come-first-served.
- **Conflict resolution:** Vector clock (peer_id + sequence number + timestamp)
- **Trust model:** Server key for entry, owner/admin/member roles in SQLite, changes signed with HMAC using server key
- **Peer limit:** 14 per server (mesh constraint)
- **License:** MIT, open source
- **Repo:** `adamnfineco/voxel` (GitHub, when ready)
- **Docs/planning:** `~/Library/Mobile Documents/com~apple~CloudDocs/labs/voxel/` (iCloud, syncs across machines)

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Voxel Client (Tauri v2)                        │
│                                                 │
│  ┌──────────────┐  ┌────────────────────────┐   │
│  │ Rust Backend  │  │ SolidJS Frontend       │   │
│  │              │  │                        │   │
│  │ - SQLite     │  │ - Pixel art UI (Canvas)│   │
│  │ - Global     │  │ - WebRTC mesh audio    │   │
│  │   hotkeys    │  │ - Web Audio API        │   │
│  │ - Tray       │  │ - WebSocket gossip     │   │
│  │ - Audio      │  │ - Speaking indicators  │   │
│  │   (cpal      │  │ - Channel tree         │   │
│  │    fallback) │  │ - TTS (SpeechSynth)    │   │
│  └──────┬───────┘  └───────────┬────────────┘   │
│         │      IPC bridge      │                 │
│         └──────────────────────┘                 │
└─────────────────────┬───────────────────────────┘
                      │
                      │ WebSocket (signaling only)
                      ▼
           ┌─────────────────────┐
           │ Voxel Signal Server │
           │ (Rust binary)       │
           │                     │
           │ - Peer discovery    │
           │ - ICE candidate     │
           │   exchange          │
           │ - Server registry   │
           │ - No audio routing  │
           └─────────────────────┘
```

**Audio path:** Pure peer-to-peer WebRTC mesh. Signaling server never touches audio.

**State sync:** Peers exchange SQLite diffs via WebSocket gossip. Vector clock resolves ordering.

---

## Data Model (SQLite)

```sql
-- Local identity (generated on first launch)
CREATE TABLE identity (
  id TEXT PRIMARY KEY,         -- UUID
  display_name TEXT,
  created_at INTEGER
);

-- Servers you've joined
CREATE TABLE servers (
  id TEXT PRIMARY KEY,         -- UUID
  name TEXT NOT NULL,
  server_key_hash TEXT NOT NULL,  -- HMAC key (encrypted)
  signal_url TEXT NOT NULL,    -- signaling server address
  last_connected INTEGER,
  created_at INTEGER
);

-- Channels per server
CREATE TABLE channels (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES servers(id),
  parent_id TEXT REFERENCES channels(id),
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_afk BOOLEAN DEFAULT FALSE,
  afk_timeout_seconds INTEGER DEFAULT 300,
  is_queued BOOLEAN DEFAULT FALSE,
  max_users INTEGER,
  password_hash TEXT,
  created_by TEXT,             -- peer_id
  updated_at INTEGER,
  UNIQUE(server_id, name, parent_id)
);

-- Roles
CREATE TABLE roles (
  server_id TEXT NOT NULL REFERENCES servers(id),
  peer_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'member')),
  granted_by TEXT,
  granted_at INTEGER,
  PRIMARY KEY (server_id, peer_id)
);

-- User preferences per server
CREATE TABLE user_prefs (
  server_id TEXT NOT NULL REFERENCES servers(id),
  key TEXT NOT NULL,
  value TEXT,
  PRIMARY KEY (server_id, key)
);

-- Muted users (persistent per server)
CREATE TABLE muted_users (
  server_id TEXT NOT NULL REFERENCES servers(id),
  peer_id TEXT NOT NULL,
  muted_at INTEGER,
  PRIMARY KEY (server_id, peer_id)
);

-- Vector clock state
CREATE TABLE vector_clock (
  server_id TEXT NOT NULL REFERENCES servers(id),
  peer_id TEXT NOT NULL,
  seq INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (server_id, peer_id)
);

-- Change log (for sync)
CREATE TABLE changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id TEXT NOT NULL REFERENCES servers(id),
  peer_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  change_type TEXT NOT NULL,   -- 'channel_create', 'channel_delete', 'role_change', etc.
  payload TEXT NOT NULL,       -- JSON
  hmac TEXT NOT NULL,
  applied BOOLEAN DEFAULT TRUE
);
```

---

## Feature Breakdown

### Phase 1 — Foundation
1. Scaffold Tauri v2 project with SolidJS
2. SQLite setup with migrations (tauri-plugin-sql)
3. Identity generation (UUID on first launch)
4. Basic pixel art shell (window chrome, 8-bit font, retro color palette)
5. System tray integration

### Phase 2 — Signaling Server
6. Rust signaling binary (WebSocket server)
7. Server registration/discovery protocol
8. ICE candidate exchange
9. Server key validation (HMAC)

### Phase 3 — Mesh Audio
10. WebRTC peer connection management (up to 14 peers)
11. Audio capture (mic input via getUserMedia)
12. Audio playback (remote streams)
13. Push-to-talk (global hotkey via tauri-plugin-global-shortcut, press/release events)
14. Voice activation mode (Web Audio API AnalyserNode threshold detection)
15. Mute mic / mute sound (independent toggles)
16. Speaking indicator (who's transmitting)
17. Audio device selection (input/output enumeration)

### Phase 4 — Channel System
18. Channel tree UI (server → channels → sub-channels → users)
19. Channel CRUD (create, rename, delete)
20. Join/leave channel
21. AFK channel (auto-move on idle timer, auto-mute)
22. Queued channels (one speaker at a time)
23. Channel password protection
24. Channel user limits

### Phase 5 — State Sync
25. WebSocket gossip layer between peers
26. Vector clock implementation
27. Change broadcast + HMAC signing
28. State merge on peer join (pull current state from first connected peer)
29. Conflict resolution (seq > timestamp tiebreaker)

### Phase 6 — User System
30. Anonymous identity (pick name on join, unique per server)
31. Name collision detection (reject if taken in active session)
32. Name release on disconnect
33. Persistent mute per user per server
34. User comments (visible to others)

### Phase 7 — Admin
35. Owner/admin/member role system
36. Kick user
37. Promote/demote admin
38. Reserved names (optional, owner feature)

### Phase 8 — Polish & UX
39. Keybinding system (configurable shortcuts for all actions)
40. TTS join/leave announcements (browser SpeechSynthesis API)
41. Sound events (connect, disconnect, user join/leave — wav file playback)
42. Ducking (lower system audio on transmit/receive via Web Audio gain node)
43. Minimize to tray
44. Mic level monitor (visual meter in UI)
45. 8-bit pixel art UI completion (full theme, sprites, animations)
46. Sound effects (button clicks, channel switch, etc.)

---

## Tech Stack Detail

| Layer | Choice | Why |
|---|---|---|
| App framework | Tauri v2 | Low RAM, Rust backend, native system access |
| Frontend | SolidJS | Tiny, reactive, no vDOM, real-time updates |
| Rendering | HTML Canvas + CSS | Pixel art, bitmap fonts, sprite sheets |
| Audio transport | Browser WebRTC | Mature, audio-only mesh, built into WebView |
| Audio processing | Web Audio API | AnalyserNode for levels, GainNode for ducking |
| Audio fallback | cpal (Rust) | If browser APIs hit limits on device control |
| Database | SQLite via tauri-plugin-sql | Local, fast, no server dependency |
| State sync | WebSocket (native browser API) | Gossip protocol between peers |
| Hotkeys | tauri-plugin-global-shortcut | PTT works when app is backgrounded |
| Tray | Tauri built-in tray API | Native system tray |
| TTS | Browser SpeechSynthesis API | Uses macOS system voices |
| Sound playback | Web Audio API AudioBufferSourceNode | Low-latency wav playback |
| Signaling server | Custom Rust binary (tokio + tungstenite) | WebSocket server for ICE exchange |
| Serialization | serde + JSON | Change payloads, IPC |

---

## Project Structure

```
~/labs/voxel/
├── README.md
├── LICENSE                    # MIT
├── Cargo.toml                 # Workspace: client + signal server
├── client/                    # Tauri v2 app
│   ├── src-tauri/             # Rust backend
│   │   ├── Cargo.toml
│   │   ├── src/
│   │   │   ├── main.rs
│   │   │   ├── db.rs          # SQLite setup + migrations
│   │   │   ├── identity.rs    # UUID generation
│   │   │   ├── audio.rs       # cpal fallback if needed
│   │   │   └── commands.rs    # Tauri IPC commands
│   │   ├── migrations/        # SQL migration files
│   │   └── tauri.conf.json
│   ├── src/                   # SolidJS frontend
│   │   ├── index.html
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── ChannelTree.tsx
│   │   │   ├── UserList.tsx
│   │   │   ├── MuteBar.tsx
│   │   │   ├── SpeakingIndicator.tsx
│   │   │   ├── MicLevel.tsx
│   │   │   ├── ServerConnect.tsx
│   │   │   └── PixelCanvas.tsx
│   │   ├── audio/
│   │   │   ├── mesh.ts        # WebRTC peer management
│   │   │   ├── ptt.ts         # Push-to-talk logic
│   │   │   ├── vad.ts         # Voice activation detection
│   │   │   ├── ducking.ts     # System audio ducking
│   │   │   └── sounds.ts      # Event sound playback
│   │   ├── sync/
│   │   │   ├── gossip.ts      # WebSocket state sync
│   │   │   ├── vectorClock.ts # Vector clock impl
│   │   │   └── hmac.ts        # Change signing/verification
│   │   ├── store/
│   │   │   ├── db.ts          # SQLite queries via Tauri IPC
│   │   │   ├── identity.ts    # Local identity management
│   │   │   └── servers.ts     # Server list management
│   │   ├── assets/
│   │   │   ├── sprites/       # Pixel art sprite sheets
│   │   │   ├── fonts/         # Bitmap fonts
│   │   │   └── sounds/        # Event wav files
│   │   └── styles/
│   │       └── pixel.css      # Retro styling, image-rendering: pixelated
│   ├── package.json
│   └── vite.config.ts
├── signal/                    # Signaling server
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs
│       ├── server.rs          # WebSocket server (tokio + tungstenite)
│       ├── registry.rs        # Server registration
│       └── ice.rs             # ICE candidate relay
└── shared/                    # Shared Rust types
    ├── Cargo.toml
    └── src/
        ├── lib.rs
        ├── protocol.rs        # Message types (signaling + gossip)
        └── crypto.rs          # HMAC utilities
```

---

## Verification

1. **Build client:** `cd client && cargo tauri dev`
2. **Build signal server:** `cd signal && cargo run`
3. **Test flow:**
   - Launch two client instances
   - Create a server on client A (generates server key)
   - Share server key with client B
   - Both connect to signaling server
   - WebRTC mesh establishes
   - Test PTT, voice activation, mute, channel switching
   - Kill one client, verify state persists in other client's SQLite
   - Reconnect, verify state syncs back
4. **Mesh stress test:** Launch 14 clients, verify audio quality holds
5. **Offline test:** Disconnect from network, verify local state is intact, reconnect and sync

---

## Open Questions (for during build)

- Pixel art sprite design — do we source/commission sprites or build minimal placeholders first?
- Bitmap font choice — which 8-bit font for the UI?
- Signal server hosting for the work team — where does it run? (VPS, home server, etc.)
- macOS permissions — microphone access prompt, accessibility for global hotkeys
