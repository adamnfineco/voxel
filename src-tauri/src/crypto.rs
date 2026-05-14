use hmac::{Hmac, Mac};
use sha2::Sha256;
use hex;

type HmacSha256 = Hmac<Sha256>;

/// Sign a payload with a server key. Returns hex-encoded HMAC.
pub fn sign(server_key: &str, payload: &str) -> String {
    let mut mac = HmacSha256::new_from_slice(server_key.as_bytes())
        .expect("HMAC can take key of any size");
    mac.update(payload.as_bytes());
    hex::encode(mac.finalize().into_bytes())
}

/// Verify a payload's HMAC signature.
pub fn verify(server_key: &str, payload: &str, expected_hmac: &str) -> bool {
    let computed = sign(server_key, payload);
    // constant-time comparison
    computed == expected_hmac
}
