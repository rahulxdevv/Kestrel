import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import type { Db, DbResult, DbStatement } from '../shared/db';

/**
 * A D1-shaped adapter over Node's built-in SQLite (node:sqlite, Node >= 22.13).
 *
 * Why a shim instead of a second query layer: every route in the app already speaks the D1 API
 * (`prepare().bind().first()` / `.all()` / `.run()` / `batch()`), so one small adapter is enough to
 * run the exact same SQL, and therefore the exact same behaviour, on a VPS, Docker, Render or
 * Cloudflare. No ORM, no native module to compile.
 */

type Param = string | number | bigint | null | Uint8Array;

function toParam(value: unknown): Param {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return value;
  if (value instanceof Uint8Array) return value;
  // Objects/arrays are almost always a bug at the call site; store JSON rather than silently binding "[object Object]".
  return JSON.stringify(value);
}

/** Statements that produce rows need `.all()`; everything else uses `.run()`. */
function returnsRows(sql: string): boolean {
  return /^\s*(select|with|pragma|explain)\b/i.test(sql) || /\breturning\b/i.test(sql);
}

export class SqliteDb implements Db {
  readonly raw: DatabaseSync;
  private cache = new Map<string, StatementSync>();

  constructor(path: string) {
    this.raw = new DatabaseSync(path, { readOnly: false });
    // WAL keeps dashboard reads from blocking ingestion writes; NORMAL is fast and safe enough
    // for analytics (a crash can lose the last transaction, never corrupt the file).
    this.raw.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA busy_timeout = 5000;
      PRAGMA temp_store = MEMORY;
      PRAGMA cache_size = -8000;
      PRAGMA foreign_keys = ON;
    `);
  }

  private stmt(sql: string): StatementSync {
    let s = this.cache.get(sql);
    if (!s) {
      if (this.cache.size > 400) this.cache.clear();
      s = this.raw.prepare(sql);
      this.cache.set(sql, s);
    }
    return s;
  }

  prepare(sql: string): DbStatement {
    return this.statement(sql, []);
  }

  private statement(sql: string, params: unknown[]): DbStatement & { __rows: boolean } {
    const run = () => this.stmt(sql);
    const args = () => params.map(toParam);
    return {
      // Internal hint so batch() knows whether to read rows or a change count.
      __rows: returnsRows(sql),

      bind: (...values: unknown[]) => this.statement(sql, values),
      first: async <T>(colName?: string) => {
        const row = run().get(...args()) as Record<string, unknown> | undefined;
        if (!row) return null;
        if (colName) return (row[colName] ?? null) as T | null;
        return row as T;
      },
      all: async <T>() => ({
        results: run().all(...args()) as T[],
        success: true,
        meta: { changes: 0 },
      }),
      run: async () => {
        const r = run().run(...args());
        return {
          success: true,
          results: [],
          meta: { changes: Number(r.changes ?? 0), last_row_id: Number(r.lastInsertRowid ?? 0) },
        };
      },
    };
  }

  async batch<T = unknown>(statements: DbStatement[]): Promise<DbResult<T>[]> {
    if (!statements.length) return [];
    const out: DbResult<T>[] = [];
    this.raw.exec('BEGIN IMMEDIATE');
    try {
      for (const s of statements) {
        const rows = (s as DbStatement & { __rows?: boolean }).__rows ?? true;
        out.push((rows ? await s.all<T>() : await s.run()) as DbResult<T>);
      }
      this.raw.exec('COMMIT');
      return out;
    } catch (e) {
      try {
        this.raw.exec('ROLLBACK');
      } catch {}
      throw e;
    }
  }

  async exec(query: string): Promise<void> {
    this.raw.exec(query);
  }

  /** Run a multi-statement SQL file (migrations). */
  execScript(sql: string): void {
    this.raw.exec(sql);
  }

  close(): void {
    this.cache.clear();
    this.raw.close();
  }
}

/**
 * Open a database file, creating the directory and file if needed.
 * Pass `:memory:` for tests.
 */
export function openDatabase(path: string): SqliteDb {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  return new SqliteDb(path);
}
