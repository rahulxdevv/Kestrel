import type { Db } from '../shared/db';

/**
 * Bindings the app needs. It is intentionally runtime-agnostic: Cloudflare injects D1 + the
 * static-assets binding, Node injects the SQLite adapter + a disk reader. Everything else is env.
 */
export interface Env {
  DB: Db;
  /** Static-assets binding: Cloudflare's Fetcher or the Node disk reader. */
  ASSETS: { fetch(input: any, init?: any): Promise<Response> };
  /** Dashboard login password. */
  ADMIN_PASSWORD?: string;
  /** Signing key for the login cookie. On Node it is generated and persisted automatically. */
  SESSION_SECRET?: string;
  /** Max tracked events per minute per IP (default 300, 0 disables). */
  INGEST_RATE_LIMIT?: string;
  /** Public sample-data showcase. Dashboard reads are open; all API writes are rejected. */
  DEMO_MODE?: string;
  /** Public base URL, used in generated snippets and webhook examples. */
  SITE_URL?: string;
}

export interface Site {
  id: string;
  name: string;
  domain: string;
  timezone: string;
  currency: string;
  api_key: string;
  dodo_webhook_secret: string | null;
  polar_webhook_secret: string | null;
  stripe_webhook_secret: string | null;
  razorpay_webhook_secret: string | null;
  /** When set, the read-only dashboard is public at /share/<token>. */
  share_token: string | null;
  created_at: number;
}

export type AppEnv = { Bindings: Env; Variables: { site: Site } };

const siteCache = new Map<string, { site: Site | null; at: number }>();

/** Sites change rarely; cache them per process so ingestion costs one fewer read per event. */
export async function getSite(db: Db, id: string): Promise<Site | null> {
  const hit = siteCache.get(id);
  if (hit && Date.now() - hit.at < 60_000) return hit.site;
  const site = await db.prepare('SELECT * FROM sites WHERE id = ?').bind(id).first<Site>();
  siteCache.set(id, { site, at: Date.now() });
  return site;
}

export function forgetSite(id: string) {
  siteCache.delete(id);
}
