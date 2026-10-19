import { randomUUID } from 'node:crypto';
import type { Db } from '../db.js';
import { hashToken, newOpaqueToken } from './tokens.js';

interface Meta { ip?: string; userAgent?: string }

interface Row {
  id: string;
  user_id: string;
  last_used_at: number;
  expires_at: number;
  revoked_at: number | null;
}

// Don't write to the database on every single check; once a minute is plenty for an idle timeout.
const TOUCH_EVERY_MS = 60_000;

/**
 * The stateful login token. One opaque token per login, stored hashed, never rotated.
 * A session is valid only while it is not revoked, not past its absolute lifetime, and was used
 * within the idle window. It is only ever sent to /api/auth/* (cookie path), never to data routes.
 */
export class AuthSessionStore {
  constructor(
    private readonly db: Db,
    private readonly ttlMs: number,
    private readonly idleMs: number,
  ) {}

  create(userId: string, meta: Meta = {}, now = Date.now()): { token: string; expiresAt: number } {
    const { raw, hash } = newOpaqueToken();
    const expiresAt = now + this.ttlMs;
    this.db
      .prepare(
        `INSERT INTO auth_sessions (id, user_id, token_hash, created_at, last_used_at, expires_at, ip, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(randomUUID(), userId, hash, now, now, expiresAt, meta.ip ?? null, meta.userAgent?.slice(0, 300) ?? null);
    return { token: raw, expiresAt };
  }

  validate(rawToken: string, now = Date.now()): { userId: string; sessionId: string } | null {
    const row = this.db
      .prepare('SELECT id, user_id, last_used_at, expires_at, revoked_at FROM auth_sessions WHERE token_hash = ?')
      .get(hashToken(rawToken)) as Row | undefined;

    if (!row || row.revoked_at !== null) return null;
    if (row.expires_at <= now) return null;
    if (now - row.last_used_at >= this.idleMs) return null;

    if (now - row.last_used_at >= TOUCH_EVERY_MS) {
      this.db.prepare('UPDATE auth_sessions SET last_used_at = ? WHERE id = ?').run(now, row.id);
    }
    return { userId: row.user_id, sessionId: row.id };
  }

  /** Logout. */
  revoke(rawToken: string, now = Date.now()): void {
    this.db
      .prepare('UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL')
      .run(now, hashToken(rawToken));
  }

  /** "Log out everywhere". */
  revokeAllForUser(userId: string, now = Date.now()): void {
    this.db
      .prepare('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
      .run(now, userId);
  }

  purgeExpired(now = Date.now()): number {
    return this.db
      .prepare('DELETE FROM auth_sessions WHERE expires_at <= ? OR last_used_at <= ?')
      .run(now, now - this.idleMs).changes;
  }
}
