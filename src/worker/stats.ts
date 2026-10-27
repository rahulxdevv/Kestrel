import type { Context } from 'hono';
import type { Db } from '../shared/db';
import { geoPoint } from '../shared/geo';
import type { AppEnv, Site } from './env';
import { bucketLabels, bucketSql, resolveRange, tzOffset, type Range } from './lib/time';
import { currencyDecimals } from './payments';

/** Filters that live on the session row (clicking a row in the dashboard adds one of these). */
const SESSION_FILTERS = [
  'channel',
  'source',
  'referrer_domain',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'ref',
  'country',
  'region',
  'city',
  'browser',
  'os',
  'device',
  'entry_page',
  'exit_page',
  'hostname',
] as const;

export type Filters = Partial<Record<(typeof SESSION_FILTERS)[number] | 'page' | 'goal', string>>;

export function parseFilters(raw: string | undefined): Filters {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    const out: Filters = {};
    for (const k of [...SESSION_FILTERS, 'page', 'goal'] as const) {
      if (typeof obj[k] === 'string') out[k] = obj[k].slice(0, 500);
    }
    return out;
  } catch {
    return {};
  }
}

/** SQL + params restricting sessions `s` by the dashboard filters (not by time). */
function filterSql(f: Filters): { sql: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  for (const k of SESSION_FILTERS) {
    const v = f[k];
    if (v === undefined) continue;
    if (v === '') parts.push(`s.${k} IS NULL`);
    else {
      parts.push(`s.${k} = ?`);
      params.push(v);
    }
  }
  if (f.page) {
    parts.push(`EXISTS (SELECT 1 FROM events fe WHERE fe.site_id = s.site_id AND fe.session_id = s.id AND fe.type = 'pageview' AND fe.path = ?)`);
    params.push(f.page);
  }
  if (f.goal) {
    parts.push(`EXISTS (SELECT 1 FROM events fe WHERE fe.site_id = s.site_id AND fe.session_id = s.id AND fe.type = 'goal' AND fe.name = ?)`);
    params.push(f.goal);
  }
  return { sql: parts.length ? ' AND ' + parts.join(' AND ') : '', params };
}

const hasFilters = (f: Filters) => Object.keys(f).length > 0;

interface Ctx {
  db: Db;
  site: Site;
  range: Range;
  filters: Filters;
  offset: number;
}

export function ctxFor(db: Db, site: Site, query: Record<string, string>): Ctx {
  const range = resolveRange(query, site.timezone, site.created_at);
  return { db, site, range, filters: parseFilters(query.filters), offset: tzOffset(site.timezone, range.to) };
}

export function makeCtx(c: Context<AppEnv>): Ctx {
  return ctxFor(c.env.DB, c.get('site'), c.req.query());
}

function sessionsWhere(ctx: Ctx, from = ctx.range.from, to = ctx.range.to) {
  const f = filterSql(ctx.filters);
  return {
    sql: `s.site_id = ? AND s.started_at >= ? AND s.started_at < ?${f.sql}`,
    params: [ctx.site.id, from, to, ...f.params],
  };
}

/** Payments in the period; with filters, only those credited to a matching visit. */
function paymentsFrom(ctx: Ctx, from = ctx.range.from, to = ctx.range.to) {
  if (!hasFilters(ctx.filters)) {
    return { sql: `payments p WHERE p.site_id = ? AND p.ts >= ? AND p.ts < ?`, params: [ctx.site.id, from, to] };
  }
  const f = filterSql(ctx.filters);
  return {
    sql: `payments p JOIN sessions s ON s.site_id = p.site_id AND s.id = p.session_id
          WHERE p.site_id = ? AND p.ts >= ? AND p.ts < ?${f.sql}`,
    params: [ctx.site.id, from, to, ...f.params],
  };
}

const KPI_SQL = (where: string) => `
  SELECT COUNT(DISTINCT s.visitor_id) AS visitors, COUNT(*) AS sessions, COALESCE(SUM(s.pageviews), 0) AS pageviews,
         COALESCE(SUM(CASE WHEN s.pageviews <= 1 AND s.goals = 0 THEN 1 ELSE 0 END), 0) AS bounces,
         COALESCE(AVG(s.duration), 0) AS avg_duration,
         COUNT(DISTINCT CASE WHEN v.first_seen >= ? THEN s.visitor_id END) AS new_visitors
  FROM sessions s LEFT JOIN visitors v ON v.site_id = s.site_id AND v.id = s.visitor_id
  WHERE ${where}`;

const REVENUE_SQL = (from: string) => `
  SELECT COALESCE(SUM(p.amount), 0) AS revenue,
         COUNT(DISTINCT CASE WHEN p.kind = 'payment' AND p.renewal = 0 THEN COALESCE(p.visitor_id, p.id) END) AS customers,
         COALESCE(SUM(CASE WHEN p.kind = 'payment' THEN 1 ELSE 0 END), 0) AS payments
  FROM ${from}`;

interface KpiRow {
  visitors: number;
  sessions: number;
  pageviews: number;
  bounces: number;
  avg_duration: number;
  new_visitors: number;
}
interface RevRow {
  revenue: number;
  customers: number;
  payments: number;
}

function kpis(k: KpiRow, r: RevRow) {
  return {
    visitors: k.visitors,
    sessions: k.sessions,
    pageviews: k.pageviews,
    newVisitors: k.new_visitors,
    returningVisitors: Math.max(0, k.visitors - k.new_visitors),
    sessionsPerVisitor: k.visitors ? k.sessions / k.visitors : 0,
    bounceRate: k.sessions ? k.bounces / k.sessions : 0,
    avgDuration: Math.round(k.avg_duration),
    revenue: r.revenue,
    payments: r.payments,
    customers: r.customers,
    conversionRate: k.visitors ? r.customers / k.visitors : 0,
    revenuePerVisitor: k.visitors ? r.revenue / k.visitors : 0,
  };
}

