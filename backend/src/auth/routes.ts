import { randomBytes } from 'node:crypto';
import { Router, type Response } from 'express';
import { z } from 'zod';
import type { FixedWindowThrottle } from '../analytics/throttle.js';
import type { Config } from '../config.js';
import { ipKey } from '../reveal/ip.js';
import type { TurnstileVerifier } from '../turnstile/verify.js';
import type { GoogleAuth } from './google.js';
import {
  AUTH_COOKIE, OAUTH_TX_COOKIE,
  clearAccessCookie, clearAuthCookies, clearOAuthTxCookie, setAccessCookie, setAuthTokenCookie, setOAuthTxCookie,
} from './cookies.js';
import { asyncHandler, HttpError } from './http.js';
import { trustedOrigin, type createAuthMiddleware } from './middleware.js';
import type { AuthSessionStore } from './sessions.js';
import { OAUTH_TX_MAX_AGE_MS, type TokenService } from './tokens.js';
import type { UserStore } from './users.js';

interface Deps {
  config: Config;
  google: GoogleAuth | null;
  users: UserStore;
  sessions: AuthSessionStore;
  tokens: TokenService;
  auth: ReturnType<typeof createAuthMiddleware>;
  turnstile: TurnstileVerifier;
  accessThrottle: FixedWindowThrottle;
}

const accessBody = z.object({ turnstileToken: z.string().min(1).max(2048) });

export function authRoutes({ config, google, users, sessions, tokens, auth, turnstile, accessThrottle }: Deps): Router {
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

  /** The stateful login token from its cookie, or null (and the cookies are cleared if it was bad). */
  const currentSession = (req: { cookies?: Record<string, unknown> }, res: Response) => {
    const raw = req.cookies?.[AUTH_COOKIE];
    if (typeof raw !== 'string' || raw === '') return null;
    const session = sessions.validate(raw);
    if (!session) clearAuthCookies(res, config);
    return session && { ...session, raw };
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

    // Login only hands out the stateful login token. The access token needs a Turnstile solve,
    // which the site runs in the background right after landing.
    const user = users.upsertGoogleUser(profile);
    const session = sessions.create(user.id, { ip: req.ip, userAgent: req.get('user-agent') });
    clearAccessCookie(res, config); // never let a previous person's access token survive a new login
    setAuthTokenCookie(res, config, session);
    backToSite(res, tx.returnTo);
  }));

  // Trade (login token cookie + a fresh Turnstile token) for a short-lived access token.
  // The browser attaches the httpOnly login cookie by itself; JavaScript only supplies the Turnstile token.
  router.post('/auth/access', csrf, asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'no-store');

    if (!accessThrottle.allow(ipKey(req.ip))) {
      throw new HttpError(429, 'rate_limited', 'Too many verification attempts. Please wait a moment.', {
        retryAfterSeconds: 60,
      });
    }
    const { turnstileToken } = accessBody.parse(req.body);

    // Check the login first: logged-out visitors must not cost a Cloudflare call.
    const session = currentSession(req, res);
    if (!session) throw new HttpError(401, 'unauthorized', 'Please log in');

    const check = await turnstile.verify(turnstileToken, req.ip);
    if (!check.ok) {
      if (check.reason === 'unavailable') {
        console.error('Turnstile verification unavailable:', check.codes);
        throw new HttpError(503, 'turnstile_unavailable', 'Human verification is temporarily unavailable');
      }
      throw new HttpError(400, 'turnstile_failed', 'Human verification failed', { codes: check.codes });
    }

    const user = users.getById(session.userId);
    if (!user) {
      sessions.revoke(session.raw);
      clearAuthCookies(res, config);
      throw new HttpError(401, 'unauthorized', 'Account no longer exists');
    }

    const access = await tokens.signAccess(user.id);
    setAccessCookie(res, config, access.token, config.auth.accessTtlSeconds);
    res.json({ user, expiresAt: access.expiresAt });
  }));

  router.post('/auth/logout', csrf, (req, res) => {
    const raw: unknown = req.cookies?.[AUTH_COOKIE];
    if (typeof raw === 'string' && raw) sessions.revoke(raw);
    clearAuthCookies(res, config);
    res.status(204).end();
  });

  // Who is logged in (from the stateful login token), and whether they still hold a valid access token,
  // so a page reload within the access lifetime doesn't need another Turnstile solve.
  router.get('/auth/me', asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'private, no-store');

    const session = currentSession(req, res);
    if (!session) throw new HttpError(401, 'unauthorized', 'Not logged in');

    const user = users.getById(session.userId);
    if (!user) {
      sessions.revoke(session.raw);
      clearAuthCookies(res, config);
      throw new HttpError(401, 'unauthorized', 'Account no longer exists');
    }

    const state = await auth.readAccess(req);
    const access = state === 'ok' && req.auth?.userId === user.id ? { expiresAt: req.auth.accessExpiresAt } : null;
    res.json({ user, access });
  }));

  return router;
}
