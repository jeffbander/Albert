import { createClient, Client } from '@libsql/client';

let dbClient: Client | null = null;

function getDb(): Client {
  if (!dbClient) {
    dbClient = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return dbClient;
}

export async function initDatabase() {
  const db = getDb();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      duration_seconds INTEGER,
      summary TEXT
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS echo_self (
      id TEXT PRIMARY KEY,
      key TEXT UNIQUE,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export async function getLastConversation() {
  const db = getDb();
  const result = await db.execute(
    'SELECT * FROM conversations ORDER BY ended_at DESC LIMIT 1'
  );
  return result.rows[0] || null;
}

export async function createConversation(id: string) {
  const db = getDb();
  await db.execute({
    sql: 'INSERT INTO conversations (id) VALUES (?)',
    args: [id],
  });
}

export async function endConversation(id: string, durationSeconds: number, summary?: string) {
  const db = getDb();
  await db.execute({
    sql: 'UPDATE conversations SET ended_at = CURRENT_TIMESTAMP, duration_seconds = ?, summary = ? WHERE id = ?',
    args: [durationSeconds, summary || null, id],
  });
}

export async function getEchoSelf(key: string) {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT value FROM echo_self WHERE key = ?',
    args: [key],
  });
  return result.rows[0]?.value as string | null;
}

export async function setEchoSelf(key: string, value: string) {
  const db = getDb();
  const id = crypto.randomUUID();
  await db.execute({
    sql: `INSERT INTO echo_self (id, key, value, updated_at)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP`,
    args: [id, key, value, value],
  });
}

export default getDb;
