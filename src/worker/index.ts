import { Hono, type Context, type Next } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { cors } from 'hono/cors';
import { handleEvent } from './collect';
import { forgetSite, type AppEnv, type Site } from './env';
import { handleExport } from './export';
import { clientIp, isSecureRequest } from './lib/client';
import { passwordsMatch, randomId, signToken, verifyToken } from './lib/crypto';
import { handleMcp } from './mcp';
import { handleDodoWebhook, handleGoalApi, handlePaymentApi, handlePolarWebhook, handleRazorpayWebhook, handleStripeWebhook, rematchPayments } from './payments';
import { pageEngagement, peakHours, purchaseJourney } from './insights';
import { bucketSql } from './lib/time';
import { getPlausibleImport, importPlausibleCsv } from './plausible-import';
import {
  aiTraffic,
  breakdown,
  content,
  customers,
  funnel,
  makeCtx,
  overview,
  realtime,
  siteSummaries,
  timeseries,
  visitorProfile,
  visitors,
  type FunnelStep,
} from './stats';

const app = new Hono<AppEnv>();
const VERSION = '1.0.0';
const STARTED_AT = Date.now();
const AUTH_COOKIE = 'kt_auth';
const AUTH_DAYS = 30;
const MAX_FAILURES = 10;
const LOCKOUT_MS = 15 * 60_000;
const DEMO_SITE_ID = 'kestrel-demo';
const isDemoMode = (c: Context<AppEnv>) => c.env.DEMO_MODE?.trim().toLowerCase() === 'true';
const demoOnlineCount = () => 4 + Math.floor(Math.random() * 5);

// API responses are always fresh and never sniffed as something else.
app.use('/api/*', async (c, next) => {
  await next();
  c.header('cache-control', 'no-store');
  c.header('x-content-type-options', 'nosniff');
});

// A demo is a public showcase, never a writeable analytics account. Block every API mutation,
// including event collection, payment/goal ingestion, auth writes, and dashboard CRUD.
app.use('/api/*', async (c, next) => {
  if (isDemoMode(c) && !['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    return c.json({ error: 'This demo is read-only.' }, 403);
  }
  await next();
});

/** Public, unauthenticated surface: tracking, webhooks, server-side API. */
app.use('/api/event', cors({ origin: '*', allowMethods: ['POST', 'OPTIONS'], maxAge: 86400 }));
app.post('/api/event', handleEvent);
app.post('/api/webhooks/dodo/:siteId', handleDodoWebhook);
app.post('/api/webhooks/polar/:siteId', handlePolarWebhook);
app.post('/api/webhooks/stripe/:siteId', handleStripeWebhook);
app.post('/api/webhooks/razorpay/:siteId', handleRazorpayWebhook);
app.post('/api/v1/payments', handlePaymentApi);
app.post('/api/v1/goals', handleGoalApi);

// Agents connect here with a site's API key (read-only). See docs/MCP.md.
app.all('/api/mcp', handleMcp);

// ---------- health (used by Docker, Dokploy and Render health checks)

app.get('/api/health', async (c) => {
  const started = Date.now();
  try {
    await c.env.DB.prepare('SELECT 1 AS ok').first();
  } catch (e) {
    return c.json({ ok: false, error: 'database unavailable' }, 503);
  }
  return c.json({
    ok: true,
    name: 'kestrel',
    version: VERSION,
    uptimeSeconds: Math.round((Date.now() - STARTED_AT) / 1000),
    dbLatencyMs: Date.now() - started,
  });
});

// ---------- login

async function isLoggedIn(c: Context<AppEnv>) {
  if (!c.env.SESSION_SECRET) return false;
  const value = await verifyToken(c.env.SESSION_SECRET, getCookie(c, AUTH_COOKIE));
  return !!value && Number(value.split('.')[1]) > Date.now();
}

app.post('/api/auth/login', async (c) => {
  if (!c.env.ADMIN_PASSWORD || !c.env.SESSION_SECRET) {
    return c.json({ error: 'Set ADMIN_PASSWORD (and SESSION_SECRET) to use the dashboard. See the README.' }, 500);
  }
  // Lock an IP out after too many wrong passwords, so a public dashboard can't be brute-forced.
  // Behind Docker/Traefik/Render/Cloudflare the real address is in a forwarding header.
  const ip = clientIp(c.req.raw.headers);
  const now = Date.now();
  const recent = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM login_failures WHERE ip = ? AND ts > ?')
    .bind(ip, now - LOCKOUT_MS)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= MAX_FAILURES) {
    return c.json({ error: 'Too many wrong attempts. Try again in 15 minutes.' }, 429);
  }
  const { password } = await c.req.json<{ password?: string }>().catch(() => ({ password: undefined }));
  if (!password || !passwordsMatch(password, c.env.ADMIN_PASSWORD)) {
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO login_failures (ip, ts) VALUES (?, ?)').bind(ip, now),
      c.env.DB.prepare('DELETE FROM login_failures WHERE ts < ?').bind(now - LOCKOUT_MS),
    ]);
    await new Promise((r) => setTimeout(r, 500));
    return c.json({ error: 'Wrong password' }, 401);
  }
  await c.env.DB.prepare('DELETE FROM login_failures WHERE ip = ?').bind(ip).run();
  const expires = Date.now() + AUTH_DAYS * 86_400_000;
  // `secure` follows the proxy's protocol header, otherwise logging in over HTTPS behind a
  // TLS-terminating proxy would silently drop the cookie.
  setCookie(c, AUTH_COOKIE, await signToken(c.env.SESSION_SECRET, `admin.${expires}`), {
    httpOnly: true,
    secure: isSecureRequest(c.req.raw.headers, new URL(c.req.url)),
    sameSite: 'Lax',
    path: '/',
    maxAge: AUTH_DAYS * 86_400,
  });
  return c.json({ ok: true });
});

