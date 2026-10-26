import { Area, Bar, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Overview } from '../lib/api';
import { bucketLabel, bucketTitle, fmtDuration, fmtMoney, fmtNumber, fmtPct } from '../lib/format';
import { useT } from '../lib/i18n';
import { Delta } from './Sparkline';

type Series = Overview['series'][number];

export function OverviewCard({ data }: { data: Overview | null }) {
  const { t } = useT();
  const current = data?.current;
  const previous = data?.previous;
  const granularity = data?.range.granularity ?? 'day';
  const series = data?.series ?? [];

  return (
    <section className="card overflow-hidden bg-white" aria-label={t('overview.chart')}>
      <div className="grid grid-cols-2 divide-x divide-y divide-stone-100 sm:grid-cols-4 sm:divide-y-0 lg:grid-cols-7">
        <Metric label={t('common.visitors')} value={fmtNumber(current?.visitors ?? 0)} comparisonLabel={t('overview.vsPrevious')} current={current?.visitors} previous={previous?.visitors} />
        <Metric label={t('common.revenue')} value={fmtMoney(current?.revenue ?? 0, data?.currency ?? 'USD', data?.decimals ?? 2)} comparisonLabel={t('overview.vsPrevious')} current={current?.revenue} previous={previous?.revenue} />
        <Metric label={t('common.conversion')} value={fmtPct(current?.conversionRate ?? 0, 2)} comparisonLabel={t('overview.vsPrevious')} current={current?.conversionRate} previous={previous?.conversionRate} />
        <Metric label={t('overview.revPerVisitor')} value={fmtMoney(current?.revenuePerVisitor ?? 0, data?.currency ?? 'USD', data?.decimals ?? 2)} comparisonLabel={t('overview.vsPrevious')} current={current?.revenuePerVisitor} previous={previous?.revenuePerVisitor} />
        <Metric label={t('overview.bounce')} value={fmtPct(current?.bounceRate ?? 0)} comparisonLabel={t('overview.vsPrevious')} current={current?.bounceRate} previous={previous?.bounceRate} invert />
        <Metric label={t('overview.sessionTime')} value={fmtDuration(current?.avgDuration ?? 0)} comparisonLabel={t('overview.vsPrevious')} current={current?.avgDuration} previous={previous?.avgDuration} />
        <div className="min-w-0 px-3.5 py-3 sm:px-4 lg:border-b-0">
          <div className="flex items-center gap-1.5 truncate text-[11px] font-medium text-stone-500">
            {t('common.online')}
            <span className={`h-1.5 w-1.5 rounded-full ${data?.online ? 'animate-pulse bg-emerald-500' : 'bg-stone-300'}`} />
          </div>
          <div className="mt-1 text-[21px] font-semibold leading-none tracking-tight text-stone-900 tabular-nums">{data ? fmtNumber(data.online) : '—'}</div>
          <div className="mt-1.5 text-[10px] text-stone-400">{t('overview.last5')}</div>
        </div>
      </div>

      <div className="border-t border-stone-100 px-3 pb-3 pt-4 sm:px-5 sm:pb-4">
        <div className="mb-2 flex items-center justify-between gap-4">
          <h2 className="text-[12px] font-medium text-stone-600">
            {t('overview.chart')} <span className="px-1 text-stone-300">·</span>
            <span className="capitalize">{granularity}</span>
          </h2>
          <div className="flex shrink-0 items-center gap-4 text-[11px] text-stone-500">
            <span className="flex items-center gap-1.5"><i className="h-[2px] w-3 rounded bg-sky-400" />{t('common.visitors')}</span>
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-[2px] bg-orange-400" />{t('common.revenue')}</span>
          </div>
        </div>

        <div className="h-[260px] w-full sm:h-[300px]">
          {data && series.length > 0 && (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={series} margin={{ top: 8, right: 0, left: -12, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#e7e5e4" strokeDasharray="3 5" />
                <XAxis
                  dataKey="bucket"
                  tickFormatter={(bucket) => bucketLabel(bucket, granularity)}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={28}
                  tick={{ fill: '#a8a29e', fontSize: 10 }}
                  dy={8}
                />
                <YAxis
                  yAxisId="visitors"
                  axisLine={false}
                  tickLine={false}
                  width={42}
                  allowDecimals={false}
                  tickFormatter={fmtNumber}
                  tick={{ fill: '#a8a29e', fontSize: 10 }}
                />
                <YAxis
                  yAxisId="revenue"
                  orientation="right"
                  axisLine={false}
                  tickLine={false}
                  width={48}
                  tickFormatter={(value) => fmtMoney(value, data.currency, data.decimals, true)}
                  tick={{ fill: '#a8a29e', fontSize: 10 }}
                  domain={[0, (max: number) => Math.max(1, Math.ceil(max * 1.5))]}
                />
                <Tooltip
                  cursor={{ fill: '#f8fafc' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const point = payload[0].payload as Series;
                    const visitors = point.visitors ?? 0;
                    const newVisitors = Math.min(point.newVisitors ?? 0, visitors);
                    const returningVisitors = Math.max(0, visitors - newVisitors);
                    const newShare = visitors ? (newVisitors / visitors) * 100 : 0;
                    return (
                      <div className="min-w-[190px] rounded-lg border border-stone-200 bg-white px-3.5 py-3 text-xs shadow-lg shadow-stone-900/5">
                        <div className="mb-2.5 font-medium text-stone-800">{bucketTitle(point.bucket, granularity)}</div>
                        <div className="flex items-center justify-between gap-5 py-1">
                          <span className="flex items-center gap-2 text-stone-500"><i className="h-2 w-2 rounded-sm bg-sky-400" />{t('common.visitors')}</span>
                          <b className="font-semibold tabular-nums text-stone-800">{fmtNumber(visitors)}</b>
                        </div>
                        <div className="my-1.5 flex h-1 overflow-hidden rounded-full bg-stone-100">
                          <span className="bg-sky-400" style={{ width: `${newShare}%` }} />
                          <span className="bg-stone-300" style={{ width: `${100 - newShare}%` }} />
                        </div>
                        <div className="mb-2 flex justify-between text-[10px] text-stone-400">
                          <span>{fmtNumber(newVisitors)} {t('overview.new')}</span>
                          <span>{fmtNumber(returningVisitors)} {t('overview.returning')}</span>
                        </div>
                        <div className="flex items-center justify-between gap-5 border-t border-stone-100 py-1.5">
                          <span className="flex items-center gap-2 text-stone-500"><i className="h-2 w-2 rounded-sm bg-orange-400" />{t('common.revenue')}</span>
                          <b className="font-medium tabular-nums text-stone-800">{fmtMoney(point.revenue, data.currency, data.decimals)}</b>
                        </div>
                        <div className="flex items-center justify-between gap-5 py-1">
                          <span className="text-stone-500">{t('common.sales')}</span>
                          <span className="font-medium tabular-nums text-stone-700">{fmtNumber(point.payments)}</span>
                        </div>
                        {point.topSource && point.topVisitors ? (
                          <div className="mt-2 border-t border-stone-100 pt-2 text-[10px] text-stone-500">
                            Top source: <span className="font-medium text-stone-700">{point.topSource}</span> · {fmtNumber(point.topVisitors)} {t('common.visitors').toLowerCase()}
                          </div>
                        ) : null}
                      </div>
                    );
                  }}
                />
                <Bar yAxisId="revenue" dataKey="revenue" fill="#ee8b70" radius={[3, 3, 0, 0]} maxBarSize={26} isAnimationActive={false} />
                <Area
                  yAxisId="visitors"
                  type="monotone"
                  dataKey="visitors"
                  stroke="#79b8e8"
                  strokeWidth={2.5}
                  fill="#bfdbfe"
                  fillOpacity={0.34}
                  dot={false}
                  activeDot={{ r: 4, fill: '#79b8e8', stroke: '#fff', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
          {data && series.length === 0 && <div className="flex h-full items-center justify-center text-sm text-stone-400">No activity in this period</div>}
        </div>
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  comparisonLabel,
  current = 0,
  previous = 0,
  invert = false,
}: {
  label: string;
  value: string;
  comparisonLabel: string;
  current?: number;
  previous?: number;
  invert?: boolean;
}) {
  return (
    <div className="min-w-0 border-b border-stone-100 px-3.5 py-3 sm:px-4 lg:border-b-0">
      <div className="truncate text-[11px] font-medium text-stone-500">{label}</div>
      <div className="mt-1 truncate text-[21px] font-semibold leading-none tracking-tight text-stone-900 tabular-nums">{value}</div>
      <div className="mt-1.5 flex min-h-[12px] items-center gap-1 text-[10px] text-stone-400">
        {previous > 0 ? <Delta current={current} previous={previous} compact invert={invert} /> : <span>—</span>}
        <span>{comparisonLabel}</span>
      </div>
    </div>
  );
}
