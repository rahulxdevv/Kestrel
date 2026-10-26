import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SqliteDb } from './sqlite';

/**
 * Applies every `migrations/*.sql` file once, in filename order, recording it in `_migrations`.
 * The same files are used by `wrangler d1 migrations apply` for Cloudflare, so both runtimes
 * always end up with the same schema.
 */
export function migrate(db: SqliteDb, dir: string): string[] {
  db.execScript('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);');
  const applied = new Set(
    (db.raw.prepare('SELECT name FROM _migrations').all() as { name: string }[]).map((r) => r.name),
  );
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const done: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(dir, file), 'utf8');
    db.execScript('BEGIN IMMEDIATE');
    try {
      db.execScript(sql);
      db.raw.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(file, Date.now());
      db.execScript('COMMIT');
      done.push(file);
    } catch (e) {
      try {
        db.execScript('ROLLBACK');
      } catch {}
      throw new Error(`Migration ${file} failed: ${(e as Error).message}`);
    }
  }
  return done;
}
