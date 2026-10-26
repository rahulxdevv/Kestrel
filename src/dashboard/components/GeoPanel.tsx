import { geoPoint } from '../../shared/geo';
import { qs, type BreakdownRow, type LivePoint } from '../lib/api';
import { useDash } from '../lib/context';
import { countryName, fmtNumber, fmtPct } from '../lib/format';
import { useApi } from '../lib/useApi';
import { Flag } from './Icons';
import { WorldMap } from './WorldMap';

/**
 * The flat world map for the selected period, not just the last 30 minutes: countries come from the
 * same breakdown query the country table uses, so the map and the list always agree.
 */
export function GeoPanel() {
  const { apiBase, q, reloadKey, overview } = useDash();
  const { data } = useApi<BreakdownRow[]>(`${apiBase}/breakdown?${qs(q, { dim: 'country' })}`, reloadKey);
  const rows = (data ?? []).filter((r) => r.label && r.visitors > 0).sort((a, b) => b.visitors - a.visitors);
  const total = rows.reduce((n, r) => n + r.visitors, 0) || overview?.current.visitors || 0;

  const points: LivePoint[] = rows.flatMap((row) => {
    const point = geoPoint(row.label);
    if (!point) return [];
    return [{ ...point, country: String(row.label), city: null as string | null, visitors: row.visitors }];
  });

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-5 py-3.5">
        <div>
          <h2 className="text-[15px] font-semibold">Where visitors are</h2>
          <p className="mt-0.5 text-[12px] text-stone-500">
            {rows.length} {rows.length === 1 ? 'country' : 'countries'} · click Country in the tables below to filter
          </p>
        </div>
        <span className="text-[11px] text-stone-400">2D vector map · selected period</span>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_280px]">
        <div className="overflow-hidden rounded-xl bg-[#0b1626]">
          {points.length ? (
            <WorldMap points={points} mode="flat" height={240} />
          ) : (
            <div className="flex h-[240px] items-center justify-center text-sm text-stone-400">
              No geographic data in this period.
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          {rows.slice(0, 7).map((row, i) => (
            <div key={row.label ?? i} className="flex items-center gap-2 text-[12.5px]">
              <Flag cc={row.label} size={13} />
              <span className="min-w-0 flex-1 truncate">{countryName(row.label)}</span>
              <span className="tabular-nums text-stone-500">{fmtNumber(row.visitors)}</span>
              <span className="w-10 text-right tabular-nums text-stone-400">
                {total ? fmtPct(row.visitors / total, 0) : '-'}
              </span>
            </div>
          ))}
          {!rows.length && <p className="py-3 text-xs text-stone-400">Nothing yet.</p>}
        </div>
      </div>
    </section>
  );
}
