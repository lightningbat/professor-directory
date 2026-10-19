import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { AnalyticsStore, ONLINE_WINDOW_MS } from '../src/analytics/store.js';
import { FixedWindowThrottle } from '../src/analytics/throttle.js';
import { openDb } from '../src/db.js';
import { boot, call, login } from './helpers.js';

const T0 = Date.UTC(2026, 9, 13, 12, 0, 0);

describe('AnalyticsStore', () => {
  const make = (tz = 'UTC') => {
    const db = openDb(':memory:');
    db.prepare("INSERT INTO users (id, google_sub, email, name, created_at, last_login_at) VALUES ('u1','s1','a@x.com','Ann',?,?)").run(T0, T0);
    return new AnalyticsStore(db, tz);
  };

  it('counts people, not tabs: two tabs from one browser are one visitor', () => {
    const a = make();
    a.heartbeat({ visitorId: 'visitor-1', sessionId: 'session-1', userId: null, path: '/' }, T0);
    a.heartbeat({ visitorId: 'visitor-1', sessionId: 'session-2', userId: null, path: '/about' }, T0);
    a.heartbeat({ visitorId: 'visitor-2', sessionId: 'session-3', userId: 'u1', path: '/' }, T0);
    assert.deepEqual(a.onlineCounts(T0 + 1000), { visitors: 2, signedIn: 1, guests: 1, sessions: 3 });
  });

  it('drops people who stop sending heartbeats', () => {
    const a = make();
    a.heartbeat({ visitorId: 'visitor-1', sessionId: 'session-1', userId: null, path: '/' }, T0);
    assert.equal(a.onlineCounts(T0 + ONLINE_WINDOW_MS - 1).visitors, 1);
    assert.equal(a.onlineCounts(T0 + ONLINE_WINDOW_MS + 1).visitors, 0);
  });

  it('a guest who logs in mid-session flips to signed in, and counts once per day', () => {
    const a = make();
    a.heartbeat({ visitorId: 'visitor-1', sessionId: 'session-1', userId: null, path: '/' }, T0);
    a.heartbeat({ visitorId: 'visitor-1', sessionId: 'session-1', userId: 'u1', path: '/' }, T0 + 20_000);
    assert.equal(a.onlineCounts(T0 + 21_000).signedIn, 1);
    const today = a.today(T0 + 21_000);
    assert.equal(today.uniqueVisitors, 1);
    assert.equal(today.signedIn, 1);
    assert.equal(today.sessions, 1);
  });

  it('breaks down where people are right now', () => {
    const a = make();
    a.heartbeat({ visitorId: 'visitor-1', sessionId: 'session-1', userId: null, path: '/' }, T0);
    a.heartbeat({ visitorId: 'visitor-2', sessionId: 'session-2', userId: null, path: '/' }, T0);
    a.heartbeat({ visitorId: 'visitor-3', sessionId: 'session-3', userId: null, path: '/contact' }, T0);
    assert.deepEqual(a.onlinePages(T0), [{ path: '/', visitors: 2 }, { path: '/contact', visitors: 1 }]);
  });

  it('lists who is online, with account details for signed-in people only', () => {
    const a = make();
    a.heartbeat({ visitorId: 'visitor-1', sessionId: 'session-1', userId: 'u1', path: '/' }, T0);
    a.heartbeat({ visitorId: 'visitor-2', sessionId: 'session-2', userId: null, path: '/' }, T0 + 5);
    const all = a.onlineSessions('all', 10, T0 + 10);
    assert.equal(all.length, 2);
    assert.equal(all.find((s) => s.kind === 'user')?.user?.email, 'a@x.com');
    assert.equal(all.find((s) => s.kind === 'guest')?.user, null);
    assert.equal(a.onlineSessions('guest', 10, T0 + 10).length, 1);
  });

  it('timeline keeps the busiest minute in each bucket', () => {
    const a = make();
    const bucket = 5 * 60_000;
    const start = Math.floor(T0 / bucket) * bucket;
    a.heartbeat({ visitorId: 'visitor-1', sessionId: 'session-1', userId: null, path: '/' }, start);
    a.recordSnapshot(start + 1000); // 1 online
    a.heartbeat({ visitorId: 'visitor-2', sessionId: 'session-2', userId: 'u1', path: '/' }, start + 60_000);
    a.recordSnapshot(start + 61_000); // 2 online
    const [point, ...rest] = a.timeline(60 * 60_000, bucket, start + 120_000);
    assert.equal(rest.length, 0);
    assert.deepEqual(point, { t: start, visitors: 2, signedIn: 1, guests: 1 });
  });

  it('daily fills quiet days with zeros and counts signups', () => {
    const a = make();
    a.heartbeat({ visitorId: 'visitor-1', sessionId: 'session-1', userId: null, path: '/' }, T0);
    const days = a.daily(3, T0);
    assert.deepEqual(days.map((d) => d.day), ['2026-10-11', '2026-10-12', '2026-10-13']);
    assert.deepEqual(days.map((d) => d.uniqueVisitors), [0, 0, 1]);
    assert.equal(days[2]!.newUsers, 1); // user u1 was created at T0
  });

  it('"today" follows the configured timezone', () => {
    const late = Date.UTC(2026, 9, 13, 20, 0, 0); // 20:00 UTC = 01:30 next day in India
    assert.equal(make('UTC').dayKey(late), '2026-10-13');
    assert.equal(make('Asia/Kolkata').dayKey(late), '2026-10-14');
  });

  it('purge removes old data only', () => {
    const a = make();
    a.heartbeat({ visitorId: 'visitor-1', sessionId: 'session-1', userId: null, path: '/' }, T0 - 100 * 86_400_000);
    a.heartbeat({ visitorId: 'visitor-2', sessionId: 'session-2', userId: null, path: '/' }, T0);
    a.purge(90, T0);
    assert.equal(a.daily(120, T0).reduce((n, d) => n + d.sessions, 0), 1);
  });
});

