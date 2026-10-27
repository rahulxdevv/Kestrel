import { useState } from 'react';
import { SiteFrame } from '../components/SiteFrame';
import { qs } from '../lib/api';
import { useDash } from '../lib/context';
import { fmtDuration, fmtMoney, fmtNumber, fmtPct } from '../lib/format';
import { useApi } from '../lib/useApi';

type PeakData = { timezone: string; cells: { weekday: number; day: string; hour: number; visitors: number; sales: number; revenue: number }[] };
type EngagementData = {
  measuredViews: number; averageReadingMs: number; averageScroll: number; readToEnd: number;
  pages: { path: string; views: number; readingMs: number; scrollDepth: number;
    buyers: { views: number; readingMs: number; scrollDepth: number };
    others: { views: number; readingMs: number; scrollDepth: number } }[];
};
type JourneyData = {
  customers: number; medianDays: number; medianVisits: number; medianPages: number; firstVisitRate: number;
  days: { label: string; count: number }[]; visits: { label: string; count: number }[];
  sources: { first: string; credited: string; count: number }[]; pages: { path: string; buyers: number; share: number }[];
};
type ImportData = { days: number; from_day: string | null; to_day: string | null; visitors: number; visits: number; pageviews: number };

export function Insights({ siteId, demoMode = false }: { siteId: string; demoMode?: boolean }) {
  return <SiteFrame siteId={siteId} active="insights" demoMode={demoMode}><InsightsBody /></SiteFrame>;
}

