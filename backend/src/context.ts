import { AnalyticsStore } from './analytics/store.js';
import { FixedWindowThrottle } from './analytics/throttle.js';
import { createAuthMiddleware } from './auth/middleware.js';
import { createGoogleAuth, type GoogleAuth } from './auth/google.js';
import { AuthSessionStore } from './auth/sessions.js';
import { TokenService } from './auth/tokens.js';
import { UserStore } from './auth/users.js';
import type { Config } from './config.js';
import type { Db } from './db.js';
import { RevealLimiter } from './reveal/limiter.js';
import { ProfessorRepository } from './repository.js';
import { createBypassVerifier, createTurnstileVerifier, type TurnstileVerifier } from './turnstile/verify.js';

export interface Overrides {
  google?: GoogleAuth | null;
  turnstile?: TurnstileVerifier;
}

const DAY_MS = 86_400_000;

/** Builds every service once so the server and the tests wire things the same way. */
export function createContext(db: Db, config: Config, overrides: Overrides = {}) {
  const tokens = new TokenService(config.auth.accessSecret, config.auth.accessTtlSeconds);
  const turnstileBypassed = !overrides.turnstile && !config.turnstile.secret;

  return {
    config,
    repo: new ProfessorRepository(db),
    users: new UserStore(db),
    sessions: new AuthSessionStore(db, config.auth.authTokenTtlDays * DAY_MS, config.auth.authTokenIdleDays * DAY_MS),
    tokens,
    auth: createAuthMiddleware(tokens),
    limiter: new RevealLimiter(db),
    analytics: new AnalyticsStore(db, config.analytics.timezone),
    heartbeatThrottle: new FixedWindowThrottle(120, 60_000), // per IP, per minute
    accessThrottle: new FixedWindowThrottle(20, 60_000), // access-token requests, per IP, per minute
    turnstileBypassed,
    turnstile:
      overrides.turnstile ??
      (config.turnstile.secret
        ? createTurnstileVerifier({
            secret: config.turnstile.secret,
            allowedHostnames: config.turnstile.allowedHostnames,
            action: config.turnstile.action,
          })
        : createBypassVerifier()),
    google:
      overrides.google !== undefined
        ? overrides.google
        : config.auth.google
          ? createGoogleAuth(config.auth.google)
          : null,
  };
}

export type AppContext = ReturnType<typeof createContext>;
