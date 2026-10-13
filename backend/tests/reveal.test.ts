import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { UserStore } from '../src/auth/users.js';
import { openDb } from '../src/db.js';
import { ipKey } from '../src/reveal/ip.js';
import { RevealLimiter } from '../src/reveal/limiter.js';
import { boot, call, login } from './helpers.js';

describe('POST /api/professors/:id/email', () => {
  let app: ReturnType<typeof boot>;
  before(() => { app = boot(); });
  after(() => app.close());

  it('needs a login', async () => {
    const { status, body } = await call(app.base, '/api/professors/prof_1/email', { method: 'POST' });
    assert.equal(status, 401);
    assert.equal(body.error.code, 'unauthorized');
  });

  it('returns the emails and the remaining quota', async () => {
    const jar = await login(app.base, 'quinn');
    const { status, body } = await call(app.base, '/api/professors/prof_1/email', { method: 'POST', jar });
    assert.equal(status, 200);
    assert.ok(body.emails.length >= 1 && body.emails[0].includes('@'));
    assert.deepEqual(body.quota, { hourRemaining: 14, dayRemaining: 49 });
  });

  it('404s for unknown professors without using up quota', async () => {
    const jar = await login(app.base, 'rita');
    assert.equal((await call(app.base, '/api/professors/nope/email', { method: 'POST', jar })).status, 404);
    const ok = await call(app.base, '/api/professors/prof_2/email', { method: 'POST', jar });
    assert.equal(ok.body.quota.hourRemaining, 14);
  });

  it('blocks a user after 15 reveals per hour, with Retry-After', async () => {
    const jar = await login(app.base, 'sam');
    for (let i = 1; i <= 15; i++) {
      const r = await call(app.base, `/api/professors/prof_${i}/email`, { method: 'POST', jar });
      assert.equal(r.status, 200, `reveal ${i}`);
    }
    const blocked = await call(app.base, '/api/professors/prof_16/email', { method: 'POST', jar });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error.limit, 'user_hourly');
    const retry = Number(blocked.res.headers.get('retry-after'));
    assert.ok(retry > 3500 && retry <= 3600);
  });
});

describe('per-IP limit across sessions', () => {
  let app: ReturnType<typeof boot>;
  before(() => { app = boot(); });
  after(() => app.close());

  it('blocks the 31st reveal from one IP even when each user is under their own limit', async () => {
    for (const name of ['u1', 'u2', 'u3']) {
      const jar = await login(app.base, name);
      for (let i = 1; i <= 10; i++) {
        const r = await call(app.base, `/api/professors/prof_${i}/email`, { method: 'POST', jar });
        assert.equal(r.status, 200);
      }
    }
    const fresh = await login(app.base, 'u4');
    const blocked = await call(app.base, '/api/professors/prof_1/email', { method: 'POST', jar: fresh });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error.limit, 'ip_hourly');
  });
});

describe('RevealLimiter (sliding windows)', () => {
  const HOUR = 3_600_000;

  it('enforces 50 per rolling day even when each hour is under 15', () => {
    const db = openDb(':memory:');
    new UserStore(db); // schema only
    const limiter = new RevealLimiter(db);
    const t0 = 1_000_000_000_000;
    let n = 0;
    const reveal = (at: number) => limiter.consume({ userId: 'u', ip: `10.0.${n >> 8}.${n++ & 255}`, professorId: 'p' }, at);

    for (let i = 0; i < 15; i++) assert.ok(reveal(t0).allowed);
    for (let i = 0; i < 15; i++) assert.ok(reveal(t0 + 61 * 60_000).allowed);
    for (let i = 0; i < 15; i++) assert.ok(reveal(t0 + 122 * 60_000).allowed);
    for (let i = 0; i < 5; i++) assert.ok(reveal(t0 + 183 * 60_000).allowed);

    const now = t0 + 184 * 60_000;
    const r = reveal(now);
    assert.ok(!r.allowed);
    if (!r.allowed) {
      assert.equal(r.limit, 'user_daily');
      assert.equal(r.retryAfterSeconds, Math.ceil((t0 + 24 * HOUR - now) / 1000));
    }
  });

  it('frees a slot once the oldest reveal leaves the window', () => {
    const db = openDb(':memory:');
    const limiter = new RevealLimiter(db);
    const t0 = 2_000_000_000_000;
    for (let i = 0; i < 15; i++) limiter.consume({ userId: 'u', ip: `1.1.1.${i}`, professorId: 'p' }, t0 + i * 1000);
    assert.ok(!limiter.consume({ userId: 'u', ip: '9.9.9.9', professorId: 'p' }, t0 + HOUR - 1).allowed);
    assert.ok(limiter.consume({ userId: 'u', ip: '9.9.9.9', professorId: 'p' }, t0 + HOUR + 1).allowed);
  });
});

describe('ipKey', () => {
  it('normalises IPv4-mapped addresses and groups IPv6 by /64', () => {
    assert.equal(ipKey('::ffff:203.0.113.7'), '203.0.113.7');
    assert.equal(ipKey('203.0.113.7'), '203.0.113.7');
    assert.equal(ipKey('2001:db8:abcd:12::1'), '2001:0db8:abcd:0012::/64');
    assert.equal(ipKey('2001:db8:abcd:12:ffff:ffff:ffff:ffff'), '2001:0db8:abcd:0012::/64');
    assert.equal(ipKey('::1'), '0000:0000:0000:0000::/64');
    assert.equal(ipKey(undefined), 'unknown');
  });
});
