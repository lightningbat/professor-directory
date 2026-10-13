import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../auth/http.js';
import { trustedOrigin } from '../auth/middleware.js';
import type { AppContext } from '../context.js';
import { toPublic } from '../professorView.js';
import { ipKey } from '../reveal/ip.js';

const optionalText = (max: number) => z.string().trim().max(max).optional();

const listQuery = z.object({
  q: optionalText(200),
  college: optionalText(120),
  department: optionalText(120),
  designation: optionalText(120),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

const LIMIT_MESSAGES = {
  user_hourly: 'You have reached the hourly limit for revealing emails.',
  user_daily: 'You have reached the daily limit for revealing emails.',
  ip_hourly: 'Too many emails have been revealed from this network. Please try again later.',
} as const;

export function professorRoutes(ctx: AppContext): Router {
  const { repo, limiter, auth, config } = ctx;
  const router = Router();

  // GET /api/professors?q=&college=&department=&designation=&page=1&pageSize=10
  // Same rows for everyone, except the profile link and per-user caching.
  router.get('/professors', auth.optional, (req, res) => {
    const query = listQuery.parse(req.query);
    const result = repo.search(query);
	console.log("query: ", query)
	console.log("result: ", result)
	// console.log("listQuery: ", listQuery)
    const loggedIn = Boolean(req.auth);

    res.vary('Cookie');
    res.set('Cache-Control', 'private, no-store');
    res.json({ ...result, data: result.data.map((p) => toPublic(p, loggedIn)) });
  });

  // POST /api/professors/:id/email
  // Order matters: origin check -> verify cookie -> make sure it exists -> count against limits -> reveal.
  router.post('/professors/:id/email', trustedOrigin(config.corsOrigins), auth.required, (req, res) => {
    const id = z.string().min(1).max(64).parse(req.params.id);

    const emails = repo.getEmails(id);
    if (!emails) throw new HttpError(404, 'not_found', 'Professor not found');

    const result = limiter.consume({ userId: req.auth!.userId, ip: ipKey(req.ip), professorId: id });
    if (!result.allowed) {
      throw new HttpError(429, 'rate_limited', LIMIT_MESSAGES[result.limit], {
        limit: result.limit,
        retryAfterSeconds: result.retryAfterSeconds,
      });
    }

    res.set('Cache-Control', 'private, no-store');
    res.json({ emails, quota: { hourRemaining: result.remaining.hour, dayRemaining: result.remaining.day } });
  });

  // GET /api/filters  -> options for the three dropdowns
  router.get('/filters', (_req, res) => {
    res.set('Cache-Control', 'public, max-age=60');
    res.json(repo.filterOptions());
  });

  // GET /api/stats  -> numbers for the footer of the table
  router.get('/stats', (_req, res) => {
    res.set('Cache-Control', 'public, max-age=60');
    res.json(repo.stats());
  });

  return router;
}
