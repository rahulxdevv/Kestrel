import { AiPanel } from '../components/AiPanel';
import { ContentPanel } from '../components/ContentPanel';
import { GeoPanel } from '../components/GeoPanel';
import { GoalsTrend } from '../components/GoalsTrend';
import { OverviewCard } from '../components/OverviewCard';
import { Panel } from '../components/Panel';
import { SiteFrame } from '../components/SiteFrame';
import { useDash } from '../lib/context';
import { navigate } from '../lib/router';

export function Overview({ siteId, demoMode = false }: { siteId: string; demoMode?: boolean }) {
  return (
    <SiteFrame siteId={siteId} active="overview" demoMode={demoMode}>
      <OverviewBody />
    </SiteFrame>
  );
}

function OverviewBody() {
  const { overview, site } = useDash();

  return (
    <div className="space-y-4">
      <OverviewCard data={overview} />

      <GeoPanel />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          tabs={[
            { label: 'Channel', dim: 'channel', filter: 'channel' },
            { label: 'Referrer', dim: 'source', filter: 'source' },
            { label: 'Campaign', dim: 'campaign', filter: 'utm_campaign' },
            { label: 'Keyword', dim: 'keyword', filter: 'utm_term' },
          ]}
        />
        <Panel
          tabs={[
            { label: 'Country', dim: 'country', filter: 'country' },
            { label: 'Region', dim: 'region', filter: 'region' },
            { label: 'City', dim: 'city', filter: 'city' },
          ]}
        />
        <Panel
          tabs={[
            { label: 'Page', dim: 'page', filter: 'page' },
            { label: 'Entry page', dim: 'entry_page', filter: 'entry_page' },
            { label: 'Exit link', dim: 'exit_link' },
            { label: 'Hostname', dim: 'hostname', filter: 'hostname' },
          ]}
        />
        <Panel
          tabs={[
            { label: 'Browser', dim: 'browser', filter: 'browser' },
            { label: 'OS', dim: 'os', filter: 'os' },
            { label: 'Device', dim: 'device', filter: 'device' },
          ]}
        />
      </div>

      <GoalsTrend />

      <AiPanel />

      <ContentPanel />

      <p className="pt-2 text-center text-xs text-stone-400">
        Times in {site.timezone} · Revenue in {site.currency} ·{' '}
        <button className="underline-offset-2 hover:underline" onClick={() => navigate(`/site/${site.id}/settings`)}>
          Settings &amp; install
        </button>
      </p>
    </div>
  );
}