app.post('/api/auth/logout', (c) => {
  deleteCookie(c, AUTH_COOKIE, { path: '/' });
  return c.json({ ok: true });
});

app.get('/api/auth/me', async (c) =>
  c.json({
    loggedIn: isDemoMode(c) || (await isLoggedIn(c)),
    configured: isDemoMode(c) || Boolean(c.env.ADMIN_PASSWORD && c.env.SESSION_SECRET),
    demoMode: isDemoMode(c),
  }),
);

// ---------- dashboard API (login required)

const requireAuth = async (c: Context<AppEnv>, next: Next) => {
  if (isDemoMode(c) && ['GET', 'HEAD'].includes(c.req.method)) return next();
  if (!(await isLoggedIn(c))) return c.json({ error: 'unauthorized' }, 401);
  await next();
};
app.use('/api/sites', requireAuth);
app.use('/api/sites/*', requireAuth);
app.use('/api/summary', requireAuth);

const loadSite = async (c: Context<AppEnv>, next: Next) => {
  const siteId = c.req.param('id');
  if (isDemoMode(c) && siteId !== DEMO_SITE_ID) return c.json({ error: 'site not found' }, 404);
  const site = await c.env.DB.prepare('SELECT * FROM sites WHERE id = ?').bind(siteId).first<Site>();
  if (!site) return c.json({ error: 'site not found' }, 404);
  c.set('site', site);
  await next();
};
app.use('/api/sites/:id', loadSite);
app.use('/api/sites/:id/*', loadSite);

function cleanDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/?#].*$/, '');
}

function validTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const publicSite = (s: Site) => ({
  ...s,
  dodo_webhook_secret: s.dodo_webhook_secret ? '••••••••' : null,
  polar_webhook_secret: s.polar_webhook_secret ? '••••••••' : null,
  stripe_webhook_secret: s.stripe_webhook_secret ? '••••••••' : null,
  razorpay_webhook_secret: s.razorpay_webhook_secret ? '••••••••' : null,
});

/** Everything a shared viewer may see: no keys, no secret, no visitor identities. */
const sharedSite = (s: Site) => ({
  id: s.id,
  name: s.name,
  domain: s.domain,
  timezone: s.timezone,
  currency: s.currency,
  created_at: s.created_at,
});

/** The demo exposes analytics but never publishes site credentials or webhook settings. */
const demoSite = (s: Site) => ({
  ...sharedSite(s),
  api_key: '',
  dodo_webhook_secret: null,
  polar_webhook_secret: null,
  stripe_webhook_secret: null,
  razorpay_webhook_secret: null,
  share_token: null,
});

