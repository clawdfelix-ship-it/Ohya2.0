import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

export type SqlValue = string | number | bigint | null | Uint8Array;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS login_codes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  owner_name TEXT,
  invite TEXT,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  used INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  platform TEXT,
  intro TEXT,
  token TEXT UNIQUE,
  avatar_hidden INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER,
  checkin_minutes INTEGER,
  wake_kind TEXT,
  wake_url TEXT,
  wake_secret TEXT,
  wake_enabled INTEGER NOT NULL DEFAULT 1,
  wake_disabled_reason TEXT,
  wake_fail_streak INTEGER NOT NULL DEFAULT 0,
  wake_last_at INTEGER,
  wake_last_test TEXT
);
CREATE INDEX IF NOT EXISTS idx_members_user ON members(user_id);

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT '',
  rules TEXT,
  category TEXT NOT NULL DEFAULT 'other',
  visibility TEXT NOT NULL DEFAULT 'link',
  kind TEXT NOT NULL DEFAULT 'group',
  join_question TEXT,
  owner_member_id TEXT NOT NULL,
  allow_same_name INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  dissolved INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  added_by_member_id TEXT,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (group_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_group_members_member ON group_members(member_id);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  member_id TEXT,
  type TEXT NOT NULL DEFAULT 'text',
  text TEXT NOT NULL DEFAULT '',
  mentions TEXT NOT NULL DEFAULT '[]',
  reply_to_seq INTEGER,
  op_key TEXT,
  created_at INTEGER NOT NULL,
  recalled INTEGER NOT NULL DEFAULT 0,
  UNIQUE (group_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_messages_group ON messages(group_id, seq);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  data BLOB
);
CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id);

CREATE TABLE IF NOT EXISTS reads (
  group_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  last_read_seq INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (group_id, member_id)
);

CREATE TABLE IF NOT EXISTS friendships (
  id TEXT PRIMARY KEY,
  a_member_id TEXT NOT NULL,
  b_member_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (a_member_id, b_member_id)
);

CREATE TABLE IF NOT EXISTS friend_requests (
  id TEXT PRIMARY KEY,
  from_member_id TEXT NOT NULL,
  to_member_id TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_friend_requests_to ON friend_requests(to_member_id, status);

CREATE TABLE IF NOT EXISTS invites (
  code TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  group_id TEXT,
  creator_member_id TEXT,
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  used_at INTEGER
);

CREATE TABLE IF NOT EXISTS pairing_codes (
  code TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  group_id TEXT,
  reclaim_member_id TEXT,
  expires_at INTEGER NOT NULL,
  max_uses INTEGER NOT NULL DEFAULT 10,
  uses INTEGER NOT NULL DEFAULT 0,
  reclaim_used INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cards (
  code TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS inbox_seen (
  member_id TEXT PRIMARY KEY,
  last_notice_id INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS wake_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  ok INTEGER NOT NULL DEFAULT 0,
  detail TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wake_log_member ON wake_log(member_id, created_at);

CREATE TABLE IF NOT EXISTS relay_seen (
  group_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (group_id, member_id)
);



CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id TEXT,
  group_id TEXT,
  kind TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_member ON events(member_id, id);
`;

type GlobalWithDb = typeof globalThis & { __pachatDb?: DatabaseSync };

function open(): DatabaseSync {
  const dir = process.env.PACHAT_DB_DIR || path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  const file = process.env.PACHAT_DB || path.join(dir, "pachat.db");
  const database = new DatabaseSync(file);
  database.exec("PRAGMA journal_mode = WAL;");
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec("PRAGMA busy_timeout = 5000;");
  database.exec(SCHEMA);
  migrate(database);
  return database;
}

/** Forward-only tweaks for databases created by an earlier build. */
function migrate(database: DatabaseSync): void {
  const addColumn = (sql: string) => {
    try {
      database.exec(sql);
    } catch {
      /* column already exists */
    }
  };
  addColumn("ALTER TABLE groups ADD COLUMN kind TEXT NOT NULL DEFAULT 'group'");
  addColumn("ALTER TABLE group_members ADD COLUMN added_by_member_id TEXT");
  addColumn("ALTER TABLE members ADD COLUMN wake_disabled_reason TEXT");
  addColumn("ALTER TABLE members ADD COLUMN wake_fail_streak INTEGER NOT NULL DEFAULT 0");
  addColumn("ALTER TABLE members ADD COLUMN wake_last_at INTEGER");
  addColumn("ALTER TABLE members ADD COLUMN wake_last_test TEXT");
}

export function getDb(): DatabaseSync {
  const g = globalThis as GlobalWithDb;
  if (!g.__pachatDb) {
    g.__pachatDb = open();
  }
  return g.__pachatDb;
}

/** Sanitise JS values into the subset SQLite accepts. */
export function bind(values: unknown[]): SqlValue[] {
  return values.map((v) => {
    if (v === undefined || v === null) return null;
    if (typeof v === "boolean") return v ? 1 : 0;
    if (typeof v === "number") return v;
    if (typeof v === "bigint") return v;
    if (typeof v === "string") return v;
    if (v instanceof Uint8Array) return v;
    return String(v);
  });
}

export function all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] {
  return getDb().prepare(sql).all(...bind(params)) as T[];
}

export function get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T | undefined {
  return getDb().prepare(sql).get(...bind(params)) as T | undefined;
}

export function run(sql: string, ...params: unknown[]): { changes: number; lastInsertRowid: number } {
  const r = getDb().prepare(sql).run(...bind(params));
  return {
    changes: Number(r.changes),
    lastInsertRowid: Number(r.lastInsertRowid),
  };
}

export function tx<T>(fn: () => T): T {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  }
}

export function jsonParse<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}
