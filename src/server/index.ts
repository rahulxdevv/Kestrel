import { serve } from '@hono/node-server';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import app from '../worker/index';
import type { Env } from '../worker/env';
import { migrate } from './migrate';
import { openDatabase } from './sqlite';
import { diskAssets } from './static';

/**
 * Kestrel's portable runtime: one Node process, one SQLite file, one static folder.
 * Runs the exact same Hono app as the Cloudflare Worker, with no second code path.
 */

/** Minimal `.env` reader so local runs and VPS boxes need no extra dependency. */
function loadEnvFile(file = '.env'): void {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

/** Sessions must survive a restart, so persist a generated secret next to the database. */
function resolveSessionSecret(dataDir: string): { secret: string; generated: boolean } {
  const fromEnv = process.env.SESSION_SECRET?.trim();
  if (fromEnv) return { secret: fromEnv, generated: false };
  const file = join(dataDir, 'session-secret');
  if (existsSync(file)) {
    const saved = readFileSync(file, 'utf8').trim();
    if (saved) return { secret: saved, generated: false };
  }
  const secret = randomBytes(32).toString('hex');
  writeFileSync(file, secret, { mode: 0o600 });
  return { secret, generated: true };
}

/** `npm run dev` / `tsx watch` runs: pick up the lifecycle or the tsx launcher. */
function isDevMode(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  const lifecycle = process.env.npm_lifecycle_event ?? '';
  const argv = process.argv.join(' ');
  return lifecycle.startsWith('dev') || /(^|[\\/])tsx([\\/]| )|\btsx\b/.test(argv);
}

/**
 * Local dev needs a password to sign in with. Generate one once and keep it beside the database,
 * so a `tsx watch` restart never locks you out or changes the value you were just given.
 */
function resolveDevPassword(dataDir: string): string {
  const file = join(dataDir, 'dev-admin-password');
  if (existsSync(file)) {
    const saved = readFileSync(file, 'utf8').trim();
    if (saved) return saved;
  }
  const password = randomBytes(12).toString('base64url');
  writeFileSync(file, password, { mode: 0o600 });
  return password;
}

function main(): void {
  loadEnvFile();

  const dev = isDevMode();
  const dataDir = resolve(process.env.DATA_DIR || 'data');
  const dbPath = process.env.DATABASE_PATH || join(dataDir, 'kestrel.db');
  const assetsDir = resolve(process.env.ASSETS_DIR || (existsSync('dist') ? 'dist' : 'public'));
  const migrationsDir = resolve(process.env.MIGRATIONS_DIR || 'migrations');
  // During development, Vite owns the single browser-facing port (3000 by default).
  // The API listens behind its /api proxy on 3001; production remains on PORT (3000).
  const port = Number(dev ? process.env.API_PORT || 3001 : process.env.PORT || 3000);
  const webPort = Number(process.env.VITE_PORT || process.env.PORT || 3000);
  const hostname = process.env.HOST || '0.0.0.0';

  mkdirSync(dirname(dbPath), { recursive: true });
  let db = openDatabase(dbPath);
  const applied = migrate(db, migrationsDir);
  if (applied.length) console.log(`→ Applied ${applied.length} migration(s): ${applied.join(', ')}`);

  const demoMode = process.env.DEMO_MODE?.trim().toLowerCase() === 'true';
  if (demoMode && !process.argv.includes('--migrate')) {
    const demoSite = db.raw.prepare('SELECT 1 FROM sites WHERE id = ?').get('kestrel-demo');
    if (!demoSite) {
      db.close();
      console.log('Demo site is missing; seeding the showcase dataset…');
      const seeded = spawnSync(process.execPath, [resolve('scripts/seed-demo.mjs')], {
        env: process.env,
        stdio: 'inherit',
      });
      if (seeded.error) throw seeded.error;
      if (seeded.status !== 0) throw new Error(`Demo seed failed with exit code ${seeded.status ?? 'unknown'}`);
      db = openDatabase(dbPath);
      const seededMigrations = migrate(db, migrationsDir);
      if (seededMigrations.length) console.log(`→ Applied ${seededMigrations.length} migration(s): ${seededMigrations.join(', ')}`);
    }
  }

  const session = resolveSessionSecret(dataDir);
  const password = process.env.ADMIN_PASSWORD?.trim() || (dev ? resolveDevPassword(dataDir) : undefined);

  const env: Env = {
    DB: db,
    ASSETS: diskAssets(assetsDir),
    ADMIN_PASSWORD: password,
    SESSION_SECRET: session.secret,
    INGEST_RATE_LIMIT: process.env.INGEST_RATE_LIMIT,
    DEMO_MODE: process.env.DEMO_MODE,
    SITE_URL: process.env.SITE_URL,
  };

  if (process.argv.includes('--migrate')) {
    console.log('Database is up to date.');
    db.close();
    return;
  }

  const setup: string[] = [];
  if (!env.ADMIN_PASSWORD) {
    setup.push(
      'WARNING  ADMIN_PASSWORD is not set. The dashboard cannot be used until you set it.',
      '         Run: ADMIN_PASSWORD="a-strong-password" npm start  (or add it to .env, see .env.example)',
    );
  } else if (dev && !process.env.ADMIN_PASSWORD) {
    setup.push(
      `Dev admin password  ${env.ADMIN_PASSWORD}`,
      `                    saved in ${join(dataDir, 'dev-admin-password')}; delete that file to rotate it`,
    );
  }
  if (session.generated) {
    setup.push(`Session secret      generated and stored in ${join(dataDir, 'session-secret')}`);
  }

  const server = serve(
    {
      fetch: (req) => app.fetch(req, env),
      port,
      hostname,
    },
    (info) => {
      const base = process.env.SITE_URL || `http://localhost:${dev ? webPort : info.port}`;
      if (dev) {
        console.log('\nKestrel development servers ready');
        console.log(`  Open        ${base}/`);
        console.log(`  Dashboard   ${base}/app`);
        console.log(`  API         proxied automatically at ${base}/api`);
      } else {
        console.log(`\nKestrel listening on http://${hostname}:${info.port}`);
        console.log(`  Dashboard   ${base}/app`);
        console.log(`  Homepage    ${base}/`);
        console.log(`  Health      ${base}/api/health`);
        console.log(`  Assets      ${assetsDir}`);
      }
      console.log(`  Database    ${dbPath}`);
      if (setup.length) console.log('\n  ' + setup.join('\n  '));
    },
  );

  const shutdown = (signal: string) => {
    console.log(`\n${signal} received, shutting down.`);
    server.close(() => {
      db.close();
      process.exit(0);
    });
    // Don't hang forever on keep-alive connections.
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
