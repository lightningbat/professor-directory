import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { SignJWT } from 'jose';
import { Jar, boot, call, config, getAccess, login, loginOnly } from './helpers.js';

let app: ReturnType<typeof boot>;
before(() => { app = boot(); });
after(() => app.close());

describe('Google login', () => {
  it('sets only the stateful login cookie (httpOnly, auth-only path) and redirects back to the site', async () => {
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
    assert.match(cookies, /auth_token=[^;]+;.*Path=\/api\/auth;.*HttpOnly/is);
    assert.doesNotMatch(cookies, /access_token=[^;]+/, 'no access token without a Turnstile check');
  });

  it('rejects a callback whose state does not match', async () => {
    const jar = new Jar();
    jar.absorb(await fetch(`${app.base}/api/auth/google`, { redirect: 'manual' }));
    const cb = await fetch(`${app.base}/api/auth/google/callback?code=alice&state=forged`, {
      redirect: 'manual',
      headers: { cookie: jar.header() },
    });
    assert.match(cb.headers.get('location')!, /auth_error=invalid_state/);
    assert.ok(!cb.headers.getSetCookie().some((c) => /^auth_token=[^;]+/.test(c)));
  });

  it('refuses unverified Google emails', async () => {
    const jar = await loginOnly(app.base, 'unverified');
    assert.ok(!jar.cookies.has('auth_token'));
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

  it('a new login drops any access token left over from a previous person', async () => {
    const jar = await login(app.base, 'previous');
    assert.ok(jar.cookies.has('access_token'));
    await loginOnly(app.base, 'next', jar);
    assert.ok(!jar.cookies.has('access_token'));
  });
});

describe('POST /api/auth/access (login token + Turnstile -> access token)', () => {
  it('needs a login first, and never calls Cloudflare for visitors', async () => {
    const { status, body } = await getAccess(app.base, new Jar());
    assert.equal(status, 401);
    assert.equal(body.error.code, 'unauthorized');
  });

  it('issues an httpOnly access token valid for about 12 minutes', async () => {
    const jar = await loginOnly(app.base, 'carol');
    const { res, status, body } = await getAccess(app.base, jar);
    assert.equal(status, 200);
    assert.equal(body.user.email, 'carol@example.com');
    const minutes = (body.expiresAt - Date.now()) / 60_000;
    assert.ok(minutes > 11.5 && minutes <= 12, `expires in ${minutes} min`);
    assert.match(res.headers.getSetCookie().join('\n'), /access_token=[^;]+;.*Path=\/api;.*HttpOnly/is);
  });

  it('a failed Turnstile check gives no access token', async () => {
    const jar = await loginOnly(app.base, 'dave');
    const { status, body } = await getAccess(app.base, jar, 'bot');
    assert.equal(status, 400);
    assert.equal(body.error.code, 'turnstile_failed');
    assert.ok(!jar.cookies.has('access_token'));
  });

  it('a Cloudflare outage is a 503 (fail closed), and the login survives it', async () => {
    const jar = await loginOnly(app.base, 'erin');
    const down = await getAccess(app.base, jar, 'down');
    assert.equal(down.status, 503);
    assert.equal(down.body.error.code, 'turnstile_unavailable');
    assert.equal((await getAccess(app.base, jar)).status, 200); // works again once Cloudflare is back
  });

  it('validates the body and the origin', async () => {
    const jar = await loginOnly(app.base, 'frank');
    assert.equal((await call(app.base, '/api/auth/access', { method: 'POST', jar })).status, 400);
    const evil = await call(app.base, '/api/auth/access', { method: 'POST', jar, origin: 'https://evil.example', json: { turnstileToken: 'ok' } });
    assert.equal(evil.status, 403);
    assert.equal(evil.body.error.code, 'bad_origin');
  });

  it('the old refresh endpoint is gone', async () => {
    assert.equal((await call(app.base, '/api/auth/refresh', { method: 'POST' })).status, 404);
  });
});

describe('GET /api/auth/me', () => {
  it('401 when logged out', async () => {
    assert.equal((await call(app.base, '/api/auth/me')).status, 401);
  });

  it('after login but before Turnstile: user known, no access yet', async () => {
    const jar = await loginOnly(app.base, 'gina');
    const { status, body } = await call(app.base, '/api/auth/me', { jar });
    assert.equal(status, 200);
    assert.equal(body.user.email, 'gina@example.com');
    assert.equal(body.access, null);
  });

  it('reports a still-valid access token, so a page reload skips Turnstile', async () => {
    const jar = await login(app.base, 'hank');
    const { body } = await call(app.base, '/api/auth/me', { jar });
    assert.ok(body.access.expiresAt > Date.now());
  });

  it('ignores an access token that belongs to someone else', async () => {
    const hank = await login(app.base, 'hank2');
    const gina = await loginOnly(app.base, 'gina2');
    gina.cookies.set('access_token', hank.cookies.get('access_token')!);
    assert.equal((await call(app.base, '/api/auth/me', { jar: gina })).body.access, null);
  });
});

describe('who gets what', () => {
  const firstProfileUrl = async (jar?: Jar) => (await call(app.base, '/api/professors?pageSize=1', { jar })).body.data[0].profileUrl as string;

  it('guests browse freely and get a Google search link', async () => {
    assert.match(await firstProfileUrl(), /^https:\/\/www\.google\.com\/search\?q=/);
  });

  it('logged in without an access token is still just a guest for links, and not an error', async () => {
    const jar = await loginOnly(app.base, 'iris');
    const res = await call(app.base, '/api/professors?pageSize=1', { jar });
    assert.equal(res.status, 200);
    assert.match(res.body.data[0].profileUrl, /^https:\/\/www\.google\.com\/search/);
  });

  it('an access token unlocks direct profile links', async () => {
    const jar = await login(app.base, 'jack');
    assert.match(await firstProfileUrl(jar), /^https:\/\/[a-z]+\.[a-z.-]+\/faculty\//);
  });

  it('emails need an access token: none, expired, forged and old-format tokens are all 401', async () => {
    const reveal = (jar?: Jar) => call(app.base, '/api/professors/prof_1/email', { method: 'POST', jar });

    assert.equal((await reveal()).body.error.code, 'access_required');

    const loginOnlyJar = await loginOnly(app.base, 'kate'); // logged in, no Turnstile yet
    assert.equal((await reveal(loginOnlyJar)).body.error.code, 'access_required');

    const user = (await call(app.base, '/api/auth/me', { jar: loginOnlyJar })).body.user;
    const expired = new Jar();
    expired.cookies.set('access_token', (await app.ctx.tokens.signAccess(user.id, -5)).token);
    assert.equal((await reveal(expired)).body.error.code, 'access_expired');

    const forged = new Jar();
    forged.cookies.set('access_token', (await app.ctx.tokens.signAccess(user.id)).token.slice(0, -4) + 'AAAA');
    assert.equal((await reveal(forged)).body.error.code, 'access_expired');

    // A token from the previous design (valid signature, no Turnstile behind it) must not work.
    const legacy = new Jar();
    legacy.cookies.set(
      'access_token',
      await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(user.id).setIssuer('professor-api')
        .setAudience('access').setExpirationTime('10m').sign(new TextEncoder().encode(config.auth.accessSecret)),
    );
    assert.equal((await reveal(legacy)).body.error.code, 'access_expired');

    const good = await login(app.base, 'kate2');
    assert.equal((await reveal(good)).status, 200);
  });

  it('a broken access cookie never breaks public browsing', async () => {
    const jar = new Jar();
    jar.cookies.set('access_token', 'garbage');
    assert.equal((await call(app.base, '/api/professors?pageSize=1', { jar })).status, 200);
  });
});

describe('logout', () => {
  it('revokes the login token on the server, not just in the browser', async () => {
    const jar = await login(app.base, 'liam');
    const stolen = jar.cookies.get('auth_token')!;

    assert.equal((await call(app.base, '/api/auth/logout', { method: 'POST', jar })).status, 204);
    assert.ok(!jar.cookies.has('auth_token') && !jar.cookies.has('access_token'));

    const attacker = new Jar();
    attacker.cookies.set('auth_token', stolen);
    assert.equal((await getAccess(app.base, attacker)).status, 401);
    assert.equal((await call(app.base, '/api/auth/me', { jar: attacker })).status, 401);
  });

  it('an access token already issued stays valid until it expires (stateless, accepted trade-off)', async () => {
    const jar = await login(app.base, 'mona');
    const access = jar.cookies.get('access_token')!;
    await call(app.base, '/api/auth/logout', { method: 'POST', jar });

    const copy = new Jar();
    copy.cookies.set('access_token', access);
    assert.equal((await call(app.base, '/api/professors/prof_3/email', { method: 'POST', jar: copy })).status, 200);
  });

  it('blocks logout POSTs from other origins', async () => {
    const jar = await login(app.base, 'nina');
    const { status, body } = await call(app.base, '/api/auth/logout', { method: 'POST', jar, origin: 'https://evil.example' });
    assert.equal(status, 403);
    assert.equal(body.error.code, 'bad_origin');
  });
});

describe('access endpoint throttle', () => {
  it('allows 20 attempts a minute per IP, then 429 with Retry-After', async () => {
    const fresh = boot();
    try {
      const jar = await loginOnly(fresh.base, 'oscar');
      let last = await getAccess(fresh.base, jar, 'bot');
      for (let i = 0; i < 19; i++) last = await getAccess(fresh.base, jar, 'bot');
      assert.equal(last.status, 400); // 20th still reaches Turnstile
      const blocked = await getAccess(fresh.base, jar, 'bot');
      assert.equal(blocked.status, 429);
      assert.equal(blocked.res.headers.get('retry-after'), '60');
    } finally {
      fresh.close();
    }
  });
});

describe('failed logins go back to where they started', () => {
  const b64 = (s: string) => Buffer.from(s).toString('base64url');
  const where = async (opts: { returnTo: string; query: (state: string) => string; keepCookie: boolean }) => {
    const start = await fetch(`${app.base}/api/auth/google?returnTo=${encodeURIComponent(opts.returnTo)}`, { redirect: 'manual' });
    const cookie = start.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!;
    const cb = await fetch(`${app.base}/api/auth/google/callback?${opts.query(state)}`, {
      redirect: 'manual',
      headers: opts.keepCookie ? { cookie } : {},
    });
    return cb.headers.get('location')!;
  };

  it('missing login cookie: admin logins still return to the admin dashboard with the error', async () => {
    const loc = await where({ returnTo: 'http://localhost:5174/', query: (s) => `code=admin&state=${s}`, keepCookie: false });
    assert.equal(loc, 'http://localhost:5174/?auth_error=invalid_state');
  });

  it('user cancelled at Google: back to the dashboard, not the public site', async () => {
    const loc = await where({ returnTo: 'http://localhost:5174/', query: (s) => `error=access_denied&state=${s}`, keepCookie: true });
    assert.equal(loc, 'http://localhost:5174/?auth_error=access_denied');
  });

  it('a forged state can only point at allowed origins', async () => {
    const evil = `abc.${b64('https://evil.example/steal')}`;
    const loc = await where({ returnTo: '/', query: () => `code=x&state=${evil}`, keepCookie: false });
    assert.equal(loc, 'http://localhost:5173/?auth_error=invalid_state');
  });
});
