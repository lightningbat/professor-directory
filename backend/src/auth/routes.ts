import { randomBytes } from 'node:crypto';
import { Router, type Response } from 'express';
import type { Config } from '../config.js';
import type { GoogleAuth } from './google.js';
import {
  ACCESS_COOKIE, OAUTH_TX_COOKIE, REFRESH_COOKIE,
  clearAuthCookies, clearOAuthTxCookie, setAuthCookies, setOAuthTxCookie,
} from './cookies.js';
import { asyncHandler, HttpError } from './http.js';
import { trustedOrigin, type createAuthMiddleware } from './middleware.js';
import type { SessionStore } from './sessions.js';
import { OAUTH_TX_MAX_AGE_MS, type TokenService } from './tokens.js';
import type { UserStore } from './users.js';

interface Deps {
  config: Config;
  google: GoogleAuth | null;
  users: UserStore;
  sessions: SessionStore;
  tokens: TokenService;
  auth: ReturnType<typeof createAuthMiddleware>;
}

// Only same-site relative paths: blocks open redirects like //evil.com or https://evil.com.
const safeReturnTo = (value: unknown): string =>
  typeof value === 'string' && /^\/(?!\/)[^\s\\]{0,200}$/.test(value) ? value : '/';

export function authRoutes({ config, google, users, sessions, tokens, auth }: Deps): Router {
  const router = Router();
  const csrf = trustedOrigin(config.corsOrigins);

  const backToSite = (res: Response, path: string, error?: string) => {
    const url = new URL(config.frontendUrl + path);
    if (error) url.searchParams.set('auth_error', error);
    res.redirect(url.toString());
  };

  // 1. Browser navigates here; we bounce it to Google.
  router.get('/auth/google', asyncHandler(async (req, res) => {
    if (!google) throw new HttpError(503, 'oauth_not_configured', 'Google login is not configured on this server');

    const state = randomBytes(16).toString('hex');
    const { url, codeVerifier } = await google.start(state);
    const tx = await tokens.signOAuthTx({ state, codeVerifier, returnTo: safeReturnTo(req.query.returnTo) });

    setOAuthTxCookie(res, config, tx, OAUTH_TX_MAX_AGE_MS);
    res.redirect(url);
  }));

  // 2. Google sends the browser back here with ?code&state.
  router.get('/auth/google/callback', asyncHandler(async (req, res) => {
    if (!google) throw new HttpError(503, 'oauth_not_configured', 'Google login is not configured on this server');

    const rawTx: unknown = req.cookies?.[OAUTH_TX_COOKIE];
    const tx = typeof rawTx === 'string' ? await tokens.verifyOAuthTx(rawTx) : null;
    clearOAuthTxCookie(res, config);

    if (typeof req.query.error === 'string') return backToSite(res, '/', 'access_denied');
    if (!tx || typeof req.query.state !== 'string' || req.query.state !== tx.state) {
      return backToSite(res, '/', 'invalid_state');
    }
    if (typeof req.query.code !== 'string') return backToSite(res, '/', 'invalid_request');

    let profile;
    try {
      profile = await google.finish(req.query.code, tx.codeVerifier);
    } catch (err) {
      console.error('Google sign-in failed:', err);
      return backToSite(res, tx.returnTo, 'google_failed');
    }
    if (!profile.emailVerified) return backToSite(res, tx.returnTo, 'email_unverified');

    const user = users.upsertGoogleUser(profile);
    const refresh = sessions.create(user.id, { ip: req.ip, userAgent: req.get('user-agent') });
    setAuthCookies(res, config, await tokens.signAccess(user.id), refresh);
    backToSite(res, tx.returnTo);
  }));

  // Swap the refresh cookie for a fresh access + refresh pair (rotation).
  router.post('/auth/refresh', csrf, asyncHandler(async (req, res) => {
    const raw: unknown = req.cookies?.[REFRESH_COOKIE];
    const result =
      typeof raw === 'string' && raw
        ? sessions.rotate(raw, { ip: req.ip, userAgent: req.get('user-agent') })
        : ({ ok: false, reason: 'invalid' } as const);

    if (!result.ok) {
      clearAuthCookies(res, config);
      throw new HttpError(401, result.reason === 'reuse' ? 'session_revoked' : 'unauthorized', 'Please log in again');
    }

    setAuthCookies(res, config, await tokens.signAccess(result.userId), result);
    res.json({ ok: true });
  }));

  router.post('/auth/logout', csrf, (req, res) => {
    const raw: unknown = req.cookies?.[REFRESH_COOKIE];
    if (typeof raw === 'string' && raw) sessions.revoke(raw);
    clearAuthCookies(res, config);
    res.status(204).end();
  });

  router.get('/auth/me', auth.required, (req, res) => {
    const user = users.getById(req.auth!.userId);
    if (!user) {
      clearAuthCookies(res, config);
      throw new HttpError(401, 'unauthorized', 'Account no longer exists');
    }
    res.set('Cache-Control', 'private, no-store');
    res.json({ user });
  });

  return router;
}

export { ACCESS_COOKIE };
