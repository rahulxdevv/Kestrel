// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/dashboard/App';

/**
 * Mounts the real dashboard against a mocked API. This catches the class of bug a typecheck
 * can't: broken context, bad routes, crashes inside panels/charts, empty states.
 */

const site = {
  id: 'site1234',
  name: 'Example',
  domain: 'example.com',
  timezone: 'UTC',
  currency: 'USD',
  api_key: 'k_test',
  dodo_webhook_secret: null,
  share_token: null,
  created_at: Date.now() - 86_400_000,
  visitors24h: 42,
  online: 2,
};

const kpis = {
  visitors: 120,
  sessions: 150,
  pageviews: 310,
  newVisitors: 90,
  returningVisitors: 30,
  sessionsPerVisitor: 1.25,
  bounceRate: 0.31,
  avgDuration: 84_000,
  revenue: 129_900,
  payments: 9,
  customers: 9,
  conversionRate: 0.075,
  revenuePerVisitor: 1082.5,
};

const overview = {
  range: { from: Date.now() - 30 * 86_400_000, to: Date.now(), granularity: 'day' as const },
  currency: 'USD',
  decimals: 2,
  current: kpis,
  previous: { ...kpis, visitors: 100, revenue: 100_000 },
  online: 2,
  series: Array.from({ length: 30 }, (_, i) => ({
    bucket: new Date(Date.now() - (29 - i) * 86_400_000).toISOString().slice(0, 10),
    visitors: 4,
    pageviews: 9,
    revenue: 4300,
    payments: 1,
  })),
};

const breakdown = [
  { label: 'X', visitors: 60, revenue: 80_000, customers: 5, extra: 't.co' },
  { label: 'Google', visitors: 40, revenue: 49_900, customers: 4, extra: undefined },
];

const summary = {
  days: 30,
  currency: 'USD',
  sites: [
    {
      ...site,
      visitors: 120,
      revenue: 129_900,
      sales: 9,
      avgOrder: 14_433,
      online: 2,
      previousVisitors: 100,
      previousRevenue: 100_000,
      series: Array.from({ length: 30 }, (_, i) => ({
        day: new Date(Date.now() - (29 - i) * 86_400_000).toISOString().slice(0, 10),
        visitors: 4,
        revenue: 4300,
      })),
    },
  ],
};

