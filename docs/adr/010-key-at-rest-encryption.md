# ADR-010: Key-at-Rest Encryption for Room Keys

**Date:** 2026-05-14  
**Status:** Accepted  
**Author:** Solin

## Context

Room keys were stored as plaintext strings in SQLite (`servers.server_key`). Anyone with access to the `.db` file could read every room key the user has ever joined. This includes cloud backup leaks, cross-app SQLite readers, and database exports.

## Decision

Encrypt room keys at rest using AES-GCM 256.

Key derivation:
```
app UUID (local identity) → HKDF(salt="voxel-keyring-v1", info="local-machine-key") → 256-bit AES-GCM key
```

Storage format:
```
enc:v1:<base64(IV)>:<base64(ciphertext)>
```

The local machine key is derived from the app's UUID (stored in the identity table) — the same UUID used as the peer identity. This means:
- The machine key is reproducible from the UUID (no separate secret to manage)
- It's machine-local: a copy of the DB file without the UUID is useless
- The UUID itself is stored in plaintext — so full SQLite access = full key access

The encryption + decryption happens in `src/store/keyring.ts`. The keyring is initialized in App.tsx boot with the identity UUID. Room keys are decrypted on connect before use.

## Alternatives Considered

**macOS Keychain via tauri-plugin-stronghold**: Would be stronger — keys stored in the OS keychain, not derivable from the DB. But tauri-plugin-stronghold was not stable in Tauri v2 at time of writing. Deferred as a future upgrade.

**No encryption**: Keys stored plaintext. Unacceptable for a privacy-first app even at this stage.

**Per-key random encryption key stored in OS keychain**: Stronger but more complex. Each room key gets its own encryption key, stored separately. Future upgrade path.

## Consequences

- Room keys in SQLite are no longer plaintext
- A DB backup without the corresponding identity UUID cannot decrypt keys
- Full local machine access still allows key derivation (acceptable for threat model)
- Backwards compatible: plaintext keys (without `enc:v1:` prefix) pass through unchanged
- Performance: one AES-GCM operation per connect, negligible cost
