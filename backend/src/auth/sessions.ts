import { randomUUID } from 'node:crypto';
import type { Db } from '../db.js';
import { hashRefreshToken, newRefreshToken } from './tokens.js';

interface Meta { ip?: string; userAgent?: string }

interface TokenRow {
	id: string;
	user_id: string;
	family_id: string;
	expires_at: number;
	used_at: number | null;
	revoked_at: number | null;
}

export type RotateResult =
	| { ok: true; userId: string; token: string; expiresAt: number }
	| { ok: false; reason: 'invalid' | 'reuse' };

/**
 * Stateful refresh tokens with rotation. Every refresh invalidates the presented token and issues
 * a new one in the same family. Presenting an already-used token means it was copied somewhere,
 * so the whole family (that login) is revoked.
 */
export class SessionStore {
	constructor(
		private readonly db: Db,
		private readonly ttlMs: number,
		// Two tabs refreshing at the same moment would look like reuse; inside this window we just
		// reject the loser instead of killing the session.
		private readonly reuseGraceMs = 10_000,
	) { }

	create(userId: string, meta: Meta = {}, now = Date.now()): { token: string; expiresAt: number } {
		return this.insert(userId, randomUUID(), meta, now);
	}

	rotate(rawToken: string, meta: Meta = {}, now = Date.now()): RotateResult {
		return this.db.transaction((): RotateResult => {
			const row = this.db
				.prepare('SELECT id, user_id, family_id, expires_at, used_at, revoked_at FROM refresh_tokens WHERE token_hash = ?')
				.get(hashRefreshToken(rawToken)) as TokenRow | undefined;

			if (!row || row.revoked_at !== null || row.expires_at <= now) return { ok: false, reason: 'invalid' };

			if (row.used_at !== null) {
				if (now - row.used_at < this.reuseGraceMs) return { ok: false, reason: 'invalid' };
				this.revokeFamily(row.family_id, now);
				return { ok: false, reason: 'reuse' };
			}

			this.db.prepare('UPDATE refresh_tokens SET used_at = ? WHERE id = ?').run(now, row.id);
			const next = this.insert(row.user_id, row.family_id, meta, now);
			return { ok: true, userId: row.user_id, ...next };
		})();
	}

	/** Logout: revoke the whole login this token belongs to. */
	revoke(rawToken: string, now = Date.now()): void {
		const row = this.db
			.prepare('SELECT family_id FROM refresh_tokens WHERE token_hash = ?')
			.get(hashRefreshToken(rawToken)) as { family_id: string } | undefined;
		if (row) this.revokeFamily(row.family_id, now);
	}

	purgeExpired(now = Date.now()): number {
		return this.db.prepare('DELETE FROM refresh_tokens WHERE expires_at <= ?').run(now).changes;
	}

	private revokeFamily(familyId: string, now: number): void {
		this.db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE family_id = ? AND revoked_at IS NULL').run(now, familyId);
	}

	private insert(userId: string, familyId: string, meta: Meta, now: number) {
		const { raw, hash } = newRefreshToken();
		const expiresAt = now + this.ttlMs;
		this.db
			.prepare(
				`INSERT INTO refresh_tokens (id, user_id, family_id, token_hash, expires_at, created_at, ip, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(randomUUID(), userId, familyId, hash, expiresAt, now, meta.ip ?? null, meta.userAgent?.slice(0, 300) ?? null);
		return { token: raw, expiresAt };
	}
}
