import type { Context } from 'hono';
import type { Db } from '../shared/db';
import { getSite, type AppEnv, type Site } from './env';
import { verifyStandardWebhook } from './lib/crypto';

export function currencyDecimals(currency: string): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

interface PaymentInput {
  id: string;
  provider: string;
  ts: number;
  amount: number; // minor units; negative for refunds
  kind: 'payment' | 'refund';
  currency: string;
  visitorId?: string | null;
  sessionId?: string | null;
  customerId?: string | null;
  email?: string | null;
  name?: string | null;
  subscriptionId?: string | null;
  renewal?: boolean;
}

export type MatchedBy = 'metadata' | 'return_page' | 'customer' | 'email' | 'timing';

/** The visit that gets the credit: the visitor's last visit that came from somewhere (last non-direct touch). */
export function creditedSessionSql() {
  return `SELECT id FROM sessions WHERE site_id = ? AND visitor_id = ? AND started_at <= ?
          ORDER BY (channel != 'Direct') DESC, started_at DESC LIMIT 1`;
}

/**
 * Work out which visitor paid and which visit gets the credit, trying the most reliable signal first:
 *  1. metadata   kt_visitor_id passed to the checkout
 *  2. return_page  the visitor landed on your return URL with ?payment_id=<this payment>
 *  3. customer   the same customer paid before (renewals)
 *  4. email      the email matches a visitor you identify()'d
 *  5. timing     exactly one visitor clicked a Dodo checkout link (or a checkout goal) shortly before the payment
 * Credit goes to the last non-direct visit, so "saw a tweet, came back directly 17 days later and paid"
 * is credited to the tweet.
 */
async function attribute(db: Db, site: Site, p: PaymentInput) {
  let visitorId = p.visitorId ?? null;
  let matchedBy: MatchedBy | null = visitorId ? 'metadata' : null;
  let renewal = !!p.renewal;

  if (!visitorId) {
    const claim = await db
      .prepare('SELECT visitor_id FROM payment_claims WHERE site_id = ? AND payment_id IN (?, ?) ORDER BY ts LIMIT 1')
      .bind(site.id, p.id, p.subscriptionId ?? p.id)
      .first<{ visitor_id: string }>();
    if (claim) [visitorId, matchedBy] = [claim.visitor_id, 'return_page'];
  }

  if (p.customerId || p.email) {
    const prev = await db
      .prepare(
        `SELECT visitor_id FROM payments WHERE site_id = ? AND kind = 'payment' AND visitor_id IS NOT NULL AND id != ?
           AND ((customer_id IS NOT NULL AND customer_id = ?) OR (email IS NOT NULL AND email = ?))
         ORDER BY ts ASC LIMIT 1`,
      )
      .bind(site.id, p.id, p.customerId ?? null, p.email ?? null)
      .first<{ visitor_id: string }>();
    if (prev) {
      if (!visitorId) [visitorId, matchedBy] = [prev.visitor_id, 'customer'];
      // Same customer paid before: a subscription renewal or repeat purchase.
      if (p.kind === 'payment') renewal = true;
    }
  }
  if (!visitorId && p.email) {
    const v = await db
      .prepare('SELECT id FROM visitors WHERE site_id = ? AND email = ? ORDER BY first_seen DESC LIMIT 1')
      .bind(site.id, p.email)
      .first<{ id: string }>();
    if (v) [visitorId, matchedBy] = [v.id, 'email'];
  }
  if (!visitorId && p.kind === 'payment' && !renewal) {
    // Only trusted when there is exactly one candidate who isn't already linked to another payment.
    const candidates = await db
      .prepare(
        `SELECT DISTINCT e.visitor_id FROM events e
         WHERE e.site_id = ? AND e.ts BETWEEN ? AND ?
           AND ((e.type = 'outbound' AND e.name LIKE '%dodopayments.com%')
                OR (e.type = 'goal' AND (e.name LIKE '%checkout%' OR e.name LIKE '%buy%' OR e.name LIKE '%purchase%')))
           AND NOT EXISTS (SELECT 1 FROM payments o WHERE o.site_id = e.site_id AND o.visitor_id = e.visitor_id
                           AND o.kind = 'payment' AND o.id != ? AND o.ts BETWEEN ? AND ?)
         LIMIT 2`,
      )
      .bind(site.id, p.ts - TIMING_WINDOW_MS, p.ts + 5 * 60_000, p.id, p.ts - TIMING_WINDOW_MS, p.ts + TIMING_WINDOW_MS)
      .all<{ visitor_id: string }>();
    if (candidates.results.length === 1) [visitorId, matchedBy] = [candidates.results[0].visitor_id, 'timing'];
  }

  let sessionId: string | null = null;
  if (visitorId) {
    const s = await db.prepare(creditedSessionSql()).bind(site.id, visitorId, p.ts + 60_000).first<{ id: string }>();
    sessionId = s?.id ?? p.sessionId ?? null;
  }
  return { visitorId, sessionId, renewal, matchedBy };
}

