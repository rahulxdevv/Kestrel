#!/usr/bin/env node
/**
 * End-to-end smoke test against a running Kestrel server.
 *
 *   ADMIN_PASSWORD=your-password npm run smoke
 *   BASE_URL=https://analytics.example.com ADMIN_PASSWORD=… npm run smoke
 *
 * It creates a temporary site, sends a real tracking event, reads every major report,
 * checks the share link and CSV export, then deletes the site.
 */
const BASE = (process.env.BASE_URL || process.env.KESTREL_URL || 'http://localhost:3000').replace(/\/+$/, '');
const PASSWORD = process.env.ADMIN_PASSWORD;

const log = (ok, msg) => console.log(`${ok ? '✓' : '✗'} ${msg}`);
let failures = 0;

function check(condition, msg) {
  if (!condition) failures++;
  log(!!condition, msg);
}

async function call(path, init = {}) {
  const res = await fetch(BASE + path, init);
  return res;
}

async function json(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON from ${res.url} (${res.status}): ${text.slice(0, 200)}`);
  }
}

async function main() {
  if (!PASSWORD) {
    console.error('Set ADMIN_PASSWORD (the same value the server uses).');
    process.exit(1);
  }

  console.log(`Kestrel smoke test → ${BASE}\n`);

  const health = await call('/api/health');
  const healthBody = await json(health);
  check(health.ok && healthBody.ok, `health (${health.status}, v${healthBody.version ?? '?'})`);

  const landing = await call('/');
  const landingText = await landing.text();
  check(landing.ok && landingText.includes('Kestrel'), 'landing page');
  const app = await call('/app');
  check(app.ok && (await app.text()).includes('id="root"'), 'dashboard shell');

  const login = await call('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD }),
  });
  const cookie = login.headers.getSetCookie?.()[0]?.split(';')[0];
  check(login.ok && !!cookie, `login (${login.status})`);
  if (!cookie) throw new Error('No session cookie returned. Check ADMIN_PASSWORD.');

  const domain = `smoke-${Date.now().toString(36)}.example.com`;
  const created = await call('/api/sites', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ domain, name: 'Smoke test', timezone: 'UTC', currency: 'USD' }),
  });
  const site = await json(created);
  check(created.ok && site.id, `create site (${site.id})`);

  const pageview = await call('/api/event', {
    method: 'POST',
    headers: {
      'content-type': 'text/plain',
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
      'x-forwarded-for': '203.0.113.77',
      'cf-ipcountry': 'US',
    },
    body: JSON.stringify({
      w: site.id,
      t: 'pageview',
      u: `https://${domain}/pricing?utm_source=x&utm_campaign=smoke`,
      r: 'https://t.co/smoke',
      vid: 'smoke-visitor-0001',
      sid: 'smoke-session-0001',
      sw: 1440,
    }),
  });
  check(pageview.status === 202, `ingest pageview (${pageview.status})`);

  const goal = await call('/api/event', {
    method: 'POST',
    headers: { 'content-type': 'text/plain', 'user-agent': 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/129.0 Safari/537.36' },
    body: JSON.stringify({
      w: site.id,
      t: 'goal',
      n: 'signup',
      u: `https://${domain}/pricing`,
      vid: 'smoke-visitor-0001',
      sid: 'smoke-session-0001',
    }),
  });
  check(goal.status === 202, 'ingest goal');

  const overview = await json(await call(`/api/sites/${site.id}/overview?period=30d`, { headers: { cookie } }));
  check(overview.current?.visitors === 1, `overview: 1 visitor (got ${overview.current?.visitors})`);
  check(Array.isArray(overview.series) && overview.series.length === 30, 'overview: 30 daily buckets');
  check(overview.online === 1, 'overview: online count');

  const pages = await json(await call(`/api/sites/${site.id}/breakdown?period=30d&dim=page`, { headers: { cookie } }));
  check(pages[0]?.label === '/pricing', `breakdown: top page ${pages[0]?.label}`);

  const goalRows = await json(await call(`/api/sites/${site.id}/breakdown?period=30d&dim=goal`, { headers: { cookie } }));
  check(goalRows[0]?.label === 'signup', 'breakdown: goal recorded');

  const realtime = await json(await call(`/api/sites/${site.id}/realtime`, { headers: { cookie } }));
  check(realtime.online === 1 && realtime.activity.length >= 2, 'realtime: activity feed');

  const funnelRes = await call(`/api/sites/${site.id}/funnels`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      name: 'Smoke funnel',
      steps: [
        { type: 'page', value: '/pricing' },
        { type: 'goal', value: 'signup' },
      ],
    }),
  });
  const funnel = await json(funnelRes);
  const funnelStats = await json(await call(`/api/sites/${site.id}/funnels/${funnel.id}/stats?period=30d`, { headers: { cookie } }));
  check(funnelStats.map((s) => s.visitors).join(',') === '1,1', 'funnel: page → goal');

  const share = await json(await call(`/api/sites/${site.id}/share`, { method: 'POST', headers: { cookie } }));
  const shared = await json(await call(`/api/public/${share.share_token}/overview?period=30d`));
  check(shared.current?.visitors === 1 && shared.site.domain === domain, 'share link: public read-only');
  check(shared.site.api_key === undefined, 'share link: no API key leaked');

  const csv = await call(`/api/sites/${site.id}/export?type=series&period=30d`, { headers: { cookie } });
  const csvText = await csv.text();
  check(csv.ok && csvText.startsWith('bucket,visitors,pageviews,revenue,payments'), 'CSV export');

  const del = await call(`/api/sites/${site.id}`, { method: 'DELETE', headers: { cookie } });
  check(del.ok, 'delete site');

  console.log('');
  if (failures) {
    console.error(`${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log('All checks passed.');
}

main().catch((e) => {
  console.error('\nSmoke test crashed:', e.message);
  process.exit(1);
});
