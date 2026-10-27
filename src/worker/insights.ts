import type { Db } from '../shared/db';
import type { Site } from './env';

const DAY = 86_400_000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export async function peakHours(db: Db, site: Site, from: number, to: number) {
  const [visits, sales] = await db.batch([
    db.prepare(
      `SELECT strftime('%Y-%m-%dT%H', started_at / 1000, 'unixepoch') AS hour, COUNT(DISTINCT visitor_id) AS visitors
       FROM sessions WHERE site_id = ? AND started_at >= ? AND started_at < ? GROUP BY hour`,
    ).bind(site.id, from, to),
    db.prepare(
      `SELECT strftime('%Y-%m-%dT%H', ts / 1000, 'unixepoch') AS hour, COUNT(*) AS sales, COALESCE(SUM(amount), 0) AS revenue
       FROM payments WHERE site_id = ? AND kind = 'payment' AND ts >= ? AND ts < ? GROUP BY hour`,
    ).bind(site.id, from, to),
  ]);
  const cells = Array.from({ length: 168 }, (_, i) => ({ weekday: (i / 24) | 0, day: WEEKDAYS[(i / 24) | 0], hour: i % 24, visitors: 0, sales: 0, revenue: 0 }));
  const toIndex = (label: string | null) => {
    if (!label) return -1;
    const date = new Date(`${label}:00Z`);
    if (!Number.isFinite(date.getTime())) return -1;
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: site.timezone, weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(date);
    const weekday = WEEKDAYS.indexOf(parts.find((p) => p.type === 'weekday')?.value ?? '');
    const hour = Number(parts.find((p) => p.type === 'hour')?.value);
    return weekday < 0 || !Number.isFinite(hour) ? -1 : weekday * 24 + hour;
  };
  for (const row of visits.results as { hour: string; visitors: number }[]) {
    const i = toIndex(row.hour); if (i >= 0) cells[i].visitors += row.visitors;
  }
  for (const row of sales.results as { hour: string; sales: number; revenue: number }[]) {
    const i = toIndex(row.hour); if (i >= 0) { cells[i].sales += row.sales; cells[i].revenue += row.revenue; }
  }
  return { cells, timezone: site.timezone, from, to };
}

export async function pageEngagement(db: Db, site: Site, from: number, to: number) {
  const res = await db.prepare(
    `SELECT pe.path, CASE WHEN EXISTS (
        SELECT 1 FROM payments p WHERE p.site_id = pe.site_id AND p.visitor_id = pe.visitor_id AND p.kind = 'payment'
      ) THEN 1 ELSE 0 END AS buyer,
      COUNT(*) AS views, AVG(pe.reading_ms) AS reading_ms, AVG(pe.scroll_depth) AS scroll_depth,
      SUM(CASE WHEN pe.scroll_depth >= 90 THEN 1 ELSE 0 END) AS completed
     FROM page_engagement pe JOIN sessions s ON s.site_id = pe.site_id AND s.id = pe.session_id
     WHERE pe.site_id = ? AND s.started_at >= ? AND s.started_at < ?
     GROUP BY pe.path, buyer ORDER BY views DESC LIMIT 1000`,
  ).bind(site.id, from, to).all<{
    path: string; buyer: number; views: number; reading_ms: number; scroll_depth: number; completed: number;
  }>();
  type Split = { views: number; reading: number; scroll: number };
  const paths = new Map<string, { views: number; read: number; scroll: number; buyers: Split; others: Split }>();
  let completed = 0;
  for (const row of res.results) {
    const item = paths.get(row.path) ?? { views: 0, read: 0, scroll: 0, buyers: { views: 0, reading: 0, scroll: 0 }, others: { views: 0, reading: 0, scroll: 0 } };
    const split = row.buyer ? item.buyers : item.others;
    item.views += row.views; item.read += row.reading_ms * row.views; item.scroll += row.scroll_depth * row.views;
    split.views += row.views; split.reading += row.reading_ms * row.views; split.scroll += row.scroll_depth * row.views;
    completed += row.completed;
    paths.set(row.path, item);
  }
  const avg = (s: Split) => ({ views: s.views, readingMs: s.views ? s.reading / s.views : 0, scrollDepth: s.views ? s.scroll / s.views : 0 });
  const pages = [...paths.entries()].map(([path, item]) => ({
    path, views: item.views, readingMs: item.views ? item.read / item.views : 0, scrollDepth: item.views ? item.scroll / item.views : 0,
    buyers: avg(item.buyers), others: avg(item.others),
  })).sort((a, b) => b.views - a.views);
  const views = pages.reduce((n, p) => n + p.views, 0);
  return {
    pages,
    measuredViews: views,
    averageReadingMs: views ? pages.reduce((n, p) => n + p.readingMs * p.views, 0) / views : 0,
    averageScroll: views ? pages.reduce((n, p) => n + p.scrollDepth * p.views, 0) / views : 0,
    readToEnd: views ? completed / views : 0,
  };
}

