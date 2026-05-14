# ADR-008: "Group" Not "Server"

**Date:** 2026-05-14  
**Status:** Accepted  
**Author:** Mark + Solin

## Context

The codebase used "server" to refer to a named voice room. In the old Ventrilo model this was accurate — you ran a server binary, others connected to it. In Voxel, every client IS a node in the mesh. There is no separate server process that hosts a room. Calling it a "server" is both technically incorrect and creates the wrong mental model for users.

Mark: "Anyone can create a group. Then we need to fix the mesh."

## Decision

Rename "server" to "group" in all user-facing surfaces:
- UI labels: "Create a Group", "Join a Group", "Recent Groups"
- Keys are "Group Keys", not "Server Keys" in UI copy
- The connect screen shows two clear actions: Create a Group / Join a Group
- Creating a group generates a random human-readable key (word-word-number format) that can be shared verbally
- No URL field, ever

Internally (DB schema, TypeScript types, Rust commands) the word "server" remains — renaming the schema would require a migration and is a future cleanup task.

## Alternatives Considered

**"Room"**: More accurate for a session, but implies temporary. Groups persist across sessions in local SQLite.

**"Channel"**: Conflicts with our existing channel concept (sub-rooms within a group).

**Keep "Server"**: Technically holdover from Ventrilo era. Confusing in a mesh context. Rejected.

## Consequences

- UX is clearer: users understand they're creating a voice group, not running infrastructure
- Key generation (word-word-number) is memorable and shareable verbally: "join echo-golf-491"
- Internal code still uses Server type — future migration task
- The create flow generates a random key automatically, lowering barrier to entry