/** Top numbers + chart. */
export async function overview(ctx: Ctx) {
  const { db, range, site } = ctx;
  const prevFrom = range.from - (range.to - range.from);
  const cur = sessionsWhere(ctx);
  const prev = sessionsWhere(ctx, prevFrom, range.from);
  const curPay = paymentsFrom(ctx);
  const prevPay = paymentsFrom(ctx, prevFrom, range.from);
  const sb = bucketSql('s.started_at', range.granularity, ctx.offset);
  const sbV = bucketSql('v.first_seen', range.granularity, ctx.offset);
  const pb = bucketSql('p.ts', range.granularity, ctx.offset);
  const eb = bucketSql('e.ts', range.granularity, ctx.offset);
  const now = Date.now();
  const pageFilter = filterSql(ctx.filters);
  const pageJoin = hasFilters(ctx.filters) ? 'JOIN sessions s ON s.site_id = e.site_id AND s.id = e.session_id' : '';

  const [k1, k0, r1, r0, online, ts, tr, ts2, ts3, ts4, imported] = await db.batch([
    db.prepare(KPI_SQL(cur.sql)).bind(range.from, ...cur.params),
    db.prepare(KPI_SQL(prev.sql)).bind(prevFrom, ...prev.params),
    db.prepare(REVENUE_SQL(curPay.sql)).bind(...curPay.params),
    db.prepare(REVENUE_SQL(prevPay.sql)).bind(...prevPay.params),
    db
      .prepare('SELECT COUNT(DISTINCT visitor_id) AS n FROM sessions WHERE site_id = ? AND started_at > ? AND last_seen_at > ?')
      .bind(site.id, now - 6 * 3_600_000, now - 5 * 60_000),
    db
      .prepare(
        `SELECT ${sb} AS b, COUNT(DISTINCT s.visitor_id) AS visitors, COUNT(*) AS sessions, SUM(s.pageviews) AS pageviews,
                COUNT(DISTINCT CASE WHEN ${sbV} = ${sb} THEN s.visitor_id END) AS new_visitors
         FROM sessions s LEFT JOIN visitors v ON v.site_id = s.site_id AND v.id = s.visitor_id
         WHERE ${cur.sql} GROUP BY b`,
      )
      .bind(...cur.params),
    db
      .prepare(
        `SELECT ${pb} AS b, SUM(p.amount) AS revenue, SUM(CASE WHEN p.kind = 'payment' THEN 1 ELSE 0 END) AS payments
         FROM ${curPay.sql} GROUP BY b`,
      )
      .bind(...curPay.params),
    db
      .prepare(
        `SELECT ${sb} AS b, s.source, s.channel, COUNT(DISTINCT s.visitor_id) AS visitors
         FROM sessions s WHERE ${cur.sql} GROUP BY b, s.source ORDER BY visitors DESC`,
      )
      .bind(...cur.params),
    // Strongest referrer per bucket: the link that sent the most people that day.
    db
      .prepare(
        `SELECT ${sb} AS b, s.referrer_domain AS referrer, COUNT(DISTINCT s.visitor_id) AS visitors
         FROM sessions s WHERE ${cur.sql} AND s.referrer_domain IS NOT NULL
         GROUP BY b, s.referrer_domain ORDER BY visitors DESC`,
      )
      .bind(...cur.params),
    // Most read page per bucket, for the tooltip's second line.
    db
      .prepare(
        `SELECT ${eb} AS b, e.path AS path, COUNT(DISTINCT e.visitor_id) AS visitors
         FROM events e ${pageJoin}
         WHERE e.site_id = ? AND e.type = 'pageview' AND e.ts >= ? AND e.ts < ?${pageFilter.sql}
         GROUP BY b, e.path ORDER BY visitors DESC`,
      )
      .bind(ctx.site.id, range.from, range.to, ...pageFilter.params),
    db.prepare('SELECT day, visitors FROM plausible_daily WHERE site_id = ? AND day >= ? AND day < ? ORDER BY day')
      .bind(site.id, new Intl.DateTimeFormat('en-CA', { timeZone: site.timezone }).format(range.from), new Intl.DateTimeFormat('en-CA', { timeZone: site.timezone }).format(range.to - 1)),
  ]);

  const visitorsBy = new Map((ts.results as any[]).map((r) => [r.b, r]));
  const revenueBy = new Map((tr.results as any[]).map((r) => [r.b, r]));
  // Rows arrive ordered by visitors, so the first row seen for a bucket is the winner.
  const firstPerBucket = <T extends { b: string }>(rows: T[]) => {
    const out = new Map<string, T>();
    for (const row of rows) if (!out.has(row.b)) out.set(row.b, row);
    return out;
  };
  const topByBucket = firstPerBucket(ts2.results as any[]);
  const refByBucket = firstPerBucket(ts3.results as any[]);
  const pathByBucket = firstPerBucket(ts4.results as any[]);
  const labels = bucketLabels(range, ctx.offset);
  const importedByBucket = new Map<string, number>();
  if (range.granularity !== 'hour') {
    for (const row of imported.results as { day: string; visitors: number }[]) {
      let bucket = row.day;
      if (range.granularity === 'month') bucket = row.day.slice(0, 7);
      else if (range.granularity === 'week') {
        const date = new Date(`${row.day}T00:00:00Z`);
        date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
        bucket = date.toISOString().slice(0, 10);
      }
      importedByBucket.set(bucket, (importedByBucket.get(bucket) ?? 0) + row.visitors);
    }
  }
  const series = labels.map((b) => ({
    bucket: b,
    visitors: visitorsBy.get(b)?.visitors ?? 0,
    pageviews: visitorsBy.get(b)?.pageviews ?? 0,
    newVisitors: Math.min(visitorsBy.get(b)?.new_visitors ?? 0, visitorsBy.get(b)?.visitors ?? 0),
    returningVisitors: Math.max(
      0,
      (visitorsBy.get(b)?.visitors ?? 0) - Math.min(visitorsBy.get(b)?.new_visitors ?? 0, visitorsBy.get(b)?.visitors ?? 0),
    ),
    importedVisitors: importedByBucket.get(b) ?? 0,
    revenue: revenueBy.get(b)?.revenue ?? 0,
    payments: revenueBy.get(b)?.payments ?? 0,
    topSource: topByBucket.get(b)?.source ?? null,
    topChannel: topByBucket.get(b)?.channel ?? null,
    topVisitors: topByBucket.get(b)?.visitors ?? 0,
    topReferrer: refByBucket.get(b)?.referrer ?? null,
    topReferrerVisitors: refByBucket.get(b)?.visitors ?? 0,
    topPath: pathByBucket.get(b)?.path ?? null,
    topPathVisitors: pathByBucket.get(b)?.visitors ?? 0,
  }));

  return {
    range,
    currency: site.currency,
    decimals: currencyDecimals(site.currency),
    current: kpis(k1.results[0] as KpiRow, r1.results[0] as RevRow),
    previous: kpis(k0.results[0] as KpiRow, r0.results[0] as RevRow),
    online: (online.results[0] as { n: number }).n,
    series,
  };
}

