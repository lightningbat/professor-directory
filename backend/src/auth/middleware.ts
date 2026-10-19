import type { Request, RequestHandler } from 'express';
import { asyncHandler, HttpError } from './http.js';
import { ACCESS_COOKIE } from './cookies.js';
import type { TokenService } from './tokens.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set when the request carries a valid access token (login + Turnstile within the last few minutes). */
      auth?: { userId: string; accessExpiresAt: number };
    }
  }
}

export function createAuthMiddleware(tokens: TokenService) {
  /** 'none' = no cookie, 'invalid' = expired/forged/old-format token, 'ok' = valid (sets req.auth). */
  async function readAccess(req: Request): Promise<'none' | 'invalid' | 'ok'> {
    const raw: unknown = req.cookies?.[ACCESS_COOKIE];
    if (typeof raw !== 'string' || raw === '') return 'none';
    const verified = await tokens.verifyAccess(raw);
    if (!verified) return 'invalid';
    req.auth = { userId: verified.userId, accessExpiresAt: verified.expiresAt };
    return 'ok';
  }

  /** For public routes that show more to people with access. Never fails: no token just means "guest". */
  const optional: RequestHandler = asyncHandler(async (req, _res, next) => {
    await readAccess(req);
    next();
  });

  /** For protected routes. The client renews the token on either 401 code and retries. */
  const required: RequestHandler = asyncHandler(async (req, _res, next) => {
    const result = await readAccess(req);
    if (result === 'none') throw new HttpError(401, 'access_required', 'An access token is required');
    if (result === 'invalid') throw new HttpError(401, 'access_expired', 'Your access token has expired');
    next();
  });

  return { optional, required, readAccess };
}

/**
 * CSRF defence in depth for state-changing requests (on top of SameSite cookies): browsers always
 * send Origin on cross-origin POSTs, so reject any that isn't one of our frontends.
 */
export function trustedOrigin(allowed: string[]): RequestHandler {
  return (req, _res, next) => {
    const origin = req.get('origin');
    if (origin && !allowed.includes(origin)) {
      next(new HttpError(403, 'bad_origin', 'Request origin is not allowed'));
      return;
    }
    next();
  };
}