const TIMING_WINDOW_MS = 3 * 3_600_000;

export async function recordPayment(db: Db, site: Site, p: PaymentInput) {
  const { visitorId, sessionId, renewal, matchedBy } = await attribute(db, site, p);
  const stmts = [
    db
      .prepare(
        `INSERT OR IGNORE INTO payments (id, site_id, provider, ts, amount, kind, currency, visitor_id, session_id, customer_id, email, name, renewal, matched_by, subscription_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        p.id,
        site.id,
        p.provider,
        p.ts,
        p.amount,
        p.kind,
        p.currency.toUpperCase(),
        visitorId,
        sessionId,
        p.customerId ?? null,
        p.email ?? null,
        p.name ?? null,
        renewal ? 1 : 0,
        matchedBy,
        p.subscriptionId ?? null,
      ),
  ];
  // A payment tells us who an anonymous visitor really is.
  if (visitorId && p.kind === 'payment' && (p.email || p.name)) {
    stmts.push(
      db.prepare('INSERT OR IGNORE INTO visitors (site_id, id, first_seen) VALUES (?, ?, ?)').bind(site.id, visitorId, p.ts),
      db
        .prepare('UPDATE visitors SET email = COALESCE(email, ?), name = COALESCE(name, ?) WHERE site_id = ? AND id = ?')
        .bind(p.email ?? null, p.name ?? null, site.id, visitorId),
    );
  }
  await db.batch(stmts);
  return { visitorId, sessionId };
}

/** Try again to link payments that have no visitor yet (e.g. ones recorded before a fallback existed). */
export async function rematchPayments(db: Db, site: Site) {
  const rows = await db
    .prepare("SELECT * FROM payments WHERE site_id = ? AND kind = 'payment' AND visitor_id IS NULL ORDER BY ts LIMIT 500")
    .bind(site.id)
    .all<{ id: string; ts: number; amount: number; currency: string; customer_id: string | null; email: string | null; name: string | null; provider: string; subscription_id: string | null }>();
  let matched = 0;
  for (const r of rows.results) {
    const a = await attribute(db, site, {
      id: r.id,
      provider: r.provider,
      ts: r.ts,
      amount: r.amount,
      kind: 'payment',
      currency: r.currency,
      customerId: r.customer_id,
      email: r.email,
      name: r.name,
      subscriptionId: r.subscription_id,
    });
    if (!a.visitorId) continue;
    matched++;
    await db.batch([
      db
        .prepare('UPDATE payments SET visitor_id = ?, session_id = ?, matched_by = ?, renewal = ? WHERE site_id = ? AND id = ?')
        .bind(a.visitorId, a.sessionId, a.matchedBy, a.renewal ? 1 : 0, site.id, r.id),
      db.prepare('INSERT OR IGNORE INTO visitors (site_id, id, first_seen) VALUES (?, ?, ?)').bind(site.id, a.visitorId, r.ts),
      db
        .prepare('UPDATE visitors SET email = COALESCE(email, ?), name = COALESCE(name, ?) WHERE site_id = ? AND id = ?')
        .bind(r.email, r.name, site.id, a.visitorId),
    ]);
  }
  return { checked: rows.results.length, matched };
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : null);

function pickMeta(meta: Record<string, unknown> | undefined, keys: string[]): string | null {
  if (!meta) return null;
  for (const k of keys) if (str(meta[k])) return meta[k] as string;
  return null;
}

/** Dodo Payments webhook: POST /api/webhooks/dodo/:siteId */
export async function handleDodoWebhook(c: Context<AppEnv>) {
  const site = await getSite(c.env.DB, c.req.param('siteId')!);
  if (!site) return c.json({ error: 'unknown site' }, 404);
  if (!site.dodo_webhook_secret) return c.json({ error: 'webhook secret not configured for this site' }, 400);

  const body = await c.req.text();
  const ok = await verifyStandardWebhook(
    site.dodo_webhook_secret,
    {
      id: c.req.header('webhook-id') ?? null,
      timestamp: c.req.header('webhook-timestamp') ?? null,
      signature: c.req.header('webhook-signature') ?? null,
    },
    body,
  );
  if (!ok) return c.json({ error: 'invalid signature' }, 401);

  const event = JSON.parse(body) as { type: string; timestamp?: string; data: Record<string, any> };
  const data = event.data ?? {};
  const customer = (data.customer ?? {}) as Record<string, unknown>;
  const meta = { ...(customer.metadata as object), ...(data.metadata as object) } as Record<string, unknown>;
  const ts = Date.parse(data.created_at ?? event.timestamp ?? '') || Date.now();

  if (event.type === 'payment.succeeded') {
    let amount = Number(data.total_amount) || 0;
    let currency = String(data.currency ?? site.currency);
    if (currency.toUpperCase() !== site.currency && str(data.settlement_currency)?.toUpperCase() === site.currency) {
      amount = Number(data.settlement_amount) || amount;
      currency = data.settlement_currency;
    }
    await recordPayment(c.env.DB, site, {
      id: String(data.payment_id),
      provider: 'dodo',
      ts,
      amount,
      kind: 'payment',
      currency,
      visitorId: pickMeta(meta, ['kt_visitor_id', 'visitor_id']),
      sessionId: pickMeta(meta, ['kt_session_id', 'session_id']),
      customerId: str(customer.customer_id) ?? str(data.customer_id),
      email: str(customer.email)?.toLowerCase() ?? null,
      name: str(customer.name),
      subscriptionId: str(data.subscription_id) ?? (Array.isArray(data.subscription_ids) ? str(data.subscription_ids[0]) : null),
    });
  } else if (event.type === 'refund.succeeded') {
    const original = await c.env.DB.prepare('SELECT * FROM payments WHERE id = ? AND site_id = ?')
      .bind(String(data.payment_id), site.id)
      .first<{ visitor_id: string | null; session_id: string | null; currency: string; amount: number }>();
    const amount = Number(data.amount) || original?.amount || 0;
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO payments (id, site_id, provider, ts, amount, kind, currency, visitor_id, session_id, customer_id, email, name)
       VALUES (?, ?, 'dodo', ?, ?, 'refund', ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        String(data.refund_id ?? `refund_${data.payment_id}`),
        site.id,
        ts,
        -Math.abs(amount),
        String(data.currency ?? original?.currency ?? site.currency).toUpperCase(),
        original?.visitor_id ?? null,
        original?.session_id ?? null,
        str(customer.customer_id),
        str(customer.email)?.toLowerCase() ?? null,
        str(customer.name),
      )
      .run();
  }
  // Every other event type is acknowledged so Dodo doesn't retry it.
  return c.json({ ok: true });
}

async function siteFromApiKey(c: Context<AppEnv>): Promise<Site | null> {
  const key = c.req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (!key) return null;
  return c.env.DB.prepare('SELECT * FROM sites WHERE api_key = ?').bind(key).first<Site>();
}

/**
 * Generic payments API, for any provider without a built-in integration.
 * POST /api/v1/payments  Authorization: Bearer <site api key>
 * { "transaction_id": "...", "amount": 29.99, "currency": "USD", "visitor_id": "<kt_vid cookie>", "email": "..." }
 */
export async function handlePaymentApi(c: Context<AppEnv>) {
  const site = await siteFromApiKey(c);
  if (!site) return c.json({ error: 'invalid api key' }, 401);
  const b = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!b || !str(b.transaction_id) || typeof b.amount !== 'number') {
    return c.json({ error: 'transaction_id (string) and amount (number, e.g. 29.99) are required' }, 400);
  }
  const currency = (str(b.currency) ?? site.currency).toUpperCase();
  const minor = Math.round((b.amount as number) * 10 ** currencyDecimals(currency));
  const refunded = b.refunded === true;
  const res = await recordPayment(c.env.DB, site, {
    id: `${site.id}:${b.transaction_id}${refunded ? ':refund' : ''}`,
    provider: 'api',
    ts: typeof b.timestamp === 'string' ? Date.parse(b.timestamp) || Date.now() : Date.now(),
    amount: refunded ? -Math.abs(minor) : minor,
    kind: refunded ? 'refund' : 'payment',
    currency,
    visitorId: str(b.visitor_id),
    sessionId: str(b.session_id),
    customerId: str(b.customer_id),
    email: str(b.email)?.toLowerCase() ?? null,
    name: str(b.name),
    renewal: b.renewal === true,
  });
  return c.json({ ok: true, attributed: !!res.sessionId, visitor_id: res.visitorId });
}

/**
 * Server-side goals (e.g. "signup" from your backend).
 * POST /api/v1/goals  { "visitor_id": "...", "name": "signup" }
 */
export async function handleGoalApi(c: Context<AppEnv>) {
  const site = await siteFromApiKey(c);
  if (!site) return c.json({ error: 'invalid api key' }, 401);
  const b = await c.req.json<Record<string, unknown>>().catch(() => null);
  const vid = str(b?.visitor_id);
  const name = str(b?.name)?.slice(0, 64);
  if (!vid || !name) return c.json({ error: 'visitor_id and name are required' }, 400);
  const s = await c.env.DB.prepare(
    'SELECT id, exit_page FROM sessions WHERE site_id = ? AND visitor_id = ? ORDER BY started_at DESC LIMIT 1',
  )
    .bind(site.id, vid)
    .first<{ id: string; exit_page: string }>();
  if (!s) return c.json({ error: 'visitor not found' }, 404);
  const now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE sessions SET goals = goals + 1 WHERE site_id = ? AND id = ?').bind(site.id, s.id),
    c.env.DB.prepare(
      "INSERT INTO events (site_id, session_id, visitor_id, ts, type, name, path, props) VALUES (?, ?, ?, ?, 'goal', ?, ?, ?)",
    ).bind(site.id, s.id, vid, now, name, s.exit_page, b?.props ? JSON.stringify(b.props).slice(0, 1000) : null),
  ]);
  return c.json({ ok: true });
}
