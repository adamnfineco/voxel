/**
 * Sidecar manager — spawns voxel-signal as an embedded subprocess
 * when no external rendezvous server is reachable.
 *
 * The voxel-signal binary is bundled inside the app at
 * src-tauri/binaries/voxel-signal-<target-triple>.
 *
 * Lifecycle:
 *   start_sidecar()  — spawn on a random available port, return ws:// URL
 *   stop_sidecar()   — kill the sidecar process
 *
 * The sidecar is killed when the app exits (via Drop on the command handle).
 */
use std::sync::Mutex;
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandChild;

/// Global sidecar process handle
pub static SIDECAR: Mutex<Option<CommandChild>> = Mutex::new(None);

/// Find an available local port
fn find_available_port() -> u16 {
    use std::net::TcpListener;
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind to find port");
    listener.local_addr().unwrap().port()
}

/// Start voxel-signal sidecar on an available port.
/// Returns the WebSocket URL (ws://127.0.0.1:<port>).
pub fn start_sidecar(app: &AppHandle) -> Result<String, String> {
    let port = find_available_port();
    let bind_addr = format!("127.0.0.1:{}", port);
    let ws_url = format!("ws://127.0.0.1:{}", port);

    log::info!("Starting voxel-signal sidecar on {}", bind_addr);

    let (_rx, child) = app
        .shell()
        .sidecar("voxel-signal")
        .map_err(|e| format!("Failed to create sidecar: {}", e))?
        .env("BIND_ADDR", &bind_addr)
        .env("RUST_LOG", "info")
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar: {}", e))?;

    let mut lock = SIDECAR.lock().unwrap();
    // Kill any existing sidecar first
    if let Some(old) = lock.take() {
        let _ = old.kill();
    }
    *lock = Some(child);

    Ok(ws_url)
}

/// Stop the sidecar process.
pub fn stop_sidecar() {
    let mut lock = SIDECAR.lock().unwrap();
    if let Some(child) = lock.take() {
        let _ = child.kill();
        log::info!("voxel-signal sidecar stopped");
    }
}
