import { useCallback, useMemo, useState } from 'react';
import { Favicon } from '../components/Icons';
import { Icon } from '../components/NavIcons';
import { Logo } from '../components/Logo';
import { OverviewCard } from '../components/OverviewCard';
import { Panel } from '../components/Panel';
import { qs, RANGE_PRESETS, type Overview, type Query, type Site } from '../lib/api';
import { DashContext, type Dash } from '../lib/context';
import { fmtMoney } from '../lib/format';
import { useApi } from '../lib/useApi';

type SharePayload = Overview & { site: Site };

const SHARE_PERIODS = RANGE_PRESETS.filter((p) => ['today', '7d', '30d', '90d', '12m'].includes(p.value));

export function ShareView({ token }: { token: string }) {
  const [period, setPeriod] = useState('30d');
  const apiBase = `/api/public/${token}`;
  const q: Query = useMemo(() => ({ period, filters: {} }), [period]);
  const [reloadKey, setReloadKey] = useState(0);
  const { data, error, loading } = useApi<SharePayload>(`${apiBase}/overview?${qs(q)}`, reloadKey);
  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);
  const site = data?.site;

  const dash: Dash | null = useMemo(() => {
    if (!site) return null;
    return {
      site,
      q,
      reloadKey,
      decimals: data?.decimals ?? 2,
      money: (minor, compact) => fmtMoney(minor, site.currency, data?.decimals ?? 2, compact),
      addFilter: () => {},
      openVisitor: () => {},
      apiBase,
      readOnly: true,
      demoMode: false,
      refresh,
      overview: data ?? null,
      overviewLoading: loading,
    };
  }, [site, q, reloadKey, data, loading, refresh, apiBase]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper px-4">
        <div className="card max-w-md p-8 text-center">
          <h1 className="text-lg font-semibold">This dashboard isn’t shared</h1>
          <p className="mt-2 text-sm text-stone-500">{error}</p>
          <a className="btn-dark mt-5 inline-flex" href="/">
            Go to Kestrel
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-30 border-b border-stone-200/80 bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <a href="/" className="hidden sm:block">
              <Logo small />
            </a>
            <span className="hidden h-5 w-px bg-stone-200 sm:block" />
            <div className="flex min-w-0 items-center gap-2">
              {site ? <Favicon domain={site.domain} size={20} /> : null}
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold leading-tight">{site?.name ?? 'Loading…'}</div>
                <div className="truncate text-[11px] text-stone-500">
                  {site?.domain} · read-only dashboard
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select className="input h-9 w-auto py-0 text-sm" value={period} onChange={(e) => setPeriod(e.target.value)}>
              {SHARE_PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <button className="btn h-9 w-9 px-0" onClick={refresh} aria-label="Refresh">
              <Icon name="refresh" size={15} />
            </button>
            <a className="btn-dark h-9 py-0 text-sm" href="/">
              Get Kestrel
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-4 px-4 py-5 sm:px-6">
        {!data && <div className="card h-[420px] animate-pulse bg-stone-50" />}
        {data && dash && site && (
          <DashContext.Provider value={dash}>
            <OverviewCard data={data} />
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel
                tabs={[
                  { label: 'Channel', dim: 'channel' },
                  { label: 'Referrer', dim: 'source' },
                  { label: 'Campaign', dim: 'campaign' },
                ]}
              />
              <Panel
                tabs={[
                  { label: 'Country', dim: 'country' },
                  { label: 'Region', dim: 'region' },
                ]}
              />
              <Panel
                tabs={[
                  { label: 'Page', dim: 'page' },
                  { label: 'Entry page', dim: 'entry_page' },
                  { label: 'Exit link', dim: 'exit_link' },
                ]}
              />
              <Panel
                tabs={[
                  { label: 'Browser', dim: 'browser' },
                  { label: 'OS', dim: 'os' },
                  { label: 'Device', dim: 'device' },
                ]}
              />
            </div>
            <p className="pb-10 pt-3 text-center text-xs text-stone-400">
              Read-only analytics for {site.domain} ·{' '}
              <a className="font-medium text-stone-600 hover:text-ink" href="/">
                Powered by Kestrel
              </a>{' '}
              · revenue in {site.currency}
            </p>
          </DashContext.Provider>
        )}
      </main>
    </div>
  );
}