/** Session dimensions, keyed by the name the dashboard asks for. */
const SESSION_DIMS: Record<string, string> = {
  channel: 's.channel',
  source: 's.source',
  campaign: 's.utm_campaign',
  keyword: 's.utm_term',
  utm_source: 's.utm_source',
  utm_medium: 's.utm_medium',
  utm_content: 's.utm_content',
  ref: 's.ref',
  country: 's.country',
  region: 's.region',
  city: 's.city',
  browser: 's.browser',
  os: 's.os',
  device: 's.device',
  entry_page: 's.entry_page',
  exit_page: 's.exit_page',
  hostname: 's.hostname',
  referrer: 's.referrer',
};

export interface BreakdownRow {
  label: string | null;
  visitors: number;
  pageviews?: number;
  revenue: number;
  customers: number;
  icon?: string | null;
  extra?: string | null;
}

export async function breakdown(ctx: Ctx, dim: string, limit = 100): Promise<BreakdownRow[]> {
  const { db } = ctx;
  const lim = Math.max(1, Math.min(500, limit));

  if (SESSION_DIMS[dim]) {
    const col = SESSION_DIMS[dim];
    const w = sessionsWhere(ctx);
    const pay = paymentsFrom(ctx);
    // Payments need the session columns even without filters.
    const payJoin = hasFilters(ctx.filters)
      ? pay
      : {
          sql: `payments p JOIN sessions s ON s.site_id = p.site_id AND s.id = p.session_id WHERE p.site_id = ? AND p.ts >= ? AND p.ts < ?`,
          params: pay.params,
        };
    const extraCol =
      dim === 'source' ? 'MAX(s.referrer_domain)' : dim === 'region' || dim === 'city' ? 'MAX(s.country)' : 'NULL';
    const [v, r] = await db.batch([
      db
        .prepare(
          `SELECT ${col} AS label, COUNT(DISTINCT s.visitor_id) AS visitors, SUM(s.pageviews) AS pageviews, ${extraCol} AS extra
           FROM sessions s WHERE ${w.sql} GROUP BY label ORDER BY visitors DESC LIMIT ${lim}`,
        )
        .bind(...w.params),
      db
        .prepare(
          `SELECT ${col} AS label, SUM(p.amount) AS revenue,
                  COUNT(DISTINCT CASE WHEN p.kind = 'payment' THEN COALESCE(p.visitor_id, p.id) END) AS customers
           FROM ${payJoin.sql} GROUP BY label`,
        )
        .bind(...payJoin.params),
    ]);
    return merge(v.results as any[], r.results as any[]);
  }

  if (dim === 'page') {
    const f = filterSql(ctx.filters);
    const join = hasFilters(ctx.filters) ? 'JOIN sessions s ON s.site_id = e.site_id AND s.id = e.session_id' : '';
    const params = [ctx.site.id, ctx.range.from, ctx.range.to, ...f.params];
    const base = `FROM events e ${join} WHERE e.site_id = ? AND e.type = 'pageview' AND e.ts >= ? AND e.ts < ?${f.sql}`;
    const [v, r] = await db.batch([
      db
        .prepare(
          `SELECT e.path AS label, COUNT(DISTINCT e.visitor_id) AS visitors, COUNT(*) AS pageviews ${base}
           GROUP BY label ORDER BY visitors DESC LIMIT ${lim}`,
        )
        .bind(...params),
      // Revenue from customers who viewed the page during the period.
      db
        .prepare(
          `SELECT pv.label, SUM(p.amount) AS revenue, COUNT(DISTINCT p.visitor_id) AS customers
           FROM (SELECT DISTINCT e.path AS label, e.visitor_id ${base}) pv
           JOIN payments p ON p.site_id = ? AND p.visitor_id = pv.visitor_id AND p.ts >= ? AND p.ts < ?
           GROUP BY pv.label`,
        )
        .bind(...params, ctx.site.id, ctx.range.from, ctx.range.to),
    ]);
    return merge(v.results as any[], r.results as any[]);
  }

  if (dim === 'exit_link' || dim === 'goal') {
    const type = dim === 'goal' ? 'goal' : 'outbound';
    const f = filterSql(ctx.filters);
    const join = hasFilters(ctx.filters) ? 'JOIN sessions s ON s.site_id = e.site_id AND s.id = e.session_id' : '';
    const params = [ctx.site.id, type, ctx.range.from, ctx.range.to, ...f.params];
    const base = `FROM events e ${join} WHERE e.site_id = ? AND e.type = ? AND e.ts >= ? AND e.ts < ?${f.sql}`;
    const [v, r] = await db.batch([
      db
        .prepare(
          `SELECT e.name AS label, COUNT(DISTINCT e.visitor_id) AS visitors, COUNT(*) AS pageviews ${base}
           GROUP BY label ORDER BY visitors DESC LIMIT ${lim}`,
        )
        .bind(...params),
      db
        .prepare(
          `SELECT g.label, SUM(p.amount) AS revenue, COUNT(DISTINCT p.visitor_id) AS customers
           FROM (SELECT DISTINCT e.name AS label, e.visitor_id ${base}) g
           JOIN payments p ON p.site_id = ? AND p.visitor_id = g.visitor_id AND p.ts >= ? AND p.ts < ?
           GROUP BY g.label`,
        )
        .bind(...params, ctx.site.id, ctx.range.from, ctx.range.to),
    ]);
    return merge(v.results as any[], r.results as any[]);
  }

  throw new Error(`unknown dimension ${dim}`);
}