describe('FixedWindowThrottle', () => {
  it('allows up to the limit per window, then resets', () => {
    const t = new FixedWindowThrottle(3, 1000);
    assert.deepEqual([0, 1, 2, 3].map(() => t.allow('ip', 0)), [true, true, true, false]);
    assert.ok(t.allow('other', 0));
    assert.ok(t.allow('ip', 1000));
  });
});

describe('POST /api/analytics/heartbeat + /api/admin', () => {
  let app: ReturnType<typeof boot>;
  before(() => { app = boot(); });
  after(() => app.close());

  const beat = (jar?: Awaited<ReturnType<typeof login>>, visitorId = 'visitor-guest-1', sessionId = 'session-guest-1', path = '/') =>
    call(app.base, '/api/analytics/heartbeat', { method: 'POST', jar, json: { visitorId, sessionId, path } });

  it('rejects malformed heartbeats', async () => {
    const bad = await call(app.base, '/api/analytics/heartbeat', { method: 'POST', json: { visitorId: 'x', sessionId: 'y', path: 'nope' } });
    assert.equal(bad.status, 400);
    assert.equal((await call(app.base, '/api/analytics/heartbeat', { method: 'POST' })).status, 400);
  });

  it('admin routes: 401 logged out, 403 for normal users, 200 for admins', async () => {
    assert.equal((await call(app.base, '/api/admin/overview')).status, 401);

    const normal = await login(app.base, 'nora');
    const denied = await call(app.base, '/api/admin/overview', { jar: normal });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.error.code, 'forbidden');

    const admin = await login(app.base, 'admin');
    assert.equal((await call(app.base, '/api/admin/me', { jar: admin })).body.user.email, 'admin@example.com');
    assert.equal((await call(app.base, '/api/admin/overview', { jar: admin })).status, 200);
  });

  it('counts guests and signed-in people from the cookie, not from the request body', async () => {
    const user = await login(app.base, 'olive');
    assert.equal((await beat(undefined, 'visitor-guest-1', 'session-guest-1', '/')).status, 204);
    assert.equal((await beat(undefined, 'visitor-guest-2', 'session-guest-2', '/about?x=1')).status, 204);
    assert.equal((await beat(user, 'visitor-user-1', 'session-user-1', '/contact')).status, 204);

    const admin = await login(app.base, 'admin');
    const { body } = await call(app.base, '/api/admin/overview', { jar: admin });
    assert.deepEqual(body.online, { visitors: 3, signedIn: 1, guests: 2, sessions: 3 });
    assert.equal(body.today.uniqueVisitors, 3);
    assert.ok(body.pages.some((p: any) => p.path === '/about'), 'query string is stripped from the path');
    assert.ok(body.totals.users >= 3);

    const online = await call(app.base, '/api/admin/online?kind=user', { jar: admin });
    assert.equal(online.body.sessions.length, 1);
    assert.equal(online.body.sessions[0].user.email, 'olive@example.com');
  });

  it('serves timeline and daily data', async () => {
    const admin = await login(app.base, 'admin');
    app.ctx.analytics.recordSnapshot();
    const tl = await call(app.base, '/api/admin/timeline?range=24h', { jar: admin });
    assert.equal(tl.status, 200);
    assert.ok(tl.body.points.length >= 1 && tl.body.points[0].visitors >= 1);
    const daily = await call(app.base, '/api/admin/daily?days=7', { jar: admin });
    assert.equal(daily.body.days.length, 7);
    assert.equal((await call(app.base, '/api/admin/daily?days=500', { jar: admin })).status, 400);
  });
});

describe('login redirect back to the admin dashboard', () => {
  let app: ReturnType<typeof boot>;
  before(() => { app = boot(); });
  after(() => app.close());

  const returnToFor = async (returnTo: string) => {
    const start = await fetch(`${app.base}/api/auth/google?returnTo=${encodeURIComponent(returnTo)}`, { redirect: 'manual' });
    const cookie = start.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!;
    const cb = await fetch(`${app.base}/api/auth/google/callback?code=admin&state=${state}`, { redirect: 'manual', headers: { cookie } });
    return cb.headers.get('location');
  };

  it('allows the admin origin but not arbitrary sites', async () => {
    assert.equal(await returnToFor('http://localhost:5174/'), 'http://localhost:5174/');
    assert.equal(await returnToFor('https://evil.example/steal'), 'http://localhost:5173/');
    assert.equal(await returnToFor('/about'), 'http://localhost:5173/about');
  });
});
