# ADR-003: Local-First SQLite + Gossip Sync

**Date:** 2026-05-13  
**Status:** Accepted  
**Author:** Mark + Solin

## Context

Room state (channels, roles, preferences, mute lists) needs to persist across sessions and sync between peers. Traditional approach: central database. But Voxel has no central server.

## Decision

Every client owns a local SQLite database. State syncs between peers via a gossip protocol over WebSocket. Changes are HMAC-signed with the shared server key and ordered by vector clocks.

## Alternatives Considered

**Central database (Postgres/Supabase)**: Would require a hosted service. Violates zero-cloud-dependency goal. Adds a trust point. Rejected for core state.

**CRDT-based sync**: More mathematically rigorous conflict resolution. But overkill — Voxel's state is low-contention (two people rarely edit the same channel name simultaneously). Vector clocks with last-write-wins are sufficient and simpler to implement. Rejected as unnecessary complexity.

**No persistence**: Fresh state every session. Rejected — channels should survive across restarts.

## Consequences

- Each peer is the authority on its own state. No "source of truth" server.
- Vector clock ordering resolves conflicts: higher sequence number wins per peer, timestamp as tiebreaker.
- HMAC signing prevents a peer from forging changes from another peer.
- Role enforcement (owner/admin/member) is checked locally before applying privileged changes. A malicious fork could bypass this — acceptable for trusted small teams.
- When a new peer joins, it requests a state snapshot from an existing peer and merges it locally.
- Offline peers miss changes but catch up on reconnect via gossip sync.