app.get('/api/sites', async (c) => {
  const now = Date.now();
  const demo = isDemoMode(c);
  const [sites, stats] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT * FROM sites ${demo ? 'WHERE id = ?' : ''} ORDER BY created_at`)
      .bind(...(demo ? [DEMO_SITE_ID] : [])),
    c.env.DB.prepare(
      `SELECT site_id, COUNT(DISTINCT visitor_id) AS visitors,
              COUNT(DISTINCT CASE WHEN last_seen_at > ? THEN visitor_id END) AS online
       FROM sessions WHERE started_at > ? GROUP BY site_id`,
    ).bind(now - 5 * 60_000, now - 86_400_000),
  ]);
  const by = new Map((stats.results as any[]).map((r) => [r.site_id, r]));
  return c.json(
    (sites.results as unknown as Site[]).map((s) => ({
      ...(demo ? demoSite(s) : publicSite(s)),
      visitors24h: by.get(s.id)?.visitors ?? 0,
      online: demo ? demoOnlineCount() : by.get(s.id)?.online ?? 0,
    })),
  );
});

/** The all-websites table: every site's numbers for the window, in one request. */
app.get('/api/summary', async (c) => {
  const days = Number(c.req.query('days')) === 30 ? 30 : 7;
  const demo = isDemoMode(c);
  const sites = await c.env.DB.prepare(`SELECT * FROM sites ${demo ? 'WHERE id = ?' : ''} ORDER BY created_at`)
    .bind(...(demo ? [DEMO_SITE_ID] : []))
    .all<Site>();
  const { summaries } = await siteSummaries(c.env.DB, days);
  const rows = (sites.results as Site[]).map((s) => ({
    ...(demo ? demoSite(s) : publicSite(s)),
    ...(summaries.get(s.id) ?? { visitors: 0, revenue: 0, sales: 0, avgOrder: 0, online: 0, previousVisitors: 0, previousRevenue: 0, series: [] }),
    ...(demo ? { online: demoOnlineCount() } : {}),
  }));
  const currency = rows.length ? rows[0].currency : 'USD';
  return c.json({
    days,
    currency,
    sites: rows,
  });
});

app.post('/api/sites', async (c) => {
  const b = await c.req.json<Partial<Site>>().catch(() => ({}) as Partial<Site>);
  const domain = cleanDomain(b.domain ?? '');
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return c.json({ error: 'Enter a domain like example.com' }, 400);
  const tz = b.timezone && validTimezone(b.timezone) ? b.timezone : 'UTC';
  const site: Site = {
    id: randomId(8),
    name: (b.name || domain).slice(0, 100),
    domain,
    timezone: tz,
    currency: (b.currency || 'USD').toUpperCase().slice(0, 3),
    api_key: 'k_' + randomId(16),
    dodo_webhook_secret: null,
    polar_webhook_secret: null,
    stripe_webhook_secret: null,
    razorpay_webhook_secret: null,
    share_token: null,
    created_at: Date.now(),
  };
  await c.env.DB.prepare(
    'INSERT INTO sites (id, name, domain, timezone, currency, api_key, dodo_webhook_secret, share_token, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(site.id, site.name, site.domain, site.timezone, site.currency, site.api_key, null, null, site.created_at)
    .run();
  return c.json(publicSite(site));
});

app.get('/api/sites/:id', (c) => c.json(isDemoMode(c) ? demoSite(c.get('site')) : publicSite(c.get('site'))));

app.patch('/api/sites/:id', async (c) => {
  const site = c.get('site');
  const b = await c.req.json<Partial<Site>>().catch(() => ({}) as Partial<Site>);
  const next = { ...site };
  if (typeof b.name === 'string' && b.name.trim()) next.name = b.name.trim().slice(0, 100);
  if (typeof b.domain === 'string') {
    const d = cleanDomain(b.domain);
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) return c.json({ error: 'Enter a domain like example.com' }, 400);
    next.domain = d;
  }
  if (typeof b.timezone === 'string') {
    if (!validTimezone(b.timezone)) return c.json({ error: 'Unknown timezone' }, 400);
    next.timezone = b.timezone;
  }
  if (typeof b.currency === 'string' && /^[A-Za-z]{3}$/.test(b.currency)) next.currency = b.currency.toUpperCase();
  if (typeof b.dodo_webhook_secret === 'string' && !b.dodo_webhook_secret.includes('•')) {
    next.dodo_webhook_secret = b.dodo_webhook_secret.trim() || null;
  }
  for (const key of ['polar_webhook_secret', 'stripe_webhook_secret', 'razorpay_webhook_secret'] as const) {
    if (typeof b[key] === 'string' && !b[key]!.includes('•')) next[key] = b[key]!.trim() || null;
  }
  await c.env.DB.prepare('UPDATE sites SET name = ?, domain = ?, timezone = ?, currency = ?, dodo_webhook_secret = ?, polar_webhook_secret = ?, stripe_webhook_secret = ?, razorpay_webhook_secret = ? WHERE id = ?')
    .bind(next.name, next.domain, next.timezone, next.currency, next.dodo_webhook_secret, next.polar_webhook_secret, next.stripe_webhook_secret, next.razorpay_webhook_secret, site.id)
    .run();
  forgetSite(site.id);
  return c.json(publicSite(next));
});

app.post('/api/sites/:id/rotate-key', async (c) => {
  const key = 'k_' + randomId(16);
  await c.env.DB.prepare('UPDATE sites SET api_key = ? WHERE id = ?').bind(key, c.get('site').id).run();
  return c.json({ api_key: key });
});

/** Turn the read-only public dashboard on or off. */
app.post('/api/sites/:id/share', async (c) => {
  const token = randomId(16);
  await c.env.DB.prepare('UPDATE sites SET share_token = ? WHERE id = ?').bind(token, c.get('site').id).run();
  forgetSite(c.get('site').id);
  return c.json({ share_token: token });
});

app.delete('/api/sites/:id/share', async (c) => {
  await c.env.DB.prepare('UPDATE sites SET share_token = NULL WHERE id = ?').bind(c.get('site').id).run();
  forgetSite(c.get('site').id);
  return c.json({ ok: true });
});

app.delete('/api/sites/:id', async (c) => {
  const id = c.get('site').id;
  await c.env.DB.batch(
    ['events', 'sessions', 'visitors', 'payments', 'payment_claims', 'funnels', 'page_engagement', 'chart_notes', 'plausible_daily'].map((t) =>
      c.env.DB.prepare(`DELETE FROM ${t} WHERE site_id = ?`).bind(id),
    ).concat(c.env.DB.prepare('DELETE FROM sites WHERE id = ?').bind(id)),
  );
  forgetSite(id);
  return c.json({ ok: true });
});

// ---------- stats

app.get('/api/sites/:id/overview', async (c) => {
  const data = await overview(makeCtx(c));
  return c.json(isDemoMode(c) ? { ...data, online: demoOnlineCount() } : data);
});

app.get('/api/sites/:id/breakdown', async (c) => {
  try {
    return c.json(await breakdown(makeCtx(c), c.req.query('dim') ?? 'source', Number(c.req.query('limit')) || 100));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

app.get('/api/sites/:id/content', async (c) => c.json(await content(makeCtx(c))));
app.get('/api/sites/:id/ai', async (c) => c.json(await aiTraffic(makeCtx(c))));
app.get('/api/sites/:id/timeseries', async (c) =>
  c.json(await timeseries(makeCtx(c), c.req.query('dim') === 'page' ? 'page' : 'goal', Number(c.req.query('limit')) || 7)),
);
app.get('/api/sites/:id/realtime', async (c) => c.json(await realtime(makeCtx(c), isDemoMode(c), Number(c.req.query('after')) || 0)));
app.get('/api/sites/:id/imports/plausible', getPlausibleImport);
app.post('/api/sites/:id/imports/plausible', importPlausibleCsv);
app.get('/api/sites/:id/insights/peak-hours', async (c) => {
  const ctx = makeCtx(c);
  return c.json(await peakHours(c.env.DB, ctx.site, ctx.range.from, ctx.range.to));
});
app.get('/api/sites/:id/insights/engagement', async (c) => {
  const ctx = makeCtx(c);
  return c.json(await pageEngagement(c.env.DB, ctx.site, ctx.range.from, ctx.range.to));
});
app.get('/api/sites/:id/insights/purchase-journey', async (c) => {
  const ctx = makeCtx(c);
  return c.json(await purchaseJourney(c.env.DB, ctx.site, ctx.range.from, ctx.range.to));
});
app.get('/api/sites/:id/notes', async (c) => {
  const ctx = makeCtx(c);
  const bucket = bucketSql('ts', ctx.range.granularity, ctx.offset);
  return c.json(await c.env.DB.prepare(`SELECT id, ts, label, ${bucket} AS bucket FROM chart_notes WHERE site_id = ? AND ts >= ? AND ts < ? ORDER BY ts`)
    .bind(ctx.site.id, ctx.range.from, ctx.range.to).all());
});
app.post('/api/sites/:id/notes', async (c) => {
  const body = await c.req.json<{ ts?: number; label?: string }>().catch((): { ts?: number; label?: string } => ({}));
  if (!Number.isFinite(body.ts) || typeof body.label !== 'string' || !body.label.trim()) return c.json({ error: 'A date and note are required.' }, 400);
  const id = randomId(10);
  const label = body.label.trim().slice(0, 120);
  await c.env.DB.prepare('INSERT INTO chart_notes (id, site_id, ts, label, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, c.get('site').id, Math.round(body.ts!), label, Date.now()).run();
  return c.json({ id, ts: Math.round(body.ts!), label }, 201);
});
app.delete('/api/sites/:id/notes/:nid', async (c) => {
  await c.env.DB.prepare('DELETE FROM chart_notes WHERE site_id = ? AND id = ?').bind(c.get('site').id, c.req.param('nid')).run();
  return c.json({ ok: true });
});
app.get('/api/sites/:id/export', handleExport);
app.post('/api/sites/:id/rematch', async (c) => c.json(await rematchPayments(c.env.DB, c.get('site'))));
app.get('/api/sites/:id/customers', async (c) => c.json(await customers(makeCtx(c))));
app.get('/api/sites/:id/visitors', async (c) => c.json(await visitors(makeCtx(c))));
app.get('/api/sites/:id/visitors/:vid', async (c) =>
  c.json(await visitorProfile(c.env.DB, c.get('site'), c.req.param('vid'))),
);

app.get('/api/sites/:id/funnels', async (c) => {
  const res = await c.env.DB.prepare('SELECT * FROM funnels WHERE site_id = ? ORDER BY created_at').bind(c.get('site').id).all();
  return c.json(res.results.map((f: any) => ({ ...f, steps: JSON.parse(f.steps) })));
});

app.post('/api/sites/:id/funnels', async (c) => {
  const b = await c.req.json<{ name?: string; steps?: FunnelStep[] }>().catch(() => ({}) as { name?: string; steps?: FunnelStep[] });
  const steps = (b.steps ?? [])
    .filter((s) => (s.type === 'page' || s.type === 'goal') && typeof s.value === 'string' && s.value.trim())
    .slice(0, 10)
    .map((s) => ({ type: s.type, value: s.value.trim().slice(0, 200) }));
  if (!b.name?.trim() || steps.length < 2) return c.json({ error: 'A funnel needs a name and at least 2 steps' }, 400);
  const id = randomId(8);
  await c.env.DB.prepare('INSERT INTO funnels (id, site_id, name, steps, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, c.get('site').id, b.name.trim().slice(0, 100), JSON.stringify(steps), Date.now())
    .run();
  return c.json({ id, name: b.name.trim(), steps });
});

app.delete('/api/sites/:id/funnels/:fid', async (c) => {
  await c.env.DB.prepare('DELETE FROM funnels WHERE id = ? AND site_id = ?').bind(c.req.param('fid'), c.get('site').id).run();
  return c.json({ ok: true });
});

app.get('/api/sites/:id/funnels/:fid/stats', async (c) => {
  const f = await c.env.DB.prepare('SELECT * FROM funnels WHERE id = ? AND site_id = ?')
    .bind(c.req.param('fid'), c.get('site').id)
    .first<{ steps: string }>();
  if (!f) return c.json({ error: 'funnel not found' }, 404);
  return c.json(await funnel(makeCtx(c), JSON.parse(f.steps)));
});

// ---------- public read-only dashboard (share links)

const loadShared = async (c: Context<AppEnv>, next: Next) => {
  const site = await c.env.DB.prepare('SELECT * FROM sites WHERE share_token = ?')
    .bind(c.req.param('token'))
    .first<Site>();
  if (!site) return c.json({ error: 'This dashboard is not shared (or the link was reset).' }, 404);
  c.set('site', site);
  await next();
};
app.use('/api/public/:token', loadShared);
app.use('/api/public/:token/*', loadShared);
app.get('/api/public/:token', (c) => c.json({ site: sharedSite(c.get('site')) }));
app.get('/api/public/:token/overview', async (c) => {
  const data = await overview(makeCtx(c));
  return c.json({ ...data, site: sharedSite(c.get('site')) });
});
app.get('/api/public/:token/breakdown', async (c) => {
  try {
    return c.json(await breakdown(makeCtx(c), c.req.query('dim') ?? 'source', 50));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});
app.get('/api/public/:token/content', async (c) => c.json(await content(makeCtx(c))));
app.get('/api/public/:token/ai', async (c) => c.json(await aiTraffic(makeCtx(c))));
app.get('/api/public/:token/realtime', async (c) => c.json(await realtime(makeCtx(c))));

app.all('/api/*', (c) => c.json({ error: 'not found' }, 404));

// ---------- pages

// Old snippets keep working after the rename.
app.get('/js/script.js', (c) => c.redirect('/js/kestrel.js', 308));

app.get('/', (c) => c.env.ASSETS.fetch(new URL('/home.html', c.req.url)));
// The share page is the same SPA shell, in read-only mode.
app.get('/share/:token', (c) => c.env.ASSETS.fetch(new URL('/app', c.req.url)));

// Everything else is the dashboard (static files, SPA fallback for /app/*).
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
