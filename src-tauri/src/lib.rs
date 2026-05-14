mod commands;
mod identity;
mod db;
mod tray;
mod crypto;
pub mod sidecar;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_websocket::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Set up tray icon (always present in menu bar)
            tray::setup_tray(app)?;

            // Show window on first launch
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }

            // DB init
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = db::ensure_initialized(&app_handle).await {
                    log::error!("DB init error: {}", e);
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::start_sidecar,
            commands::stop_sidecar,
            commands::get_or_create_identity,
            commands::list_servers,
            commands::add_server,
            commands::remove_server,
            commands::update_server_last_connected,
            commands::list_channels,
            commands::create_channel,
            commands::update_channel,
            commands::delete_channel,
            commands::get_role,
            commands::set_role,
            commands::list_roles,
            commands::mute_user,
            commands::unmute_user,
            commands::is_muted,
            commands::list_muted,
            commands::get_pref,
            commands::set_pref,
            commands::get_app_pref,
            commands::set_app_pref,
            commands::sign_change,
            commands::verify_change,
            commands::get_vector_clock,
            commands::update_vector_clock,
            commands::save_change,
            commands::get_changes_since,
            commands::reserve_name,
            commands::list_reserved_names,
        ])
        .run(tauri::generate_context!())
        .expect("error while running voxel");
}
