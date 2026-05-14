# ADR-002: Mesh Audio — Every Client Is a Server

**Date:** 2026-05-13  
**Status:** Accepted  
**Author:** Mark + Solin

## Context

Voice chat apps traditionally route audio through a central server (SFU or mixing server). This creates a single point of failure, a privacy risk (the server can hear everything), and an infrastructure cost.

## Decision

Every Voxel client is a full mesh node. Audio flows directly between peers via WebRTC. There is no central audio server. The client IS the server.

When you open Voxel, your machine becomes a node in the mesh. It sends audio directly to every other peer and receives audio directly from them. No intermediary touches the audio stream.

A lightweight rendezvous layer exists only to help peers find each other on the public internet (ICE candidate exchange, peer discovery). It never sees audio. It's hidden from the user — an internal transport detail, not a product surface.

## Alternatives Considered

**SFU (Selective Forwarding Unit) like LiveKit**: Scales better past ~15 peers because each client only uploads once. But requires a server in the audio path — privacy risk, infrastructure cost, single point of failure. Rejected for the core use case (small teams, ≤14 people).

**Mixing server**: Even more centralized — server decodes, mixes, re-encodes. Highest quality control but worst privacy model. Rejected.

**Pure mesh with no rendezvous**: Works on LAN (mDNS discovery), but not on the public internet. Peers behind NAT need ICE/STUN/TURN to establish direct connections. Rejected as sole approach because Mark's team is remote.

## Consequences

- **14-peer practical cap**: mesh connections scale O(n²). At 14 peers, each client maintains 13 peer connections. This is the practical limit before CPU and bandwidth degrade noticeably for audio-only.
- **No single point of failure for audio**: if the rendezvous layer goes down, existing mesh connections keep working. New peers can't join until it's back.
- **Privacy by architecture**: audio is peer-to-peer with DTLS-SRTP transport encryption. No server can eavesdrop because no server is in the audio path.
- **Rendezvous is disposable**: it's a matchmaker, not infrastructure. Can be a tiny binary, a sidecar, or eventually embedded in the client itself (first peer auto-hosts).
