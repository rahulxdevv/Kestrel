import type { Context } from 'hono';
import type { Db } from '../shared/db';
import type { AppEnv, Site } from './env';
import { breakdown, content, ctxFor, overview, realtime } from './stats';
import { currencyDecimals } from './payments';

/**
 * A small Model Context Protocol server, so an agent (Claude, Cursor, ChatGPT, a custom script) can ask
 * questions about a site instead of you copying numbers into a chat.
 *
 * Transport: stateless Streamable HTTP at POST /api/mcp. Auth is the site's own API key, so a key can
 * only ever read that one site. Read-only: there is no tool that writes, deletes or spends anything.
 */

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'kestrel', version: '1.0.0' };

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, any>;
}

const PERIODS = ['today', 'yesterday', '24h', '48h', '7d', '30d', '90d', '12m', 'all'];

const TOOLS = [
  {
    name: 'get_overview',
    description:
      'Headline numbers for a period: visitors, pageviews, bounce rate, session time, revenue, customers, conversion rate and how many people are online now. Includes the previous period so you can talk about change.',
    inputSchema: {
      type: 'object',
      properties: { period: { type: 'string', enum: PERIODS, description: 'Defaults to 7d.' } },
      additionalProperties: false,
    },
  },
  {
    name: 'get_traffic_sources',
    description:
      'Where visitors came from: channel (Organic Search, Organic Social, AI, Referral, Email, Paid, Direct) or referrer (Google, ChatGPT, X, Reddit…), with visitors and revenue per row.',
    inputSchema: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: PERIODS },
        dimension: { type: 'string', enum: ['channel', 'source', 'campaign', 'keyword'], description: 'Defaults to source.' },
        limit: { type: 'number', description: '1-100, defaults to 20.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_content_performance',
    description:
      'Which specific post, video, reel, campaign or landing page produced visits and revenue, plus the best day in the period and what drove it. Use this to answer "why is traffic up?".',
    inputSchema: {
      type: 'object',
      properties: { period: { type: 'string', enum: PERIODS } },
      additionalProperties: false,
    },
  },
  {
    name: 'get_top_pages',
    description: 'Most visited pages with pageviews, visitors and the revenue earned by people who read them.',
    inputSchema: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: PERIODS },
        limit: { type: 'number', description: '1-100, defaults to 20.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_audience',
    description: 'Breakdown of the audience by country, region, city, device, browser or operating system.',
    inputSchema: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: PERIODS },
        dimension: {
          type: 'string',
          enum: ['country', 'region', 'city', 'device', 'browser', 'os', 'hostname'],
          description: 'Defaults to country.',
        },
        limit: { type: 'number' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_live_visitors',
    description: 'Who is on the site right now: online count, active pages, live sources, countries and the newest events.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_site_info',
    description: 'The tracked site, its timezone and currency, the install snippet, and the endpoint an agent should use.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
] as const;

function jsonRpc(id: JsonRpcRequest['id'], result: unknown) {
  return { jsonrpc: '2.0' as const, id: id ?? null, result };
}

function rpcError(id: JsonRpcRequest['id'], code: number, message: string, data?: unknown) {
  return { jsonrpc: '2.0' as const, id: id ?? null, error: { code, message, ...(data ? { data } : {}) } };
}

/** Tool output goes back as JSON text, which every MCP client renders fine. */
const text = (value: unknown) => ({
  content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  isError: false,
});

function money(minor: number, site: Site) {
  const value = minor / 10 ** currencyDecimals(site.currency);
  return { amount: Number(value.toFixed(2)), currency: site.currency, minor };
}

function pickPeriod(args: Record<string, any>) {
  return typeof args.period === 'string' && PERIODS.includes(args.period) ? args.period : '7d';
}

function limitOf(args: Record<string, any>, fallback = 20) {
  const n = Number(args.limit);
  return Number.isFinite(n) ? Math.max(1, Math.min(100, Math.round(n))) : fallback;
}

async function runTool(db: Db, site: Site, name: string, args: Record<string, any>, origin: string) {
  const ctx = ctxFor(db, site, { period: pickPeriod(args) });

  switch (name) {
    case 'get_overview': {
      const data = await overview(ctx);
      const k = data.current;
      const p = data.previous;
      return text({
        site: site.domain,
        period: { from: new Date(data.range.from).toISOString(), to: new Date(data.range.to).toISOString() },
        timezone: site.timezone,
        current: {
          visitors: k.visitors,
          pageviews: k.pageviews,
          sessions: k.sessions,
          newVisitors: k.newVisitors,
          bounceRate: Number(k.bounceRate.toFixed(3)),
          avgSessionMs: k.avgDuration,
          revenue: money(k.revenue, site),
          customers: k.customers,
          conversionRate: Number(k.conversionRate.toFixed(4)),
          revenuePerVisitor: money(k.revenuePerVisitor, site),
        },
        previous: {
          visitors: p.visitors,
          revenue: money(p.revenue, site),
          customers: p.customers,
        },
        onlineNow: data.online,
        series: data.series.map((s) => ({ bucket: s.bucket, visitors: s.visitors, revenue: money(s.revenue, site) })),
      });
    }
    case 'get_traffic_sources': {
      const dim = ['channel', 'source', 'campaign', 'keyword'].includes(args.dimension) ? args.dimension : 'source';
      const rows = await breakdown(ctx, dim, limitOf(args));
      return text({
        dimension: dim,
        rows: rows.map((r) => ({
          label: r.label ?? 'Direct/None',
          visitors: r.visitors,
          revenue: money(r.revenue, site),
          customers: r.customers,
        })),
      });
    }
    case 'get_top_pages': {
      const rows = await breakdown(ctx, 'page', limitOf(args));
      return text({
        rows: rows.map((r) => ({
          page: r.label,
          visitors: r.visitors,
          pageviews: r.pageviews ?? 0,
          revenue: money(r.revenue, site),
        })),
      });
    }
    case 'get_audience': {
      const dim = ['country', 'region', 'city', 'device', 'browser', 'os', 'hostname'].includes(args.dimension)
        ? args.dimension
        : 'country';
      const rows = await breakdown(ctx, dim, limitOf(args));
      return text({
        dimension: dim,
        rows: rows.map((r) => ({ label: r.label ?? 'Unknown', visitors: r.visitors, revenue: money(r.revenue, site) })),
      });
    }
    case 'get_content_performance': {
      const data = await content(ctx);
      return text({
        note: 'Each row is the post, campaign or landing page a visit arrived on. `url` is the source content when the link was tagged with one.',
        period: { from: new Date(ctx.range.from).toISOString(), to: new Date(ctx.range.to).toISOString() },
        peakDay: data.peak
          ? {
              day: data.peak.day,
              visitors: data.peak.visitors,
              medianVisitors: data.peak.median,
              liftPercent: Math.round(data.peak.lift * 100),
              drivers: data.peak.drivers.map((d) => ({
                source: d.source,
                campaign: d.campaign,
                content: d.content ?? d.ref,
                url: d.url,
                visitors: d.visitors,
              })),
            }
          : null,
        rows: data.rows.slice(0, 30).map((r) => ({
          source: r.source,
          channel: r.channel,
          campaign: r.campaign,
          content: r.content ?? r.ref,
          url: r.url,
          entryPage: r.entryPage,
          visitors: r.visitors,
          revenue: money(r.revenue, site),
          customers: r.customers,
        })),
      });
    }
    case 'get_live_visitors': {
      const data = await realtime(ctx);
      return text({
        online: data.online,
        windowMinutes: data.windowMinutes,
        pages: data.pages,
        sources: data.sources,
        countries: data.countries,
        recentEvents: data.activity.slice(0, 10),
      });
    }
    case 'get_site_info': {
      return text({
        site: { id: site.id, name: site.name, domain: site.domain, timezone: site.timezone, currency: site.currency },
        snippet: `<script defer data-website-id="${site.id}" src="${origin}/js/kestrel.js"></script>`,
        eventEndpoint: `${origin}/api/event`,
        mcpEndpoint: `${origin}/api/mcp`,
        dashboard: `${origin}/app/site/${site.id}`,
      });
    }
    default:
      return null;
  }
}

export async function handleMcp(c: Context<AppEnv>) {
  const origin = new URL(c.req.url).origin;

  if (c.req.method === 'GET' || c.req.method === 'DELETE') {
    return c.json(
      {
        error: 'This MCP endpoint is stateless. POST JSON-RPC 2.0 requests with your site API key.',
        endpoint: `${origin}/api/mcp`,
        auth: 'Authorization: Bearer <site api key>',
      },
      405,
    );
  }

  // Site API keys are per-website, so a leaked key exposes exactly one site, read-only.
  const header = c.req.header('authorization') ?? '';
  const key = header.replace(/^Bearer\s+/i, '').trim() || c.req.header('x-api-key') || '';
  if (!key) return c.json({ error: 'Missing API key. Use Authorization: Bearer <site api key>.' }, 401);

  const site = await c.env.DB.prepare('SELECT * FROM sites WHERE api_key = ?').bind(key).first<Site>();
  if (!site) return c.json({ error: 'Unknown API key.' }, 401);

  let payload: JsonRpcRequest | JsonRpcRequest[];
  try {
    payload = await c.req.json();
  } catch {
    return c.json(rpcError(null, -32700, 'Parse error'), 400);
  }

  const handle = async (req: JsonRpcRequest) => {
    if (!req || req.jsonrpc !== '2.0' || typeof req.method !== 'string') {
      return rpcError(req?.id, -32600, 'Invalid Request');
    }
    // Notifications (no id) never get a body.
    if (req.id === undefined) return null;

    switch (req.method) {
      case 'initialize':
        return jsonRpc(req.id, {
          protocolVersion: req.params?.protocolVersion ?? PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: `Read-only analytics for ${site.domain}. Ask get_content_performance to explain why traffic changed.`,
        });
      case 'ping':
        return jsonRpc(req.id, {});
      case 'tools/list':
        return jsonRpc(req.id, { tools: TOOLS });
      case 'tools/call': {
        const name = String(req.params?.name ?? '');
        const args = (req.params?.arguments ?? {}) as Record<string, any>;
        if (!TOOLS.some((t) => t.name === name)) {
          return rpcError(req.id, -32602, `Unknown tool: ${name}`);
        }
        try {
          const result = await runTool(c.env.DB, site, name, args, origin);
          return jsonRpc(req.id, result ?? rpcError(req.id, -32603, 'Tool produced no result'));
        } catch (e) {
          return jsonRpc(req.id, {
            content: [{ type: 'text', text: `Tool failed: ${(e as Error).message}` }],
            isError: true,
          });
        }
      }
      default:
        return rpcError(req.id, -32601, `Method not found: ${req.method}`);
    }
  };

  if (Array.isArray(payload)) {
    const results = (await Promise.all(payload.map(handle))).filter((r) => r !== null);
    return c.json(results);
  }
  const result = await handle(payload);
  if (result === null) return c.body(null, 202);
  return c.json(result);
}
