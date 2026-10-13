import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Jar, boot, call, login } from './helpers.js';

let app: ReturnType<typeof boot>;
before(() => { app = boot({ reuseGraceMs: 0 }); });
after(() => app.close());

describe('Google login', () => {
  it('sets httpOnly access + refresh cookies and redirects back to the site', async () => {
    const jar = new Jar();
    const start = await fetch(`${app.base}/api/auth/google?returnTo=/search`, { redirect: 'manual' });
    jar.absorb(start);
    assert.equal(start.status, 302);
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!;

    const cb = await fetch(`${app.base}/api/auth/google/callback?code=alice&state=${state}`, {
      redirect: 'manual',
      headers: { cookie: jar.header() },
    });
    assert.equal(cb.status, 302);
    assert.equal(cb.headers.get('location'), 'http://localhost:5173/search');

    const cookies = cb.headers.getSetCookie().join('\n');
    assert.match(cookies, /access_token=[^;]+;.*HttpOnly/is);
    assert.match(cookies, /refresh_token=[^;]+;.*Path=\/api\/auth;.*HttpOnly/is);
  });

  it('rejects a callback whose state does not match', async () => {
    const jar = new Jar();
    jar.absorb(await fetch(`${app.base}/api/auth/google`, { redirect: 'manual' }));
    const cb = await fetch(`${app.base}/api/auth/google/callback?code=alice&state=forged`, {
      redirect: 'manual',
      headers: { cookie: jar.header() },
    });
    assert.match(cb.headers.get('location')!, /auth_error=invalid_state/);
    assert.ok(!cb.headers.getSetCookie().some((c) => c.startsWith('access_token=') && !/Expires=Thu, 01 Jan 1970/.test(c)));
  });

  it('refuses unverified Google emails', async () => {
    const jar = await login(app.base, 'unverified');
    assert.ok(!jar.cookies.has('access_token'));
  });

  it('only redirects to same-site paths', async () => {
    const start = await fetch(`${app.base}/api/auth/google?returnTo=//evil.com`, { redirect: 'manual' });
    const jar = new Jar();
    jar.absorb(start);
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!;
    const cb = await fetch(`${app.base}/api/auth/google/callback?code=bob&state=${state}`, {
      redirect: 'manual',
      headers: { cookie: jar.header() },
    });
    assert.equal(cb.headers.get('location'), 'http://localhost:5173/');
  });
});

describe('session', () => {
  it('GET /api/auth/me needs a cookie', async () => {
    assert.equal((await call(app.base, '/api/auth/me')).status, 401);
    const jar = await login(app.base, 'carol');
    const { status, body } = await call(app.base, '/api/auth/me', { jar });
    assert.equal(status, 200);
    assert.equal(body.user.email, 'carol@example.com');
  });

  it('logged-in users get direct profile links, still no emails in the list', async () => {
    const jar = await login(app.base, 'dave');
    const { body } = await call(app.base, '/api/professors?pageSize=3', { jar });
    for (const p of body.data) {
      assert.match(p.profileUrl, /^https:\/\/[a-z]+\.[a-z.-]+\/faculty\//);
      assert.ok(!('emails' in p));
    }
  });

  it('a tampered access token is a 401 token_expired, not silently anonymous', async () => {
    const jar = await login(app.base, 'erin');
    jar.cookies.set('access_token', jar.cookies.get('access_token')!.slice(0, -4) + 'AAAA');
    const { status, body } = await call(app.base, '/api/professors', { jar });
    assert.equal(status, 401);
    assert.equal(body.error.code, 'token_expired');
  });

  it('refresh rotates the token and the old one stops working', async () => {
    const jar = await login(app.base, 'frank');
    const oldRefresh = jar.cookies.get('refresh_token')!;

    const first = await call(app.base, '/api/auth/refresh', { method: 'POST', jar });
    assert.equal(first.status, 200);
    const newRefresh = jar.cookies.get('refresh_token')!;
    assert.notEqual(newRefresh, oldRefresh);

    // Replaying the old token is treated as theft: it fails AND kills the new one too.
    const replay = new Jar();
    replay.cookies.set('refresh_token', oldRefresh);
    assert.equal((await call(app.base, '/api/auth/refresh', { method: 'POST', jar: replay })).status, 401);

    const afterTheft = new Jar();
    afterTheft.cookies.set('refresh_token', newRefresh);
    assert.equal((await call(app.base, '/api/auth/refresh', { method: 'POST', jar: afterTheft })).status, 401);
  });

  it('logout revokes the refresh token server-side', async () => {
    const jar = await login(app.base, 'grace');
    const stolen = jar.cookies.get('refresh_token')!;

    assert.equal((await call(app.base, '/api/auth/logout', { method: 'POST', jar })).status, 204);
    assert.ok(!jar.cookies.has('access_token') && !jar.cookies.has('refresh_token'));

    const attacker = new Jar();
    attacker.cookies.set('refresh_token', stolen);
    assert.equal((await call(app.base, '/api/auth/refresh', { method: 'POST', jar: attacker })).status, 401);
  });

  it('blocks POSTs from other origins', async () => {
    const jar = await login(app.base, 'heidi');
    const { status, body } = await call(app.base, '/api/auth/refresh', {
      method: 'POST', jar, origin: 'https://evil.example',
    });
    assert.equal(status, 403);
    assert.equal(body.error.code, 'bad_origin');
  });
});
