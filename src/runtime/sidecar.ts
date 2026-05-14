/**
 * Sidecar manager (frontend side).
 *
 * Tries to reach the default rendezvous endpoint. If unreachable,
 * asks the Tauri backend to spawn the embedded voxel-signal sidecar
 * on a local port and returns that URL instead.
 *
 * This enables true zero-config: if no hosted rendezvous exists,
 * the first peer auto-hosts it locally (ADR-011).
 */

import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_SIGNAL_URL } from "./config";

const PROBE_TIMEOUT_MS = 2000;

/**
 * Probe whether a WebSocket server is reachable at the given URL.
 * Returns true if connectable within timeout.
 */
async function isReachable(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) { resolved = true; resolve(false); }
    }, PROBE_TIMEOUT_MS);

    try {
      const ws = new WebSocket(url);
      ws.onopen = () => {
        ws.close();
        if (!resolved) { resolved = true; clearTimeout(timer); resolve(true); }
      };
      ws.onerror = () => {
        if (!resolved) { resolved = true; clearTimeout(timer); resolve(false); }
      };
      ws.onclose = (evt) => {
        // Some servers close immediately — if we got a connection at all, count it
        if (!resolved && evt.code !== 1006) {
          resolved = true; clearTimeout(timer); resolve(true);
        }
      };
    } catch {
      if (!resolved) { resolved = true; clearTimeout(timer); resolve(false); }
    }
  });
}

let _sidecarUrl: string | null = null;

// Check at call time — Tauri injects __TAURI_INTERNALS__ asynchronously
// so reading at module load time is always false.
function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Get the rendezvous URL to use.
 * Tries DEFAULT_SIGNAL_URL first; if unreachable, starts the sidecar.
 */
export async function getRendezvousUrl(): Promise<string> {
  // First check if the default endpoint is reachable
  const defaultReachable = await isReachable(DEFAULT_SIGNAL_URL);
  if (defaultReachable) {
    return DEFAULT_SIGNAL_URL;
  }

  // If not in Tauri, we can't start the sidecar
  if (!isTauri()) {
    console.warn("[sidecar] default rendezvous unreachable and no Tauri runtime");
    return DEFAULT_SIGNAL_URL; // fallback — connection will fail with an error
  }

  // Start the embedded sidecar
  if (_sidecarUrl) {
    // Already running — verify it's still up
    const stillUp = await isReachable(_sidecarUrl);
    if (stillUp) return _sidecarUrl;
    _sidecarUrl = null; // dead — restart
  }

  try {
    console.info("[sidecar] starting embedded voxel-signal...");
    const url = await invoke<string>("start_sidecar");
    _sidecarUrl = url;

    // Poll until the sidecar is actually accepting connections (max 3s)
    let ready = false;
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 250));
      ready = await isReachable(url);
      if (ready) break;
    }

    if (!ready) {
      console.warn("[sidecar] started but not reachable after 3s");
    } else {
      console.info("[sidecar] ready at", url);
    }

    return url;
  } catch (e) {
    console.error("[sidecar] failed to start:", e);
    return DEFAULT_SIGNAL_URL;
  }
}

/** Stop the sidecar when disconnecting. */
export async function stopSidecar(): Promise<void> {
  if (!isTauri() || !_sidecarUrl) return;
  try {
    await invoke("stop_sidecar");
    _sidecarUrl = null;
  } catch (e) {
    console.warn("[sidecar] stop error:", e);
  }
}

export function getSidecarUrl(): string | null {
  return _sidecarUrl;
}
