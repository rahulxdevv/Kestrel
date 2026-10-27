import { useEffect, useRef, useState } from 'react';
import { Avatar, DeviceIcon, Favicon, Flag, SourceIcon } from '../components/Icons';
import { Icon } from '../components/NavIcons';
import { SiteFrame } from '../components/SiteFrame';
import { WorldMap } from '../components/WorldMap';
import { qs, type LiveData } from '../lib/api';
import { useDash } from '../lib/context';
import { countryName, decimalsFor, fmtMoney, fmtNumber } from '../lib/format';
import { useT } from '../lib/i18n';
import { useApi } from '../lib/useApi';

export function Realtime({ siteId, demoMode = false }: { siteId: string; demoMode?: boolean }) {
  return (
    <SiteFrame siteId={siteId} active="realtime" withOverview={false} demoMode={demoMode}>
      <RealtimeBody />
    </SiteFrame>
  );
}

function RealtimeBody() {
  const { apiBase, q, reloadKey, refresh, site, demoMode } = useDash();
  const { t } = useT();
  const [auto, setAuto] = useState(true);
  const [view, setView] = useState<'globe' | 'flat'>('globe');
  const [sound, setSound] = useState(() => localStorage.getItem('kestrel:sale-sound') === 'on');
  const seenSales = useRef<Set<string> | null>(null);
  const latestServerTime = useRef(Date.now());
  const [saleAfter, setSaleAfter] = useState(() => Date.now() - 1000);
  const { data, loading } = useApi<LiveData>(`${apiBase}/realtime?${qs(q, { after: saleAfter })}`, reloadKey);

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => setSaleAfter(Math.max(0, latestServerTime.current - 15_000)), 15_000);
    return () => clearInterval(id);
  }, [auto, refresh]);

  useEffect(() => {
    const toggle = (event: Event) => setSound(Boolean((event as CustomEvent<{ enabled: boolean }>).detail?.enabled));
    window.addEventListener('kestrel:sale-sound', toggle);
    return () => window.removeEventListener('kestrel:sale-sound', toggle);
  }, []);

  useEffect(() => {
    if (!data) return;
    const lastReturnedSale = data.sales[data.sales.length - 1]?.ts;
    // If the safety cap is reached, keep polling from the oldest unprocessed
    // point in the ordered result set so a busy site cannot skip sales.
    const nextCursor = data.sales.length >= 1000 && lastReturnedSale
      ? Math.max(0, lastReturnedSale - 1)
      : data.serverTime;
    latestServerTime.current = Math.max(latestServerTime.current, nextCursor);
    const ids = data.sales.map((item) => item.sale_id ?? `${item.ts}-${item.visitor_id}`);
    if (!seenSales.current) seenSales.current = new Set();
    const unseen = ids.filter((id) => !seenSales.current!.has(id));
    ids.forEach((id) => seenSales.current!.add(id));
    if (seenSales.current.size > 1000) seenSales.current = new Set([...seenSales.current].slice(-500));
    if (sound) unseen.forEach(() => playSaleChime());
  }, [data, sound]);

  function refreshLive() {
    setSaleAfter(Math.max(0, latestServerTime.current - 15_000));
    refresh();
  }

  const time = (ts: number) =>
    new Intl.DateTimeFormat('en', { timeZone: site.timezone, hour: 'numeric', minute: '2-digit' }).format(ts);

  const live = data?.online ?? 0;
  const points = data?.points ?? [];
  const sources = data?.sources ?? [];
  const countries = data?.countries ?? [];
  const devices = data?.devices ?? [];

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <section className="card overflow-hidden xl:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-5 py-3.5">
          <div className="flex items-center gap-3">
            <span className="relative flex h-2.5 w-2.5">
              {live > 0 && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />}
              <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${live ? 'bg-emerald-500' : 'bg-stone-300'}`} />
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-[26px] font-semibold leading-none tracking-tight">{data?.online ?? '-'}</span>
              <span className="text-[12.5px] text-stone-500">{t('realtime.liveNow', { domain: site.domain })}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex rounded-xl bg-stone-100/80 p-1" role="group" aria-label="Map style">
              {([
                { key: 'globe', label: '3D globe' },
                { key: 'flat', label: '2D map' },
              ] as const).map((option) => (
                <button
                  key={option.key}
                  onClick={() => setView(option.key)}
                  aria-pressed={view === option.key}
                  className={`rounded-lg px-2.5 py-1 text-[11.5px] transition ${
                    view === option.key ? 'bg-white font-medium text-ink shadow-card' : 'text-stone-500 hover:text-ink'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button
              className={`btn h-8 py-0 text-[11.5px] ${auto ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : ''}`}
              onClick={() => setAuto((a) => !a)}
              title={demoMode ? 'Rotate sample visitors every 15 seconds' : 'Auto-refresh every 15 seconds'}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${auto ? 'bg-emerald-500' : 'bg-stone-400'}`} />
              {auto ? (demoMode ? 'Simulated' : 'Live') : 'Paused'}
            </button>
            <button className="btn h-8 w-8 px-0 text-[11.5px]" onClick={refreshLive} disabled={loading} aria-label="Refresh">
              <Icon name="refresh" size={14} />
            </button>
            <button className={`btn h-8 px-2 text-[11px] ${sound ? 'border-amber-200 bg-amber-50 text-amber-800' : ''}`} aria-pressed={sound}
              title="Press M from anywhere to toggle sale sounds" onClick={() => {
                const enabled = !sound; localStorage.setItem('kestrel:sale-sound', enabled ? 'on' : 'off');
                window.dispatchEvent(new CustomEvent('kestrel:sale-sound', { detail: { enabled } }));
              }}>{sound ? 'Sound on · M' : 'Sound off · M'}</button>
          </div>
        </div>

        <div className="relative bg-[#070d18]">
          <WorldMap points={points} mode={view} height={440} />

          {/* The same summary DataFast puts on the map, but built from our own numbers. */}
          <div className="pointer-events-none absolute left-3 top-3 w-[248px] rounded-xl border border-white/15 bg-white/95 p-3 text-ink shadow-lg backdrop-blur-sm sm:left-4 sm:top-4">
            <div className="flex items-center gap-1.5 text-[12px] font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {fmtNumber(data?.online ?? 0)} visitors on {site.domain}
            </div>
            <div className="mt-2.5 space-y-1.5">
              <SummaryRow label="Referrers">
                {sources.slice(0, 3).map((s) => (
                  <Chip key={s.label ?? 'direct'} icon={<SourceIcon source={s.label} size={11} />}>
                    {s.label ?? 'Direct'} ({fmtNumber(s.visitors)})
                  </Chip>
                ))}
                {!sources.length && <span className="text-[10.5px] text-stone-400">-</span>}
              </SummaryRow>
              <SummaryRow label="Countries">
                {countries.slice(0, 2).map((c) => (
                  <Chip key={c.label ?? 'x'} icon={<Flag cc={c.label} size={10} />}>
                    {countryName(c.label)} ({fmtNumber(c.visitors)})
                  </Chip>
                ))}
                {!countries.length && <span className="text-[10.5px] text-stone-400">-</span>}
              </SummaryRow>
              <SummaryRow label="Devices">
                {devices.slice(0, 3).map((d) => (
                  <Chip key={d.label ?? 'x'}>
                    <DeviceIcon name={d.label} size={11} />
                    {d.label} ({fmtNumber(d.visitors)})
                  </Chip>
                ))}
                {!devices.length && <span className="text-[10.5px] text-stone-400">-</span>}
              </SummaryRow>
            </div>
          </div>

          <div className="pointer-events-none absolute bottom-3 left-4 right-4 flex items-end justify-between gap-2">
            <span className="rounded-lg bg-black/35 px-2 py-1 text-[10.5px] text-white/50 backdrop-blur">
              {demoMode
                ? 'Sample locations are simulated for this demo.'
                : view === 'globe'
                  ? 'Drag to spin the globe. Every face is a visitor from the last 30 minutes.'
                  : 'Flat map · every dot is a visitor from the last 30 minutes.'}
            </span>
            {points.length > 0 && (
              <span className="rounded-lg bg-black/35 px-2 py-1 text-[10.5px] text-white/50 backdrop-blur">
                {points.length} {demoMode ? 'sample' : 'live'} {points.length === 1 ? 'location' : 'locations'}
              </span>
            )}
          </div>
        </div>

        <div className="border-t border-stone-100 px-5 py-3">
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-stone-400">
            <span>{t('realtime.activity')} · last 30 minutes</span>
            <span>{data ? `${data.activity.length} events` : ''}</span>
          </div>
          {!data && <div className="h-52 animate-pulse rounded-xl bg-stone-50" />}
          {data && data.activity.length === 0 && (
            <p className="py-12 text-center text-sm text-stone-400">
              Quiet right now. As soon as someone opens {site.domain}, they show up here.
            </p>
          )}
          <ol className="divide-y divide-stone-100">
            {data?.activity.map((e, i) => (
              <li key={e.sale_id ?? `${e.ts}-${i}`} className={`flex items-center gap-3 py-2.5 ${e.type === 'sale' ? 'rounded-lg bg-amber-50/70 px-2' : ''}`}>
                <span className="w-11 shrink-0 text-[11px] tabular-nums text-stone-400">{time(e.ts)}</span>
                <span className="flex w-7 shrink-0 justify-center">
                  {e.type === 'sale' && !e.visitor_id
                    ? <span className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-amber-100 text-amber-700"><Icon name="dollar" size={15} /></span>
                    : <Avatar id={e.visitor_id ?? 'sale'} size={26} className="rounded-lg" />}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13.5px]">
                  {e.type === 'sale' ? <span className="mr-1.5 font-semibold text-amber-800">Sale · {fmtMoney(e.amount ?? 0, e.currency ?? site.currency, decimalsFor(e.currency ?? site.currency))}</span> : null}
                  {e.type === 'goal' && <span className="mr-1.5 font-medium text-violet-700">{e.name}</span>}
                  {e.type === 'outbound' ? (
                    <span className="text-stone-600">left to {e.name?.replace(/^https?:\/\//, '')}</span>
                  ) : (
                    <span className="text-stone-700">{e.path}</span>
                  )}
                </span>
                <span className="hidden items-center gap-1.5 text-xs text-stone-500 sm:flex">
                  <SourceIcon source={e.source} />
                  <span className="max-w-[110px] truncate">{e.source ?? t('common.direct')}</span>
                </span>
                <span className="hidden items-center gap-1 text-xs text-stone-500 md:flex">
                  <Flag cc={e.country} size={13} /> {countryName(e.country)}
                </span>
                <span className="hidden items-center gap-1 text-xs text-stone-400 lg:flex">
                  <DeviceIcon name={e.device} size={14} /> {e.browser ?? '-'}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <div className="space-y-4">
        <MiniList
          title={t('realtime.pages')}
          rows={(data?.pages ?? []).map((p) => ({ label: p.label, value: p.visitors, icon: <Favicon domain={site.domain} size={15} /> }))}
        />
        <MiniList
          title={t('realtime.sources')}
          rows={sources.map((p) => ({
            label: p.label ?? t('common.direct'),
            value: p.visitors,
            icon: <SourceIcon source={p.label} />,
          }))}
        />
        <MiniList
          title={t('realtime.countries')}
          rows={countries.map((p) => ({ label: countryName(p.label), value: p.visitors, icon: <Flag cc={p.label} size={13} /> }))}
        />
        <MiniList
          title="Devices"
          rows={devices.map((p) => ({
            label: p.label,
            value: p.visitors,
            icon: <DeviceIcon name={p.label} size={14} />,
          }))}
        />
        <p className="px-1 text-[11px] text-stone-400">
          {demoMode
            ? 'These simulated visitors rotate while you explore. No live tracking data is collected.'
            : 'Counts are distinct visitors in the last 30 minutes. Realtime data is never sampled.'}
        </p>
      </div>
    </div>
  );
}

function playSaleChime() {
  try {
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return;
    const audio = new AudioContextClass();
    const now = audio.currentTime;
    [880, 1175, 1568].forEach((frequency, index) => {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const start = now + index * 0.075;
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);
      oscillator.connect(gain); gain.connect(audio.destination);
      oscillator.start(start); oscillator.stop(start + 0.25);
    });
    window.setTimeout(() => { void audio.close(); }, 500);
  } catch { /* Audio is optional and can be blocked by the browser. */ }
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-[62px] shrink-0 pt-1 text-[10px] font-medium uppercase tracking-wide text-stone-400">{label}</span>
      <div className="flex min-w-0 flex-wrap gap-1">{children}</div>
    </div>
  );
}

function Chip({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-stone-200 bg-white px-1.5 py-0.5 text-[10.5px] text-stone-600">
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

function MiniList({
  title,
  rows,
}: {
  title: string;
  rows: { label: string | null; value: number; icon: React.ReactNode }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section className="card p-4">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-400">{title}</h3>
      {rows.length === 0 && <p className="py-3 text-sm text-stone-400">-</p>}
      <div className="space-y-1">
        {rows.map((r, i) => (
          <div key={i} className="relative flex h-7 items-center rounded-md px-2">
            <div className="absolute inset-y-0 left-0 rounded-md bg-visitorsSoft" style={{ width: `${(r.value / max) * 100}%` }} />
            <span className="relative flex min-w-0 flex-1 items-center gap-2 text-[13px]">
              {r.icon}
              <span className="truncate">{r.label}</span>
            </span>
            <span className="relative text-[13px] font-medium tabular-nums">{r.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
