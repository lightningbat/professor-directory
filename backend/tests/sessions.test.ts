import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { AuthSessionStore } from '../src/auth/sessions.js';
import { openDb, type Db } from '../src/db.js';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 13, 12);

describe('AuthSessionStore (stateful login token)', () => {
  let db: Db;
  let store: AuthSessionStore;

  beforeEach(() => {
    db = openDb(':memory:');
    for (const id of ['u1', 'u2']) {
      db.prepare('INSERT INTO users (id, google_sub, email, created_at, last_login_at) VALUES (?, ?, ?, ?, ?)').run(id, `s-${id}`, `${id}@x.com`, T0, T0);
    }
    store = new AuthSessionStore(db, 30 * DAY, 14 * DAY);
  });

  it('stores only a hash, and the raw token validates', () => {
    const { token } = store.create('u1', {}, T0);
    assert.equal(store.validate(token, T0 + 1000)?.userId, 'u1');
    const row = db.prepare('SELECT token_hash FROM auth_sessions').get() as { token_hash: string };
    assert.notEqual(row.token_hash, token);
    assert.equal(store.validate('not-a-token', T0), null);
  });

  it('expires after 14 idle days, but activity keeps it alive', () => {
    const { token } = store.create('u1', {}, T0);
    assert.ok(store.validate(token, T0 + 10 * DAY)); // touches last_used
    assert.ok(store.validate(token, T0 + 23 * DAY)); // 13 days since last use
    assert.equal(store.validate(token, T0 + 40 * DAY), null);

    const idle = store.create('u2', {}, T0);
    assert.equal(store.validate(idle.token, T0 + 14 * DAY), null);
  });

  it('has a hard 30 day lifetime no matter how active', () => {
    const { token, expiresAt } = store.create('u1', {}, T0);
    assert.equal(expiresAt, T0 + 30 * DAY);
    for (let d = 5; d < 30; d += 5) assert.ok(store.validate(token, T0 + d * DAY));
    assert.equal(store.validate(token, T0 + 30 * DAY), null);
  });

  it('revoke ends one login, revokeAllForUser ends every login of that user', () => {
    const a = store.create('u1', {}, T0);
    const b = store.create('u1', {}, T0);
    const other = store.create('u2', {}, T0);

    store.revoke(a.token, T0 + 1);
    assert.equal(store.validate(a.token, T0 + 2), null);
    assert.ok(store.validate(b.token, T0 + 2));

    store.revokeAllForUser('u1', T0 + 3);
    assert.equal(store.validate(b.token, T0 + 4), null);
    assert.ok(store.validate(other.token, T0 + 4));
  });

  it('purges dead sessions only', () => {
    const live = store.create('u1', {}, T0 + 29 * DAY);
    store.create('u2', {}, T0);
    assert.equal(store.purgeExpired(T0 + 31 * DAY), 1);
    assert.ok(store.validate(live.token, T0 + 31 * DAY));
  });
});