function merge(visits: any[], revenue: any[]): BreakdownRow[] {
  const rev = new Map(revenue.map((r) => [r.label, r]));
  const rows: BreakdownRow[] = visits.map((v) => ({
    label: v.label,
    visitors: v.visitors,
    pageviews: v.pageviews ?? undefined,
    revenue: rev.get(v.label)?.revenue ?? 0,
    customers: rev.get(v.label)?.customers ?? 0,
    extra: v.extra ?? null,
  }));
  // Sources that made money but had no visits in this period (paid later) still show up.
  const seen = new Set(visits.map((v) => v.label));
  for (const r of revenue) if (!seen.has(r.label)) rows.push({ label: r.label, visitors: 0, revenue: r.revenue, customers: r.customers });
  return rows;
}

/** Customers in the period, with where they came from (the "Journey" tab). */
export async function customers(ctx: Ctx) {
  const { db, site, range } = ctx;
  const f = filterSql(ctx.filters);
  const join = hasFilters(ctx.filters) ? 'JOIN' : 'LEFT JOIN';
  const res = await db
    .prepare(
      `SELECT p.id, p.ts, p.amount, p.currency, p.renewal, p.matched_by, p.email AS pay_email, p.name AS pay_name, p.visitor_id, p.session_id,
              v.first_seen, v.name, v.email, v.user_id,
              s.source, s.channel, s.referrer_domain, s.utm_campaign, s.ref, s.country, s.city, s.device, s.os, s.browser, s.entry_page,
              (SELECT COUNT(*) FROM sessions s2 WHERE s2.site_id = p.site_id AND s2.visitor_id = p.visitor_id AND s2.started_at <= p.ts) AS visits
       FROM payments p
       LEFT JOIN visitors v ON v.site_id = p.site_id AND v.id = p.visitor_id
       ${join} sessions s ON s.site_id = p.site_id AND s.id = p.session_id
       WHERE p.site_id = ? AND p.kind = 'payment' AND p.ts >= ? AND p.ts < ?${f.sql}
       ORDER BY p.ts DESC LIMIT 200`,
    )
    .bind(site.id, range.from, range.to, ...f.params)
    .all();
  return res.results;
}

/** Recent visitors in the period (the "Users" tab). */
export async function visitors(ctx: Ctx) {
  const w = sessionsWhere(ctx);
  const res = await ctx.db
    .prepare(
      `SELECT t.*, v.name, v.email, v.user_id, v.first_seen,
              (SELECT COALESCE(SUM(amount), 0) FROM payments p WHERE p.site_id = t.site_id AND p.visitor_id = t.visitor_id) AS spent
       FROM (
         SELECT s.site_id, s.visitor_id, MAX(s.last_seen_at) AS last_seen, COUNT(*) AS sessions, SUM(s.pageviews) AS pageviews,
                SUM(s.duration) AS duration, s.source, s.referrer_domain, s.country, s.city, s.device, s.os, s.browser
         FROM sessions s WHERE ${w.sql} GROUP BY s.visitor_id ORDER BY last_seen DESC LIMIT 200
       ) t LEFT JOIN visitors v ON v.site_id = t.site_id AND v.id = t.visitor_id
       ORDER BY t.last_seen DESC`,
    )
    .bind(...w.params)
    .all();
  return res.results;
}

/** Everything one visitor did: visits, pages, clicks, payments. */
/**
 * Last 30 minutes, for the live view. Deliberately unfiltered and tiny: it is polled every 15s,
 * so each call is five small indexed reads rather than the full dashboard query set.
 */
interface DemoLiveTemplate {
  source: string | null;
  country: string | null;
  city: string | null;
  device: string | null;
  browser: string | null;
  os: string | null;
  entry_page: string | null;
  exit_page: string | null;
}

/** Synthetic, read-only visitors keep the public demo's Live screen illustrative at any hour. */
async function demoRealtime(ctx: Ctx, now: number) {
  const templates = (
    await ctx.db
      .prepare(
        `SELECT source, country, city, device, browser, os, entry_page, exit_page
         FROM sessions WHERE site_id = ? ORDER BY started_at DESC LIMIT 120`,
      )
      .bind(ctx.site.id)
      .all<DemoLiveTemplate>()
  ).results;
  if (!templates.length) return null;

  const activeCount = 4 + Math.floor(Math.random() * 5);
  const sources = new Map<string | null, number>();
  const countries = new Map<string | null, number>();
  const devices = new Map<string | null, number>();
  const pages = new Map<string, { visitors: Set<string>; views: number }>();
  const places = new Map<string, { country: string; city: string | null; visitors: number; visitorId: string }>();
  const activity: {
    ts: number;
    type: 'pageview' | 'goal' | 'outbound' | 'sale';
    name: string | null;
    path: string;
    visitor_id: string;
    source: string | null;
    country: string | null;
    city: string | null;
    device: string | null;
    browser: string | null;
    os: string | null;
    sale_id?: string;
    amount?: number;
    currency?: string;
  }[] = [];

  for (let i = 0; i < activeCount; i++) {
    const sample = templates[Math.floor(Math.random() * templates.length)];
    const visitorId = `demo-live-${now.toString(36)}-${i}-${Math.random().toString(36).slice(2, 7)}`;
    const source = sample.source;
    sources.set(source, (sources.get(source) ?? 0) + 1);
    if (sample.country) countries.set(sample.country, (countries.get(sample.country) ?? 0) + 1);
    if (sample.device) devices.set(sample.device, (devices.get(sample.device) ?? 0) + 1);

    const placeKey = `${sample.country ?? ''}:${sample.city ?? ''}`;
    if (sample.country) {
      const place = places.get(placeKey);
      if (place) place.visitors++;
      else places.set(placeKey, { country: sample.country, city: sample.city, visitors: 1, visitorId });
    }

    const paths = [sample.entry_page, sample.exit_page, '/pricing', '/docs'].filter((p): p is string => Boolean(p));
    const start = now - Math.floor(Math.random() * 28 * 60_000);
    const eventCount = 1 + Math.floor(Math.random() * 3);
    for (let j = 0; j < eventCount; j++) {
      const path = paths[Math.floor(Math.random() * paths.length)] ?? '/';
      const roll = Math.random();
      const type: 'pageview' | 'goal' | 'outbound' = j === 0 || roll < 0.78 ? 'pageview' : roll < 0.93 ? 'goal' : 'outbound';
      const name = type === 'goal' ? ['signup_click', 'pricing_cta', 'checkout_click'][Math.floor(Math.random() * 3)] :
        type === 'outbound' ? 'https://x.com/kestrel' : null;
      const ts = Math.min(now, start + j * (20_000 + Math.floor(Math.random() * 80_000)));
      activity.push({
        ts,
        type,
        name,
        path,
        visitor_id: visitorId,
        source,
        country: sample.country,
        city: sample.city,
        device: sample.device,
        browser: sample.browser,
        os: sample.os,
      });
      if (type === 'pageview') {
        const page = pages.get(path) ?? { visitors: new Set<string>(), views: 0 };
        page.visitors.add(visitorId);
        page.views++;
        pages.set(path, page);
      }
    }
  }

  if (Math.random() < 0.45) {
    const sample = templates[Math.floor(Math.random() * templates.length)];
    activity.push({
      ts: now, type: 'sale', name: null, path: sample.exit_page ?? '/pricing',
      visitor_id: `demo-sale-${now.toString(36)}`, source: sample.source, country: sample.country, city: sample.city,
      device: sample.device, browser: sample.browser, os: sample.os, sale_id: `demo-${now.toString(36)}`,
      amount: (19 + Math.floor(Math.random() * 180)) * 100, currency: ctx.site.currency,
    });
  }

  const points = [...places.values()].flatMap((place) => {
    const point = geoPoint(place.country, place.city);
    return point ? [{ ...point, ...place }] : [];
  });
  const rows = (counts: Map<string | null, number>) => [...counts.entries()]
    .map(([label, visitors]) => ({ label, visitors }))
    .sort((a, b) => b.visitors - a.visitors);

  return {
    online: activeCount,
    windowMinutes: 30,
    pages: [...pages.entries()]
      .map(([label, counts]) => ({ label, visitors: counts.visitors.size, views: counts.views }))
      .sort((a, b) => b.visitors - a.visitors)
      .slice(0, 8),
    sources: rows(sources).slice(0, 6),
    countries: rows(countries).slice(0, 6),
    devices: rows(devices),
    points,
    activity: activity.sort((a, b) => b.ts - a.ts).slice(0, 30),
    serverTime: now,
  };
}

