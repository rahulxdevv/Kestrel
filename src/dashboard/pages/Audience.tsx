import { AudiencePanel } from '../components/GoalsPanel';
import { SiteFrame } from '../components/SiteFrame';

export function Audience({ siteId, demoMode = false }: { siteId: string; demoMode?: boolean }) {
  return (
    <SiteFrame siteId={siteId} active="audience" demoMode={demoMode}>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Audience</h1>
          <p className="mt-0.5 text-sm text-stone-500">
            Every visitor in this period, and every payment traced back to the visit that caused it.
          </p>
        </div>
        <AudiencePanel />
      </div>
    </SiteFrame>
  );
}
