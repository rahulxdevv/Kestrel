import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { qs, type TimeseriesData } from '../lib/api';
import { useDash } from '../lib/context';
import { bucketLabel, fmtNumber } from '../lib/format';
import { useApi } from '../lib/useApi';

const COLORS = ['#2fa36b', '#e0703c', '#8b5cf6', '#d9a521', '#3b82f6', '#14b8a6', '#ec4899', '#64748b', '#a855f7', '#84cc16'];

const MODES: { key: 'goal' | 'page'; label: string }[] = [
  { key: 'goal', label: 'Goals' },
  { key: 'page', label: 'Pages' },
];

export function GoalsTrend() {
  const { apiBase, q, reloadKey } = useDash();
  const [dim, setDim] = useState<'goal' | 'page'>('goal');
  const { data } = useApi<TimeseriesData>(`${apiBase}/timeseries?${qs(q, { dim, limit: 7 })}`, reloadKey);
  const g = 'day';
  const series = data?.series ?? [];
  const empty = !!data && series.length === 0;

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-5 py-3.5">
        <div className="flex items-center gap-3">
          <h2 className="text-[15px] font-semibold">{dim === 'goal' ? 'Goals over time' : 'Pages over time'}</h2>
          <div className="flex rounded-lg bg-stone-100/80 p-0.5">
            {MODES.map((mode) => (
              <button
                key={mode.key}
                onClick={() => setDim(mode.key)}
                aria-pressed={dim === mode.key}
                className={`rounded-md px-2.5 py-1 text-[11.5px] transition ${
                  dim === mode.key ? 'bg-white font-medium text-ink shadow-card' : 'text-stone-500 hover:text-ink'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
        <span className="text-[11.5px] text-stone-400">Top {series.length || 7} · distinct visitors</span>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_260px]">
        <div className="h-[268px]">
          {empty && (
            <div className="flex h-full items-center justify-center text-center text-sm text-stone-400">
              No {dim === 'goal' ? 'goals' : 'pages'} recorded in this period.
            </div>
          )}
          {data && !empty && (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.rows ?? []} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#efece7" strokeDasharray="4 4" />
                <XAxis
                  dataKey="bucket"
                  tickFormatter={(b) => bucketLabel(b, g)}
                  tick={{ fill: '#a8a29e', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={28}
                />
                <YAxis
                  tick={{ fill: '#a8a29e', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ stroke: '#d6cec2', strokeDasharray: '3 3' }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const rows = [...payload].sort((a, b) => Number(b.value) - Number(a.value)).slice(0, 6);
                    return (
                      <div className="card min-w-[200px] px-3.5 py-3 text-sm">
                        <div className="mb-1.5 font-medium">{bucketLabel(String(label), g, true)}</div>
                        {rows.map((row) => (
                          <div key={row.dataKey as string} className="flex items-center justify-between gap-5 py-0.5">
                            <span className="flex min-w-0 items-center gap-2 text-stone-500">
                              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: row.color }} />
                              <span className="max-w-[150px] truncate">{String(row.dataKey)}</span>
                            </span>
                            <span className="font-medium tabular-nums">{fmtNumber(Number(row.value))}</span>
                          </div>
                        ))}
                      </div>
                    );
                  }}
                />
                {(data.series ?? []).map((serie, i) => (
                  <Line
                    key={serie.key}
                    type="monotone"
                    dataKey={serie.key}
                    stroke={COLORS[i % COLORS.length]}
                    strokeWidth={1.8}
                    dot={false}
                    activeDot={{ r: 3 }}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
          {!data && <div className="h-full animate-pulse rounded-xl bg-stone-50" />}
        </div>

        <div className="max-h-[268px] overflow-y-auto pr-1">
          {series.map((serie, i) => {
            const max = Math.max(1, ...series.map((s) => s.total));
            return (
              <div key={serie.key} className="relative mb-1 flex h-8 items-center gap-2 overflow-hidden rounded-lg px-2">
                <div
                  className="absolute inset-y-0 left-0 rounded-lg opacity-15"
                  style={{ width: `${(serie.total / max) * 100}%`, background: COLORS[i % COLORS.length] }}
                />
                <span className="relative h-2.5 w-1 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                <span className="relative min-w-0 flex-1 truncate text-[12.5px]" title={serie.label}>
                  {serie.label}
                </span>
                <span className="relative text-[12px] font-medium tabular-nums">{fmtNumber(serie.total)}</span>
              </div>
            );
          })}
          {!series.length && !empty && <div className="h-32 animate-pulse rounded-lg bg-stone-50" />}
        </div>
      </div>
    </section>
  );
}
