# ADR-005: Rendezvous Layer Hidden from UX

**Date:** 2026-05-14  
**Status:** Accepted  
**Author:** Mark + Solin

## Context

WebRTC peers on the public internet need a way to find each other and exchange ICE candidates. This requires a signaling/rendezvous layer. The initial implementation exposed a "Signal URL" field in the connect screen, which leaked an infrastructure detail into the product.

Mark's feedback: "I don't get why you need a URL. The whole thing should be mesh. Just server key, maybe a name, and boom."

## Decision

The rendezvous layer is internal plumbing. Users never see it. The connect flow is:

1. Enter server key
2. (Optional) enter display name
3. Connect

The rendezvous endpoint is a hidden default in `src/runtime/config.ts`. No URL field in the UI. The architecture still needs rendezvous for public-internet connectivity, but it's treated like DNS — essential infrastructure that users don't think about.

## Alternatives Considered

**Expose Signal URL as advanced config**: Power users might want to self-host. But exposing it in the main UI creates confusion and contradicts the "just enter a key" promise. Could add a hidden/advanced settings toggle later. Rejected for the primary UX.

**LAN-only (mDNS)**: No rendezvous needed on local networks. But Mark's team is remote. Rejected as sole approach.

**Embedded sidecar**: First peer auto-starts a rendezvous server embedded in the client. No separate binary needed. This is the ideal end state but adds complexity. Deferred — not rejected.

## Consequences

- Connect screen is clean: key + name only
- Rendezvous endpoint is a build-time or runtime config default
- Self-hosting rendezvous is still possible but not a first-class UX concern
- Future: embedded sidecar means even the hidden rendezvous becomes automatic
