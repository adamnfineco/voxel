# ADR-004: Shared Server Key as Root of Trust

**Date:** 2026-05-13  
**Status:** Accepted  
**Author:** Mark + Solin

## Context

Need an auth/trust model that's dead simple for users but still prevents random people from joining rooms and forging state changes. No user accounts, no email, no OAuth.

## Decision

A single shared server key per room. You know the key → you're in. The key is entered once and stored locally. It serves three purposes:

1. **Room entry**: the rendezvous layer uses it to group peers into the same room
2. **Change authentication**: gossip changes are HMAC-signed with the server key
3. **Future E2EE root**: media encryption key can be derived from the server key via HKDF

Display names are session-scoped and first-come-first-served. The rendezvous layer enforces name uniqueness per room.

## Alternatives Considered

**Per-user keypairs (public key crypto)**: Stronger identity guarantees. Each user generates a keypair, public key = identity. But adds complexity — key management, "forgot password" problems, potential key files to manage. Rejected for v1 in favor of simplicity.

**Password-derived keys**: User picks a password, keypair derived via PBKDF2/Argon2. Invisible crypto but still per-user. More complex than a shared room key. Could layer on later if needed. Rejected for v1.

**No auth at all**: Anyone can join any room. No signing on changes. Too open — a random person could stumble into a room and delete channels. Rejected.

## Consequences

- UX is minimal: enter a key, pick a name, go
- Anyone with the key has equal entry rights (role differentiation is separate — first joiner becomes owner)
- Server key should NOT be stored plaintext long-term (currently it is — gap to fix)
- If the key leaks, the room is compromised. Mitigation: rotate the key (create a new room)
- HMAC signing prevents change forgery but not replay attacks across rooms with the same key (acceptable — rooms are isolated by ID + key)
