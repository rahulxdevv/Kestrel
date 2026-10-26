/**
 * The tiny SQL surface Kestrel needs. It matches the subset of Cloudflare D1 that the app uses,
 * so the same query code runs on Cloudflare Workers (D1) and on any Node host (`node:sqlite`).
 */
export interface DbResult<T = unknown> {
  results: T[];
  success: boolean;
  meta?: Record<string, unknown>;
}

export interface DbStatement {
  bind(...values: unknown[]): DbStatement;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<DbResult<T>>;
  run(): Promise<DbResult<unknown>>;
}

export interface Db {
  prepare(query: string): DbStatement;
  batch<T = unknown>(statements: DbStatement[]): Promise<DbResult<T>[]>;
  exec?(query: string): Promise<unknown>;
}