export async function realtime(ctx: Ctx, simulate = false, after = 0) {
  const now = Date.now();
  if (simulate) {
    const mock = await demoRealtime(ctx, now);
    if (mock) return { ...mock, sales: mock.activity.filter((event) => event.type === 'sale' && event.ts > after) };
  }
  const since = now - 30 * 60_000;
  const active = now - 5 * 60_000;
  const id = ctx.site.id;
  const [online, pages, sources, countries, devices, places, activity, sales] = await ctx.db.batch([
    ctx.db
      .prepare('SELECT COUNT(DISTINCT visitor_id) AS n FROM sessions WHERE site_id = ? AND last_seen_at > ?')
      .bind(id, active),
    ctx.db
      .prepare(
        `SELECT e.path AS label, COUNT(DISTINCT e.visitor_id) AS visitors, COUNT(*) AS views
         FROM events e WHERE e.site_id = ? AND e.type = 'pageview' AND e.ts >= ?
         GROUP BY e.path ORDER BY visitors DESC LIMIT 8`,
      )
      .bind(id, since),
    ctx.db
      .prepare(
        `SELECT source AS label, COUNT(DISTINCT visitor_id) AS visitors FROM sessions
         WHERE site_id = ? AND started_at >= ? GROUP BY source ORDER BY visitors DESC LIMIT 6`,
      )
      .bind(id, since),
    ctx.db
      .prepare(
        `SELECT country AS label, COUNT(DISTINCT visitor_id) AS visitors FROM sessions
         WHERE site_id = ? AND started_at >= ? AND country IS NOT NULL GROUP BY country ORDER BY visitors DESC LIMIT 6`,
      )
      .bind(id, since),
    ctx.db
      .prepare(
        `SELECT device AS label, COUNT(DISTINCT visitor_id) AS visitors FROM sessions
         WHERE site_id = ? AND started_at >= ? AND device IS NOT NULL GROUP BY device ORDER BY visitors DESC`,
      )
      .bind(id, since),
    ctx.db
      .prepare(
        `SELECT country, city, COUNT(DISTINCT visitor_id) AS visitors, MAX(visitor_id) AS visitor_id
         FROM sessions
         WHERE site_id = ? AND started_at >= ? AND country IS NOT NULL
         GROUP BY country, city ORDER BY visitors DESC LIMIT 40`,
      )
      .bind(id, since),
    ctx.db
      .prepare(
        `SELECT * FROM (
           SELECT e.ts, e.type, e.name, e.path, e.visitor_id, s.source, s.country, s.city, s.device, s.browser, s.os,
                  NULL AS sale_id, NULL AS amount, NULL AS currency
           FROM events e LEFT JOIN sessions s ON s.site_id = e.site_id AND s.id = e.session_id
           WHERE e.site_id = ? AND e.ts >= ?
           UNION ALL
           SELECT p.ts, 'sale' AS type, NULL AS name, COALESCE(s.exit_page, '/') AS path,
                  p.visitor_id, s.source, s.country, s.city, s.device, s.browser, s.os,
                  p.id AS sale_id, p.amount, p.currency
           FROM payments p LEFT JOIN sessions s ON s.site_id = p.site_id AND s.id = p.session_id
           WHERE p.site_id = ? AND p.kind = 'payment' AND p.ts >= ?
         ) ORDER BY ts DESC LIMIT 30`,
      )
      .bind(id, since, id, since),
    ctx.db.prepare(
      `SELECT p.id AS sale_id, p.ts, p.amount, p.currency, p.visitor_id,
              s.source, s.country, s.city, s.device, s.browser, s.os, COALESCE(s.exit_page, '/') AS path
       FROM payments p LEFT JOIN sessions s ON s.site_id = p.site_id AND s.id = p.session_id
       WHERE p.site_id = ? AND p.kind = 'payment' AND p.ts > ? ORDER BY p.ts LIMIT 1000`,
    ).bind(id, Math.max(since, after)),
  ]);

  // Coordinates for the globe. A place we cannot place still counts in `countries`, it just has no dot.
  const points = (places.results as { country: string; city: string | null; visitors: number; visitor_id: string }[])
    .map((p) => {
      const point = geoPoint(p.country, p.city);
      return point
        ? { ...point, country: p.country, city: p.city, visitors: p.visitors, visitorId: p.visitor_id }
        : null;
    })
    .filter(Boolean);

  return {
    online: (online.results[0] as { n: number }).n ?? 0,
    windowMinutes: 30,
    pages: pages.results as { label: string; visitors: number; views: number }[],
    sources: sources.results as { label: string; visitors: number }[],
    countries: countries.results as { label: string; visitors: number }[],
    devices: devices.results as { label: string; visitors: number }[],
    points,
    activity: activity.results as Record<string, unknown>[],
    sales: sales.results as Record<string, unknown>[],
    serverTime: now,
  };
}

