#!/usr/bin/env node
/**
 * Seed 30 days of realistic demo data so a fresh install isn't an empty dashboard.
 *
 *   npm run seed
 *
 * Writes straight into the SQLite file (default data/kestrel.db). Repeat runs replace the demo site.
 */
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DAY = 86_400_000;
const path = process.env.DATABASE_PATH || join(process.env.DATA_DIR || 'data', 'kestrel.db');
const siteId = 'kestrel-demo';
const SHARE = 'demo-preview';

mkdirSync(dirname(resolve(path)), { recursive: true });
const db = new DatabaseSync(path);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);
`);

// Apply migrations (idempotent) so seeding works on a brand-new checkout.
const dir = resolve('migrations');
const applied = new Set(db.prepare('SELECT name FROM _migrations').all().map((r) => r.name));
for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  if (applied.has(file)) continue;
  db.exec('BEGIN IMMEDIATE');
  db.exec(readFileSync(join(dir, file), 'utf8'));
  db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(file, Date.now());
  db.exec('COMMIT');
}

// Deterministic PRNG so the demo looks the same for everyone.
let seed = 42;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = (list) => list[Math.floor(rand() * list.length)];
const between = (min, max) => min + Math.floor(rand() * (max - min + 1));

/**
 * Where each visit came from. Social sources carry real post URLs in `ref`, which is what lets the
 * Content view show "this tweet made $412" instead of "t.co".
 */
const SOURCES = [
  {
    source: 'Google',
    channel: 'Organic Search',
    referrer: 'google.com',
    domain: 'google.com',
    weight: 22,
    content: [
      { ref: null, campaign: null, content: null },
      { ref: null, campaign: null, content: null },
    ],
    entry: ['/blog/self-hosted-analytics', '/docs', '/pricing'],
  },
  {
    source: 'X',
    channel: 'Organic Social',
    weight: 18,
    content: [
      {
        ref: 'https://x.com/kestrel_dev/status/1846123456789012345',
        campaign: 'launch-thread',
        content: 'launch-thread-post-1',
      },
      {
        ref: 'https://x.com/kestrel_dev/status/1846998877665544332',
        campaign: 'build-in-public',
        content: 'revenue-attribution-demo',
      },
      {
        ref: 'https://x.com/indie_hacker/status/1847333222111000999',
        campaign: 'community-share',
        content: 'ih-shoutout',
      },
    ],
    entry: ['/', '/pricing', '/blog/launch'],
  },
  {
    source: 'ChatGPT',
    channel: 'AI',
    referrer: 'chatgpt.com',
    domain: 'chatgpt.com',
    weight: 13,
    content: [{ ref: null, campaign: null, content: 'answer-cited-kestrel' }],
    entry: ['/docs', '/blog/self-hosted-analytics', '/'],
  },
  { source: 'Direct/None', channel: 'Direct', weight: 15, content: [{ ref: null, campaign: null, content: null }], entry: ['/'] },
  {
    source: 'YouTube',
    channel: 'Organic Social',
    weight: 9,
    content: [
      {
        ref: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        campaign: 'youtube-review',
        content: 'self-hosted-analytics-review',
      },
    ],
    entry: ['/', '/pricing'],
  },
  {
    source: 'Newsletter',
    channel: 'Email',
    weight: 8,
    content: [
      { ref: null, campaign: 'weekly-digest', content: 'issue-42' },
      { ref: null, campaign: 'weekly-digest', content: 'issue-43' },
    ],
    entry: ['/blog/launch', '/'],
  },
  {
    source: 'Reddit',
    channel: 'Organic Social',
    weight: 5,
    content: [{ ref: 'https://www.reddit.com/r/selfhosted/comments/1abcd2e/', campaign: 'r-selfhosted', content: 'selfhosted-post' }],
    entry: ['/', '/docs'],
  },
  {
    source: 'Instagram',
    channel: 'Organic Social',
    weight: 4,
    content: [{ ref: 'https://www.instagram.com/reel/C9xYzAbCdEf/', campaign: 'reels-launch', content: 'reel-1' }],
    entry: ['/'],
  },
  {
    source: 'Facebook',
    channel: 'Organic Social',
    weight: 3,
    content: [{ ref: 'https://www.facebook.com/kestrelapp/posts/1029384756', campaign: 'fb-launch', content: 'fb-post-1' }],
    entry: ['/'],
  },
  {
    source: 'Product Hunt',
    channel: 'Referral',
    referrer: 'producthunt.com',
    domain: 'producthunt.com',
    weight: 3,
    content: [{ ref: 'https://www.producthunt.com/posts/kestrel', campaign: 'ph-launch', content: 'ph-launch-day' }],
    entry: ['/', '/pricing'],
  },
];

const PAGES = ['/', '/pricing', '/pricing', '/blog/launch', '/blog/launch', '/docs', '/changelog', '/customers'];
const GOALS = [
  { name: 'signup_click', weight: 26 },
  { name: 'start_trial', weight: 18 },
  { name: 'pricing_cta', weight: 20 },
  { name: 'scroll_to_pricing', weight: 16 },
  { name: 'scroll_to_faq', weight: 11 },
  { name: 'checkout_click', weight: 9 },
];
const GEOS = [
  { country: 'US', region: 'California', city: 'San Francisco' },
  { country: 'US', region: 'Texas', city: 'Austin' },
  { country: 'US', region: 'New York', city: 'New York' },
  { country: 'IN', region: 'Karnataka', city: 'Bengaluru' },
  { country: 'DE', region: 'Berlin', city: 'Berlin' },
  { country: 'GB', region: 'England', city: 'London' },
  { country: 'BR', region: 'São Paulo', city: 'São Paulo' },
  { country: 'CA', region: 'Ontario', city: 'Toronto' },
  { country: 'AU', region: 'Victoria', city: 'Melbourne' },
  { country: 'NL', region: 'North Holland', city: 'Amsterdam' },
  { country: 'JP', region: 'Tokyo', city: 'Tokyo' },
  { country: 'SG', region: 'Singapore', city: 'Singapore' },
  { country: 'PL', region: 'Masovia', city: 'Warsaw' },
  { country: 'PT', region: 'Lisbon', city: 'Lisbon' },
];
const DEVICES = [
  { browser: 'Chrome', os: 'Mac OS', device: 'Desktop', sw: 1512 },
  { browser: 'Chrome', os: 'Windows', device: 'Desktop', sw: 1920 },
  { browser: 'Safari', os: 'iOS', device: 'Mobile', sw: 390 },
  { browser: 'Mobile Safari', os: 'iOS', device: 'Mobile', sw: 430 },
  { browser: 'Firefox', os: 'Linux', device: 'Desktop', sw: 1440 },
  { browser: 'Edge', os: 'Windows', device: 'Desktop', sw: 1600 },
];

function weighted(list) {
  const total = list.reduce((n, x) => n + x.weight, 0);
  let r = rand() * total;
  for (const x of list) {
    r -= x.weight;
    if (r <= 0) return x;
  }
  return list[0];
}

const now = Date.now();
const today = new Date(now).setUTCHours(0, 0, 0, 0);
// The launch post went out two days ago and made that day about 3x a normal day.
const SPIKE_DAY = 2;

db.exec('BEGIN IMMEDIATE');
try {
  for (const table of ['events', 'sessions', 'visitors', 'payments', 'funnels', 'page_engagement', 'chart_notes', 'plausible_daily']) {
    db.prepare(`DELETE FROM ${table} WHERE site_id = ?`).run(siteId);
  }
  db.prepare('DELETE FROM sites WHERE id = ?').run(siteId);
  db.prepare(
    `INSERT INTO sites (id, name, domain, timezone, currency, api_key, dodo_webhook_secret, share_token, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
  ).run(siteId, 'Kestrel Demo', 'kestrel.dev', 'UTC', 'USD', 'k_demo_key_not_real', SHARE, today - 30 * DAY);

  db.prepare('INSERT INTO funnels (id, site_id, name, steps, created_at) VALUES (?, ?, ?, ?, ?)').run(
    'demo-funnel-acquisition',
    siteId,
    'Acquisition to checkout',
    JSON.stringify([
      { type: 'page', value: '/' },
      { type: 'page', value: '/pricing' },
      { type: 'goal', value: 'checkout_click' },
    ]),
    now,
  );

  const visitorStmt = db.prepare('INSERT OR IGNORE INTO visitors (site_id, id, first_seen, name, email) VALUES (?, ?, ?, ?, ?)');
  const sessionStmt = db.prepare(
    `INSERT INTO sessions (site_id, id, visitor_id, started_at, last_seen_at, duration, pageviews, goals, hostname,
       entry_page, exit_page, referrer, referrer_domain, source, channel, utm_source, utm_medium, utm_campaign, utm_content, ref,
       country, region, city, browser, os, device)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const eventStmt = db.prepare(
    'INSERT INTO events (site_id, session_id, visitor_id, ts, type, name, path, props) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const paymentStmt = db.prepare(
    `INSERT INTO payments (id, site_id, provider, ts, amount, kind, currency, visitor_id, session_id, email, name,
       renewal, matched_by, subscription_id)
     VALUES (?, ?, 'dodo', ?, ?, 'payment', 'USD', ?, ?, ?, ?, 0, 'metadata', NULL)`,
  );

  let visitors = 0;
  let payments = 0;
  let paymentSeq = 0;

  for (let d = 29; d >= 0; d--) {
    const dayStart = today - d * DAY;
    // Growth trend: older days are quieter.
    const growth = 0.55 + (29 - d) * 0.022;
    const spike = d === SPIKE_DAY ? 3.1 : 1;
    const count = Math.round(between(38, 85) * growth * spike);
    for (let i = 0; i < count; i++) {
      // On the spike day most traffic is the launch thread, which is why the Content view explains it.
      const src =
        d === SPIKE_DAY && rand() < 0.62
          ? SOURCES.find((s) => s.source === 'X')
          : weighted(SOURCES);
      const content = pick(src.content);
      const geo = pick(GEOS);
      const dev = pick(DEVICES);
      // About a third of visits are people who have been here before, so "new vs returning" has a story.
      const repeat = rand() < 0.34;
      const vid = repeat ? `visitor-repeat-${i % 120}` : `visitor-${d}-${i}-${Math.floor(rand() * 1e6).toString(36)}`;
      const hour = between(7, 23) + rand();
      const started = dayStart + Math.floor(hour * 3_600_000);
      if (started > now) continue;
      const visitorName = rand() < 0.18 ? `Visitor ${between(100, 999)}` : null;
      const visitorEmail = rand() < 0.12 ? `user${between(100, 999)}@example.com` : null;
      const sid = `session-${d}-${i}-${Math.floor(rand() * 1e6).toString(36)}`;
      const entry = d === SPIKE_DAY && src.source === 'X' ? '/pricing' : pick(src.entry ?? PAGES);
      const views = between(1, 5);
      const duration = between(8, 420) * 1000;
      const didSignup = rand() < 0.14;
      const goalNames = [];
      if (didSignup) goalNames.push('signup_click');
      for (let extra = between(0, 2); extra > 0; extra--) goalNames.push(weighted(GOALS).name);
      const email = visitorEmail ?? (didSignup && rand() < 0.5 ? `buyer${d}-${i}@example.com` : null);
      const name = visitorName;
      const paid = src.channel === 'Paid';

      visitorStmt.run(siteId, vid, started, name, email);
      sessionStmt.run(
        siteId,
        sid,
        vid,
        started,
        started + duration,
        duration,
        views,
        goalNames.length,
        'kestrel.dev',
        entry,
        views > 1 ? pick(PAGES) : entry,
        src.referrer ? `${src.referrer}/` : null,
        src.domain ?? null,
        src.source,
        src.channel,
        paid ? 'x' : null,
        paid ? 'cpc' : null,
        content.campaign,
        content.content,
        content.ref,
        geo.country,
        geo.region,
        geo.city,
        dev.browser,
        dev.os,
        dev.device,
      );

      let ts = started;
      for (let v = 0; v < views; v++) {
        eventStmt.run(siteId, sid, vid, ts, 'pageview', null, v === 0 ? entry : pick(PAGES), null);
        ts += between(20_000, 180_000);
        if (ts > now) break;
      }
      for (const goalName of goalNames) {
        eventStmt.run(siteId, sid, vid, Math.min(ts, now), 'goal', goalName, entry, null);
        ts += 8000;
      }
      if (rand() < 0.07) {
        eventStmt.run(siteId, sid, vid, Math.min(ts, now), 'outbound', 'https://x.com/kestrel_dev', entry, null);
      }

      // Roughly 2% of visitors buy something.
      if (rand() < 0.022) {
        const amount = pick([2900, 4900, 9900, 24900]);
        paymentSeq++;
        paymentStmt.run(
          `pay_demo_${d}_${i}_${paymentSeq}`,
          siteId,
          Math.min(started + between(5, 400) * 60_000, now),
          amount,
          vid,
          sid,
          email ?? `buyer${paymentSeq}@example.com`,
          name ?? `Customer ${paymentSeq}`,
        );
        payments++;
      }
      visitors++;
    }
  }

  // A handful of visitors "right now", so the realtime page and the globe have data.
  const LIVE = [
    { geo: GEOS[0], source: SOURCES[1] },
    { geo: GEOS[3], source: SOURCES[2] },
    { geo: GEOS[4], source: SOURCES.find((s) => s.source === 'Direct/None') },
    { geo: GEOS[5], source: SOURCES[0] },
    { geo: GEOS[10], source: SOURCES.find((s) => s.source === 'Newsletter') },
    { geo: GEOS[6], source: SOURCES.find((s) => s.source === 'Instagram') },
    { geo: GEOS[8], source: SOURCES.find((s) => s.source === 'YouTube') },
  ];
  LIVE.forEach((live, i) => {
    const src = live.source;
    const dev = pick(DEVICES);
    const vid = `visitor-live-${i}`;
    const sid = `session-live-${i}`;
    const started = now - between(60, 240) * 1000;
    const content = pick(src.content);
    visitorStmt.run(siteId, vid, started, null, null);
    sessionStmt.run(
      siteId,
      sid,
      vid,
      started,
      now,
      120_000,
      2,
      0,
      'kestrel.dev',
      '/',
      '/pricing',
      src.referrer ? `${src.referrer}/` : null,
      src.domain ?? null,
      src.source,
      src.channel,
      null,
      null,
      content.campaign,
      content.content,
      content.ref,
      live.geo.country,
      live.geo.region,
      live.geo.city,
      dev.browser,
      dev.os,
      dev.device,
    );
    eventStmt.run(siteId, sid, vid, started, 'pageview', null, '/', null);
    eventStmt.run(siteId, sid, vid, now - 5000, 'pageview', null, '/pricing', null);
  });

  const engagementStmt = db.prepare(
    `INSERT INTO page_engagement (site_id, session_id, visitor_id, path, reading_ms, scroll_depth, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const engagementPages = db.prepare(
    `SELECT e.session_id, e.visitor_id, e.path, MAX(e.ts) AS ts,
            EXISTS (SELECT 1 FROM payments p WHERE p.site_id = e.site_id AND p.visitor_id = e.visitor_id AND p.kind = 'payment') AS buyer
     FROM events e WHERE e.site_id = ? AND e.type = 'pageview' GROUP BY e.session_id, e.visitor_id, e.path`,
  ).all(siteId);
  for (const page of engagementPages) {
    const scroll = page.buyer ? between(58, 96) : between(32, 91);
    const reading = page.buyer ? between(42, 190) : between(18, 155);
    engagementStmt.run(siteId, page.session_id, page.visitor_id, page.path, reading * 1000, scroll, page.ts);
  }
  db.prepare('INSERT INTO chart_notes (id, site_id, ts, label, created_at) VALUES (?, ?, ?, ?, ?)').run(
    'demo-note-launch', siteId, today - 2 * DAY + 15 * 3_600_000, 'Product Hunt launch', now,
  );

  db.exec('COMMIT');
  console.log(`✓ Seeded ${visitors} visitors, ${payments} payments across 30 days (+${LIVE.length} live visitors).`);
  console.log(`  Site:    Kestrel Demo (${siteId})`);
  console.log(`  Share:   /share/${SHARE}`);
  if (process.env.DEMO_MODE?.trim().toLowerCase() === 'true') {
    console.log('  DEMO_MODE is enabled; the full dashboard is public and read-only.');
  } else {
    console.log(`  Open the dashboard at /app and sign in with your ADMIN_PASSWORD.`);
  }
} catch (e) {
  try {
    db.exec('ROLLBACK');
  } catch {}
  console.error('Seed failed:', e.message);
  process.exit(1);
} finally {
  db.close();
}
