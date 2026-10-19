import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { ONLINE_WINDOW_MS } from '../analytics/store.js';
import { HttpError } from '../auth/http.js';
import type { AppContext } from '../context.js';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

// How far back each chart range goes and how coarse the buckets are.
const RANGES = {
  '24h': { rangeMs: DAY_MS, bucketMs: 5 * 60_000 },
  '7d': { rangeMs: 7 * DAY_MS, bucketMs: 30 * 60_000 },
  '30d': { rangeMs: 30 * DAY_MS, bucketMs: 2 * HOUR_MS },
} as const;

const timelineQuery = z.object({ range: z.enum(['24h', '7d', '30d']).default('24h') });
const dailyQuery = z.object({ days: z.coerce.number().int().min(1).max(90).default(30) });
const onlineQuery = z.object({
  kind: z.enum(['all', 'user', 'guest']).default('all'),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

/** Everything under /api/admin: valid login cookie AND an email listed in ADMIN_EMAILS. */
export function adminRoutes(ctx: AppContext): Router {
  const { analytics, auth, users, config } = ctx;
  const router = Router();

  const adminOnly: RequestHandler = (req, res, next) => {
    const user = users.getById(req.auth!.userId);
    if (!user || !config.adminEmails.has(user.email.toLowerCase())) {
      next(new HttpError(403, 'forbidden', 'This account does not have admin access'));
      return;
    }
    res.set('Cache-Control', 'no-store');
    next();
  };
  router.use(auth.required, adminOnly);

  router.get('/me', (req, res) => {
    res.json({ user: users.getById(req.auth!.userId) });
  });

  // Everything the top of the dashboard needs, in one request (polled every few seconds).
  router.get('/overview', (_req, res) => {
    const now = Date.now();
    res.json({
      generatedAt: now,
      timezone: analytics.timezone,
      onlineWindowSeconds: ONLINE_WINDOW_MS / 1000,
      online: analytics.onlineCounts(now),
      pages: analytics.onlinePages(now),
      today: analytics.today(now),
      totals: { users: analytics.totalUsers() },
      reveals24h: analytics.revealsSince(now - DAY_MS),
    });
  });

  // The people online right now.
  router.get('/online', (req, res) => {
    const { kind, limit } = onlineQuery.parse(req.query);
    res.json({ generatedAt: Date.now(), sessions: analytics.onlineSessions(kind, limit) });
  });

  // Peak concurrent visitors over time.
  router.get('/timeline', (req, res) => {
    const { range } = timelineQuery.parse(req.query);
    const { rangeMs, bucketMs } = RANGES[range];
    res.json({ range, bucketSeconds: bucketMs / 1000, points: analytics.timeline(rangeMs, bucketMs) });
  });

  // Unique visitors, sessions and signups per day (days with no traffic are filled with zeros).
  router.get('/daily', (req, res) => {
    const { days } = dailyQuery.parse(req.query);
    res.json({ timezone: analytics.timezone, days: analytics.daily(days) });
  });

  return router;
}
