import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export type Db = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS professors (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  profile_url TEXT,
  college     TEXT NOT NULL,
  department  TEXT NOT NULL,
  designation TEXT NOT NULL,
  keywords    TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS professor_emails (
  professor_id TEXT    NOT NULL REFERENCES professors(id) ON DELETE CASCADE,
  email        TEXT    NOT NULL,
  position     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (professor_id, email)
);

CREATE INDEX IF NOT EXISTS idx_professors_college     ON professors(college);
CREATE INDEX IF NOT EXISTS idx_professors_department  ON professors(department);
CREATE INDEX IF NOT EXISTS idx_professors_designation ON professors(designation);
CREATE INDEX IF NOT EXISTS idx_professors_name        ON professors(name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  google_sub    TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL,
  name          TEXT,
  picture       TEXT,
  created_at    INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL
);

-- Only a SHA-256 hash of each refresh token is stored. A "family" is one login; rotating
-- a token creates a new row in the same family, so reuse of an old token can revoke it all.
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id  TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  used_at    INTEGER,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL,
  ip         TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_refresh_family ON refresh_tokens(family_id);
CREATE INDEX IF NOT EXISTS idx_refresh_user   ON refresh_tokens(user_id);

-- One row per successful email reveal; the rate limiter counts rows in a sliding window.
CREATE TABLE IF NOT EXISTS email_reveals (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT    NOT NULL,
  ip           TEXT    NOT NULL,
  professor_id TEXT    NOT NULL,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reveals_user ON email_reveals(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reveals_ip   ON email_reveals(ip, created_at);
`;

export function openDb(file: string): Db {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}
