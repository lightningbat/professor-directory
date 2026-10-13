import type { CookieOptions, Response } from 'express';
import type { Config } from '../config.js';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';
export const OAUTH_TX_COOKIE = 'oauth_tx';

// The refresh cookie is only ever sent to the auth endpoints.
export const REFRESH_PATH = '/api/auth';
export const OAUTH_TX_PATH = '/api/auth/google';

function base(config: Config): CookieOptions {
  const { secure, sameSite, domain } = config.auth.cookie;
  return { httpOnly: true, secure, sameSite, domain };
}

export function setAuthCookies(
  res: Response,
  config: Config,
  access: string,
  refresh: { token: string; expiresAt: number },
): void {
  const refreshMaxAge = Math.max(0, refresh.expiresAt - Date.now());
  // The access cookie outlives the JWT inside it on purpose: once the JWT expires the browser
  // still sends it, so the API can answer "token_expired" and the client refreshes quietly,
  // instead of the user silently turning into a logged-out visitor.
  res.cookie(ACCESS_COOKIE, access, { ...base(config), path: '/', maxAge: refreshMaxAge });
  res.cookie(REFRESH_COOKIE, refresh.token, { ...base(config), path: REFRESH_PATH, maxAge: refreshMaxAge });
}

export function clearAuthCookies(res: Response, config: Config): void {
  res.clearCookie(ACCESS_COOKIE, { ...base(config), path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...base(config), path: REFRESH_PATH });
}

export function setOAuthTxCookie(res: Response, config: Config, value: string, maxAgeMs: number): void {
  // Must be Lax: Google sends the browser back with a cross-site top-level GET, which
  // Strict cookies would not be attached to.
  res.cookie(OAUTH_TX_COOKIE, value, { ...base(config), sameSite: 'lax', path: OAUTH_TX_PATH, maxAge: maxAgeMs });
}

export function clearOAuthTxCookie(res: Response, config: Config): void {
  res.clearCookie(OAUTH_TX_COOKIE, { ...base(config), sameSite: 'lax', path: OAUTH_TX_PATH });
}
