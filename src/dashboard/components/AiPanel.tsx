import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { domainForSource } from '../../shared/sources';
import { qs, type AiData } from '../lib/api';
import { useDash } from '../lib/context';
import { bucketLabel, fmtNumber, fmtPct } from '../lib/format';
import { useApi } from '../lib/useApi';
import { Favicon } from './Icons';

/**
 * Which assistant sent the visit. Gartner-style "AI visibility" tabs (answers / indexing / training)
 * would be guesswork from a referrer, so this only reports what we can prove: a real referral click
 * from ChatGPT, Claude, Gemini, Perplexity, Copilot, DeepSeek, Grok or an AI search result.
 */
export function AiPanel() {
  const { apiBase, q, reloadKey, overview } = useDash();
  const { data } = useApi<AiData>(`${apiBase}/ai?${qs(q)}`, reloadKey);
  const aiSources = data?.sources ?? [];
  const g = 'day';
  const totalVisitors = overview?.current.visitors ?? 0;
  const share = totalVisitors ? (data?.total ?? 0) / totalVisitors : 0;

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-100 px-5 py-3.5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold">AI assistants</h2>
            <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-600">
              {fmtNumber(data?.total ?? 0)}
            </span>
          </div>
          <p className="mt-1 text-[12px] text-stone-500">
            Visitors who clicked through from a chat answer or AI search result, {fmtPct(share, 1)} of all traffic.
          </p>
        </div>
        <span className="text-[11px] text-stone-400">Tracked by referrer</span>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_250px]">
        <div className="h-[210px]">
          {data && data.total === 0 && (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-stone-400">
              No AI referrals in this period yet. When ChatGPT or Claude links to you, the visit lands here.
            </div>
          )}
          {data && data.total > 0 && (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.series} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="ai-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#efece7" strokeDasharray="4 4" />
                <XAxis
                  dataKey="bucket"
                  tickFormatter={(b) => bucketLabel(b, g)}
                  tick={{ fill: '#a8a29e', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={26}
                />
                <YAxis tick={{ fill: '#a8a29e', fontSize: 11 }} axisLine={false} tickLine={false} width={38} allowDecimals={false} />
                <Tooltip
                  cursor={{ stroke: '#d6cec2', strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0].payload as { bucket: string; visitors: number };
                    return (
                      <div className="card px-3.5 py-2.5 text-sm">
                        <div className="font-medium">{bucketLabel(row.bucket, g, true)}</div>
                        <div className="mt-1 text-stone-500">
                          {fmtNumber(row.visitors)} AI-referred {row.visitors === 1 ? 'visitor' : 'visitors'}
                        </div>
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="visitors"
                  stroke="#8b5cf6"
                  strokeWidth={2.2}
                  fill="url(#ai-area)"
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
          {!data && <div className="h-full animate-pulse rounded-xl bg-stone-50" />}
        </div>

        <div className="space-y-1">
          {aiSources.map((source, i) => (
            <div
              key={source.label ?? i}
              className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 ${
                i === 0 ? 'bg-stone-100/80' : 'hover:bg-stone-50'
              }`}
            >
              <Favicon domain={source.label ? domainForSource(source.label) : null} size={16} />
              <span className="min-w-0 flex-1 truncate text-[12.5px]">{source.label ?? 'Unknown'}</span>
              <span className="text-[12.5px] font-medium tabular-nums">{fmtNumber(source.visitors)}</span>
            </div>
          ))}
          {!aiSources.length && <p className="px-2 py-3 text-xs text-stone-400">Nothing yet.</p>}
        </div>
      </div>
    </section>
  );
}
