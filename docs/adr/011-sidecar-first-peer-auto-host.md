# ADR-011: Sidecar Rendezvous — First Peer Auto-Hosts

**Date:** 2026-05-14  
**Status:** Proposed  
**Author:** Solin

## Context

Currently, Voxel requires a separate `voxel-signal` binary running somewhere for peers to find each other. This contradicts the "every client is a server" philosophy and adds an operational burden. Users shouldn't need to run anything outside the Voxel app.

Mark: "I even see 'signal server' in the settings, that feels weird. The goal is to have it SEAMLESS."

## Decision (Proposed)

When a user creates a group, if no rendezvous server is reachable at the default endpoint, the Voxel client auto-spawns `voxel-signal` as a sidecar process. Tauri's sidecar feature supports this — you can ship a separate binary and spawn it programmatically.

Flow:
1. User clicks "Create a Group"
2. App tries to reach the default rendezvous endpoint
3. If unreachable (timeout), spawn sidecar voxel-signal on a random local port
4. Register the sidecar address as the group's rendezvous endpoint
5. When peers join, they get the creator's rendezvous address from the group key metadata
6. Sidecar dies when the creator disconnects — another peer can take over

Discovery of the sidecar address:
- Option A: encode the rendezvous URL in the group key (e.g., `echo-golf-491@192.168.1.5:48210`)
- Option B: use a minimal DHT/gossip layer for address discovery
- Option C: use the public hosted rendezvous as a bulletin board for local sidecar addresses

## Alternatives Considered

**Always require hosted rendezvous**: Simple but requires infrastructure. Contradicts "zero cloud dependency" posture. Rejected for the ideal end state.

**mDNS only (LAN)**: Works without any server. But Mark's team is remote. Rejected as the only mechanism.

**Encode address in key**: Clean and simple. Group key becomes `<name>@<host>:<port>`. Downside: IP address changes, NAT traversal issues. Works for static IPs and tailscale-style setups.

## Status: Proposed

Not yet implemented. The groundwork (Tauri sidecar API, voxel-signal binary) is in place. The missing pieces:
- Cargo workspace configured to include signal as a sidecar resource
- tauri.conf.json `externalBin` entry for voxel-signal
- Auto-spawn logic in App.tsx connect flow
- Address encoding in group key format

## Consequences (when implemented)

- True zero-configuration: anyone can create a group with no external dependencies
- Creator's machine acts as the rendezvous for their group
- Natural limitation: if creator is offline, new peers can't join (acceptable — others can take over hosting)
- Addresses NAT traversal with STUN servers already in the mesh config
