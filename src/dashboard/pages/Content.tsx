import { ContentPanel } from '../components/ContentPanel';
import { SiteFrame } from '../components/SiteFrame';
import { Icon } from '../components/NavIcons';
import { useDash } from '../lib/context';
import { useT } from '../lib/i18n';

export function Content({ siteId, demoMode = false }: { siteId: string; demoMode?: boolean }) {
  return (
    <SiteFrame siteId={siteId} active="content" demoMode={demoMode}>
      <ContentBody />
    </SiteFrame>
  );
}

function ContentBody() {
  const { site } = useDash();
  const { t } = useT();
  const examples = [
    { label: 'X post', url: `https://${site.domain}/?ref=https://x.com/you/status/1234567890` },
    { label: 'YouTube', url: `https://${site.domain}/?utm_source=youtube&utm_content=review-2026` },
    { label: 'Instagram reel', url: `https://${site.domain}/?ref=https://www.instagram.com/reel/C9xYzAbCdEf/` },
    { label: 'Newsletter', url: `https://${site.domain}/?utm_source=newsletter&utm_campaign=issue-44` },
  ];

  return (
    <div className="space-y-4">
      <ContentPanel mode="full" />

      <section className="card p-5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-100 text-stone-500">
            <Icon name="tag" size={15} />
          </span>
          <h2 className="text-[15px] font-semibold">Make the next post show up by name</h2>
        </div>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-stone-600">
          Social platforms only send the referrer host (<code className="rounded bg-stone-100 px-1 py-0.5 text-[12px]">t.co</code>,{' '}
          <code className="rounded bg-stone-100 px-1 py-0.5 text-[12px]">l.instagram.com</code>), never the post. Put the post URL in{' '}
          <code className="rounded bg-stone-100 px-1 py-0.5 text-[12px]">?ref=</code> or its name in{' '}
          <code className="rounded bg-stone-100 px-1 py-0.5 text-[12px]">?utm_content=</code> and {t('content.title').toLowerCase()} becomes
          exact, including the revenue each one produced.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {examples.map((example) => (
            <div key={example.label} className="rounded-xl border border-stone-200 bg-stone-50/60 px-3 py-2">
              <div className="text-[11px] font-medium uppercase tracking-wider text-stone-400">{example.label}</div>
              <div className="mt-1 overflow-x-auto whitespace-nowrap font-mono text-[11.5px] text-stone-600">{example.url}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
