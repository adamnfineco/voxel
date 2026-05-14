# AGENTS.md

## What is Voxel

Retro voice chat. Ventrilo-inspired. Every client is a mesh node — audio is peer-to-peer via WebRTC. A hidden rendezvous layer handles peer discovery only. No central audio server. No accounts. MIT licensed.

## Workspace layout

```
src/                    SolidJS frontend (NOT React)
src/audio/              WebRTC mesh, PTT, VAD, ducking, sounds, mic level
src/components/         UI components + local SVG icon library (icons.tsx)
src/store/              SQLite queries via tauri-plugin-sql, reactive state (SolidJS signals)
src/sync/               Gossip protocol, signaling client, vector clock, HMAC, change application
src/runtime/            Runtime bridge (no circular imports) + hidden config (rendezvous URL)
src/styles/pixel.css    Full design system — CSS custom properties, no Tailwind

src-tauri/              Tauri v2 Rust backend
src-tauri/src/lib.rs    App entry — plugin registration, tray setup, window management
src-tauri/src/commands.rs  IPC commands (identity, servers, channels, roles, crypto)
src-tauri/src/tray.rs   System tray with show/hide toggle
src-tauri/tauri.conf.json  Tauri config — plugins.sql preloads sqlite:voxel.db
src-tauri/capabilities/default.json  ACL permissions — sql, global-shortcut, websocket, shell, log

signal/                 Standalone Rust rendezvous server (tokio + tungstenite)
signal/src/server.rs    WebSocket handler — /signal and /gossip endpoints

docs/                   Gitignored except force-added files
docs/adr/               Architectural Decision Records (force-tracked via git add -f)
docs/system-design.md   Full architecture reference (force-tracked)
```

## Session summary (2026-05-14)

**What was built in this session:**

1. **Solid/Vite 6 bundle fix** — Solid IS in the bundle, just minified. `solidBrowserFix` plugin in vite.config.ts is belt-and-suspenders.
2. **Group UX** — `GroupConnect.tsx` replaces `ServerConnect.tsx`. Create Group generates a random key (echo-golf-491 style). Click key to copy.
3. **E2EE audio** — `src/audio/e2ee.ts`. HKDF-SHA256 key derivation from room key → AES-GCM 256. RTCRtpScriptTransform inlined worker. Attached to every WebRTC sender/receiver.
4. **Channel passwords** — SHA-256 hashed, prompted on join. `src/store/crypto.ts`.
5. **Channel modal** — `ChannelModal.tsx` replaces simple text modal. Name, password, AFK, queued, max-users.
6. **Admin promote/demote** — right-click user in channel. Broadcasts `role_set` via gossip.
7. **Key-at-rest encryption** — `src/store/keyring.ts`. Room keys stored as AES-GCM ciphertext in SQLite. Derived from app UUID via HKDF.
8. **Max-users enforcement** — join blocked client-side with error flash.
9. **Embedded sidecar** — `src-tauri/src/sidecar.rs`. voxel-signal bundled as a Tauri sidecar binary. Auto-spawned when default rendezvous unreachable. `src/runtime/sidecar.ts` probes + triggers spawn.
10. **Connection status** — dot in header: green=connected, amber=reconnecting. Peer count shown.
11. **Font sizes** — bumped 28% across the board.
12. **ADRs 008-011** — Group naming, E2EE, key-at-rest, sidecar plan.

## Recent changes (high signal for next session)

- **Groups not Servers** — user-facing term is "group". DB/types still say `Server` internally. `GroupConnect` is the new connect screen. `ServerConnect.tsx` is no longer used.
- **E2EE** — `src/audio/e2ee.ts` derives AES-GCM media key from room key via HKDF. Attached to every WebRTC sender/receiver. `initE2EE(roomKey)` called in App.tsx connect flow.
- **Channel modal** — `ChannelModal.tsx` handles create/edit with password, AFK, queued, max-users. Replaces old simple text modal.
- **Channel passwords** — stored as SHA-256 hash in SQLite. Prompt shown before joining. `hashPassword`/`verifyPassword` in `src/store/crypto.ts`.
- **Admin promote/demote** — right-click user → Make Admin / Remove Admin (owner only). Broadcasts `role_set` via gossip.
- **Font sizes** — bumped ~28% across the board (base 12→15px, small 9→11px, 10→13px).
- **Solid bundle was always correct** — Solid IS in the release bundle, just minified. The `solidBrowserFix` plugin in `vite.config.ts` is belt-and-suspenders, not strictly required.
- **Sidecar** — `src-tauri/src/sidecar.rs` + `src/runtime/sidecar.ts`. voxel-signal binary bundled at `src-tauri/binaries/voxel-signal-aarch64-apple-darwin`. Auto-spawns when default rendezvous unreachable.
- **Keyring** — `src/store/keyring.ts`. Room keys AES-GCM encrypted at rest in SQLite. initKeyring(uuid) called at boot. encryptRoomKey() in GroupConnect, decryptRoomKey() before use.
- **ConnStatus** — `connStatus` signal in appState: disconnected/connecting/connected/reconnecting. Green/amber/red dot in main header. Peer count also shown.

## Critical gotchas

