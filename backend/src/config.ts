import 'dotenv/config';
import { z } from 'zod';

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(8080),
    DATABASE_PATH: z.string().min(1).default('./data/professors.db'),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
    FRONTEND_URL: z.string().url().default('http://localhost:5173'),
    AUTO_SEED: z.enum(['true', 'false']).optional(),
    SEED_COUNT: z.coerce.number().int().min(1).max(5000).default(200),

    ACCESS_TOKEN_SECRET: z.string().min(32, 'must be at least 32 characters (openssl rand -base64 48)'),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),

    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_REDIRECT_URI: z.string().url().default('http://localhost:8080/api/auth/google/callback'),

    COOKIE_SECURE: z.enum(['true', 'false']).optional(),
    COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    COOKIE_DOMAIN: z.string().optional(),

    TRUST_PROXY: z.string().default('false'),
  })
  .refine((e) => e.COOKIE_SAMESITE !== 'none' || e.COOKIE_SECURE !== 'false', {
    path: ['COOKIE_SAMESITE'],
    message: 'SameSite=None requires secure cookies',
  });

function parseTrustProxy(value: string): boolean | number | string {
  if (value === 'false') return false;
  if (value === 'true') return true;
  if (/^\d+$/.test(value)) return Number(value);
  return value; // e.g. "loopback" or a CIDR list, passed straight to Express
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  // Treat empty values (KEY=) the same as unset.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ''));
  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
    throw new Error(`Invalid environment configuration:\n  ${details}`);
  }
  const e = parsed.data;
  const frontendUrl = e.FRONTEND_URL.replace(/\/$/, '');
  const corsOrigins = [
    ...new Set([...e.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean), new URL(frontendUrl).origin]),
  ];

  return {
    env: e.NODE_ENV,
    port: e.PORT,
    databasePath: e.DATABASE_PATH,
    corsOrigins,
    frontendUrl,
    autoSeed: e.AUTO_SEED ? e.AUTO_SEED === 'true' : e.NODE_ENV !== 'production',
    seedCount: e.SEED_COUNT,
    trustProxy: parseTrustProxy(e.TRUST_PROXY),
    auth: {
      accessSecret: e.ACCESS_TOKEN_SECRET,
      accessTtlSeconds: e.ACCESS_TOKEN_TTL_SECONDS,
      refreshTtlDays: e.REFRESH_TOKEN_TTL_DAYS,
      google:
        e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET
          ? { clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET, redirectUri: e.GOOGLE_REDIRECT_URI }
          : null,
      cookie: {
        secure: e.COOKIE_SECURE ? e.COOKIE_SECURE === 'true' : e.NODE_ENV === 'production',
        sameSite: e.COOKIE_SAMESITE,
        domain: e.COOKIE_DOMAIN,
      },
    },
  };
}

export type Config = ReturnType<typeof loadConfig>;
