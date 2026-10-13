import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createContext } from './context.js';
import { openDb } from './db.js';
import { seedIfEmpty } from './seed/seed.js';

const config = loadConfig();
const db = openDb(config.databasePath);

if (config.autoSeed) {
	const inserted = seedIfEmpty(db, config.seedCount);
	if (inserted > 0) console.log(`Seeded ${inserted} fake professors`);
}

const ctx = createContext(db, config);
if (!ctx.google) {
	console.warn('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set: login will return 503');
}

const app = createApp(ctx);
const server = app.listen(config.port, () => {
	console.log(`API listening on http://localhost:${config.port}/api`);
});

// Housekeeping: drop expired refresh tokens and reveal-log rows older than the longest window.
const cleanup = setInterval(() => {
	ctx.sessions.purgeExpired();
	ctx.limiter.purgeOlderThanDay();
}, 60 * 60 * 1000);
cleanup.unref();

function shutdown() {
	clearInterval(cleanup);
	server.close(() => {
		db.close();
		process.exit(0);
	});
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