export async function purchaseJourney(db: Db, site: Site, from: number, to: number) {
  const [buyers, pages] = await db.batch([
    db.prepare(
      `WITH purchases AS (
         SELECT visitor_id, MIN(ts) AS paid_at FROM payments
         WHERE site_id = ? AND kind = 'payment' AND visitor_id IS NOT NULL AND ts >= ? AND ts < ? GROUP BY visitor_id
       )
       SELECT p.visitor_id, p.paid_at,
         (SELECT MIN(started_at) FROM sessions s WHERE s.site_id = ? AND s.visitor_id = p.visitor_id AND s.started_at <= p.paid_at) AS first_seen,
         (SELECT COUNT(*) FROM sessions s WHERE s.site_id = ? AND s.visitor_id = p.visitor_id AND s.started_at <= p.paid_at) AS visits,
         (SELECT COUNT(*) FROM events e WHERE e.site_id = ? AND e.visitor_id = p.visitor_id AND e.type = 'pageview' AND e.ts <= p.paid_at) AS pageviews,
         (SELECT source FROM sessions s WHERE s.site_id = ? AND s.visitor_id = p.visitor_id AND s.started_at <= p.paid_at ORDER BY started_at ASC LIMIT 1) AS first_source,
         (SELECT source FROM sessions s WHERE s.site_id = ? AND s.visitor_id = p.visitor_id AND s.started_at <= p.paid_at
          ORDER BY (channel != 'Direct') DESC, started_at DESC LIMIT 1) AS credited_source
       FROM purchases p`,
    ).bind(site.id, from, to, site.id, site.id, site.id, site.id, site.id),
    db.prepare(
      `WITH purchases AS (
         SELECT visitor_id, MIN(ts) AS paid_at FROM payments
         WHERE site_id = ? AND kind = 'payment' AND visitor_id IS NOT NULL AND ts >= ? AND ts < ? GROUP BY visitor_id
       )
       SELECT e.path, COUNT(DISTINCT e.visitor_id) AS buyers
       FROM events e JOIN purchases p ON p.visitor_id = e.visitor_id AND e.site_id = ? AND e.ts <= p.paid_at
       WHERE e.site_id = ? AND e.type = 'pageview' GROUP BY e.path ORDER BY buyers DESC LIMIT 12`,
    ).bind(site.id, from, to, site.id, site.id),
  ]);
  const rows = buyers.results as { visitor_id: string; paid_at: number; first_seen: number | null; visits: number; pageviews: number; first_source: string | null; credited_source: string | null }[];
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b); const m = sorted.length >> 1;
    return sorted.length ? sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2 : 0;
  };
  const dayNames = ['Same visit', 'Same day', '1–3 days', '4–7 days', '1–2 weeks', '2–4 weeks', '1–3 months', '3+ months'];
  const visitNames = ['1', '2', '3', '4–5', '6–10', '11+'];
  const dayCounts = Array(dayNames.length).fill(0) as number[];
  const visitCounts = Array(visitNames.length).fill(0) as number[];
  const dayValues: number[] = []; const visitValues: number[] = []; const pageValues: number[] = [];
  const sourceFlows = new Map<string, number>(); let firstVisit = 0;
  for (const row of rows) {
    const elapsed = Math.max(0, row.paid_at - (row.first_seen ?? row.paid_at)) / DAY;
    const di = elapsed < 0.02 ? 0 : elapsed < 1 ? 1 : elapsed <= 3 ? 2 : elapsed <= 7 ? 3 : elapsed <= 14 ? 4 : elapsed <= 28 ? 5 : elapsed <= 90 ? 6 : 7;
    const vi = row.visits <= 1 ? 0 : row.visits === 2 ? 1 : row.visits === 3 ? 2 : row.visits <= 5 ? 3 : row.visits <= 10 ? 4 : 5;
    dayCounts[di]++; visitCounts[vi]++; dayValues.push(elapsed); visitValues.push(row.visits); pageValues.push(row.pageviews);
    if (row.visits <= 1) firstVisit++;
    const key = `${row.first_source ?? 'Direct'}\u0000${row.credited_source ?? 'Direct'}`;
    sourceFlows.set(key, (sourceFlows.get(key) ?? 0) + 1);
  }
  return {
    customers: rows.length, medianDays: median(dayValues), medianVisits: median(visitValues), medianPages: median(pageValues),
    firstVisitRate: rows.length ? firstVisit / rows.length : 0,
    days: dayNames.map((label, i) => ({ label, count: dayCounts[i] })),
    visits: visitNames.map((label, i) => ({ label, count: visitCounts[i] })),
    sources: [...sourceFlows.entries()].map(([key, count]) => { const [first, credited] = key.split('\u0000'); return { first, credited, count }; }).sort((a, b) => b.count - a.count).slice(0, 20),
    pages: (pages.results as { path: string; buyers: number }[]).map((row) => ({ ...row, share: rows.length ? row.buyers / rows.length : 0 })),
  };
}
