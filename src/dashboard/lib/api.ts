export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T = any>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: init?.json !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const data: any = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith('/api/auth')) {
    window.dispatchEvent(new Event('kestrel:logout'));
  }
  if (!res.ok) throw new ApiError(res.status, data.error ?? res.statusText);
  return data as T;
}

export interface Site {
  id: string;
  name: string;
  domain: string;
  timezone: string;
  currency: string;
  api_key: string;
  dodo_webhook_secret: string | null;
  share_token: string | null;
  created_at: number;
  visitors24h?: number;
  online?: number;
}

export interface Kpis {
  visitors: number;
  sessions: number;
  pageviews: number;
  newVisitors: number;
  returningVisitors: number;
  sessionsPerVisitor: number;
  bounceRate: number;
  avgDuration: number;
  revenue: number;
  payments: number;
  customers: number;
  conversionRate: number;
  revenuePerVisitor: number;
}

export interface LiveActivity {
  ts: number;
  type: 'pageview' | 'goal' | 'outbound';
  name: string | null;
  path: string;
  visitor_id: string;
  source: string | null;
  country: string | null;
  city: string | null;
  device: string | null;
  browser: string | null;
  os: string | null;
}

export interface LivePoint {
  lat: number;
  lon: number;
  country: string;
  city: string | null;
  visitors: number;
  /** One real visitor from that place, so the marker carries their profile picture. */
  visitorId?: string;
}

export interface LiveData {
  online: number;
  windowMinutes: number;
  pages: { label: string; visitors: number; views: number }[];
  sources: { label: string | null; visitors: number }[];
  countries: { label: string | null; visitors: number }[];
  devices: { label: string | null; visitors: number }[];
  points: LivePoint[];
  activity: LiveActivity[];
  serverTime: number;
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

export type SummarySite = Site & SiteSummary;

export interface SummaryResponse {
  days: number;
  currency: string;
  sites: SummarySite[];
}

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

export interface TimeseriesData {
  dim: 'goal' | 'page';
  buckets: string[];
  rows: Record<string, string | number>[];
  series: { key: string; label: string; total: number }[];
}

export interface AiData {
  total: number;
  series: { bucket: string; visitors: number }[];
  sources: { label: string | null; visitors: number }[];
}

export interface ContentData {
  rows: ContentRow[];
  days: { day: string; visitors: number }[];
  peak: {
    day: string;
    visitors: number;
    median: number;
    lift: number;
    drivers: ContentRow[];
  } | null;
  currency: string;
}

export interface Overview {
  range: { from: number; to: number; granularity: 'hour' | 'day' | 'week' | 'month' };
  currency: string;
  decimals: number;
  current: Kpis;
  previous: Kpis;
  online: number;
  series: {
    bucket: string;
    visitors: number;
    pageviews: number;
    newVisitors: number;
    returningVisitors: number;
    revenue: number;
    payments: number;
    topSource?: string | null;
    topChannel?: string | null;
    topVisitors?: number;
    topReferrer?: string | null;
    topReferrerVisitors?: number;
    topPath?: string | null;
    topPathVisitors?: number;
  }[];
}

export interface BreakdownRow {
  label: string | null;
  visitors: number;
  pageviews?: number;
  revenue: number;
  customers: number;
  extra?: string | null;
}

export type Filters = Record<string, string>;

export interface Query {
  period: string;
  from?: string;
  to?: string;
  granularity?: string;
  filters: Filters;
}

export const RANGE_PRESETS: { value: string; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '48h', label: 'Last 2 days' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '12m', label: 'Last 12 months' },
  { value: 'all', label: 'All time' },
];

export function qs(q: Query, extra: Record<string, string | number> = {}) {
  const p = new URLSearchParams();
  p.set('period', q.period);
  if (q.from) p.set('from', q.from);
  if (q.to) p.set('to', q.to);
  if (q.granularity) p.set('granularity', q.granularity);
  if (Object.keys(q.filters).length) p.set('filters', JSON.stringify(q.filters));
  for (const [k, v] of Object.entries(extra)) p.set(k, String(v));
  return p.toString();
}