- **This is SolidJS, NOT React.** Never use React libraries, React hooks, or React component patterns. Solid components are plain functions returning JSX. `createSignal` not `useState`. `Show`/`For` not ternaries with `.map`. React icon libraries (e.g. `@phosphor-icons/react`) will crash the app at runtime — see ADR-007.
- **Icons are local inline SVGs** in `src/components/icons.tsx`. No external icon package. Add new icons there.
- **No emojis in UI code.** Use SVG icons from `icons.tsx` instead.
- **`src/runtime/bridge.ts`** exists to break circular imports between App.tsx and Settings.tsx. If you need App to expose a function to Settings, register it in the bridge, not as a direct export.
- **Tauri APIs must be guarded.** Check for `__TAURI_INTERNALS__` before calling Tauri APIs in module-level code. Use dynamic `import()` not static imports for `@tauri-apps/api/window` at the top level. See `src/index.tsx` for the pattern.
- **SQL plugin requires explicit ACL.** If you add new SQL operations, `sql:default` alone is not enough — you need `sql:allow-execute`, `sql:allow-select`, etc. in `src-tauri/capabilities/default.json`.
- **`global-shortcut` plugin config must be empty in tauri.conf.json.** Do NOT add a `"global-shortcut": { ... }` object to `plugins` — it causes a deserialization crash. Shortcuts are registered at runtime via the JS API.
- **Shared AudioContext.** App.tsx creates ONE AudioContext and passes it to mesh, VAD, micLevel, ducking, and sounds. Never create additional AudioContexts.
- **docs/ is gitignored.** To track a doc, use `git add -f docs/path/to/file.md`.

## Commands

```bash
# Frontend
npm install                          # install deps
npm run build                        # production build (vite)
npx tsc --noEmit                     # typecheck (strict, no output)

# Tauri app
source "$HOME/.cargo/env"            # if cargo not in PATH
cargo tauri dev                      # dev mode (vite + cargo, hot reload)
cargo tauri build --no-bundle        # release binary without .dmg/.app packaging

# Rendezvous server
cargo build --release -p voxel-signal  # build
./target/release/voxel-signal          # run (default ws://0.0.0.0:8080)
BIND_ADDR=0.0.0.0:9090 ./target/release/voxel-signal  # custom port

# Tests
node test-signal.mjs                 # 21 integration tests (requires voxel-signal on :8080)

# Full verification sequence
npx tsc --noEmit && npm run build && cargo tauri build --no-bundle && cargo check -p voxel-signal
```

## Testing

- **Signal server**: `test-signal.mjs` — 21 headless integration tests covering join/leave, WebRTC relay, name dedup, room cap, gossip, room isolation, oversized messages. Requires `voxel-signal` running on `:8080`.
- **Frontend**: no test framework yet. Verify via `npx tsc --noEmit` + `npm run build`.
- **Tauri binary**: `cargo tauri build --no-bundle` confirms the full app compiles and links.
- **No browser E2E tests yet.** Client UX validation is manual.

## Architecture rules

- **Every client is a mesh node.** Audio is peer-to-peer WebRTC. No server in the audio path.
- **Rendezvous is hidden plumbing.** Users never see a signal URL. The default endpoint lives in `src/runtime/config.ts`. The UI only asks for server key + optional name.
- **Local-first state.** All room state (channels, roles, vector clock, change log) lives in local SQLite. Synced between peers via HMAC-signed gossip with vector clock ordering.
- **Server key = root of trust.** Used for room entry, HMAC signing, and future E2EE key derivation.
- **Role enforcement is client-side.** Privileged gossip changes (channel CRUD, role changes) are checked against the sender's role in local SQLite before applying. See `src/sync/changes.ts`.

## Key files added since initial build

- `src/components/GroupConnect.tsx` — connect screen (create/join group)
- `src/components/ChannelModal.tsx` — channel create/edit with all settings
- `src/audio/e2ee.ts` — E2EE: HKDF key derivation + RTCRtpScriptTransform
- `src/store/crypto.ts` — SHA-256 password hashing utilities
- `src/runtime/bridge.ts` — breaks circular App↔Settings import
- `src/runtime/config.ts` — hidden rendezvous URL + group name derivation
- `src/components/icons.tsx` — ALL icons (inline SVG, no external library)
- `docs/adr/` — 10 ADRs tracking every major decision

## ADR practice

Every significant architectural decision gets a numbered record in `docs/adr/NNN-slug.md`. Format defined in ADR-000.

Current ADRs:
- 000: ADR format
- 001: Tauri + SolidJS over Electron/Swift
- 002: Mesh audio — every client is a server
- 003: Local-first SQLite + gossip sync
- 004: Shared server key trust model
- 005: Rendezvous hidden from UX
- 006: Tray + Dock app on macOS
- 007: Inline SVG icons, no React libraries
- 008: "Group" not "Server" in UX
- 009: E2EE audio via HKDF + AES-GCM RTCRtpScriptTransform

**When making a structural decision, write the ADR before or alongside the code change.** Use `git add -f docs/adr/NNN-*.md` to track it.

## Style

- CSS custom properties in `src/styles/pixel.css` — no Tailwind, no CSS-in-JS
- No pure `#000000` — minimum darkness is `#09090b` (zinc-950)
- No outer glows — inner refraction borders only (see `--refraction` token)
- All CSS animations use `transform` and `opacity` only (GPU accelerated)
- `100dvh` not `100vh` for full-height layouts
- Pixel art: `image-rendering: pixelated`, Press Start 2P font for display text, monospace for data
