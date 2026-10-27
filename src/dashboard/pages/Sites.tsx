import { useEffect, useMemo, useState } from 'react';
import { Chevron, Dropdown, itemCls } from '../components/Dropdown';
import { Favicon } from '../components/Icons';
import { LanguagePicker } from '../components/LanguagePicker';
import { Logo } from '../components/Logo';
import { Modal } from '../components/Modal';
import { Icon } from '../components/NavIcons';
import { Delta, MiniChart } from '../components/Sparkline';
import { api, type Site, type SummaryResponse, type SummarySite } from '../lib/api';
import { decimalsFor, fmtMoney, fmtNumber } from '../lib/format';
import { useT } from '../lib/i18n';
import { navigate } from '../lib/router';

type SortKey = 'online' | 'revenue' | 'visitors' | 'name';

export function Sites() {
  const { t } = useT();
  const [days, setDays] = useState<7 | 30>(30);
  const [sort, setSort] = useState<SortKey>('online');
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let alive = true;
    api<SummaryResponse>(`/api/summary?days=${days}`)
      .then((res) => {
        if (!alive) return;
        setData(res);
        if (!res.sites.length) setAdding(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [days]);

  const sites = data?.sites ?? null;
  const sorted = useMemo(() => {
    if (!sites) return null;
    const copy = [...sites];
    if (sort === 'name') copy.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'revenue') copy.sort((a, b) => b.revenue - a.revenue);
    else if (sort === 'visitors') copy.sort((a, b) => b.visitors - a.visitors);
    else copy.sort((a, b) => b.online - a.online || b.revenue - a.revenue);
    return copy;
  }, [sites, sort]);

  const currency = data?.currency ?? 'USD';
  const mixedCurrency = (sites ?? []).some((s) => s.currency !== currency);
  // Counts add up across every site; money only adds up inside one currency.
  const totals = (sites ?? []).reduce(
    (acc, s) => ({
      revenue: acc.revenue + (s.currency === currency ? s.revenue : 0),
      visitors: acc.visitors + s.visitors,
      sales: acc.sales + (s.currency === currency ? s.sales : 0),
      online: acc.online + s.online,
      previousVisitors: acc.previousVisitors + s.previousVisitors,
      previousRevenue: acc.previousRevenue + (s.currency === currency ? s.previousRevenue : 0),
    }),
    { revenue: 0, visitors: 0, sales: 0, online: 0, previousVisitors: 0, previousRevenue: 0 },
  );
  const decimals = decimalsFor(currency);
  const money = (minor: number, compact = false) => fmtMoney(minor, currency, decimals, compact);
  const onlineSites = (sites ?? []).filter((s) => s.online > 0).length;

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    window.dispatchEvent(new Event('kestrel:logout'));
  }

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-30 border-b border-stone-200/70 bg-paper/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <a href="/app" className="flex items-center gap-2" onClick={(e) => { e.preventDefault(); navigate('/'); }}>
            <Logo />
          </a>
          <nav className="flex items-center gap-1.5 text-sm" aria-label="Main">
            <span className="rounded-lg bg-white px-2.5 py-1.5 font-medium text-ink shadow-card">{t('nav.sites')}</span>
            <a
              className="rounded-lg px-2.5 py-1.5 text-stone-500 transition hover:text-ink"
              href="https://github.com/rahulxdevv/kestrel#readme"
              target="_blank"
              rel="noreferrer"
            >
              Docs
            </a>
            <LanguagePicker className="ml-1 hidden sm:inline-flex" />
            <button className="ml-1 rounded-lg px-2.5 py-1.5 text-stone-500 transition hover:text-ink" onClick={logout}>
              Sign out
            </button>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-[1180px] px-4 pb-16 pt-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[26px] font-semibold tracking-tight">{t('sites.title')}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Dropdown
              align="right"
              button={
                <span className="flex h-10 items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-sm shadow-card transition hover:bg-stone-50">
                  <span className="text-stone-500">{t('sites.sort')}:</span>
                  <span className="font-medium">
                    {sort === 'online'
                      ? t('sites.sort.online')
                      : sort === 'revenue'
                        ? t('sites.sort.revenue')
                        : sort === 'visitors'
                          ? t('sites.sort.visitors')
                          : t('sites.sort.name')}
                  </span>
                  <Chevron />
                </span>
              }
            >
              {(close) => (
                <>
                  {(['online', 'revenue', 'visitors', 'name'] as SortKey[]).map((key) => (
                    <button
                      key={key}
                      className={itemCls(sort === key)}
                      onClick={() => {
                        setSort(key);
                        close();
                      }}
                    >
                      {t(`sites.sort.${key}`)}
                      {sort === key && <Icon name="check" size={14} className="ml-auto text-stone-400" />}
                    </button>
                  ))}
                </>
              )}
            </Dropdown>
            <button className="btn-dark h-10" onClick={() => setAdding(true)}>
              <Icon name="plus" size={16} />
              {t('sites.add')}
            </button>
          </div>
        </div>

        <section className="card mt-5 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-5 py-4">
            <div>
              <h2 className="text-[15px] font-semibold">{t('sites.all')}</h2>
              <p className="mt-0.5 text-[11.5px] text-stone-500">
                {sites
                  ? `${sites.length} ${sites.length === 1 ? 'website' : 'websites'}${mixedCurrency ? ` · money in ${currency}` : ''}`
                  : '\u00a0'}
              </p>
            </div>
            <div className="flex rounded-xl bg-stone-100/80 p-1" role="group" aria-label="Period">
              {([
                { value: 7, label: t('sites.period7') },
                { value: 30, label: t('sites.period30') },
              ] as const).map((option) => (
                <button
                  key={option.value}
                  onClick={() => setDays(option.value)}
                  aria-pressed={days === option.value}
                  className={`rounded-lg px-3 py-1.5 text-[12.5px] transition ${
                    days === option.value ? 'bg-white font-medium text-ink shadow-card' : 'text-stone-500 hover:text-ink'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 divide-stone-100 sm:grid-cols-3 lg:grid-cols-5 lg:divide-x">
            <Stat label={t('common.revenue')} value={data ? money(totals.revenue) : '-'} delta={<Delta current={totals.revenue} previous={totals.previousRevenue} />} />
            <Stat label={t('common.visitors')} value={data ? fmtNumber(totals.visitors) : '-'} delta={<Delta current={totals.visitors} previous={totals.previousVisitors} />} />
            <Stat label={t('common.sales')} value={data ? fmtNumber(totals.sales) : '-'} sub={data ? `${t('sites.avgOrder')} ${money(totals.sales ? totals.revenue / totals.sales : 0)}` : undefined} />
            <Stat label={t('sites.avgOrder')} value={data ? money(totals.sales ? totals.revenue / totals.sales : 0) : '-'} sub={data ? `${t('common.conversion')} ${totals.visitors ? ((totals.sales / totals.visitors) * 100).toFixed(1) : '0'}%` : undefined} />
            <Stat
              label={t('common.online')}
              value={data ? String(totals.online) : '-'}
              live={!!totals.online}
              sub={data ? t('sites.sitesOnline', { n: onlineSites }) : undefined}
            />
          </div>
        </section>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(sorted ?? []).map((site) => (
            <SiteCard key={site.id} site={site} days={days} onOpen={() => navigate(`/site/${site.id}`)} />
          ))}

          {!sites &&
            [0, 1, 2].map((i) => <div key={i} className="card h-[218px] animate-pulse bg-stone-50" />)}

          {sites && !sites.length && (
            <div className="card col-span-full p-12 text-center">
              <h2 className="text-lg font-semibold">{t('sites.empty')}</h2>
              <p className="mx-auto mt-1.5 max-w-md text-sm text-stone-500">{t('sites.emptyHint')}</p>
              <button className="btn-dark mt-5" onClick={() => setAdding(true)}>
                <Icon name="plus" size={16} />
                {t('sites.add')}
              </button>
            </div>
          )}
        </div>

        <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-stone-200/80 pt-5 text-xs text-stone-400">
          <span>Kestrel · self-hosted, revenue-first analytics</span>
          <div className="flex items-center gap-3">
            <LanguagePicker className="sm:hidden" />
            <span>
              Built by{' '}
              <a className="text-stone-500 hover:text-ink" href="https://github.com/rahulxdevv" target="_blank" rel="noreferrer">
                rahulxdevv
              </a>
            </span>
          </div>
        </footer>
      </div>

      <AddSite open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function Stat({
  label,
  value,
  delta,
  sub,
  live = false,
}: {
  label: string;
  value: string;
  delta?: React.ReactNode;
  sub?: string;
  live?: boolean;
}) {
  return (
    <div className="px-5 py-4">
      <div className="flex items-center gap-1.5 text-[12px] text-stone-500">
        {label}
        {live && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />}
      </div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
        <span className="text-[26px] font-semibold leading-none tracking-tight">{value}</span>
        {delta}
      </div>
      <div className="mt-1.5 h-4 truncate text-[11px] text-stone-400">{sub ?? '\u00a0'}</div>
    </div>
  );
}

function SiteCard({ site, days, onOpen }: { site: SummarySite; days: number; onOpen: () => void }) {
  const { t } = useT();
  const decimals = decimalsFor(site.currency);
  return (
    <button
      onClick={onOpen}
      className="card group flex flex-col p-4 text-left transition hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Favicon domain={site.domain} size={26} />
          <div className="min-w-0">
            <div className="truncate text-[14.5px] font-semibold leading-tight">{site.name}</div>
            <div className="truncate text-[11.5px] leading-tight text-stone-500">{site.domain}</div>
          </div>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
            site.online ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-500'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${site.online ? 'animate-pulse bg-emerald-500' : 'bg-stone-400'}`} />
          {site.online}
        </span>
      </div>

      <div className="mt-3">
        <MiniChart series={site.series} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-stone-100 pt-3">
        <div>
          <div className="text-[11px] text-stone-500">{t('common.visitors')} · {days}d</div>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-[19px] font-semibold leading-none tracking-tight">{fmtNumber(site.visitors)}</span>
            <Delta current={site.visitors} previous={site.previousVisitors} compact />
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] text-stone-500">{t('common.revenue')} · {days}d</div>
          <div className="mt-0.5 text-[19px] font-semibold leading-none tracking-tight">
            {fmtMoney(site.revenue, site.currency, decimals, true)}
          </div>
        </div>
      </div>
    </button>
  );
}

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD', 'SGD', 'JPY', 'BRL', 'SEK', 'CHF', 'AED', 'NGN', 'ZAR'];

function AddSite({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [domain, setDomain] = useState('');
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [currency, setCurrency] = useState('USD');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const zones = (() => {
    try {
      return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
    } catch {
      return [];
    }
  })();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const site = await api<Site>('/api/sites', { method: 'POST', json: { domain, name, timezone, currency } });
      navigate(`/site/${site.id}/settings`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add a website" width="max-w-md">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="domain">Domain</label>
          <input id="domain" className="input" placeholder="example.com" value={domain} onChange={(e) => setDomain(e.target.value)} autoFocus />
          <p className="mt-1 text-xs text-stone-500">Subdomains (app.example.com) are tracked under the same site.</p>
        </div>
        <div>
          <label className="label" htmlFor="name">
            Name <span className="font-normal text-stone-400">(optional)</span>
          </label>
          <input id="name" className="input" placeholder="My SaaS" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="tz">Timezone</label>
            <input id="tz" className="input" list="tz-list" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
            <datalist id="tz-list">
              {zones.map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="label" htmlFor="cur">Revenue currency</label>
            <select id="cur" className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn-dark w-full" disabled={!domain || busy}>
          {busy ? 'Creating…' : 'Add website'}
        </button>
      </form>
    </Modal>
  );
}