/**
 * What actually drove traffic and money: the post, campaign or page each visit arrived on.
 * `ref` and `utm_content` are allowed to be a full URL, which is how an X post or a YouTube
 * video shows up by name instead of as a bare referrer host.
 */
export interface ContentRow {
  source: string | null;
  channel: string | null;
  campaign: string | null;
  content: string | null;
  ref: string | null;
  entryPage: string | null;
  url: string | null;
  visitors: number;
  pageviews: number;
  revenue: number;
  customers: number;
  firstSeen: number;
  lastSeen: number;
}

const keyOf = (r: { source: string | null; campaign: string | null; content: string | null; ref: string | null; entry_page: string | null }) =>
  [r.source ?? '', r.campaign ?? '', r.content ?? '', r.ref ?? '', r.entry_page ?? ''].join('\u0000');

function externalUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return /^https?:$/.test(u.protocol) ? u.toString() : null;
  } catch {
    return null;
  }
}

const CONTENT_COLS = `s.source, s.channel, s.utm_campaign AS campaign, s.utm_content AS content, s.ref, s.entry_page`;

async function contentRows(ctx: Ctx, from: number, to: number, limit: number): Promise<ContentRow[]> {
  const w = sessionsWhere(ctx, from, to);
  const f = filterSql(ctx.filters);
  const [visits, money] = await ctx.db.batch([
    ctx.db
      .prepare(
        `SELECT ${CONTENT_COLS}, COUNT(DISTINCT s.visitor_id) AS visitors, SUM(s.pageviews) AS pageviews,
                MIN(s.started_at) AS first_seen, MAX(s.last_seen_at) AS last_seen
         FROM sessions s WHERE ${w.sql}
         GROUP BY s.source, s.channel, s.utm_campaign, s.utm_content, s.ref, s.entry_page
         ORDER BY visitors DESC LIMIT ${limit}`,
      )
      .bind(...w.params),
    ctx.db
      .prepare(
        `SELECT ${CONTENT_COLS}, SUM(p.amount) AS revenue,
                COUNT(DISTINCT CASE WHEN p.kind = 'payment' THEN COALESCE(p.visitor_id, p.id) END) AS customers
         FROM payments p JOIN sessions s ON s.site_id = p.site_id AND s.id = p.session_id
         WHERE p.site_id = ? AND p.ts >= ? AND p.ts < ?${f.sql}
         GROUP BY s.source, s.channel, s.utm_campaign, s.utm_content, s.ref, s.entry_page`,
      )
      .bind(ctx.site.id, from, to, ...f.params),
  ]);

  const revenueBy = new Map((money.results as any[]).map((r) => [keyOf(r), r]));
  return (visits.results as any[]).map((r) => {
    const paid = revenueBy.get(keyOf(r));
    return {
      source: r.source ?? null,
      channel: r.channel ?? null,
      campaign: r.campaign ?? null,
      content: r.content ?? null,
      ref: r.ref ?? null,
      entryPage: r.entry_page ?? null,
      url: externalUrl(r.ref) ?? externalUrl(r.content),
      visitors: r.visitors ?? 0,
      pageviews: r.pageviews ?? 0,
      revenue: paid?.revenue ?? 0,
      customers: paid?.customers ?? 0,
      firstSeen: r.first_seen ?? 0,
      lastSeen: r.last_seen ?? 0,
    };
  });
}

/**
 * Content performance for the period, plus the single best day and what drove it. That answers
 * "traffic is up, but why?" without making the reader cross-reference three tables.
 */
export async function content(ctx: Ctx) {
  const { db, site, range } = ctx;
  const rows = await contentRows(ctx, range.from, range.to, 60);

  const where = sessionsWhere(ctx);
  const dayRows = await db
    .prepare(
      `SELECT strftime('%Y-%m-%d', s.started_at / 1000, 'unixepoch') AS day,
              COUNT(DISTINCT s.visitor_id) AS visitors
       FROM sessions s WHERE ${where.sql}
       GROUP BY day ORDER BY day`,
    )
    .bind(...where.params)
    .all<{ day: string; visitors: number }>();

  const days = dayRows.results;
  let peak: { day: string; visitors: number; median: number; lift: number; drivers: ContentRow[] } | null = null;
  if (days.length >= 3) {
    const sorted = [...days].sort((a, b) => a.visitors - b.visitors);
    const median = sorted[Math.floor(sorted.length / 2)]?.visitors ?? 0;
    const best = [...days].sort((a, b) => b.visitors - a.visitors)[0];
    if (best && median > 0) {
      const midnight = Date.parse(best.day + 'T00:00:00Z');
      const drivers = (await contentRows(ctx, midnight, midnight + 86_400_000, 4)).filter((r) => r.visitors > 0);
      peak = { day: best.day, visitors: best.visitors, median, lift: best.visitors / median - 1, drivers };
    }
  }

  return { rows, days, peak, currency: site.currency };
}

export interface SiteSummary {
  visitors: number;
  revenue: number;
  sales: number;
  avgOrder: number;
  online: number;
  previousVisitors: number;
  previousRevenue: number;
  series: { day: string; visitors: number; revenue: number }[];
}

/**
 * The all-websites view: one row per site for the chosen window, with a daily sparkline.
 * Four grouped queries total, no matter how many sites exist.
 */
