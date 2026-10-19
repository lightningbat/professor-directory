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
  ctx.analytics.purge(config.analytics.retentionDays);
}, 60 * 60 * 1000);
cleanup.unref();

// Once a minute, record how many people are online so the dashboard can chart it.
const snapshots = setInterval(() => ctx.analytics.recordSnapshot(), 60 * 1000);
snapshots.unref();

if (config.env === 'production' && /localhost|127\.0\.0\.1/.test(config.adminUrl)) {
  console.warn(`ADMIN_URL is still ${config.adminUrl}: admin logins will be sent to the public site instead of the dashboard`);
}
if (config.adminEmails.size === 0) {
  console.warn('ADMIN_EMAILS is empty: nobody can open /api/admin');
}

function shutdown() {
  clearInterval(cleanup);
  clearInterval(snapshots);
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
