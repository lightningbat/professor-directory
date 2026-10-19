import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import type { GoogleAuth, GoogleProfile } from '../src/auth/google.js';
import { loadConfig } from '../src/config.js';
import { createContext, type Overrides } from '../src/context.js';
import { openDb } from '../src/db.js';
import { seedAll } from '../src/seed/seed.js';
import type { TurnstileVerifier } from '../src/turnstile/verify.js';

export const ORIGIN = 'http://localhost:5173';

export const config = loadConfig({
  NODE_ENV: 'test',
  ACCESS_TOKEN_SECRET: 'x'.repeat(48),
  DATABASE_PATH: ':memory:',
  CORS_ORIGIN: ORIGIN,
  FRONTEND_URL: ORIGIN,
  ADMIN_EMAILS: 'admin@example.com',
  ADMIN_URL: 'http://localhost:5174',
} as NodeJS.ProcessEnv);

/** Pretends to be Google: the "code" is just the name of the person logging in. */
export const fakeGoogle: GoogleAuth = {
  async start(state) {
    return { url: `https://accounts.example.test/auth?state=${state}`, codeVerifier: 'verifier' };
  },
  async finish(code): Promise<GoogleProfile> {
    return {
      sub: `sub-${code}`,
      email: `${code}@example.com`,
      emailVerified: code !== 'unverified',
      name: code,
      picture: null,
    };
  },
};

/** Pretends to be Cloudflare: the token "ok" passes, "down" simulates an outage, anything else is rejected. */
export const fakeTurnstile: TurnstileVerifier = {
  async verify(token) {
    if (token === 'ok') return { ok: true };
    if (token === 'down') return { ok: false, reason: 'unavailable', codes: ['network_error'] };
    return { ok: false, reason: 'rejected', codes: ['invalid-input-response'] };
  },
};

export function boot(overrides: Overrides = {}) {
  const db = openDb(':memory:');
  seedAll(db, 80);
  const ctx = createContext(db, config, { google: fakeGoogle, turnstile: fakeTurnstile, ...overrides });
  const server = createApp(ctx).listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, ctx, db, close: () => server.close() };
}

/** A tiny cookie jar so tests behave like a browser. */
export class Jar {
  cookies = new Map<string, string>();

  absorb(res: Response): void {
    for (const line of res.headers.getSetCookie()) {
      const pair = line.split(';')[0]!;
      const i = pair.indexOf('=');
      const name = pair.slice(0, i);
      const value = pair.slice(i + 1);
      if (value === '' || /expires=Thu, 01 Jan 1970/i.test(line)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  header(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

/** Google login only: gives the stateful login cookie but no access token yet (like right after landing). */
export async function loginOnly(base: string, name: string, jar = new Jar()): Promise<Jar> {
  const start = await fetch(`${base}/api/auth/google?returnTo=/search`, { redirect: 'manual' });
  jar.absorb(start);
  const state = new URL(start.headers.get('location')!).searchParams.get('state')!;

  const cb = await fetch(`${base}/api/auth/google/callback?code=${name}&state=${state}`, {
    redirect: 'manual',
    headers: { cookie: jar.header() },
  });
  jar.absorb(cb);
  return jar;
}

/** Trade the login cookie plus a Turnstile token for an access token. */
export function getAccess(base: string, jar: Jar, token = 'ok') {
  return call(base, '/api/auth/access', { method: 'POST', jar, json: { turnstileToken: token } });
}

/** Full sign-in as the site does it: Google login, then Turnstile, so the jar holds both cookies. */
export async function login(base: string, name: string): Promise<Jar> {
  const jar = await loginOnly(base, name);
  const res = await getAccess(base, jar);
  if (res.status !== 200) throw new Error(`access request failed: ${res.status} ${JSON.stringify(res.body)}`);
  return jar;
}

export async function call(
  base: string,
  path: string,
  opts: { method?: string; jar?: Jar; origin?: string | null; ip?: string; json?: unknown } = {},
) {
  const headers: Record<string, string> = {};
  if (opts.jar) headers.cookie = opts.jar.header();
  if (opts.origin !== null && (opts.method ?? 'GET') !== 'GET') headers.origin = opts.origin ?? ORIGIN;
  if (opts.json !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(base + path, {
    method: opts.method ?? 'GET',
    headers,
    redirect: 'manual',
    body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined,
  });
  opts.jar?.absorb(res);
  const text = await res.text();
  return { res, status: res.status, body: text ? (JSON.parse(text) as any) : null };
}