export async function siteSummaries(db: Db, days: number) {
  const now = Date.now();
  const from = now - days * 86_400_000;
  const previousFrom = from - days * 86_400_000;
  const active = now - 5 * 60_000;

  const [visits, prevVisits, money, prevMoney, online, dailyVisits, dailyMoney] = await db.batch([
    db
      .prepare(
        `SELECT s.site_id, COUNT(DISTINCT s.visitor_id) AS visitors FROM sessions s
         WHERE s.started_at >= ? AND s.started_at < ? GROUP BY s.site_id`,
      )
      .bind(from, now),
    db
      .prepare(
        `SELECT s.site_id, COUNT(DISTINCT s.visitor_id) AS visitors FROM sessions s
         WHERE s.started_at >= ? AND s.started_at < ? GROUP BY s.site_id`,
      )
      .bind(previousFrom, from),
    db
      .prepare(
        `SELECT site_id, SUM(CASE WHEN kind = 'payment' THEN amount ELSE 0 END) AS revenue,
                SUM(CASE WHEN kind = 'payment' AND renewal = 0 THEN 1 ELSE 0 END) AS sales
         FROM payments WHERE ts >= ? AND ts < ? GROUP BY site_id`,
      )
      .bind(from, now),
    db
      .prepare(
        `SELECT site_id, SUM(CASE WHEN kind = 'payment' THEN amount ELSE 0 END) AS revenue
         FROM payments WHERE ts >= ? AND ts < ? GROUP BY site_id`,
      )
      .bind(previousFrom, from),
    db
      .prepare('SELECT site_id, COUNT(DISTINCT visitor_id) AS n FROM sessions WHERE last_seen_at > ? GROUP BY site_id')
      .bind(active),
    db
      .prepare(
        `SELECT site_id, strftime('%Y-%m-%d', started_at / 1000, 'unixepoch') AS day,
                COUNT(DISTINCT visitor_id) AS visitors
         FROM sessions WHERE started_at >= ? AND started_at < ? GROUP BY site_id, day`,
      )
      .bind(from, now),
    db
      .prepare(
        `SELECT site_id, strftime('%Y-%m-%d', ts / 1000, 'unixepoch') AS day, SUM(amount) AS revenue
         FROM payments WHERE ts >= ? AND ts < ? AND kind = 'payment' GROUP BY site_id, day`,
      )
      .bind(from, now),
  ]);

  const bySite = <T extends { site_id: string }>(rows: unknown[]) => new Map((rows as T[]).map((r) => [r.site_id, r]));
  const visitsBy = bySite<{ site_id: string; visitors: number }>(visits.results);
  const prevBy = bySite<{ site_id: string; visitors: number }>(prevVisits.results);
  const moneyBy = bySite<{ site_id: string; revenue: number; sales: number }>(money.results);
  const prevMoneyBy = bySite<{ site_id: string; revenue: number }>(prevMoney.results);
  const onlineBy = bySite<{ site_id: string; n: number }>(online.results);

  const series = new Map<string, { day: string; visitors: number; revenue: number }[]>();
  const dayKeys: string[] = [];
  for (let i = days - 1; i >= 0; i--) dayKeys.push(new Date(now - i * 86_400_000).toISOString().slice(0, 10));
  const revenueCells = new Map(
    (dailyMoney.results as { site_id: string; day: string; revenue: number }[]).map((r) => [r.site_id + r.day, r.revenue]),
  );
  for (const r of dailyVisits.results as { site_id: string; day: string; visitors: number }[]) {
    if (!series.has(r.site_id)) series.set(r.site_id, []);
    series.get(r.site_id)!.push({ day: r.day, visitors: r.visitors, revenue: revenueCells.get(r.site_id + r.day) ?? 0 });
  }

  const build = (siteId: string): SiteSummary => {
    const rows = series.get(siteId) ?? [];
    const byDay = new Map(rows.map((r) => [r.day, r]));
    const filled = dayKeys.map((day) => byDay.get(day) ?? { day, visitors: 0, revenue: 0 });
    const revenue = moneyBy.get(siteId)?.revenue ?? 0;
    const sales = moneyBy.get(siteId)?.sales ?? 0;
    return {
      visitors: visitsBy.get(siteId)?.visitors ?? 0,
      revenue,
      sales,
      avgOrder: sales ? revenue / sales : 0,
      online: onlineBy.get(siteId)?.n ?? 0,
      previousVisitors: prevBy.get(siteId)?.visitors ?? 0,
      previousRevenue: prevMoneyBy.get(siteId)?.revenue ?? 0,
      series: filled,
    };
  };

  const ids = new Set<string>([
    ...visitsBy.keys(),
    ...series.keys(),
    ...moneyBy.keys(),
    ...prevBy.keys(),
    ...onlineBy.keys(),
  ]);
  const summaries = new Map<string, SiteSummary>();
  for (const id of ids) summaries.set(id, build(id));

  return { days, from, to: now, summaries };
}

export async function visitorProfile(db: Db, site: Site, vid: string) {
  const [v, s, e, p] = await db.batch([
    db.prepare('SELECT * FROM visitors WHERE site_id = ? AND id = ?').bind(site.id, vid),
    db.prepare('SELECT * FROM sessions WHERE site_id = ? AND visitor_id = ? ORDER BY started_at DESC LIMIT 100').bind(site.id, vid),
    db
      .prepare('SELECT session_id, ts, type, name, path, props FROM events WHERE site_id = ? AND visitor_id = ? ORDER BY ts DESC LIMIT 1000')
      .bind(site.id, vid),
    db.prepare('SELECT * FROM payments WHERE site_id = ? AND visitor_id = ? ORDER BY ts DESC').bind(site.id, vid),
  ]);
  return {
    visitor: v.results[0] ?? null,
    sessions: s.results,
    events: e.results,
    payments: p.results,
    currency: site.currency,
    decimals: currencyDecimals(site.currency),
  };
}

/** Turn a funnel page step into an escaped SQL LIKE pattern (`*` stays the only wildcard). */
export function pageLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (m) => '\\' + m).replace(/\*/g, '%');
}

export interface FunnelStep {
  type: 'page' | 'goal';
  value: string; // page paths support * wildcards, e.g. /blog/*
  label?: string;
}

