use std::sync::Arc;

use dashmap::DashMap;
use futures_util::{SinkExt, StreamExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc;
use tokio_tungstenite::{accept_async, tungstenite::Message};
use tracing::{info, warn, error, debug};

// ─── Constants ────────────────────────────────────────────────────────────────

/// Max peers per room (enforced server-side)
const MAX_PEERS_PER_ROOM: usize = 14;

/// Max raw WebSocket message size in bytes (64 KB for signal, 128 KB for gossip)
const MAX_SIGNAL_MSG_BYTES: usize = 64 * 1024;
const MAX_GOSSIP_MSG_BYTES: usize = 128 * 1024;

/// Max display name length
const MAX_NAME_LEN: usize = 48;

/// Max server_id / peer_id length
const MAX_ID_LEN: usize = 64;

// ─── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
struct PeerInfo {
    peer_id: String,
    display_name: String,
    channel_id: Option<String>,
    tx: mpsc::UnboundedSender<Message>,
}

// server_id → (peer_id → PeerInfo)
type ServerRoom = Arc<DashMap<String, PeerInfo>>;
type Rooms = Arc<DashMap<String, ServerRoom>>;

#[derive(Debug, PartialEq)]
enum ConnectionKind {
    Signal,
    Gossip,
}

// ─── Entry ────────────────────────────────────────────────────────────────────

pub async fn run(addr: &str) {
    let listener = TcpListener::bind(addr).await.expect("Failed to bind");
    let rooms: Rooms = Arc::new(DashMap::new());

    info!("Listening on ws://{}", addr);

    while let Ok((stream, remote_addr)) = listener.accept().await {
        let rooms = Arc::clone(&rooms);
        tokio::spawn(async move {
            if let Err(e) = handle_connection(stream, rooms, remote_addr.to_string()).await {
                // Only log errors that aren't normal disconnects
                let msg = e.to_string();
                if !msg.contains("Connection closed") && !msg.contains("No initial message") {
                    error!("Connection error from {}: {}", remote_addr, e);
                }
            }
        });
    }
}

// ─── Connection handler ───────────────────────────────────────────────────────

async fn handle_connection(
    stream: TcpStream,
    rooms: Rooms,
    remote: String,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let ws_stream = accept_async(stream).await?;
    let (mut ws_sender, mut ws_receiver) = ws_stream.split();

    // First message: identifies the connection type + peer
    let first = ws_receiver.next().await.ok_or("No initial message")??;

    let text = match &first {
        Message::Text(t) => t.as_str().to_owned(),
        _ => return Err("Expected text for handshake".into()),
    };

    if text.len() > MAX_SIGNAL_MSG_BYTES {
        return Err("Handshake too large".into());
    }

    let init: serde_json::Value = serde_json::from_str(&text)?;

    // Extract and validate fields
    let conn_type_str = init["type"].as_str().unwrap_or("");
    let kind = match conn_type_str {
        "join"         => ConnectionKind::Signal,
        "sync_request" => ConnectionKind::Gossip,
        other => {
            warn!("Unknown connection type '{}' from {}", other, remote);
            return Err(format!("Unknown connection type: {}", other).into());
        }
    };

    let server_id = validated_id(init["serverId"].as_str(), "serverId")?;
    // Gossip messages use "peerId" instead of "from" for identification
    let peer_id = {
        let from_val = init["from"].as_str().or_else(|| init["peerId"].as_str());
        validated_id(from_val, "from/peerId")?
    };

    // Validate/sanitize display name
    let raw_name = init["displayName"].as_str().unwrap_or(&peer_id[..8.min(peer_id.len())]);
    let display_name = sanitize_name(raw_name);

    debug!("[{}] {:?} peer={} server={}", remote, kind, &peer_id[..8.min(peer_id.len())], &server_id[..8.min(server_id.len())]);

    // Get or create room
    let room: ServerRoom = rooms
        .entry(server_id.clone())
        .or_insert_with(|| Arc::new(DashMap::new()))
        .clone();

    // TX channel for outbound messages to this peer
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();

    // ── Signal connection ──────────────────────────────────────────────────

    if kind == ConnectionKind::Signal {
        // Enforce peer cap
        if room.len() >= MAX_PEERS_PER_ROOM {
            let msg = serde_json::json!({
                "type": "error",
                "message": format!("Server full (max {} peers)", MAX_PEERS_PER_ROOM),
                "serverId": server_id,
            });
            let _ = tx.send(Message::Text(serde_json::to_string(&msg)?.into()));
            return Err("Room full".into());
        }

        // Name deduplication: reject if taken
        let name_taken = room.iter().any(|e| {
            e.display_name.to_lowercase() == display_name.to_lowercase()
        });

        if name_taken {
            let msg = serde_json::json!({
                "type": "name_taken",
                "serverId": server_id,
            });
            let _ = ws_sender.send(Message::Text(serde_json::to_string(&msg)?.into())).await;
            return Err(format!("Name '{}' already taken", display_name).into());
        }

        info!("SIGNAL peer '{}' joined server {} from {}", display_name, &server_id[..8.min(server_id.len())], remote);

        // Build peer list snapshot for new peer
        let peer_list: Vec<serde_json::Value> = room.iter()
            .map(|e| serde_json::json!({
                "peerId":      e.peer_id,
                "displayName": e.display_name,
                "channelId":   e.channel_id,
            }))
            .collect();

        // Register peer
        room.insert(peer_id.clone(), PeerInfo {
            peer_id: peer_id.clone(),
            display_name: display_name.clone(),
            channel_id: None,
            tx: tx.clone(),
        });

        // Send peer list to newcomer
        let peer_list_msg = serde_json::json!({
            "type":     "peer_list",
            "from":     "server",
            "serverId": server_id,
            "names":    peer_list,
        });
        let _ = tx.send(Message::Text(serde_json::to_string(&peer_list_msg)?.into()));

        // Notify existing peers
        broadcast_except(&room, &peer_id, &serde_json::json!({
            "type":        "peer_joined",
            "from":        peer_id,
            "serverId":    server_id,
            "displayName": display_name,
        }));

        // Spawn outbound sender task
        tokio::spawn(async move {
            while let Some(msg) = rx.recv().await {
                if ws_sender.send(msg).await.is_err() { break; }
            }
        });

        // Process incoming messages
        while let Some(Ok(msg)) = ws_receiver.next().await {
            match msg {
                Message::Text(text) => {
                    if text.len() > MAX_SIGNAL_MSG_BYTES {
                        warn!("[signal] oversized message from {}, discarding", &peer_id[..8.min(peer_id.len())]);
                        continue;
                    }
                    match serde_json::from_str::<serde_json::Value>(&text) {
                        Ok(val) => route_signal(&room, &peer_id, &server_id, val).await,
                        Err(_)  => debug!("[signal] bad JSON from {}", &peer_id[..8.min(peer_id.len())]),
                    }
                }
                Message::Ping(data) => {
                    if let Some(p) = room.get(&peer_id) {
                        let _ = p.tx.send(Message::Pong(data));
                    }
                }
                Message::Close(_) => break,
                _ => {}
            }
        }

        // Cleanup
        info!("SIGNAL peer '{}' left server {}", display_name, &server_id[..8.min(server_id.len())]);
        room.remove(&peer_id);

        broadcast_except(&room, &peer_id, &serde_json::json!({
            "type":        "peer_left",
            "from":        peer_id,
            "serverId":    server_id,
            "displayName": display_name,
        }));

    // ── Gossip connection ──────────────────────────────────────────────────

    } else {
        debug!("GOSSIP peer {} joined server {}", &peer_id[..8.min(peer_id.len())], &server_id[..8.min(server_id.len())]);

        // Gossip peers are NOT registered in the room (room = signal peers only)
        // They use a separate tracking map per-server stored locally
        // For now: just relay gossip messages to signal peers in the same server

        // Send the initial sync_request to all signal peers so they can respond
        broadcast_except(&room, &peer_id, &serde_json::from_str::<serde_json::Value>(&text).unwrap_or_default());

        // Spawn sender
        tokio::spawn(async move {
            while let Some(msg) = rx.recv().await {
                if ws_sender.send(msg).await.is_err() { break; }
            }
        });

        // For gossip: we relay messages from non-signal peers to signal peers
        // We need to add the gossip tx to the room temporarily for reply routing
        room.insert(format!("gossip:{}", peer_id), PeerInfo {
            peer_id: format!("gossip:{}", peer_id),
            display_name: String::new(),
            channel_id: None,
            tx: tx.clone(),
        });

        while let Some(Ok(msg)) = ws_receiver.next().await {
            match msg {
                Message::Text(text) => {
                    if text.len() > MAX_GOSSIP_MSG_BYTES {
                        warn!("[gossip] oversized message from {}, discarding", &peer_id[..8.min(peer_id.len())]);
                        continue;
                    }
                    match serde_json::from_str::<serde_json::Value>(&text) {
                        Ok(val) => route_gossip(&room, &peer_id, val).await,
                        Err(_)  => {}
                    }
                }
                Message::Ping(data) => {
                    if let Some(p) = room.get(&format!("gossip:{}", peer_id)) {
                        let _ = p.tx.send(Message::Pong(data));
                    }
                }
                Message::Close(_) => break,
                _ => {}
            }
        }

        room.remove(&format!("gossip:{}", peer_id));
        debug!("GOSSIP peer {} left server {}", &peer_id[..8.min(peer_id.len())], &server_id[..8.min(server_id.len())]);
    }

    // Clean up empty rooms
    if room.is_empty() {
        rooms.remove(&server_id);
    }

    Ok(())
}

// ─── Signal message routing ───────────────────────────────────────────────────

async fn route_signal(
    room: &ServerRoom,
    from_id: &str,
    server_id: &str,
    val: serde_json::Value,
) {
    let msg_type = val["type"].as_str().unwrap_or("");

    match msg_type {
        // Direct: route to specific peer
        "offer" | "answer" | "ice" => {
            if let Some(to) = val["to"].as_str() {
                send_to_peer(room, to, &val);
            }
        }

        // Broadcast: channel state change
        "channel_change" => {
            // Update channel in room state
            let channel_id = val["channelId"].as_str().map(|s| s.to_string());
            if let Some(mut p) = room.get_mut(from_id) {
                p.channel_id = channel_id;
            }
            broadcast_except(room, from_id, &val);
        }

        // Ping → pong
        "ping" => {
            let pong = serde_json::json!({
                "type":     "pong",
                "from":     "server",
                "serverId": server_id,
            });
            if let Some(p) = room.get(from_id) {
                let _ = p.tx.send(Message::Text(
                    serde_json::to_string(&pong).unwrap_or_default().into()
                ));
            }
        }

        "join" => {
            // Re-join after reconnect — just acknowledge with peer list
            let peer_list: Vec<serde_json::Value> = room.iter()
                .filter(|e| e.peer_id != from_id)
                .map(|e| serde_json::json!({
                    "peerId":      e.peer_id,
                    "displayName": e.display_name,
                    "channelId":   e.channel_id,
                }))
                .collect();

            let msg = serde_json::json!({
                "type":     "peer_list",
                "from":     "server",
                "serverId": server_id,
                "names":    peer_list,
            });
            if let Some(p) = room.get(from_id) {
                let _ = p.tx.send(Message::Text(
                    serde_json::to_string(&msg).unwrap_or_default().into()
                ));
            }
        }

        other => {
            debug!("[signal] unhandled type '{}' from {}", other, &from_id[..8.min(from_id.len())]);
        }
    }
}

// ─── Gossip message routing ───────────────────────────────────────────────────

async fn route_gossip(
    room: &ServerRoom,
    from_gossip_id: &str,
    val: serde_json::Value,
) {
    let msg_type = val["type"].as_str().unwrap_or("");
    let from_key = format!("gossip:{}", from_gossip_id);

    match msg_type {
        "change" | "sync_request" | "sync_response" => {
            // Relay to all peers (signal + gossip) except sender
            broadcast_except(room, &from_key, &val);
        }
        "ping" => {
            // Just ignore gossip pings — the client handles heartbeat
        }
        other => {
            debug!("[gossip] unhandled type '{}' from {}", other, &from_gossip_id[..8.min(from_gossip_id.len())]);
        }
    }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

fn send_to_peer(room: &ServerRoom, peer_id: &str, msg: &serde_json::Value) {
    if let Some(peer) = room.get(peer_id) {
        if let Ok(text) = serde_json::to_string(msg) {
            let _ = peer.tx.send(Message::Text(text.into()));
        }
    }
}

fn broadcast_except(room: &ServerRoom, exclude_id: &str, msg: &serde_json::Value) {
    if let Ok(text) = serde_json::to_string(msg) {
        for entry in room.iter() {
            if entry.peer_id != exclude_id {
                let _ = entry.tx.send(Message::Text(text.clone().into()));
            }
        }
    }
}

fn validated_id<'a>(val: Option<&'a str>, field: &str) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    match val {
        Some(s) if !s.is_empty() && s.len() <= MAX_ID_LEN => {
            // Allow UUID chars + hyphens only
            if s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
                Ok(s.to_string())
            } else {
                Err(format!("Invalid characters in {}", field).into())
            }
        }
        Some(s) if s.is_empty() => Err(format!("{} is empty", field).into()),
        Some(_)                  => Err(format!("{} too long", field).into()),
        None                     => Err(format!("{} missing", field).into()),
    }
}

fn sanitize_name(raw: &str) -> String {
    // Trim, collapse whitespace, enforce max length, strip control chars
    let cleaned: String = raw
        .chars()
        .filter(|c| !c.is_control())
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");

    if cleaned.is_empty() {
        "anon".to_string()
    } else {
        cleaned[..cleaned.len().min(MAX_NAME_LEN)].to_string()
    }
}