const contentData = {
  currency: 'USD',
  days: [{ day: '2026-10-20', visitors: 40 }],
  peak: {
    day: '2026-10-20',
    visitors: 40,
    median: 10,
    lift: 3,
    drivers: [
      {
        source: 'X',
        channel: 'Organic Social',
        campaign: 'launch-thread',
        content: 'launch-thread-post-1',
        ref: 'https://x.com/kestrel_dev/status/1846123456789012345',
        entryPage: '/pricing',
        url: 'https://x.com/kestrel_dev/status/1846123456789012345',
        visitors: 30,
        pageviews: 60,
        revenue: 49_900,
        customers: 3,
        firstSeen: Date.now() - 86_400_000,
        lastSeen: Date.now(),
      },
    ],
  },
  rows: [
    {
      source: 'X',
      channel: 'Organic Social',
      campaign: 'launch-thread',
      content: 'launch-thread-post-1',
      ref: 'https://x.com/kestrel_dev/status/1846123456789012345',
      entryPage: '/pricing',
      url: 'https://x.com/kestrel_dev/status/1846123456789012345',
      visitors: 30,
      pageviews: 60,
      revenue: 49_900,
      customers: 3,
      firstSeen: Date.now() - 86_400_000,
      lastSeen: Date.now(),
    },
  ],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) return jsonResponse({ loggedIn: true, configured: true });
      if (url.includes('/api/auth/login')) return jsonResponse({ ok: true });
      if (url.match(/\/api\/sites$/)) return jsonResponse([site]);
      if (url.includes('/api/summary')) return jsonResponse(summary);
      if (url.includes('/overview')) return jsonResponse(overview);
      if (url.includes('/realtime'))
        return jsonResponse({
          online: 2,
          windowMinutes: 30,
          pages: [{ label: '/pricing', visitors: 2, views: 3 }],
          sources: [{ label: 'X', visitors: 2 }],
          countries: [{ label: 'IN', visitors: 2 }],
          points: [{ lat: 12.97, lon: 77.59, country: 'IN', city: 'Bengaluru', visitors: 2 }],
          activity: [
            {
              ts: Date.now(),
              type: 'pageview',
              name: null,
              path: '/pricing',
              visitor_id: 'v-1',
              source: 'X',
              country: 'IN',
              city: null,
              device: 'Desktop',
              browser: 'Chrome',
              os: 'Mac OS',
            },
          ],
          serverTime: Date.now(),
        });
      if (url.includes('/breakdown')) return jsonResponse(breakdown);
      if (url.includes('/content')) return jsonResponse(contentData);
      if (url.includes('/timeseries'))
        return jsonResponse({
          dim: 'goal',
          buckets: ['2026-10-24', '2026-10-25'],
          rows: [
            { bucket: '2026-10-24', signup_click: 12 },
            { bucket: '2026-10-25', signup_click: 8 },
          ],
          series: [{ key: 'signup_click', label: 'signup_click', total: 20 }],
        });
      if (url.includes('/ai'))
        return jsonResponse({
          total: 13,
          series: [
            { bucket: '2026-10-24', visitors: 8 },
            { bucket: '2026-10-25', visitors: 5 },
          ],
          sources: [
            { label: 'ChatGPT', visitors: 9 },
            { label: 'Claude', visitors: 4 },
          ],
        });
      if (url.includes('/funnels')) return jsonResponse([]);
      if (url.includes('/customers') || url.includes('/visitors')) return jsonResponse([]);
      if (url.includes('/api/sites/')) return jsonResponse(site);
      return jsonResponse({});
    }),
  );

  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  window.history.pushState(null, '', '/app');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('dashboard shell', () => {
  it('lists websites with live stats', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Websites' })).toBeTruthy());
    await waitFor(() => expect(screen.getByText('Example')).toBeTruthy());
    expect(screen.getByText('All websites')).toBeTruthy();
    expect(screen.getAllByText('$1,299').length).toBeGreaterThan(0);
  });

  it('renders the content route with the post that drove traffic', async () => {
    window.history.pushState(null, '', '/app/site/site1234/content');
    render(<App />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Content & campaigns' })).toBeTruthy());
    await waitFor(() => expect(screen.getAllByText('launch-thread-post-1').length).toBeGreaterThan(0));
    expect(screen.queryByText(/Traffic spike/)).toBeNull();
  });

  it('renders the overview route with KPIs and chart', async () => {
    window.history.pushState(null, '', '/app/site/site1234');
    render(<App />);

    await waitFor(() => expect(screen.getAllByText('Visitors').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Revenue').length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByText('90 new · 30 returning')).toBeTruthy());
    // Breakdown panels are rendered from the mocked API.
    await waitFor(() => expect(screen.getAllByText('Channel').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Google').length).toBeGreaterThan(0);
  });

  it('renders the realtime route', async () => {
    window.history.pushState(null, '', '/app/site/site1234/realtime');
    render(<App />);
    await waitFor(() => expect(screen.getByText(/visitors on example.com right now/)).toBeTruthy());
    await waitFor(() => expect(screen.getAllByText('/pricing').length).toBeGreaterThan(0));
  });

  it('renders the goals page', async () => {
    window.history.pushState(null, '', '/app/site/site1234/goals');
    render(<App />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Goals & funnels' })).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Funnels' })).toBeTruthy();
  });

  it('renders the audience page', async () => {
    window.history.pushState(null, '', '/app/site/site1234/audience');
    render(<App />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Audience' })).toBeTruthy());
    await waitFor(() => expect(screen.getByText('No visitors in this period.')).toBeTruthy());
  });

  it('renders settings after loading the site', async () => {
    window.history.pushState(null, '', '/app/site/site1234/settings#tracking');
    render(<App />);
    await waitFor(() => expect(screen.getByText(/Install the tracking script/)).toBeTruthy());
    expect(screen.getAllByText(/js\/kestrel\.js/).length).toBeGreaterThan(0);
  });

  it('shows the login screen when logged out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/auth/me')) return jsonResponse({ loggedIn: false, configured: true });
        return jsonResponse({});
      }),
    );
    render(<App />);
    await waitFor(() => expect(screen.getByText('Welcome back')).toBeTruthy());
  });

  it('shows the public share view without a login', async () => {
    window.history.pushState(null, '', '/share/demo-preview');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/public/demo-preview/overview')) return jsonResponse({ ...overview, site });
        if (url.includes('/api/public/demo-preview/breakdown')) return jsonResponse(breakdown);
        return jsonResponse({});
      }),
    );
    render(<App />);
    await waitFor(() => expect(screen.getByText(/read-only dashboard/)).toBeTruthy());
    expect(screen.getByText('Powered by Kestrel')).toBeTruthy();
  });
});
