-- Local identity (generated on first launch)
CREATE TABLE IF NOT EXISTS identity (
  id TEXT PRIMARY KEY,
  display_name TEXT,
  created_at INTEGER NOT NULL
);

-- Servers you've joined
CREATE TABLE IF NOT EXISTS servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  server_key TEXT NOT NULL,
  signal_url TEXT NOT NULL,
  last_connected INTEGER,
  created_at INTEGER NOT NULL
);

-- Channels per server
CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES channels(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_afk INTEGER DEFAULT 0,
  afk_timeout_seconds INTEGER DEFAULT 300,
  is_queued INTEGER DEFAULT 0,
  max_users INTEGER,
  password_hash TEXT,
  created_by TEXT,
  updated_at INTEGER NOT NULL,
  UNIQUE(server_id, name, parent_id)
);

-- Default lobby channel inserted when server is created
-- (handled in app logic)

-- Roles per server
CREATE TABLE IF NOT EXISTS roles (
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  peer_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'member')),
  display_name TEXT,
  granted_by TEXT,
  granted_at INTEGER NOT NULL,
  PRIMARY KEY (server_id, peer_id)
);

-- User preferences per server
CREATE TABLE IF NOT EXISTS user_prefs (
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT,
  PRIMARY KEY (server_id, key)
);

-- Global app preferences (not server-specific)
CREATE TABLE IF NOT EXISTS app_prefs (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Muted users (persistent per server)
CREATE TABLE IF NOT EXISTS muted_users (
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  peer_id TEXT NOT NULL,
  muted_at INTEGER NOT NULL,
  PRIMARY KEY (server_id, peer_id)
);

-- Reserved names per server (owner feature)
CREATE TABLE IF NOT EXISTS reserved_names (
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  peer_id TEXT,
  reserved_at INTEGER NOT NULL,
  PRIMARY KEY (server_id, name)
);

-- Vector clock state
CREATE TABLE IF NOT EXISTS vector_clock (
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  peer_id TEXT NOT NULL,
  seq INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (server_id, peer_id)
);

-- Change log (for sync)
CREATE TABLE IF NOT EXISTS changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  peer_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  change_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  hmac TEXT NOT NULL,
  applied INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_changes_server_seq ON changes(server_id, peer_id, seq);
CREATE INDEX IF NOT EXISTS idx_channels_server ON channels(server_id);
