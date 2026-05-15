import Database from "@tauri-apps/plugin-sql";

let _db: Database | null = null;

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS identity (
    id TEXT PRIMARY KEY,
    display_name TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    server_key TEXT NOT NULL,
    signal_url TEXT NOT NULL,
    last_connected INTEGER,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL,
    parent_id TEXT,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_afk INTEGER DEFAULT 0,
    afk_timeout_seconds INTEGER DEFAULT 300,
    is_queued INTEGER DEFAULT 0,
    max_users INTEGER,
    password_hash TEXT,
    created_by TEXT,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS roles (
    server_id TEXT NOT NULL,
    peer_id TEXT NOT NULL,
    role TEXT NOT NULL,
    display_name TEXT,
    granted_by TEXT,
    granted_at INTEGER NOT NULL,
    PRIMARY KEY (server_id, peer_id)
  )`,
  `CREATE TABLE IF NOT EXISTS user_prefs (
    server_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT,
    PRIMARY KEY (server_id, key)
  )`,
  `CREATE TABLE IF NOT EXISTS app_prefs (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS muted_users (
    server_id TEXT NOT NULL,
    peer_id TEXT NOT NULL,
    muted_at INTEGER NOT NULL,
    PRIMARY KEY (server_id, peer_id)
  )`,
  `CREATE TABLE IF NOT EXISTS reserved_names (
    server_id TEXT NOT NULL,
    name TEXT NOT NULL,
    peer_id TEXT,
    reserved_at INTEGER NOT NULL,
    PRIMARY KEY (server_id, name)
  )`,
  `CREATE TABLE IF NOT EXISTS vector_clock (
    server_id TEXT NOT NULL,
    peer_id TEXT NOT NULL,
    seq INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (server_id, peer_id)
  )`,
  `CREATE TABLE IF NOT EXISTS changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id TEXT NOT NULL,
    peer_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    timestamp INTEGER NOT NULL,
    change_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    hmac TEXT NOT NULL,
    applied INTEGER DEFAULT 1
  )`,
];

export async function getDb(): Promise<Database> {
  if (_db) return _db;
  _db = await Database.load("sqlite:voxel.db");
  // Run migrations
  for (const sql of MIGRATIONS) {
    await _db.execute(sql);
  }
  return _db;
}

// ─── App prefs ────────────────────────────────────────────────────────────────

export async function getAppPref(key: string): Promise<string | null> {
  const rows = await query<{ value: string }>(
    "SELECT value FROM app_prefs WHERE key = ?",
    [key]
  );
  return rows.length > 0 ? rows[0].value : null;
}

export async function setAppPref(key: string, value: string): Promise<void> {
  await execute(
    "INSERT OR REPLACE INTO app_prefs (key, value) VALUES (?, ?)",
    [key, value]
  );
}

// Generic query helpers
export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const db = await getDb();
  // tauri-plugin-sql select returns T[] — cast to satisfy strict TS
  return db.select<T[]>(sql, params) as unknown as T[];
}

export async function execute(sql: string, params: unknown[] = []): Promise<void> {
  const db = await getDb();
  await db.execute(sql, params);
}
