import type { Request, RequestHandler } from 'express';
import { asyncHandler, HttpError } from './http.js';
import { ACCESS_COOKIE } from './cookies.js';
import type { TokenService } from './tokens.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: { userId: string };
    }
  }
}

export function createAuthMiddleware(tokens: TokenService) {
  async function authenticate(req: Request): Promise<'none' | 'invalid' | 'ok'> {
    const raw: unknown = req.cookies?.[ACCESS_COOKIE];
    if (typeof raw !== 'string' || raw === '') return 'none';
    const verified = await tokens.verifyAccess(raw);
    if (!verified) return 'invalid';
    req.auth = verified;
    return 'ok';
  }

  const expired = () => new HttpError(401, 'token_expired', 'Access token is missing, expired or invalid');

  /** Works for visitors and logged-in users. A stale token gets 401 so the client can refresh. */
  const optional: RequestHandler = asyncHandler(async (req, _res, next) => {
    if ((await authenticate(req)) === 'invalid') throw expired();
    next();
  });

  /** Verifies the access cookie; anything but a valid token is a 401. */
  const required: RequestHandler = asyncHandler(async (req, _res, next) => {
    const result = await authenticate(req);
    if (result === 'none') throw new HttpError(401, 'unauthorized', 'Login required');
    if (result === 'invalid') throw expired();
    next();
  });

  return { optional, required };
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
