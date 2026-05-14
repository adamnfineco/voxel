use uuid::Uuid;

/// Generate a new app-level UUID. Called once on first launch.
pub fn generate_uuid() -> String {
    Uuid::new_v4().to_string()
}
