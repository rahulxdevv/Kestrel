import { domainForSource } from '../../shared/sources';
import { qs, type ContentData, type ContentRow } from '../lib/api';
import { useDash } from '../lib/context';
import { fmtNumber } from '../lib/format';
import { useT } from '../lib/i18n';
import { navigate } from '../lib/router';
import { useApi } from '../lib/useApi';
import { Favicon } from './Icons';
import { Icon } from './NavIcons';

/** The label a visitor would recognise: the post name, the campaign, or the landing page. */
export function contentTitle(row: ContentRow): string {
  return row.content || row.campaign || row.ref || row.entryPage || row.source || 'Direct';
}

function sourceLabel(row: ContentRow): string {
  if (row.source && row.source !== 'Direct/None') return row.source;
  return row.channel ?? 'Direct';
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function ContentIcon({ row, size = 18 }: { row: ContentRow; size?: number }) {
  const domain = domainForSource(row.source ?? '') ?? hostOf(row.url) ?? (row.source?.includes('.') ? row.source : null);
  return <Favicon domain={domain} size={size} />;
}

export function ContentPanel({ mode = 'overview' }: { mode?: 'overview' | 'full' }) {
  const { apiBase, q, money, reloadKey, readOnly, site } = useDash();
  const { t } = useT();
  const { data } = useApi<ContentData>(`${apiBase}/content?${qs(q)}`, reloadKey);
  const rows = data?.rows ?? [];
  const shown = mode === 'overview' ? rows.slice(0, 6) : rows;

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-100 px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold">{t('content.title')}</h2>
          <p className="mt-0.5 text-[12px] text-stone-500">{t('content.subtitle')}</p>
        </div>
        {mode === 'overview' && !readOnly && (
          <button
            className="flex items-center gap-1 text-[12.5px] font-medium text-stone-500 transition hover:text-ink"
            onClick={() => navigate(`/site/${site.id}/content`)}
          >
            View all <Icon name="arrowUpRight" size={13} />
          </button>
        )}
      </div>

      <div className="mt-2 divide-y divide-stone-100">
        {shown.map((row, i) => (
          <div key={`${row.source}-${row.campaign}-${row.content}-${row.entryPage}-${i}`} className="group flex items-center gap-3 px-4 py-2.5">
            <ContentIcon row={row} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                {row.url ? (
                  <a
                    href={row.url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-[13.5px] font-medium underline-offset-2 hover:underline"
                    title={row.url}
                  >
                    {contentTitle(row)}
                  </a>
                ) : (
                  <span className="truncate text-[13.5px] font-medium">{contentTitle(row)}</span>
                )}
                {row.url && <Icon name="externalLink" size={12} className="shrink-0 text-stone-300 group-hover:text-stone-500" />}
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-stone-400">
                <span>{sourceLabel(row)}</span>
                {row.entryPage && row.entryPage !== contentTitle(row) && (
                  <>
                    <span className="text-stone-300">·</span>
                    <span className="truncate">{row.entryPage}</span>
                  </>
                )}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[13px] font-medium tabular-nums">{fmtNumber(row.visitors)}</div>
              <div className={`text-[11px] tabular-nums ${row.revenue > 0 ? 'text-revenue' : 'text-stone-300'}`}>
                {row.revenue > 0 ? money(row.revenue) : '-'}
              </div>
            </div>
          </div>
        ))}
        {data && !rows.length && (
          <div className="px-5 py-10 text-center">
            <p className="text-sm text-stone-500">{t('content.empty')}</p>
            <p className="mt-1 text-xs text-stone-400">
              https://yoursite.com/?ref=https://x.com/you/status/123
            </p>
          </div>
        )}
        {!data && <div className="h-40 animate-pulse bg-stone-50" />}
      </div>
    </section>
  );
}
