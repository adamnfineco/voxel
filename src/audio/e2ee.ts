/**
 * E2EE — end-to-end encrypted audio.
 *
 * Derives a 256-bit AES-GCM media key from the room/server key using
 * HKDF-SHA256, then attaches RTCRtpScriptTransform workers to all
 * sender and receiver tracks so every audio frame is encrypted before
 * leaving the client and decrypted after arrival.
 *
 * The room key (user-visible, shared secret) serves as the IKM.
 * The derived media key never leaves the client.
 *
 * Usage:
 *   await initE2EE(serverKey);
 *   attachSenderE2EE(sender);
 *   attachReceiverE2EE(receiver);
 *
 * See ADR-009 for the decision record.
 */

let _mediaKeyRaw: ArrayBuffer | null = null;

// ─── Key derivation ───────────────────────────────────────────────────────────

/**
 * Derive a 256-bit AES-GCM media key from the room key using HKDF-SHA256.
 * The room key is the user-visible shared secret.
 */
export async function deriveMediaKey(roomKey: string): Promise<ArrayBuffer> {
  const enc = new TextEncoder();

  // Import the room key as raw key material
  const ikm = await crypto.subtle.importKey(
    "raw",
    enc.encode(roomKey),
    "HKDF",
    false,
    ["deriveKey"]
  );

  // Derive a 256-bit AES-GCM key
  const derived = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: enc.encode("voxel-e2ee-audio-v1"),
      info: enc.encode("media-encryption-key"),
    },
    ikm,
    { name: "AES-GCM", length: 256 },
    true, // extractable so we can export the raw bytes for the worker
    ["encrypt", "decrypt"]
  );

  return crypto.subtle.exportKey("raw", derived);
}

// ─── Initialise ───────────────────────────────────────────────────────────────

/**
 * Initialise E2EE with a room key.
 * Must be called before any peers are connected.
 */
export async function initE2EE(roomKey: string): Promise<void> {
  _mediaKeyRaw = await deriveMediaKey(roomKey);
}

export function isE2EEReady(): boolean {
  return _mediaKeyRaw !== null;
}

// ─── Attach transforms ────────────────────────────────────────────────────────

/**
 * Attach E2EE encryption to a sender track.
 * Call this after adding a track to a PeerConnection.
 */
export function attachSenderE2EE(sender: RTCRtpSender): void {
  if (!_mediaKeyRaw) return;
  if (!("transform" in sender)) {
    console.warn("[e2ee] RTCRtpScriptTransform not supported on this sender");
    return;
  }

  const worker = makeWorker();
  if (!worker) return;

  // Pass the media key to the worker
  worker.postMessage({ type: "set-key", rawKey: _mediaKeyRaw });

  // Attach the transform — worker will encrypt each outbound frame
  (sender as any).transform = new RTCRtpScriptTransform(worker, {
    type: "rtctransform",
    direction: "send",
  });
}

/**
 * Attach E2EE decryption to a receiver track.
 * Call this when a remote track arrives.
 */
export function attachReceiverE2EE(receiver: RTCRtpReceiver): void {
  if (!_mediaKeyRaw) return;
  if (!("transform" in receiver)) {
    console.warn("[e2ee] RTCRtpScriptTransform not supported on this receiver");
    return;
  }

  const worker = makeWorker();
  if (!worker) return;

  worker.postMessage({ type: "set-key", rawKey: _mediaKeyRaw });

  (receiver as any).transform = new RTCRtpScriptTransform(worker, {
    type: "rtctransform",
    direction: "receive",
  });
}

// ─── Worker factory ───────────────────────────────────────────────────────────

function makeWorker(): Worker | null {
  try {
    // Create a worker from the inline worker source
    // In production, this is a blob URL from the compiled worker bundle
    const workerSrc = getWorkerSource();
    const blob = new Blob([workerSrc], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    return new Worker(url, { type: "module" });
  } catch (e) {
    console.error("[e2ee] failed to create worker:", e);
    return null;
  }
}

/**
 * Inline worker source.
 * In a full build pipeline this would be a separate worker bundle.
 * For now it's inlined to avoid worker bundling complexity with Vite.
 */
function getWorkerSource(): string {
  return `
const MAGIC = new Uint8Array([0x56, 0x58, 0x45, 0x45]);
const IV_LENGTH = 12;
const AAD_LENGTH = 8;
let _cryptoKey = null;
let _seqSend = 0n;

self.onmessage = async (event) => {
  if (event.data.type === "set-key" && event.data.rawKey instanceof ArrayBuffer) {
    _cryptoKey = await crypto.subtle.importKey(
      "raw", event.data.rawKey,
      { name: "AES-GCM" }, false, ["encrypt", "decrypt"]
    );
  } else if (event.data.type === "rtctransform") {
    const transformer = event.data.transformer;
    const direction = event.data.direction;
    direction === "send" ? senderTransform(transformer) : receiverTransform(transformer);
  }
};

self.addEventListener("rtctransform", (event) => {
  const direction = event.transformer.options.direction;
  direction === "send"
    ? senderTransform(event.transformer)
    : receiverTransform(event.transformer);
});

async function senderTransform(transformer) {
  const reader = transformer.readable.getReader();
  const writer = transformer.writable.getWriter();
  while (true) {
    const { value: frame, done } = await reader.read();
    if (done) break;
    if (!_cryptoKey) { await writer.write(frame); continue; }
    try {
      const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
      const seq = _seqSend++;
      const aad = seqToBytes(seq);
      const payload = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: aad },
        _cryptoKey, frame.data
      );
      const out = new Uint8Array(MAGIC.length + IV_LENGTH + AAD_LENGTH + payload.byteLength);
      let offset = 0;
      out.set(MAGIC, offset); offset += MAGIC.length;
      out.set(iv, offset);    offset += IV_LENGTH;
      out.set(aad, offset);   offset += AAD_LENGTH;
      out.set(new Uint8Array(payload), offset);
      frame.data = out.buffer;
      await writer.write(frame);
    } catch(e) { /* drop frame on encrypt error */ }
  }
}

async function receiverTransform(transformer) {
  const reader = transformer.readable.getReader();
  const writer = transformer.writable.getWriter();
  while (true) {
    const { value: frame, done } = await reader.read();
    if (done) break;
    const data = new Uint8Array(frame.data);
    if (!hasVxeeMagic(data)) {
      if (!_cryptoKey) { await writer.write(frame); }
      continue;
    }
    if (!_cryptoKey) continue;
    try {
      let offset = MAGIC.length;
      const iv  = data.slice(offset, offset + IV_LENGTH);   offset += IV_LENGTH;
      const aad = data.slice(offset, offset + AAD_LENGTH);  offset += AAD_LENGTH;
      const ct  = data.slice(offset);
      const pt  = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv, additionalData: aad },
        _cryptoKey, ct
      );
      frame.data = pt;
      await writer.write(frame);
    } catch { /* wrong key / corrupted → silence */ }
  }
}

function hasVxeeMagic(data) {
  if (data.length < MAGIC.length) return false;
  return MAGIC.every((b, i) => data[i] === b);
}

function seqToBytes(seq) {
  const buf = new Uint8Array(8);
  const view = new DataView(buf.buffer);
  view.setBigUint64(0, seq, false);
  return buf;
}
`.trim();
}
