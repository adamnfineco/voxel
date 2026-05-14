# Contributing to Voxel

## Prerequisites

- [Rust](https://rustup.rs/) 1.77+
- [Node.js](https://nodejs.org/) 18+
- macOS (primary dev target — Tauri supports Linux/Windows too)

## Setup

```bash
git clone https://github.com/adamnfineco/voxel
cd voxel
npm install
```

## Run in development

Terminal 1 — rendezvous server (or let the sidecar handle it automatically):
```bash
source "$HOME/.cargo/env"
cargo run --release --manifest-path signal/Cargo.toml
```

Terminal 2 — app with hot reload:
```bash
npm run tauri dev
```

## Verify before committing

```bash
# TypeScript
npm run typecheck

# Frontend build
npm run build

# Rust (both crates)
source "$HOME/.cargo/env"
cargo check --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path signal/Cargo.toml

# Integration tests (requires rendezvous server on :8080)
npm test
```

## Build for distribution (Apple Silicon)

```bash
./scripts/release.sh 0.x.y
```

This typehecks, tests, bundles the sidecar binary, and produces a `.app` + `.dmg` in `target/aarch64-apple-darwin/release/bundle/`.

## Architecture

Every Voxel client is a mesh node. See [`docs/system-design.md`](docs/system-design.md) and [`docs/adr/`](docs/adr/) for the full architecture and every major decision recorded.

Short version:
- **`src/`** — SolidJS frontend (not React — don't use React libraries)
- **`src/audio/`** — WebRTC mesh, PTT, VAD, E2EE, ducking, sounds
- **`src/sync/`** — gossip protocol, vector clocks, HMAC signing
- **`src/store/`** — local SQLite state, keyring, identity
- **`src/runtime/`** — sidecar manager, config, bridge for cross-component comms
- **`src/components/`** — UI components, **all icons are inline SVGs** in `icons.tsx`
- **`src-tauri/`** — Rust backend (Tauri v2), sidecar spawning, tray
- **`signal/`** — standalone rendezvous server (Rust, tokio + tungstenite)

## Key conventions

- **SolidJS not React** — imports from `solid-js`, not `react`. Using React components crashes the app.
- **Icons** — add to `src/components/icons.tsx` as inline SVGs. No external icon libraries.
- **No circular imports** — `App.tsx` ↔ `Settings.tsx` communicate via `src/runtime/bridge.ts`
- **ADR for structural decisions** — any significant architecture choice gets a record in `docs/adr/NNN-slug.md`. Immutable once written; supersede with a new ADR.
- **Tauri ACL** — new plugin capabilities need explicit entries in `src-tauri/capabilities/default.json`
- **Mic permission** — `NSMicrophoneUsageDescription` lives in `src-tauri/Info.plist` and is merged into the app's `Info.plist` at build time

## Versioning

We use `MAJOR.MINOR.PATCH` (semver) with pre-release labels:

```
v0.1.0-alpha.1   ← architecture built, not yet validated end-to-end
v0.1.0-alpha.2   ← incremental pre-release builds
v0.1.0-beta.1    ← feature-complete, being tested
v0.1.0           ← voice actually works between two real people
v0.1.1           ← bug fixes on top of v0.1.0
v0.2.0           ← next feature milestone
v1.0.0           ← stable, multi-peer validated, hosted rendezvous running
```

Rules:
- `MAJOR` — breaking protocol or trust model change (currently 0, stays 0 until very stable)
- `MINOR` — new feature milestone
- `PATCH` — bug fixes, polish, no new features

A version only leaves alpha/beta when it has been **validated end-to-end**:
- voice works between two real machines on real network conditions
- PTT works backgrounded
- sidecar starts and peers find each other

Tag format: `vX.Y.Z` or `vX.Y.Z-alpha.N` / `vX.Y.Z-beta.N`

## PR conventions

- One logical change per PR
- TypeScript + Rust must both pass (`npm run typecheck`, `cargo check`)
- `npm test` must pass (21/21 signal server tests)
- If the change touches architecture: add or update an ADR first

## License

MIT. Contributions are MIT licensed.
