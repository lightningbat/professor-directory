import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadConfig } from '../src/config.js';

const env = (extra: Record<string, string> = {}) =>
  ({ ACCESS_TOKEN_SECRET: 'x'.repeat(48), NODE_ENV: 'test', ...extra }) as NodeJS.ProcessEnv;

describe('COOKIE_DOMAIN', () => {
  it('is optional (host-only cookies by default), and blank counts as unset', () => {
    assert.equal(loadConfig(env()).auth.cookie.domain, undefined);
    assert.equal(loadConfig(env({ COOKIE_DOMAIN: '' })).auth.cookie.domain, undefined);
  });

  it('accepts bare domains, and tolerates stray quotes or spaces', () => {
    assert.equal(loadConfig(env({ COOKIE_DOMAIN: '.mydomain.com' })).auth.cookie.domain, '.mydomain.com');
    assert.equal(loadConfig(env({ COOKIE_DOMAIN: 'mydomain.com' })).auth.cookie.domain, 'mydomain.com');
    assert.equal(loadConfig(env({ COOKIE_DOMAIN: '  ".mydomain.com" ' })).auth.cookie.domain, '.mydomain.com');
  });

  it('rejects URLs, ports and paths at startup with a helpful message', () => {
    for (const bad of ['https://mydomain.com', 'mydomain.com:443', 'mydomain.com/api', '*.mydomain.com']) {
      assert.throws(() => loadConfig(env({ COOKIE_DOMAIN: bad })), /not a valid cookie domain/, bad);
    }
  });
});

describe('Turnstile and token settings', () => {
  it('requires the Turnstile secret in production, not in development', () => {
    assert.throws(() => loadConfig(env({ NODE_ENV: 'production' })), /TURNSTILE_SECRET_KEY/);
    assert.equal(loadConfig(env({ NODE_ENV: 'production', TURNSTILE_SECRET_KEY: 's' })).turnstile.secret, 's');
    assert.equal(loadConfig(env()).turnstile.secret, null);
  });

  it('only accepts Turnstile tokens solved on our own hostnames', () => {
    const c = loadConfig(env({ FRONTEND_URL: 'https://mydomain.com', ADMIN_URL: 'https://admin.mydomain.com', CORS_ORIGIN: 'https://mydomain.com' }));
    assert.deepEqual([...c.turnstile.allowedHostnames].sort(), ['admin.mydomain.com', 'mydomain.com']);
  });

  it('defaults: 12 minute access token, 14 day idle / 30 day login token', () => {
    const c = loadConfig(env());
    assert.equal(c.auth.accessTtlSeconds, 720);
    assert.equal(c.auth.authTokenIdleDays, 14);
    assert.equal(c.auth.authTokenTtlDays, 30);
  });

  it('refuses an idle timeout longer than the login lifetime', () => {
    assert.throws(() => loadConfig(env({ AUTH_TOKEN_IDLE_DAYS: '40', AUTH_TOKEN_TTL_DAYS: '30' })), /AUTH_TOKEN_IDLE_DAYS/);
  });
});
