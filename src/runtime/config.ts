/**
 * Product-facing runtime config.
 *
 * We keep signaling/discovery hidden from the user.
 * There still needs to be a rendezvous layer for public-internet peers
 * to find each other and exchange ICE candidates, but that is an internal
 * transport detail — not part of the UX.
 */

/**
 * Default hidden rendezvous endpoint.
 *
 * For now this points at localhost for development.
 * Later we can switch this to a hosted default, sidecar, or registry.
 */
export const DEFAULT_SIGNAL_URL = "wss://voxel.damnfine.xyz";

/**
 * Human-friendly server nickname if the user doesn't provide one.
 */
export function deriveServerName(serverKey: string): string {
  const clean = serverKey.trim();
  if (!clean) return "Voxel Server";
  return `Server ${clean.slice(0, 6).toUpperCase()}`;
}