function InsightsBody() {
  const { apiBase, q, reloadKey, site } = useDash();
  const suffix = qs(q);
  const { data: peak } = useApi<PeakData>(`${apiBase}/insights/peak-hours?${suffix}`, reloadKey);
  const { data: engagement } = useApi<EngagementData>(`${apiBase}/insights/engagement?${suffix}`, reloadKey);
  const { data: journey } = useApi<JourneyData>(`${apiBase}/insights/purchase-journey?${suffix}`, reloadKey);
  const { data: imports } = useApi<ImportData>(`${apiBase}/imports/plausible`, reloadKey);
  const [peakMetric, setPeakMetric] = useState<'visitors' | 'sales' | 'revenue'>('visitors');
  const maxValue = Math.max(1, ...(peak?.cells.map((cell) => cell[peakMetric]) ?? [0]));
  const peakCell = peak?.cells.reduce((best, cell) => cell[peakMetric] > best[peakMetric] ? cell : best, peak.cells[0]);
  const peakLabel = peakCell ? `${peakCell.day}s, ${hourLabel(peakCell.hour)}` : '—';

  return (
    <div className="space-y-4">
      <header className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">Insights</h1>
        <p className="mt-1 text-sm text-stone-500">When visitors arrive, what they read, and how buyers reach checkout.</p>
      </header>

      {!!imports?.days && <section className="card grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center sm:p-5">
        <div><p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">Historical import</p><h2 className="mt-1 text-sm font-semibold">Plausible daily totals</h2><p className="mt-1 text-xs text-stone-500">{imports.from_day} – {imports.to_day} · {imports.days} imported days · shown separately from Kestrel visitor records</p></div>
        <div className="grid grid-cols-3 gap-3 text-right sm:gap-4"><Stat label="Daily visitors" value={fmtNumber(imports.visitors)} /><Stat label="Visits" value={fmtNumber(imports.visits)} /><Stat label="Pageviews" value={fmtNumber(imports.pageviews)} /></div>
      </section>}

      <section className="card min-w-0 overflow-hidden p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">Peak hours</p>
            <h2 className="mt-1 text-lg font-semibold">Busiest on <span className="text-blue-700">{peakLabel}</span></h2>
            <p className="mt-1 text-xs text-stone-500">Visits and purchases are grouped in {peak?.timezone ?? site.timezone} local time.</p>
          </div>
          <div className="flex max-w-full flex-wrap gap-1 rounded-xl bg-stone-100 p-1" role="group" aria-label="Peak hours metric">
            {(['visitors', 'sales', 'revenue'] as const).map((key) => (
              <button key={key} onClick={() => setPeakMetric(key)} aria-pressed={peakMetric === key}
                className={`rounded-lg px-2.5 py-1.5 text-xs ${peakMetric === key ? 'bg-white font-medium text-ink shadow-card' : 'text-stone-500'}`}>
                {key === 'visitors' ? 'Visits' : key === 'sales' ? 'Sales' : 'Revenue'}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 overflow-x-auto pb-2">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-[42px_repeat(24,minmax(18px,1fr))] gap-1">
              <span />
              {Array.from({ length: 24 }, (_, hour) => <span key={hour} className={`pb-1 text-center text-[9px] text-stone-400 ${hour % 3 ? 'invisible' : ''}`}>{hourLabel(hour)}</span>)}
              {Array.from({ length: 7 }, (_, day) => <div key={day} className="contents">
                <span className="flex items-center text-[10px] text-stone-500">{peak?.cells.find((cell) => cell.weekday === day)?.day}</span>
                {Array.from({ length: 24 }, (_, hour) => {
                  const cell = peak?.cells.find((entry) => entry.weekday === day && entry.hour === hour);
                  const value = cell?.[peakMetric] ?? 0;
                  const alpha = value ? 0.12 + 0.78 * value / maxValue : 0.045;
                  const bg = peakMetric === 'sales' ? `rgba(225, 105, 131, ${alpha})` : peakMetric === 'revenue' ? `rgba(226, 139, 102, ${alpha})` : `rgba(72, 126, 202, ${alpha})`;
                  return <div key={hour} title={`${cell?.day} ${hourLabel(hour)} · ${peakMetric === 'revenue' ? fmtMoney(value, site.currency, 2) : fmtNumber(value)} ${peakMetric}`}
                    className={`h-6 rounded-[4px] sm:h-7 ${cell && peakCell && cell.weekday === peakCell.weekday && cell.hour === peakCell.hour ? 'ring-2 ring-ink ring-offset-1' : ''}`}
                    style={{ backgroundColor: bg }} />;
                })}
              </div>)}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between text-[10px] text-stone-400"><span>12a</span><span>6a</span><span>12p</span><span>6p</span><span>11p</span></div>
      </section>

      <section className="card min-w-0 overflow-hidden p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">Engagement</p><h2 className="mt-1 text-lg font-semibold">What people read</h2></div>
          <div className="grid grid-cols-3 gap-3 text-right sm:gap-6">
            <Stat label="Avg. reading" value={fmtDuration(engagement?.averageReadingMs ?? 0)} />
            <Stat label="Avg. scroll" value={fmtPct((engagement?.averageScroll ?? 0) / 100)} />
            <Stat label="Read to end" value={fmtPct(engagement?.readToEnd ?? 0)} />
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[650px] text-left text-xs">
            <thead className="border-b border-stone-100 text-[10px] font-medium uppercase tracking-wide text-stone-400">
              <tr><th className="pb-2 pr-3">Page</th><th className="w-[28%] pb-2 pr-3">Scroll depth</th><th className="pb-2 pr-3 text-right">Reading</th><th className="pb-2 pr-3 text-right">Views</th><th className="pb-2 text-right">Buyer scroll / read</th></tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {engagement?.pages.slice(0, 12).map((row) => <tr key={row.path}>
                <td className="max-w-[230px] truncate py-2.5 pr-3 font-medium text-stone-700" title={row.path}>{row.path}</td>
                <td className="py-2.5 pr-3"><div className="flex items-center gap-2"><div className="h-2 min-w-12 flex-1 rounded-full bg-stone-100"><div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.max(0, Math.min(100, row.scrollDepth))}%` }} /></div><span className="w-9 text-right tabular-nums">{fmtPct(row.scrollDepth / 100)}</span></div></td>
                <td className="py-2.5 pr-3 text-right tabular-nums">{fmtDuration(row.readingMs)}</td>
                <td className="py-2.5 pr-3 text-right tabular-nums">{fmtNumber(row.views)}</td>
                <td className="py-2.5 text-right tabular-nums text-stone-500">{row.buyers.views ? `${fmtPct(row.buyers.scrollDepth / 100)} · ${fmtDuration(row.buyers.readingMs)}` : '—'}</td>
              </tr>)}
            </tbody>
          </table>
          {engagement && engagement.measuredViews === 0 && <p className="py-8 text-center text-sm text-stone-400">Engagement data will appear as visitors read and scroll on tracked pages.</p>}
          {engagement && engagement.measuredViews > 0 && <p className="mt-2 text-[10px] text-stone-400">Buyer behavior compares visitors who purchased with everyone else. Data is measured on pages after this tracker update.</p>}
        </div>
      </section>

      <section className="card min-w-0 overflow-hidden p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">Path to purchase</p><h2 className="mt-1 text-lg font-semibold">How buyers got there</h2></div>
          <span className="text-xs text-stone-500">{fmtNumber(journey?.customers ?? 0)} first-time buyers</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <JourneyStat label="Median time to buy" value={`${formatDays(journey?.medianDays ?? 0)}`} sub="from first visit" />
          <JourneyStat label="Median visits" value={`${(journey?.medianVisits ?? 0).toLocaleString('en', { maximumFractionDigits: 1 })}`} sub="before paying" />
          <JourneyStat label="Bought on first visit" value={fmtPct(journey?.firstVisitRate ?? 0)} sub="of known buyers" />
          <JourneyStat label="Pages before buying" value={`${(journey?.medianPages ?? 0).toLocaleString('en', { maximumFractionDigits: 1 })}`} sub="median" />
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Histogram title="Time from first visit to purchase" rows={journey?.days ?? []} />
          <Histogram title="Visits before purchase" rows={journey?.visits ?? []} />
        </div>
        <div className="mt-5 rounded-xl bg-slate-50 p-3 sm:p-4">
          <div className="flex flex-wrap justify-between gap-2 text-xs font-semibold text-stone-600"><span>Who brought them in</span><span>Who got credit at the sale</span></div>
          <div className="mt-3 space-y-2">
            {journey?.sources.slice(0, 8).map((flow, i) => <div key={`${flow.first}-${flow.credited}-${i}`} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_44px] items-center gap-2 text-xs">
              <span className="truncate text-right text-stone-600">{flow.first}</span><span className="text-stone-300">→</span><span className="truncate text-stone-700">{flow.credited}</span><span className="text-right font-medium tabular-nums">{flow.count}</span>
            </div>)}
            {journey?.sources.length === 0 && <p className="py-4 text-center text-xs text-stone-400">Known visitor purchases will show their first touch and credited visit.</p>}
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {journey?.pages.slice(0, 6).map((row) => <div key={row.path} className="flex min-w-0 items-center gap-2 text-xs"><span className="min-w-0 flex-1 truncate text-stone-600">{row.path}</span><span className="h-1.5 w-20 overflow-hidden rounded-full bg-stone-100"><span className="block h-full rounded-full bg-rose-400" style={{ width: `${Math.min(100, row.share * 100)}%` }} /></span><span className="w-10 text-right tabular-nums">{fmtPct(row.share)}</span></div>)}
        </div>
      </section>
    </div>
  );
}

function hourLabel(hour: number) { return new Date(Date.UTC(2020, 0, 1, hour)).toLocaleTimeString('en', { hour: 'numeric', timeZone: 'UTC' }).toLowerCase(); }
function formatDays(days: number) { return days < 1 ? 'Same day' : `${days.toLocaleString('en', { maximumFractionDigits: 1 })} ${days === 1 ? 'day' : 'days'}`; }

function Stat({ label, value }: { label: string; value: string }) { return <div><div className="text-[10px] text-stone-400">{label}</div><div className="mt-0.5 text-sm font-semibold tabular-nums">{value}</div></div>; }
function JourneyStat({ label, value, sub }: { label: string; value: string; sub: string }) { return <div className="min-w-0 rounded-xl bg-slate-50 p-3"><div className="truncate text-[10px] text-stone-500">{label}</div><div className="mt-1 text-lg font-semibold leading-tight tabular-nums">{value}</div><div className="mt-0.5 truncate text-[10px] text-stone-400">{sub}</div></div>; }
function Histogram({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return <div className="min-w-0"><h3 className="mb-2 text-xs font-medium text-stone-600">{title}</h3><div className="flex h-32 items-end gap-1.5 sm:gap-2">{rows.map((row) => <div key={row.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"><span className="text-[9px] tabular-nums text-stone-500">{row.count}</span><div className="w-full rounded-t-md bg-rose-400" style={{ height: `${Math.max(3, row.count / max * 78)}%` }} title={`${row.label}: ${row.count}`} /><span className="w-full truncate text-center text-[9px] text-stone-400">{row.label}</span></div>)}</div></div>;
}
