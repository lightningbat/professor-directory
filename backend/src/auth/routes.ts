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

export function authRoutes({ config, google, users, sessions, tokens, auth }: Deps): Router {
  const router = Router();
  const csrf = trustedOrigin(config.corsOrigins);

  // Relative paths, or absolute URLs on one of our own origins (public site, admin dashboard).
  // Anything else falls back to "/" so this can't be used as an open redirect.
  const safeReturnTo = (value: unknown): string => {
    if (typeof value !== 'string' || value.length > 300) return '/';
    if (/^\/(?!\/)[^\s\\]{0,200}$/.test(value)) return value;
    try {
      const url = new URL(value);
      if (/^https?:$/.test(url.protocol) && config.corsOrigins.includes(url.origin)) return url.toString();
    } catch {
      /* not a URL */
    }
    return '/';
  };

  // The destination also travels inside `state` (which Google hands back untouched), so even when
  // the login cookie is missing we can send an error back to the site the login started from.
  // It is re-checked against the allow-list, so a forged state can't redirect anywhere else.
  const returnToFromState = (state: unknown): string => {
    if (typeof state !== 'string') return '/';
    const dot = state.indexOf('.');
    if (dot < 0) return '/';
    try {
      return safeReturnTo(Buffer.from(state.slice(dot + 1), 'base64url').toString('utf8'));
    } catch {
      return '/';
    }
  };

  const backToSite = (res: Response, path: string, error?: string) => {
    const url = new URL(path, `${config.frontendUrl}/`);
    if (error) url.searchParams.set('auth_error', error);
    res.redirect(url.toString());
  };

  // 1. Browser navigates here; we bounce it to Google.
  router.get('/auth/google', asyncHandler(async (req, res) => {
    if (!google) throw new HttpError(503, 'oauth_not_configured', 'Google login is not configured on this server');

    const requested = req.query.returnTo;
    const returnTo = safeReturnTo(requested);
    if (typeof requested === 'string' && requested !== '/' && returnTo === '/') {
      console.warn(
        `Login returnTo "${requested}" was rejected: its origin isn't in FRONTEND_URL, ADMIN_URL or CORS_ORIGIN. ` +
          `The user will be sent to ${config.frontendUrl}/ instead.`,
      );
    }

    const state = `${randomBytes(16).toString('hex')}.${Buffer.from(returnTo).toString('base64url')}`;
    const { url, codeVerifier } = await google.start(state);
    const tx = await tokens.signOAuthTx({ state, codeVerifier, returnTo });

    setOAuthTxCookie(res, config, tx, OAUTH_TX_MAX_AGE_MS);
    res.redirect(url);
  }));

  // 2. Google sends the browser back here with ?code&state.
  router.get('/auth/google/callback', asyncHandler(async (req, res) => {
    if (!google) throw new HttpError(503, 'oauth_not_configured', 'Google login is not configured on this server');

    const rawTx: unknown = req.cookies?.[OAUTH_TX_COOKIE];
    const tx = typeof rawTx === 'string' ? await tokens.verifyOAuthTx(rawTx) : null;
    clearOAuthTxCookie(res, config);

    const dest = tx?.returnTo ?? returnToFromState(req.query.state);

    if (typeof req.query.error === 'string') return backToSite(res, dest, 'access_denied');
    if (!tx || typeof req.query.state !== 'string' || req.query.state !== tx.state) {
      console.warn(
        tx
          ? 'Google callback: state did not match the login cookie'
          : 'Google callback: login cookie (oauth_tx) missing. If the login started on a different host than this ' +
            'callback, set COOKIE_DOMAIN to the shared parent domain (e.g. .mydomain.com).',
      );
      return backToSite(res, dest, 'invalid_state');
    }
    if (typeof req.query.code !== 'string') return backToSite(res, dest, 'invalid_request');

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
