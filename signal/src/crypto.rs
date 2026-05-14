/// Verify that the provided key matches the server key.
/// Simple equality check — HMAC validation happens on individual change messages.
#[allow(dead_code)]
pub fn verify_server_key(server_key: &str, provided: &str) -> bool {
    server_key == provided
}
