import { randomUUID } from 'node:crypto';
import type { Db } from '../db.js';
import type { User } from '../types.js';
import type { GoogleProfile } from './google.js';

export class UserStore {
  constructor(private readonly db: Db) {}

  upsertGoogleUser(profile: GoogleProfile, now = Date.now()): User {
    return this.db
      .prepare(
        `INSERT INTO users (id, google_sub, email, name, picture, created_at, last_login_at)
         VALUES (@id, @sub, @email, @name, @picture, @now, @now)
         ON CONFLICT(google_sub) DO UPDATE SET
           email = excluded.email, name = excluded.name, picture = excluded.picture,
           last_login_at = excluded.last_login_at
         RETURNING id, email, name, picture`,
      )
      .get({ id: randomUUID(), sub: profile.sub, email: profile.email, name: profile.name, picture: profile.picture, now }) as User;
  }

  getById(id: string): User | null {
    return (this.db.prepare('SELECT id, email, name, picture FROM users WHERE id = ?').get(id) as User | undefined) ?? null;
  }
}
