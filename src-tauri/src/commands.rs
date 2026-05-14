use serde::{Deserialize, Serialize};

use crate::identity::generate_uuid;
use crate::crypto;
use crate::sidecar;
use tauri::AppHandle;

// ─── Sidecar Commands ─────────────────────────────────────────────────────────

/// Start the embedded voxel-signal sidecar. Returns the ws:// URL.
#[tauri::command]
pub fn start_sidecar(app: AppHandle) -> Result<String, String> {
    sidecar::start_sidecar(&app)
}

/// Stop the embedded voxel-signal sidecar.
#[tauri::command]
pub fn stop_sidecar() -> bool {
    sidecar::stop_sidecar();
    true
}

// ─── Types ───────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Identity {
    pub id: String,
    pub display_name: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Server {
    pub id: String,
    pub name: String,
    pub server_key: String,
    pub signal_url: String,
    pub last_connected: Option<i64>,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Channel {
    pub id: String,
    pub server_id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub sort_order: i64,
    pub is_afk: bool,
    pub afk_timeout_seconds: i64,
    pub is_queued: bool,
    pub max_users: Option<i64>,
    pub password_hash: Option<String>,
    pub created_by: Option<String>,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Role {
    pub server_id: String,
    pub peer_id: String,
    pub role: String,
    pub display_name: Option<String>,
    pub granted_by: Option<String>,
    pub granted_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Change {
    pub server_id: String,
    pub peer_id: String,
    pub seq: i64,
    pub timestamp: i64,
    pub change_type: String,
    pub payload: String,
    pub hmac: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct SignedChange {
    pub hmac: String,
}

// ─── Identity Commands ────────────────────────────────────────────────────────

/// Returns the existing identity or generates a new one.
/// The frontend passes in the DB-loaded identity (or null).
#[tauri::command]
pub fn get_or_create_identity(existing: Option<Identity>) -> Identity {
    if let Some(id) = existing {
        return id;
    }
    Identity {
        id: generate_uuid(),
        display_name: None,
        created_at: chrono::Utc::now().timestamp_millis(),
    }
}

// ─── Server Commands ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_servers() -> Vec<Server> {
    // Actual DB ops handled from frontend via tauri-plugin-sql
    // These commands provide Rust-side logic/validation
    vec![]
}

#[tauri::command]
pub fn add_server(
    name: String,
    server_key: String,
    signal_url: String,
) -> Server {
    Server {
        id: generate_uuid(),
        name,
        server_key,
        signal_url,
        last_connected: None,
        created_at: chrono::Utc::now().timestamp_millis(),
    }
}

#[tauri::command]
pub fn remove_server(_server_id: String) -> bool {
    true
}

#[tauri::command]
pub fn update_server_last_connected(_server_id: String) -> i64 {
    chrono::Utc::now().timestamp_millis()
}

// ─── Channel Commands ─────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_channels(_server_id: String) -> Vec<Channel> {
    vec![]
}

#[tauri::command]
pub fn create_channel(
    server_id: String,
    parent_id: Option<String>,
    name: String,
    is_afk: bool,
    afk_timeout_seconds: i64,
    is_queued: bool,
    max_users: Option<i64>,
    created_by: String,
) -> Channel {
    Channel {
        id: generate_uuid(),
        server_id,
        parent_id,
        name,
        sort_order: 0,
        is_afk,
        afk_timeout_seconds,
        is_queued,
        max_users,
        password_hash: None,
        created_by: Some(created_by),
        updated_at: chrono::Utc::now().timestamp_millis(),
    }
}

#[tauri::command]
pub fn update_channel(_channel: Channel) -> bool {
    true
}

#[tauri::command]
pub fn delete_channel(_channel_id: String) -> bool {
    true
}

// ─── Role Commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_role(_server_id: String, _peer_id: String) -> Option<Role> {
    None
}

#[tauri::command]
pub fn set_role(
    server_id: String,
    peer_id: String,
    role: String,
    display_name: Option<String>,
    granted_by: String,
) -> Role {
    Role {
        server_id,
        peer_id,
        role,
        display_name,
        granted_by: Some(granted_by),
        granted_at: chrono::Utc::now().timestamp_millis(),
    }
}

#[tauri::command]
pub fn list_roles(_server_id: String) -> Vec<Role> {
    vec![]
}

// ─── Mute Commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn mute_user(_server_id: String, _peer_id: String) -> i64 {
    chrono::Utc::now().timestamp_millis()
}

#[tauri::command]
pub fn unmute_user(_server_id: String, _peer_id: String) -> bool {
    true
}

#[tauri::command]
pub fn is_muted(_server_id: String, _peer_id: String) -> bool {
    false
}

#[tauri::command]
pub fn list_muted(_server_id: String) -> Vec<String> {
    vec![]
}

// ─── Prefs Commands ───────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_pref(_server_id: String, _key: String) -> Option<String> {
    None
}

#[tauri::command]
pub fn set_pref(_server_id: String, _key: String, _value: String) -> bool {
    true
}

#[tauri::command]
pub fn get_app_pref(_key: String) -> Option<String> {
    None
}

#[tauri::command]
pub fn set_app_pref(_key: String, _value: String) -> bool {
    true
}

// ─── Crypto Commands ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn sign_change(server_key: String, payload: String) -> String {
    crypto::sign(&server_key, &payload)
}

#[tauri::command]
pub fn verify_change(server_key: String, payload: String, hmac: String) -> bool {
    crypto::verify(&server_key, &payload, &hmac)
}

// ─── Vector Clock Commands ────────────────────────────────────────────────────

#[tauri::command]
pub fn get_vector_clock(_server_id: String, _peer_id: String) -> i64 {
    0
}

#[tauri::command]
pub fn update_vector_clock(_server_id: String, _peer_id: String, _seq: i64) -> bool {
    true
}

// ─── Change Log Commands ──────────────────────────────────────────────────────

#[tauri::command]
pub fn save_change(_change: Change) -> bool {
    true
}

#[tauri::command]
pub fn get_changes_since(_server_id: String, _peer_id: String, _since_seq: i64) -> Vec<Change> {
    vec![]
}

// ─── Reserved Names ───────────────────────────────────────────────────────────

#[tauri::command]
pub fn reserve_name(_server_id: String, _name: String, _peer_id: Option<String>) -> bool {
    true
}

#[tauri::command]
pub fn list_reserved_names(_server_id: String) -> Vec<String> {
    vec![]
}
