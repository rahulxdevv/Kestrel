import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import app from '../src/worker/index';
import type { Env } from '../src/worker/env';
import { migrate } from '../src/server/migrate';
import { SqliteDb } from '../src/server/sqlite';
import { resetRateLimits } from '../src/worker/lib/ratelimit';

/**
 * Runs the real Hono app against a real SQLite database, the same code path a self-hosted
 * deployment uses. If this passes, ingest → dashboard → share link works on a VPS.
 */

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';

let db: SqliteDb;
let env: Env;
let cookie = '';
let siteId = '';

function req(path: string, init?: RequestInit & { headers?: Record<string, string> }) {
  return app.request(path, init, env);
}

async function json<T>(res: Response): Promise<T> {
  expect(res.status, await res.clone().text()).toBeLessThan(400);
  return (await res.json()) as T;
}

beforeAll(async () => {
  resetRateLimits();
  db = new SqliteDb(':memory:');
  migrate(db, resolve('migrations'));
  env = {
    DB: db,
    ASSETS: { fetch: async () => new Response('asset', { headers: { 'content-type': 'text/plain' } }) },
    ADMIN_PASSWORD: 'correct horse battery staple',
    SESSION_SECRET: 'test-secret-that-is-long-enough-for-hmac',
  };
});

afterAll(() => db.close());

describe('node sqlite adapter (D1 compatibility)', () => {
  it('supports first/all/run and batch with mixed statements', async () => {
    await env.DB.prepare('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT, flag INTEGER)').run();
    await env.DB.prepare('INSERT INTO t (name, flag) VALUES (?, ?)').bind('a', true).run();
    const one = await env.DB.prepare('SELECT name, flag FROM t WHERE id = ?').bind(1).first<{ name: string; flag: number }>();
    expect(one).toMatchObject({ name: 'a', flag: 1 });
    expect((await env.DB.prepare('SELECT name FROM t WHERE id = ?').bind(99).first())).toBeNull();

    const [sel, upd] = await env.DB.batch<{ name: string }>([
      env.DB.prepare('SELECT name FROM t'),
      env.DB.prepare("UPDATE t SET name = 'b' WHERE id = 1"),
    ]);
    expect(sel.results).toHaveLength(1);
    expect(upd.meta?.changes).toBe(1);
  });

  it('treats undefined as NULL instead of throwing', async () => {
    await env.DB.prepare('INSERT INTO t (name, flag) VALUES (?, ?)').bind(undefined, false).run();
    const row = await env.DB.prepare('SELECT name, flag FROM t WHERE name IS NULL').first<{ flag: number }>();
    expect(row?.flag).toBe(0);
  });
});

describe('auth', () => {
  it('reports health without a login', async () => {
    const health = await json<{ ok: boolean; name: string }>(await req('/api/health'));
    expect(health.ok).toBe(true);
    expect(health.name).toBe('kestrel');
  });

  it('rejects a wrong password and accepts the right one', async () => {
    const bad = await req('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'nope' }),
    });
    expect(bad.status).toBe(401);

    const ok = await req('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
      body: JSON.stringify({ password: 'correct horse battery staple' }),
    });
    expect(ok.status).toBe(200);
    cookie = ok.headers.get('set-cookie')?.split(';')[0] ?? '';
    expect(cookie).toMatch(/^kt_auth=/);
  });

  it('guards the dashboard API', async () => {
    expect((await req('/api/sites')).status).toBe(401);
  });
});

