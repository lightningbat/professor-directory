import { createAuthMiddleware } from './auth/middleware.js';
import { createGoogleAuth, type GoogleAuth } from './auth/google.js';
import { SessionStore } from './auth/sessions.js';
import { TokenService } from './auth/tokens.js';
import { UserStore } from './auth/users.js';
import type { Config } from './config.js';
import type { Db } from './db.js';
import { RevealLimiter } from './reveal/limiter.js';
import { ProfessorRepository } from './repository.js';

export interface Overrides {
	google?: GoogleAuth | null;
	reuseGraceMs?: number;
}

/** Builds every service once so the server and the tests wire things the same way. */
export function createContext(db: Db, config: Config, overrides: Overrides = {}) {
	const tokens = new TokenService(config.auth.accessSecret, config.auth.accessTtlSeconds);
	return {
		config,
		repo: new ProfessorRepository(db),
		users: new UserStore(db),
		sessions: new SessionStore(db, config.auth.refreshTtlDays * 86_400_000, overrides.reuseGraceMs),
		tokens,
		auth: createAuthMiddleware(tokens),
		limiter: new RevealLimiter(db),
		google:
			overrides.google !== undefined
				? overrides.google
				: config.auth.google
					? createGoogleAuth(config.auth.google)
					: null,
	};
}

export type AppContext = ReturnType<typeof createContext>;
