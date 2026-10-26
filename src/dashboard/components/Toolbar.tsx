import { useState } from 'react';
import { RANGE_PRESETS, type Overview, type Query, type Site } from '../lib/api';
import { dayInTz } from '../lib/format';
import { Chevron, Dropdown, itemCls } from './Dropdown';

const GRANULARITIES = [
  { value: 'hour', label: 'Hourly' },
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
];

export function Toolbar({
  site,
  q,
  update,
  overview,
  onRefresh,
  loading,
}: {
  site: Site;
  q: Query;
  update: (p: Partial<Query>) => void;
  overview: Overview | null;
  onRefresh: () => void;
  loading: boolean;
}) {
  const [from, setFrom] = useState(q.from ?? '');
  const [to, setTo] = useState(q.to ?? '');

  const label =
    q.period === 'custom'
      ? q.from === q.to
        ? new Date(q.from + 'T00:00:00Z').toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
        : `${q.from} → ${q.to}`
      : RANGE_PRESETS.find((p) => p.value === q.period)?.label ?? 'Last 30 days';

  function shift(dir: -1 | 1) {
    if (!overview) return;
    const range = overview.range;
    const span = Math.max(range.to - range.from, 86_400_000);
    const nf = range.from + dir * span;
    const nt = nf + span - 1;
    if (nf > Date.now()) return;
    update({ period: 'custom', from: dayInTz(nf, site.timezone), to: dayInTz(Math.min(nt, Date.now()), site.timezone) });
  }
  const canForward = overview ? overview.range.to < Date.now() - 60_000 : false;
  const granularityValue = q.granularity ?? overview?.range.granularity;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex h-10 items-stretch rounded-xl border border-stone-200 bg-white shadow-card">
        <button
          className="rounded-l-xl px-2.5 text-lg text-stone-500 transition hover:bg-stone-50 disabled:opacity-30"
          onClick={() => shift(-1)}
          disabled={!overview}
          aria-label="Previous period"
        >
          ‹
        </button>
        <Dropdown
          button={
            <span className="flex h-full items-center gap-2 border-x border-stone-200 px-3 text-sm font-medium hover:bg-stone-50">
              {label} <Chevron />
            </span>
          }
        >
          {(close) => (
            <>
              {RANGE_PRESETS.map((p) => (
                <button
                  key={p.value}
                  className={itemCls(q.period === p.value)}
                  onClick={() => {
                    close();
                    update({ period: p.value, granularity: undefined });
                  }}
                >
                  {p.label}
                </button>
              ))}
              <div className="my-1 border-t border-stone-100" />
              <form
                className="space-y-2 p-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!from || !to) return;
                  close();
                  update({ period: 'custom', from, to: to < from ? from : to, granularity: undefined });
                }}
              >
                <div className="text-xs font-medium text-stone-500">Custom range</div>
                <input type="date" className="input py-1.5" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
                <input type="date" className="input py-1.5" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
                <button className="btn-dark w-full py-1.5">Apply</button>
              </form>
            </>
          )}
        </Dropdown>
        <button
          className="rounded-r-xl px-2.5 text-lg text-stone-500 transition hover:bg-stone-50 disabled:opacity-30"
          onClick={() => shift(1)}
          disabled={!canForward}
          aria-label="Next period"
        >
          ›
        </button>
      </div>

      <Dropdown
        button={
          <span className="flex h-10 items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-sm font-medium shadow-card hover:bg-stone-50">
            {GRANULARITIES.find((g) => g.value === granularityValue)?.label ?? 'Daily'} <Chevron />
          </span>
        }
      >
        {(close) =>
          GRANULARITIES.map((g) => (
            <button
              key={g.value}
              className={itemCls(granularityValue === g.value)}
              onClick={() => {
                close();
                update({ granularity: g.value });
              }}
            >
              {g.label}
            </button>
          ))
        }
      </Dropdown>

      <button className="btn h-10 w-10 px-0" onClick={onRefresh} aria-label="Refresh data" title="Refresh">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={loading ? 'animate-spin' : ''}>
          <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
          <path d="M21 3v5h-5" />
        </svg>
      </button>
    </div>
  );
}
