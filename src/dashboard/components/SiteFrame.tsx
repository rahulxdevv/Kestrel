import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { qs, type Overview, type Query, type Site } from '../lib/api';
import { DashContext, type Dash } from '../lib/context';
import { fmtMoney } from '../lib/format';
import { navigate } from '../lib/router';
import { useApi } from '../lib/useApi';
import { useQueryState } from '../lib/useQueryState';
import { Dropdown, itemCls } from './Dropdown';
import { Icon } from './NavIcons';
import { renderLabel } from './Panel';
import { Shell, type Section } from './Shell';
import { Toolbar } from './Toolbar';
import { VisitorModal } from './VisitorModal';

const FILTER_LABELS: Record<string, { label: string; dim: string }> = {
  channel: { label: 'Channel', dim: 'channel' },
  source: { label: 'Referrer', dim: 'source' },
  utm_campaign: { label: 'Campaign', dim: 'campaign' },
  utm_term: { label: 'Keyword', dim: 'keyword' },
  utm_source: { label: 'UTM source', dim: 'utm_source' },
  utm_medium: { label: 'UTM medium', dim: 'utm_medium' },
  ref: { label: 'Ref', dim: 'ref' },
  country: { label: 'Country', dim: 'country' },
  region: { label: 'Region', dim: 'region' },
  city: { label: 'City', dim: 'city' },
  browser: { label: 'Browser', dim: 'browser' },
  os: { label: 'OS', dim: 'os' },
  device: { label: 'Device', dim: 'device' },
  page: { label: 'Visited page', dim: 'page' },
  entry_page: { label: 'Entry page', dim: 'entry_page' },
  hostname: { label: 'Hostname', dim: 'hostname' },
  goal: { label: 'Completed goal', dim: 'goal' },
};

const EXPORTS = [
  { type: 'series', dim: '', label: 'Overview series' },
  { type: 'breakdown', dim: 'page', label: 'Pages' },
  { type: 'breakdown', dim: 'channel', label: 'Channels' },
  { type: 'breakdown', dim: 'source', label: 'Referrers' },
  { type: 'breakdown', dim: 'country', label: 'Countries' },
  { type: 'visitors', dim: '', label: 'Visitors' },
  { type: 'payments', dim: '', label: 'Payments' },
];

function ExportMenu({ base, q }: { base: string; q: Query }) {
  return (
    <Dropdown
      align="right"
      button={
        <span className="btn h-10">
          <Icon name="download" size={16} />
          <span className="hidden sm:inline">Export</span>
        </span>
      }
    >
      {(close) => (
        <>
          <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-stone-400">Download CSV</div>
          {EXPORTS.map((e) => (
            <a
              key={e.label}
              className={itemCls(false)}
              href={`${base}/export?${qs(q, { type: e.type, ...(e.dim ? { dim: e.dim } : {}) })}`}
              onClick={close}
            >
              {e.label}
            </a>
          ))}
        </>
      )}
    </Dropdown>
  );
}

export function SiteFrame({
  siteId,
  active,
  demoMode = false,
  withOverview = true,
  children,
}: {
  siteId: string;
  active: Section;
  demoMode?: boolean;
  withOverview?: boolean;
  children: ReactNode;
}) {
  const [q, update] = useQueryState();
  const [reloadKey, setReloadKey] = useState(0);
  const [visitor, setVisitor] = useState<string | null>(null);
  const { data: sites } = useApi<Site[]>('/api/sites');
  const site = sites?.find((s) => s.id === siteId);
  const apiBase = `/api/sites/${siteId}`;
  const { data: overview, loading } = useApi<Overview>(
    withOverview && site ? `${apiBase}/overview?${qs(q)}` : null,
    reloadKey,
  );

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);
  const addFilter = useCallback(
    (key: string, value: string) => update({ filters: { ...q.filters, [key]: value } }),
    [q.filters, update],
  );
  const removeFilter = (key: string) => {
    const { [key]: _drop, ...rest } = q.filters;
    update({ filters: rest });
  };

  const dash: Dash | null = useMemo(() => {
    if (!site) return null;
    const decimals = overview?.decimals ?? 2;
    return {
      site,
      q,
      reloadKey,
      decimals,
      money: (minor, compact) => fmtMoney(minor, site.currency, decimals, compact),
      addFilter,
      openVisitor: setVisitor,
      apiBase,
      readOnly: false,
      demoMode,
      refresh,
      overview: overview ?? null,
      overviewLoading: loading,
    };
  }, [site, q, reloadKey, overview, loading, addFilter, refresh, apiBase, demoMode]);

  if (sites && !site) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="card max-w-md p-8 text-center">
          <h1 className="text-lg font-semibold">Website not found</h1>
          <p className="mt-2 text-sm text-stone-500">It may have been deleted, or the link is from another Kestrel instance.</p>
          <button className="btn-dark mt-5" onClick={() => navigate('/')}>
            Back to websites
          </button>
        </div>
      </div>
    );
  }

  if (!dash) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-stone-200 border-t-ink" />
      </div>
    );
  }

  // Realtime is unfiltered by design, so don't offer filters that would not apply.
  const filterKeys = active === 'realtime' ? [] : Object.keys(q.filters);

  return (
    <DashContext.Provider value={dash}>
      <Shell site={site!} sites={sites!} active={active} online={site!.online ?? overview?.online ?? 0} demoMode={demoMode}>
        <div className="sticky top-0 z-20 -mx-3 mb-4 border-b border-stone-200/70 bg-paper/90 px-3 pb-3 pt-1 backdrop-blur sm:-mx-5 sm:px-5 lg:-mx-8 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Toolbar site={site!} q={q} update={update} overview={overview} onRefresh={refresh} loading={loading} />
            {!demoMode && <div className="flex items-center gap-2"><ExportMenu base={apiBase} q={q} /></div>}
          </div>

          {filterKeys.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {Object.entries(q.filters).map(([k, v]) => (
                <span
                  key={k}
                  className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white py-1 pl-3 pr-1 text-sm shadow-card"
                >
                  <span className="text-stone-500">{FILTER_LABELS[k]?.label ?? k} is</span>
                  <span className="flex min-w-0 items-center gap-1.5 font-medium">
                    {renderLabel(FILTER_LABELS[k]?.dim ?? k, { label: v || null })}
                  </span>
                  <button
                    className="rounded-lg p-1 text-stone-400 transition hover:bg-stone-100 hover:text-ink"
                    onClick={() => removeFilter(k)}
                    aria-label={`Remove ${FILTER_LABELS[k]?.label ?? k} filter`}
                  >
                    <Icon name="x" size={13} />
                  </button>
                </span>
              ))}
              <button className="text-sm text-stone-500 underline-offset-2 hover:underline" onClick={() => update({ filters: {} })}>
                Clear all
              </button>
            </div>
          )}
        </div>

        {children}
      </Shell>
      <VisitorModal key={visitor ?? 'none'} visitorId={visitor} onClose={() => setVisitor(null)} />
    </DashContext.Provider>
  );
}