describe('sites, ingest and reports', () => {
  it('creates a site', async () => {
    const site = await json<{ id: string; api_key: string; share_token: string | null }>(
      await req('/api/sites', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ domain: 'https://www.example.com/pricing', name: 'Example', timezone: 'UTC', currency: 'USD' }),
      }),
    );
    expect(site.id).toBeTruthy();
    expect(site.api_key.startsWith('k_')).toBe(true);
    expect(site.share_token).toBeNull();
    siteId = site.id;
  });

  it('accepts a pageview and a goal from the tracker', async () => {
    const base = { w: siteId, u: 'https://example.com/pricing', vid: 'visitor-test-1', sid: 'session-test-1', sw: 1440 };
    const pv = await req('/api/event', {
      method: 'POST',
      headers: { 'user-agent': UA, 'x-forwarded-for': '198.51.100.7', 'cf-ipcountry': 'IN', 'content-type': 'text/plain' },
      body: JSON.stringify({ ...base, t: 'pageview', r: 'https://t.co/abc' }),
    });
    expect(pv.status).toBe(202);

    const goal = await req('/api/event', {
      method: 'POST',
      headers: { 'user-agent': UA, 'x-forwarded-for': '198.51.100.7', 'content-type': 'text/plain' },
      body: JSON.stringify({ ...base, t: 'goal', n: 'signup' }),
    });
    expect(goal.status).toBe(202);

    const ping = await req('/api/event', {
      method: 'POST',
      headers: { 'user-agent': UA, 'content-type': 'text/plain' },
      body: JSON.stringify({ ...base, t: 'ping', d: 45_000 }),
    });
    expect(ping.status).toBe(202);
  });

  it('rejects events for another domain', async () => {
    const res = await req('/api/event', {
      method: 'POST',
      headers: { 'user-agent': UA, 'content-type': 'text/plain' },
      body: JSON.stringify({ w: siteId, t: 'pageview', u: 'https://evil.test/x', vid: 'visitor-test-2', sid: 'session-test-2' }),
    });
    expect(res.status).toBe(403);
  });

  it('computes the overview with attribution and new/returning', async () => {
    const data = await json<any>(await req(`/api/sites/${siteId}/overview?period=30d`, { headers: { cookie } }));
    expect(data.current.visitors).toBe(1);
    expect(data.current.pageviews).toBe(1);
    expect(data.current.newVisitors).toBe(1);
    expect(data.current.returningVisitors).toBe(0);
    expect(data.online).toBe(1);
    expect(data.series).toHaveLength(30);
    expect(data.series.reduce((n: number, s: any) => n + s.visitors, 0)).toBe(1);
  });

  it('breaks traffic down by source, channel and page', async () => {
    const sources = await json<any[]>(await req(`/api/sites/${siteId}/breakdown?period=30d&dim=source`, { headers: { cookie } }));
    expect(sources[0]).toMatchObject({ label: 'X', visitors: 1 });
    const pages = await json<any[]>(await req(`/api/sites/${siteId}/breakdown?period=30d&dim=page`, { headers: { cookie } }));
    expect(pages[0]).toMatchObject({ label: '/pricing', visitors: 1 });
    const countries = await json<any[]>(await req(`/api/sites/${siteId}/breakdown?period=30d&dim=country`, { headers: { cookie } }));
    expect(countries[0]).toMatchObject({ label: 'IN' });
  });

  it('filters by channel and by page', async () => {
    const filters = JSON.stringify({ channel: 'Organic Social' });
    const res = await json<any>(
      await req(`/api/sites/${siteId}/overview?period=30d&filters=${encodeURIComponent(filters)}`, { headers: { cookie } }),
    );
    expect(res.current.visitors).toBe(1);

    const missRes = await json<any>(
      await req(`/api/sites/${siteId}/overview?period=30d&filters=${encodeURIComponent(JSON.stringify({ page: '/nope' }))}`, {
        headers: { cookie },
      }),
    );
    expect(missRes.current.visitors).toBe(0);
  });

  it('returns the realtime feed', async () => {
    const live = await json<any>(await req(`/api/sites/${siteId}/realtime`, { headers: { cookie } }));
    expect(live.online).toBe(1);
    expect(live.pages[0].label).toBe('/pricing');
    expect(live.activity.length).toBeGreaterThanOrEqual(2);
  });

  it('builds a funnel from a page and a goal', async () => {
    const funnel = await json<{ id: string }>(
      await req(`/api/sites/${siteId}/funnels`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({
          name: 'Signup',
          steps: [
            { type: 'page', value: '/pricing' },
            { type: 'goal', value: 'signup' },
          ],
        }),
      }),
    );
    const stats = await json<{ visitors: number }[]>(
      await req(`/api/sites/${siteId}/funnels/${funnel.id}/stats?period=30d`, { headers: { cookie } }),
    );
    expect(stats.map((s) => s.visitors)).toEqual([1, 1]);
  });

  it('supports wildcards in funnel page steps', async () => {
    const funnel = await json<{ id: string }>(
      await req(`/api/sites/${siteId}/funnels`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({
          name: 'Wildcard',
          steps: [
            { type: 'page', value: '/pric*' },
            { type: 'goal', value: 'signup' },
          ],
        }),
      }),
    );
    const stats = await json<{ visitors: number }[]>(
      await req(`/api/sites/${siteId}/funnels/${funnel.id}/stats?period=30d`, { headers: { cookie } }),
    );
    expect(stats.map((s) => s.visitors)).toEqual([1, 1]);
  });

  it('accepts localhost events when the server itself is on localhost', async () => {
    const res = await req('/api/event', {
      method: 'POST',
      headers: { 'user-agent': UA, 'content-type': 'text/plain' },
      body: JSON.stringify({
        w: siteId,
        t: 'pageview',
        u: 'http://localhost:5173/pricing',
        vid: 'visitor-local-1',
        sid: 'session-local-1',
      }),
    });
    expect(res.status).toBe(202);
  });

  it('exports CSV', async () => {
    const res = await req(`/api/sites/${siteId}/export?type=series&period=30d`, { headers: { cookie } });
    expect(res.headers.get('content-type')).toContain('text/csv');
    const text = await res.text();
    expect(text.split('\r\n')[0]).toBe('bucket,visitors,pageviews,revenue,payments');
  });

  it('creates a read-only share link without leaking secrets', async () => {
    const share = await json<{ share_token: string }>(
      await req(`/api/sites/${siteId}/share`, { method: 'POST', headers: { cookie } }),
    );
    const shared = await json<any>(await req(`/api/public/${share.share_token}/overview?period=30d`));
    expect(shared.site.domain).toBe('example.com');
    expect(shared.site.api_key).toBeUndefined();
    expect(shared.current.visitors).toBeGreaterThan(0);

    const rows = await json<any[]>(await req(`/api/public/${share.share_token}/breakdown?period=30d&dim=page`));
    expect(rows[0].label).toBe('/pricing');

    expect((await req('/api/public/not-a-real-token/overview')).status).toBe(404);
  });
});

describe('rate limiting', () => {
  it('stops a flood from one IP', async () => {
    resetRateLimits();
    const limited: Env = { ...env, INGEST_RATE_LIMIT: '2' };
    const hit = () =>
      app.request(
        '/api/event',
        {
          method: 'POST',
          headers: { 'user-agent': UA, 'x-forwarded-for': '192.0.2.44', 'content-type': 'text/plain' },
          body: JSON.stringify({
            w: siteId,
            t: 'pageview',
            u: 'https://example.com/pricing',
            vid: 'visitor-flood-1',
            sid: 'session-flood-1',
          }),
        },
        limited,
      );
    expect((await hit()).status).toBe(202);
    expect((await hit()).status).toBe(202);
    expect((await hit()).status).toBe(429);
    resetRateLimits();
  });
});

describe('funnel page patterns', () => {
  it('escapes SQL LIKE wildcards and keeps * as the wildcard', async () => {
    const { pageLikePattern } = await import('../src/worker/stats');
    expect(pageLikePattern('/blog/*')).toBe('/blog/%');
    expect(pageLikePattern('/100%_off')).toBe('/100\\%\\_off');
    expect(pageLikePattern('/a\\b')).toBe('/a\\\\b');
  });
});
