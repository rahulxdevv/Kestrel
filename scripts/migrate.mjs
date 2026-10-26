#!/usr/bin/env node
/**
 * Apply Kestrel's SQL migrations to a SQLite file without booting the server.
 * `npm run db:migrate`. The server also runs this automatically on every boot.
 */
import { readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const path = process.env.DATABASE_PATH || join(process.env.DATA_DIR || 'data', 'kestrel.db');
mkdirSync(dirname(resolve(path)), { recursive: true });
const db = new DatabaseSync(path);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);
`);

const dir = resolve(process.env.MIGRATIONS_DIR || 'migrations');
const applied = new Set(db.prepare('SELECT name FROM _migrations').all().map((r) => r.name));
let count = 0;

for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  if (applied.has(file)) continue;
  const sql = readFileSync(join(dir, file), 'utf8');
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(sql);
    db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(file, Date.now());
    db.exec('COMMIT');
    console.log(`✓ ${file}`);
    count++;
  } catch (e) {
    try {
      db.exec('ROLLBACK');
    } catch {}
    console.error(`✗ ${file}: ${e.message}`);
    process.exit(1);
  }
}

console.log(count ? `Applied ${count} migration(s) to ${path}` : `Database already up to date (${path})`);
db.close();
