import type { CookieOptions, Response } from 'express';
import type { Config } from '../config.js';

export const ACCESS_COOKIE = 'access_token';
export const AUTH_COOKIE = 'auth_token';
export const OAUTH_TX_COOKIE = 'oauth_tx';

// The login token only travels to the auth endpoints; the access token to the whole API.
export const AUTH_PATH = '/api/auth';
export const ACCESS_PATH = '/api';
export const OAUTH_TX_PATH = '/api/auth/google';

// Cookies from the previous design (refresh token, and an access cookie scoped to "/").
const LEGACY_REFRESH_COOKIE = 'refresh_token';

function base(config: Config): CookieOptions {
  const { secure, sameSite, domain } = config.auth.cookie;
  return { httpOnly: true, secure, sameSite, domain };
}

function clearLegacy(res: Response, config: Config): void {
  res.clearCookie(ACCESS_COOKIE, { ...base(config), path: '/' });
  res.clearCookie(LEGACY_REFRESH_COOKIE, { ...base(config), path: AUTH_PATH });
}

export function setAuthTokenCookie(res: Response, config: Config, session: { token: string; expiresAt: number }): void {
  res.cookie(AUTH_COOKIE, session.token, {
    ...base(config),
    path: AUTH_PATH,
    maxAge: Math.max(0, session.expiresAt - Date.now()),
  });
}

export function setAccessCookie(res: Response, config: Config, token: string, ttlSeconds: number): void {
  clearLegacy(res, config);
  res.cookie(ACCESS_COOKIE, token, { ...base(config), path: ACCESS_PATH, maxAge: ttlSeconds * 1000 });
}

export function clearAccessCookie(res: Response, config: Config): void {
  clearLegacy(res, config);
  res.clearCookie(ACCESS_COOKIE, { ...base(config), path: ACCESS_PATH });
}

/** Logout, or a login token that turned out to be invalid. */
export function clearAuthCookies(res: Response, config: Config): void {
  clearAccessCookie(res, config);
  res.clearCookie(AUTH_COOKIE, { ...base(config), path: AUTH_PATH });
}

export function setOAuthTxCookie(res: Response, config: Config, value: string, maxAgeMs: number): void {
  // Must be Lax: Google sends the browser back with a cross-site top-level GET, which
  // Strict cookies would not be attached to.
  res.cookie(OAUTH_TX_COOKIE, value, { ...base(config), sameSite: 'lax', path: OAUTH_TX_PATH, maxAge: maxAgeMs });
}

export function clearOAuthTxCookie(res: Response, config: Config): void {
  res.clearCookie(OAUTH_TX_COOKIE, { ...base(config), sameSite: 'lax', path: OAUTH_TX_PATH });
}
