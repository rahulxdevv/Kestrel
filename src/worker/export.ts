import type { Context } from 'hono';
import type { AppEnv } from './env';
import { currencyDecimals } from './payments';
import { breakdown, makeCtx, overview, visitors, customers } from './stats';

/** RFC 4180 quoting: commas, quotes and newlines are escaped, everything else is left alone. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

const iso = (ts: number | null | undefined) => (typeof ts === 'number' ? new Date(ts).toISOString() : '');

/**
 * GET /api/sites/:id/export?type=breakdown|series|visitors|payments&dim=page
 * Every table in the dashboard can leave the building, which matters when you self-host and want
 * your own copy of the data.
 */
export async function handleExport(c: Context<AppEnv>) {
  const ctx = makeCtx(c);
  const type = c.req.query('type') ?? 'breakdown';
  const major = 10 ** currencyDecimals(ctx.site.currency);
  const stamp = new Date().toISOString().slice(0, 10);
  let filename = `kestrel-${type}-${stamp}.csv`;
  let csv: string;

  if (type === 'series') {
    const data = await overview(ctx);
    csv = toCsv(
      ['bucket', 'visitors', 'pageviews', 'revenue', 'payments'],
      data.series.map((s) => [s.bucket, s.visitors, s.pageviews, (s.revenue / major).toFixed(2), s.payments]),
    );
  } else if (type === 'visitors') {
    const rows = await visitors(ctx);
    csv = toCsv(
      ['visitor_id', 'name', 'email', 'source', 'country', 'city', 'browser', 'os', 'device', 'sessions', 'pageviews', 'duration_seconds', 'spent', 'last_seen'],
      rows.map((r: any) => [
        r.visitor_id,
        r.name,
        r.email,
        r.source,
        r.country,
        r.city,
        r.browser,
        r.os,
        r.device,
        r.sessions,
        r.pageviews,
        Math.round((r.duration ?? 0) / 1000),
        ((r.spent ?? 0) / major).toFixed(2),
        iso(r.last_seen),
      ]),
    );
  } else if (type === 'payments' || type === 'journey') {
    const rows = await customers(ctx);
    csv = toCsv(
      ['payment_id', 'date', 'amount', 'currency', 'visitor_id', 'source', 'campaign', 'email', 'matched_by', 'renewal'],
      rows.map((r: any) => [
        r.id,
        iso(r.ts),
        (r.amount / major).toFixed(2),
        r.currency,
        r.visitor_id,
        r.source,
        r.utm_campaign,
        r.email ?? r.pay_email,
        r.matched_by,
        r.renewal ? 'yes' : 'no',
      ]),
    );
  } else {
    const dim = c.req.query('dim') ?? 'page';
    let rows;
    try {
      rows = await breakdown(ctx, dim, 500);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
    filename = `kestrel-${dim}-${stamp}.csv`;
    csv = toCsv(
      [dim, 'visitors', 'pageviews', 'revenue', 'customers', 'conversion_rate'],
      rows.map((r) => [
        r.label,
        r.visitors,
        r.pageviews ?? '',
        (r.revenue / major).toFixed(2),
        r.customers,
        r.visitors ? (r.customers / r.visitors).toFixed(4) : '',
      ]),
    );
  }

  return c.body(csv, 200, {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="${filename}"`,
    'cache-control': 'no-store',
  });
}
