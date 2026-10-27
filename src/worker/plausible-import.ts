import type { Context } from 'hono';
import type { AppEnv } from './env';

function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = []; let field = ''; let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field.length === 0) quoted = true;
    else if (c === ',') { row.push(field.trim()); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && input[i + 1] === '\n') i++;
      row.push(field.trim()); field = '';
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

const integer = (v: string | undefined) => {
  const n = Number((v ?? '').replace(/[,%\s]/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
};

export async function getPlausibleImport(c: Context<AppEnv>) {
  const site = c.get('site');
  const stats = await c.env.DB.prepare('SELECT COUNT(*) AS days, MIN(day) AS from_day, MAX(day) AS to_day, MAX(imported_at) AS imported_at, COALESCE(SUM(visitors), 0) AS visitors, COALESCE(SUM(visits), 0) AS visits, COALESCE(SUM(pageviews), 0) AS pageviews FROM plausible_daily WHERE site_id = ?')
    .bind(site.id).first<{ days: number; from_day: string | null; to_day: string | null; imported_at: number | null; visitors: number; visits: number; pageviews: number }>();
  return c.json(stats ?? { days: 0, from_day: null, to_day: null, imported_at: null, visitors: 0, visits: 0, pageviews: 0 });
}

export async function importPlausibleCsv(c: Context<AppEnv>) {
  const body = await c.req.json<{ csv?: string }>().catch(() => null);
  if (typeof body?.csv !== 'string' || !body.csv.trim()) return c.json({ error: 'Choose a Plausible daily metrics CSV file.' }, 400);
  if (body.csv.length > 5_000_000) return c.json({ error: 'The CSV must be smaller than 5 MB.' }, 413);
  const rows = parseCsv(body.csv);
  if (rows.length < 2) return c.json({ error: 'The CSV needs a header and at least one daily row.' }, 400);
  const headers = rows[0].map((h) => h.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
  const col = (...names: string[]) => names.map((name) => headers.indexOf(name)).find((i) => i >= 0) ?? -1;
  const dateCol = col('date', 'day');
  const visitorsCol = col('visitors', 'unique_visitors', 'unique_visitors_total');
  const visitsCol = col('visits', 'sessions', 'total_visits');
  const viewsCol = col('pageviews', 'page_views', 'views');
  const bounceCol = col('bounce_rate', 'bounce_rate_percent');
  const durationCol = col('visit_duration', 'average_visit_duration', 'avg_visit_duration');
  if (dateCol < 0 || visitorsCol < 0 || viewsCol < 0 || (visitsCol < 0 && visitorsCol < 0)) {
    return c.json({ error: 'Expected Plausible daily columns: date, visitors, visits, pageviews, bounce_rate, visit_duration.' }, 400);
  }
  const valid = rows.slice(1).filter((r) => r[dateCol] && /^\d{4}-\d{2}-\d{2}$/.test(r[dateCol]));
  if (!valid.length || valid.length > 10_000) return c.json({ error: 'Provide 1 to 10,000 rows with dates formatted YYYY-MM-DD.' }, 400);
  const site = c.get('site'); const importedAt = Date.now();
  const statements = valid.map((r) => {
    const visits = integer(visitsCol >= 0 ? r[visitsCol] : r[visitorsCol]);
    const bounce = Number((r[bounceCol] ?? '').replace(/[,%\s]/g, '')) || 0;
    const bounceRate = bounce > 1 ? bounce / 100 : bounce;
    const duration = Number((r[durationCol] ?? '').replace(/[^0-9.]/g, '')) || 0;
    return c.env.DB.prepare(
      `INSERT INTO plausible_daily (site_id, day, visitors, visits, pageviews, bounces, visit_duration, imported_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (site_id, day) DO UPDATE SET visitors = excluded.visitors, visits = excluded.visits,
         pageviews = excluded.pageviews, bounces = excluded.bounces, visit_duration = excluded.visit_duration, imported_at = excluded.imported_at`,
    ).bind(site.id, r[dateCol], integer(r[visitorsCol]), visits, integer(r[viewsCol]), Math.round(visits * Math.min(1, bounceRate)), Math.round(duration), importedAt);
  });
  for (let i = 0; i < statements.length; i += 100) await c.env.DB.batch(statements.slice(i, i + 100));
  return c.json({ imported: valid.length, from: valid[0][dateCol], to: valid[valid.length - 1][dateCol] });
}
