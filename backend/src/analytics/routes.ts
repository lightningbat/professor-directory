import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../auth/http.js';
import type { AppContext } from '../context.js';
import { ipKey } from '../reveal/ip.js';

const id = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
const heartbeatBody = z.object({
  visitorId: id,
  sessionId: id,
  path: z.string().max(300).startsWith('/'),
});

export function analyticsRoutes(ctx: AppContext): Router {
  const { analytics, auth, heartbeatThrottle } = ctx;
  const router = Router();

  // POST /api/analytics/heartbeat  { visitorId, sessionId, path }
  // The site calls this every ~25 s while a tab is visible. "Signed in" means the request carries a valid
  // access token (login + Turnstile), never anything the browser claims in the body.
  router.post('/analytics/heartbeat', auth.optional, (req, res) => {
    if (!heartbeatThrottle.allow(ipKey(req.ip))) {
      throw new HttpError(429, 'rate_limited', 'Too many heartbeats');
    }
    const body = heartbeatBody.parse(req.body);

    analytics.heartbeat({
      visitorId: body.visitorId,
      sessionId: body.sessionId,
      userId: req.auth?.userId ?? null,
      path: body.path.split(/[?#]/)[0]!.slice(0, 100) || '/',
    });
    res.status(204).end();
  });

  return router;
}
