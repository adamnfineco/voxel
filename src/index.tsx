import { render } from "solid-js/web";
import App from "./App";
import "./styles/pixel.css";

function reportFatal(message: string) {
  console.error("[voxel fatal]", message);
  const existing = document.getElementById("voxel-fatal");
  if (existing) {
    existing.textContent = message;
    return;
  }

  const el = document.createElement("div");
  el.id = "voxel-fatal";
  el.style.position = "fixed";
  el.style.inset = "0";
  el.style.background = "#09090b";
  el.style.color = "#e8f0f8";
  el.style.padding = "16px";
  el.style.fontFamily = "monospace";
  el.style.fontSize = "12px";
  el.style.whiteSpace = "pre-wrap";
  el.style.zIndex = "999999";
  el.textContent = `Voxel fatal error\n\n${message}`;
  document.body.appendChild(el);
}

window.addEventListener("error", (event) => {
  reportFatal(`${event.message}\n${event.filename}:${event.lineno}:${event.colno}`);
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason instanceof Error
    ? `${event.reason.message}\n${event.reason.stack ?? ""}`
    : String(event.reason);
  reportFatal(`Unhandled promise rejection\n\n${reason}`);
});

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

render(() => <App />, root);

/**
 * Browser-safe Tauri window wiring.
 * We dynamically import Tauri APIs only when running inside Tauri.
 * This avoids a blank/black UI in plain browser preview or early webview init.
 */
async function installWindowCloseHandler() {
  // Detect Tauri runtime safely
  const hasTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  if (!hasTauri) return;

  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    await win.onCloseRequested((event) => {
      event.preventDefault();
      win.hide();
    });
  } catch (e) {
    console.warn("[voxel] could not install close handler:", e);
  }
}

// Delay to allow Tauri injection to be ready before touching APIs
queueMicrotask(() => {
  installWindowCloseHandler();
});
