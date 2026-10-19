import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { adminRoutes } from './admin/routes.js';
import { analyticsRoutes } from './analytics/routes.js';
import { authRoutes } from './auth/routes.js';
import { HttpError } from './auth/http.js';
import type { AppContext } from './context.js';
import { professorRoutes } from './routes/professors.js';

export function createApp(ctx: AppContext) {
  const { config } = ctx;
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins, credentials: true, methods: ['GET', 'POST'] }));
  app.use(cookieParser());
  app.use(express.json({ limit: '2kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/admin', adminRoutes(ctx));
  app.use('/api', authRoutes(ctx));
  app.use('/api', analyticsRoutes(ctx));
  app.use('/api', professorRoutes(ctx));

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Not found' } });
  });

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof HttpError) {
      const retry = err.extra.retryAfterSeconds;
      if (typeof retry === 'number') res.set('Retry-After', String(retry));
      res.status(err.status).json({ error: { code: err.code, message: err.message, ...err.extra } });
      return;
    }
    if (err instanceof ZodError) {
      res.status(400).json({
        error: {
          code: 'invalid_request',
          message: 'Invalid query parameters',
          issues: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
        },
      });
      return;
    }
    if ((err as { type?: string }).type === 'entity.parse.failed' || (err as { type?: string }).type === 'entity.too.large') {
      res.status(400).json({ error: { code: 'invalid_request', message: 'Invalid request body' } });
      return;
    }
    console.error(err);
    res.status(500).json({ error: { code: 'internal', message: 'Internal server error' } });
  };
  app.use(onError);

  return app;
}
