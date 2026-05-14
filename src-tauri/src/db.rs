use tauri::AppHandle;

/// Ensures the SQLite database is initialized with migrations.
/// The actual migration SQL is run via tauri-plugin-sql from the frontend,
/// but this is the Rust-side hook for any startup logic.
pub async fn ensure_initialized(_app: &AppHandle) -> Result<(), String> {
    // tauri-plugin-sql handles migrations via the frontend load() call
    // This function is a placeholder for future Rust-side DB startup logic
    log::info!("DB initialization hook called");
    Ok(())
}
