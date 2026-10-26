import { GoalsSection } from '../components/GoalsPanel';
import { SiteFrame } from '../components/SiteFrame';
import { useDash } from '../lib/context';

export function Goals({ siteId, demoMode = false }: { siteId: string; demoMode?: boolean }) {
  return (
    <SiteFrame siteId={siteId} active="goals" demoMode={demoMode}>
      <GoalsBody />
    </SiteFrame>
  );
}

function GoalsBody() {
  const { overview } = useDash();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Goals &amp; funnels</h1>
        <p className="mt-0.5 text-sm text-stone-500">
          Track the actions that matter, then see exactly where visitors drop off between them.
        </p>
      </div>
      <GoalsSection totalVisitors={overview?.current.visitors ?? 0} />
    </div>
  );
}
