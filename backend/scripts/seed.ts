// npm run seed          -> fills an empty database
// npm run seed -- --reset -> wipes professors and re-seeds
import { loadConfig } from '../src/config.js';
import { openDb } from '../src/db.js';
import { seedAll, seedIfEmpty } from '../src/seed/seed.js';

const config = loadConfig();
const db = openDb(config.databasePath);
const reset = process.argv.includes('--reset');

const inserted = reset ? seedAll(db, config.seedCount) : seedIfEmpty(db, config.seedCount);
console.log(inserted > 0 ? `Inserted ${inserted} professors` : 'Database already has data (use --reset to replace it)');
db.close();
