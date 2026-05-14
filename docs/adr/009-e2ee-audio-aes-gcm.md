# ADR-009: App-Layer E2EE Audio — AES-GCM via RTCRtpScriptTransform

**Date:** 2026-05-14  
**Status:** Accepted  
**Author:** Mark + Solin

## Context

WebRTC provides DTLS-SRTP transport encryption by default — audio is not plaintext on the wire. But Mark asked: "Can the audio be end-to-end encrypted too? We have the keys anyway."

The rendezvous layer never touches audio, so DTLS-SRTP already protects against passive eavesdroppers on the network. App-layer E2EE adds protection against:
- A compromised or malicious rendezvous server (even though ours never routes audio)
- A future SFU/relay scenario
- Asserting a stronger privacy posture ("we can't hear you even if we wanted to")

## Decision

Implement app-layer E2EE on every audio frame using:
- **HKDF-SHA256** to derive a 256-bit AES-GCM media key from the room key
- **RTCRtpScriptTransform** (Insertable Streams) to intercept frames in a Worker
- **AES-GCM 256** with per-frame random 12-byte IVs and sequence-number AAD

Key derivation:
```
room_key (user-visible) → HKDF(salt="voxel-e2ee-audio-v1", info="media-encryption-key") → 256-bit AES-GCM key
```

Frame layout (sender):
```
[MAGIC 4B] [IV 12B] [AAD/SEQ 8B] [encrypted payload]
```

The magic bytes `VXEE` allow version detection and graceful handling of unencrypted peers.

## Alternatives Considered

**DTLS-SRTP only (default WebRTC)**: Good for transport security but doesn't provide app-layer guarantees. Rejected as the only layer.

**Per-user keypairs + ratchet (Signal protocol)**: Much stronger. Each peer has a keypair, key agreement per session, forward secrecy. But adds significant complexity — key management, ratchet state persistence, pairing flows. Deferred to a future ADR if needed.

**SFrame**: A standard for E2EE in conferencing (RFC draft). Uses similar HKDF derivation but with a defined header format. Worth adopting if we want interoperability later. For now we use our own simpler format.

## Consequences

- Audio frames are encrypted end-to-end using the room key as root of trust
- If you don't have the room key, you hear silence (decryption fails → frame dropped)
- Peers with different room keys silently can't hear each other
- The derived media key never leaves the client — only raw bytes passed to the Worker
- RTCRtpScriptTransform requires macOS 12.3+ (WebKit 615+) — check in `e2ee.ts` guards against older platforms
- No forward secrecy — if the room key leaks, past recordings could be decrypted (acceptable for v1; Signal-style ratchet is a future upgrade path)
- Sequence number in AAD prevents frame reordering attacks
