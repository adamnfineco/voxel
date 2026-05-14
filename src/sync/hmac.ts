/**
 * HMAC-SHA256 signing/verification using Web Crypto API.
 * Used to authenticate changes broadcast over the gossip network.
 */

async function importKey(serverKey: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(serverKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function signPayload(serverKey: string, payload: string): Promise<string> {
  const key = await importKey(serverKey);
  const enc = new TextEncoder();
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyPayload(
  serverKey: string,
  payload: string,
  hmacHex: string
): Promise<boolean> {
  const computed = await signPayload(serverKey, payload);
  return computed === hmacHex;
}
