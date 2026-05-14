import { query, execute } from "./db";

export interface Identity {
  id: string;
  display_name: string | null;
  created_at: number;
}

function generateUUID(): string {
  return crypto.randomUUID();
}

export async function getOrCreateIdentity(): Promise<Identity> {
  const rows = await query<Identity>("SELECT * FROM identity LIMIT 1");
  if (rows.length > 0) return rows[0];

  const id: Identity = {
    id: generateUUID(),
    display_name: null,
    created_at: Date.now(),
  };

  await execute(
    "INSERT INTO identity (id, display_name, created_at) VALUES (?, ?, ?)",
    [id.id, id.display_name, id.created_at]
  );

  return id;
}

export async function setDisplayName(name: string): Promise<void> {
  await execute("UPDATE identity SET display_name = ?", [name]);
}

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