/** Visitors who completed each step, in order, within the period. */
export async function funnel(ctx: Ctx, steps: FunnelStep[]) {
  if (!steps.length) return [];
  const f = filterSql(ctx.filters);
  const join = hasFilters(ctx.filters) ? 'JOIN sessions s ON s.site_id = e.site_id AND s.id = e.session_id' : '';
  const conds: string[] = [];
  const params: unknown[] = [];
  for (const st of steps) {
    if (st.type === 'goal') {
      conds.push(`(e.type = 'goal' AND e.name = ?)`);
      params.push(st.value);
    } else {
      // LIKE with an escaped pattern: page paths can contain [], which are wildcards in GLOB.
      conds.push(`(e.type = 'pageview' AND e.path LIKE ? ESCAPE '\\')`);
      params.push(pageLikePattern(st.value));
    }
  }
  const rows = (
    await ctx.db
      .prepare(
        `SELECT e.visitor_id AS v, e.ts, e.type, e.name, e.path FROM events e ${join}
         WHERE e.site_id = ? AND e.ts >= ? AND e.ts < ? AND (${conds.join(' OR ')})${f.sql}
         ORDER BY e.ts LIMIT 100000`,
      )
      .bind(ctx.site.id, ctx.range.from, ctx.range.to, ...params, ...f.params)
      .all<{ v: string; ts: number; type: string; name: string | null; path: string }>()
  ).results;

  const matchers = steps.map((st) => {
    if (st.type === 'goal') return (r: (typeof rows)[0]) => r.type === 'goal' && r.name === st.value;
    const re = new RegExp('^' + st.value.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    return (r: (typeof rows)[0]) => r.type === 'pageview' && re.test(r.path);
  });
  const progress = new Map<string, number>();
  for (const r of rows) {
    const at = progress.get(r.v) ?? 0;
    if (at < steps.length && matchers[at](r)) progress.set(r.v, at + 1);
  }
  const counts = steps.map(() => 0);
  for (const reached of progress.values()) for (let i = 0; i < reached; i++) counts[i]++;
  return steps.map((st, i) => ({ ...st, visitors: counts[i] }));
}

/**
 * Multi-line series for the goals / pages card: the top N labels, each with a value per bucket.
 * Two grouped queries (one for the ranking, one for the grid) keep it cheap on long ranges.
 */
export async function timeseries(ctx: Ctx, dim: 'goal' | 'page', limit = 7) {
  const { db } = ctx;
  const type = dim === 'goal' ? 'goal' : 'pageview';
  const label = dim === 'goal' ? 'e.name' : 'e.path';
  const sb = bucketSql('e.ts', ctx.range.granularity, ctx.offset);
  const f = filterSql(ctx.filters);
  const join = hasFilters(ctx.filters) ? 'JOIN sessions s ON s.site_id = e.site_id AND s.id = e.session_id' : '';
  const where = `e.site_id = ? AND e.type = ? AND e.ts >= ? AND e.ts < ? AND ${label} IS NOT NULL${f.sql}`;
  const params = [ctx.site.id, type, ctx.range.from, ctx.range.to, ...f.params];

  const [top, grid] = await db.batch([
    db
      .prepare(
        `SELECT ${label} AS label, COUNT(*) AS n FROM events e ${join}
         WHERE ${where} GROUP BY label ORDER BY n DESC LIMIT ${Math.max(1, Math.min(12, limit))}`,
      )
      .bind(...params),
    db
      .prepare(
        `SELECT ${sb} AS bucket, ${label} AS label, COUNT(DISTINCT e.visitor_id) AS visitors
         FROM events e ${join} WHERE ${where} GROUP BY bucket, label`,
      )
      .bind(...params),
  ]);

  const ranked = (top.results as { label: string; n: number }[]).map((r) => r.label);
  const buckets = bucketLabels(ctx.range, ctx.offset);
  const index = new Map(ranked.map((name, i) => [name, i]));
  const rows = buckets.map((bucket) => {
    const row: Record<string, string | number> = { bucket };
    for (const name of ranked) row[name] = 0;
    return row;
  });
  const byBucket = new Map(buckets.map((b, i) => [b, i]));
  for (const cell of grid.results as { bucket: string; label: string; visitors: number }[]) {
    const i = byBucket.get(cell.bucket);
    const key = index.get(cell.label);
    if (i === undefined || key === undefined) continue;
    rows[i][ranked[key]] = cell.visitors;
  }

  const totals = new Map<string, number>();
  for (const cell of grid.results as { label: string; visitors: number }[]) {
    totals.set(cell.label, (totals.get(cell.label) ?? 0) + cell.visitors);
  }

  return {
    dim,
    buckets,
    rows,
    series: ranked.map((name) => ({ key: name, label: name, total: totals.get(name) ?? 0 })),
  };
}

/** Traffic that came from an AI assistant, over time and by assistant. */
export async function aiTraffic(ctx: Ctx) {
  const { db } = ctx;
  const sb = bucketSql('s.started_at', ctx.range.granularity, ctx.offset);
  const w = sessionsWhere(ctx);
  const [series, sources] = await db.batch([
    db
      .prepare(
        `SELECT ${sb} AS b, COUNT(DISTINCT s.visitor_id) AS visitors FROM sessions s
         WHERE ${w.sql} AND s.channel = 'AI' GROUP BY b`,
      )
      .bind(...w.params),
    db
      .prepare(
        `SELECT s.source AS label, COUNT(DISTINCT s.visitor_id) AS visitors FROM sessions s
         WHERE ${w.sql} AND s.channel = 'AI' GROUP BY label ORDER BY visitors DESC LIMIT 8`,
      )
      .bind(...w.params),
  ]);

  const byBucket = new Map((series.results as { b: string; visitors: number }[]).map((r) => [r.b, r.visitors]));
  const buckets = bucketLabels(ctx.range, ctx.offset);
  const rows = buckets.map((bucket) => ({ bucket, visitors: byBucket.get(bucket) ?? 0 }));
  const rowsOut = (sources.results as { label: string; visitors: number }[]) ?? [];
  return {
    total: rowsOut.reduce((n, r) => n + r.visitors, 0),
    series: rows,
    sources: rowsOut,
  };
}
