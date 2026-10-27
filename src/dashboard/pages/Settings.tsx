import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Favicon } from '../components/Icons';
import { LanguagePicker } from '../components/LanguagePicker';
import { Icon } from '../components/NavIcons';
import { Modal } from '../components/Modal';
import { Shell } from '../components/Shell';
import { buildAiPrompt } from '../lib/aiPrompt';
import { api, qs, type Site } from '../lib/api';
import { navigate } from '../lib/router';
import { getCachedApiResponse, setCachedApiResponse } from '../lib/useApi';

type TabKey = 'general' | 'tracking' | 'goals' | 'revenue' | 'agents' | 'sharing' | 'data';

const TABS: { key: TabKey; label: string; icon: string; hint: string }[] = [
  { key: 'general', label: 'General', icon: 'settings', hint: 'Name, domain, timezone' },
  { key: 'tracking', label: 'Tracking', icon: 'pulse', hint: 'Install the script' },
  { key: 'goals', label: 'Goals & events', icon: 'target', hint: 'Clicks, conversions, identify' },
  { key: 'revenue', label: 'Revenue', icon: 'dollar', hint: 'Payments and attribution' },
  { key: 'agents', label: 'Agents & MCP', icon: 'sparkles', hint: 'Claude, Cursor, ChatGPT' },
  { key: 'sharing', label: 'Share & export', icon: 'share', hint: 'Public link and CSV' },
  { key: 'data', label: 'Data & advanced', icon: 'database', hint: 'API key, backup, delete' },
];

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD', 'SGD', 'JPY', 'BRL', 'SEK', 'CHF', 'AED', 'NGN', 'ZAR'];

const EXPORTS: { label: string; type: string; dim?: string; note: string }[] = [
  { label: 'Visitors & revenue', type: 'series', note: 'Daily totals' },
  { label: 'Pages', type: 'breakdown', dim: 'page', note: 'By page path' },
  { label: 'Channels', type: 'breakdown', dim: 'channel', note: 'Acquisition groups' },
  { label: 'Referrers', type: 'breakdown', dim: 'source', note: 'Traffic sources' },
  { label: 'Countries', type: 'breakdown', dim: 'country', note: 'Visitor geography' },
  { label: 'Visitors', type: 'visitors', note: 'One row per visitor' },
  { label: 'Payments', type: 'payments', note: 'Revenue and attribution' },
];

const INSTALL_TABS = ['HTML', 'Next.js', 'Astro', 'Ad-blocker'] as const;
type InstallTab = (typeof INSTALL_TABS)[number];

function timeZones() {
  try {
    return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
  } catch {
    return [];
  }
}

export function Settings({ siteId }: { siteId: string }) {
  const [sites, setSites] = useState<Site[] | null>(() => getCachedApiResponse<Site[]>('/api/sites'));
  const [site, setSite] = useState<Site | null>(() => getCachedApiResponse<Site[]>('/api/sites')?.find((s) => s.id === siteId) ?? null);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<TabKey>(() => {
    const hash = window.location.hash.replace('#', '') as TabKey;
    return TABS.some((t) => t.key === hash) ? hash : 'general';
  });
  const [toast, setToast] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);

  const [form, setForm] = useState<Partial<Site>>(() => {
    const found = getCachedApiResponse<Site[]>('/api/sites')?.find((s) => s.id === siteId);
    return found ? { name: found.name, domain: found.domain, timezone: found.timezone, currency: found.currency } : {};
  });
  const [busy, setBusy] = useState(false);

  const origin = window.location.origin;
  const zones = useMemo(timeZones, []);

  useEffect(() => {
    api<Site[]>('/api/sites')
      .then((list) => {
        setSites(list);
        const found = list.find((s) => s.id === siteId);
        if (!found) {
          setNotFound(true);
          return;
        }
        setSite(found);
        setForm({ name: found.name, domain: found.domain, timezone: found.timezone, currency: found.currency });
      })
      .catch((e) => {
        setNotFound(true);
        notify((e as Error).message, 'error');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  function notify(message: string, kind: 'ok' | 'error' = 'ok') {
    setToast({ kind, message });
  }

  function go(next: TabKey) {
    setTab(next);
    window.history.replaceState(null, '', `#${next}`);
  }

  function applySite(next: Site) {
    setSite((current) => ({ ...current, ...next }));
    const updated = (sites ?? []).map((s) => (s.id === next.id ? { ...s, ...next } : s));
    setSites(updated);
    setCachedApiResponse('/api/sites', updated);
  }

  async function save(patch: Partial<Site>, message = 'Changes saved') {
    setBusy(true);
    try {
      const next = await api<Site>(`/api/sites/${siteId}`, { method: 'PATCH', json: patch });
      applySite(next);
      setForm({ name: next.name, domain: next.domain, timezone: next.timezone, currency: next.currency });
      notify(message);
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const trackingLive = (site?.visitors24h ?? 0) > 0;


  if (notFound) {
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

  if (!site || !sites) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-stone-200 border-t-ink" />
      </div>
    );
  }

  return (
    <Shell site={site} sites={sites} active="settings" online={site.online ?? 0}>
      <div className="mx-auto max-w-6xl pb-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[26px] font-semibold tracking-tight">Site settings</h1>
              </div>
              <p className="mt-0.5 truncate text-sm text-stone-500">
                {site.name} · {site.domain}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn h-9" onClick={() => navigate(`/site/${site.id}`)}>
              Back to dashboard
            </button>
          </div>
        </header>


        <div className="mt-7 grid grid-cols-1 gap-6 lg:grid-cols-[216px_minmax(0,1fr)]">
          <aside className="min-w-0">
            <nav className="flex gap-1 overflow-x-auto border-b border-stone-200 pb-1 lg:sticky lg:top-6 lg:flex-col lg:gap-0 lg:overflow-visible lg:border-b-0 lg:border-l lg:pb-0" aria-label="Settings sections">
              {TABS.map((t) => {
                const active = tab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => go(t.key)}
                    aria-current={active ? 'page' : undefined}
                    className={`shrink-0 border-b-2 px-3 py-2 text-sm transition lg:-ml-px lg:w-full lg:border-b-0 lg:border-l-2 lg:px-4 lg:py-2.5 lg:text-left ${
                      active
                        ? 'border-ink font-medium text-ink'
                        : 'border-transparent text-stone-500 hover:text-ink'
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </nav>
          </aside>

          <div className="min-w-0 space-y-5">
            {tab === 'general' && <GeneralPanel site={site} form={form} setForm={setForm} zones={zones} busy={busy} save={save} origin={origin} />}
            {tab === 'tracking' && <TrackingPanel site={site} origin={origin} trackingLive={trackingLive} notify={notify} />}
            {tab === 'goals' && <GoalsPanel site={site} onJump={go} />}
            {tab === 'revenue' && <RevenuePanel site={site} origin={origin} busy={busy} save={save} onJump={go} />}
            {tab === 'agents' && <AgentsPanel site={site} origin={origin} />}
            {tab === 'sharing' && <SharingPanel site={site} applySite={applySite} origin={origin} notify={notify} />}
            {tab === 'data' && <DataPanel site={site} applySite={applySite} origin={origin} notify={notify} />}
          </div>
        </div>
      </div>

      {toast && (
        <div
          className={`fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm text-white shadow-lg ${
            toast.kind === 'error' ? 'bg-red-600' : 'bg-ink'
          }`}
          role="status"
        >
          <Icon name={toast.kind === 'error' ? 'x' : 'check'} size={15} />
          {toast.message}
        </div>
      )}
    </Shell>
  );
}

function PanelCard({
  title,
  description,
  icon,
  action,
  children,
  className = '',
}: {
  title?: string;
  description?: ReactNode;
  icon?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card p-5 sm:p-6 ${className}`}>
      {(title || description) && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div>
              {title && <h2 className="text-[16px] font-semibold tracking-tight">{title}</h2>}
              {description && <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-500">{description}</p>}
            </div>
          </div>
          {action}
        </div>
      )}
      <div className={title || description ? 'mt-5' : ''}>{children}</div>
    </section>
  );
}

function CopyButton({ text, label = 'Copy', className = '' }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        navigator.clipboard.writeText(text).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? (
        <span className="inline-flex items-center gap-1.5">
          <Icon name="check" size={13} /> Copied
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5">
          <Icon name="copy" size={13} /> {label}
        </span>
      )}
    </button>
  );
}

function CodeBlock({ code, label = 'Code' }: { code: string; label?: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-stone-50">
      <div className="flex items-center justify-between gap-2 border-b border-stone-200 px-3.5 py-2">
        <span className="font-mono text-[11px] text-stone-500">{label}</span>
        <CopyButton text={code} className="rounded-md px-1.5 py-0.5 text-[11px] font-medium text-stone-500 transition hover:bg-white hover:text-stone-800" />
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-relaxed text-stone-700">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-xs leading-5 text-stone-500">{hint}</p>}
    </div>
  );
}

function SaveRow({ busy, dirty, onSave, label = 'Save changes' }: { busy: boolean; dirty: boolean; onSave: () => void; label?: string }) {
  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-4">
      <span className="flex items-center gap-1.5 text-xs text-stone-500">
        <span className={`h-1.5 w-1.5 rounded-full ${dirty ? 'bg-amber-400' : 'bg-emerald-500'}`} />
        {dirty ? 'Unsaved changes' : 'All changes saved'}
      </span>
      <button className="btn-dark" disabled={busy || !dirty} onClick={onSave}>
        {busy ? 'Saving…' : label}
      </button>
    </div>
  );
}

function GeneralPanel({
  site,
  form,
  setForm,
  zones,
  busy,
  save,
  origin,
}: {
  site: Site;
  form: Partial<Site>;
  setForm: (next: Partial<Site>) => void;
  zones: string[];
  busy: boolean;
  save: (patch: Partial<Site>, message?: string) => Promise<void>;
  origin: string;
}) {
  const dirty =
    form.name !== site.name || form.domain !== site.domain || form.timezone !== site.timezone || form.currency !== site.currency;

  return (
    <>
      <PanelCard
        title="Website details"
        description="The name you see in the dashboard and the domain Kestrel reports on. Subdomains are tracked under the same site."
        icon="globe"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Display name" htmlFor="site-name">
            <input id="site-name" className="input" value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field
            label="Domain"
            htmlFor="site-domain"
            hint={
              <>
                Paste it without <code className="rounded bg-stone-100 px-1 py-0.5 text-[11px]">https://</code> or a trailing slash.
              </>
            }
          >
            <input
              id="site-domain"
              className="input"
              placeholder="example.com"
              value={form.domain ?? ''}
              onChange={(e) => setForm({ ...form, domain: e.target.value })}
            />
          </Field>
        </div>
      </PanelCard>

      <PanelCard title="Regional settings" description="Used for every date, chart and revenue number in the dashboard." icon="clock">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Timezone" htmlFor="site-tz" hint="Dates and daily totals are grouped in this timezone.">
            <input
              id="site-tz"
              className="input"
              list="settings-timezones"
              value={form.timezone ?? ''}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            />
            <datalist id="settings-timezones">
              {zones.map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
          </Field>
          <Field label="Revenue currency" htmlFor="site-currency" hint="Payments are displayed in this currency.">
            <select
              id="site-currency"
              className="input"
              value={form.currency ?? 'USD'}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            >
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
        </div>
        <SaveRow
          busy={busy}
          dirty={dirty}
          onSave={() => save({ name: form.name, domain: form.domain, timezone: form.timezone, currency: form.currency })}
        />
      </PanelCard>

      <PanelCard title="Site identity" description="Useful when you script against the API or ask an AI assistant to make changes." icon="lock">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3">
            <div className="text-[11px] font-medium uppercase tracking-wide text-stone-400">Website ID</div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <code className="min-w-0 truncate font-mono text-xs text-stone-700">{site.id}</code>
              <CopyButton text={site.id} className="shrink-0 text-xs font-medium text-stone-500 hover:text-ink" />
            </div>
          </div>
          <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3">
            <div className="text-[11px] font-medium uppercase tracking-wide text-stone-400">Dashboard URL</div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <code className="min-w-0 truncate font-mono text-xs text-stone-700">{origin}/app/site/{site.id}</code>
              <CopyButton text={`${origin}/app/site/${site.id}`} className="shrink-0 text-xs font-medium text-stone-500 hover:text-ink" />
            </div>
          </div>
        </div>
      </PanelCard>
    </>
  );
}

function TrackingPanel({
  site,
  origin,
  trackingLive,
  notify,
}: {
  site: Site;
  origin: string;
  trackingLive: boolean;
  notify: (message: string, kind?: 'ok' | 'error') => void;
}) {
  const [installTab, setInstallTab] = useState<InstallTab>('HTML');

  const snippet = `<script\n  defer\n  data-website-id="${site.id}"\n  src="${origin}/js/kestrel.js"\n></script>`;
  const snippets: Record<InstallTab, { label: string; code: string; note: ReactNode }> = {
    HTML: {
      label: 'index.html',
      code: snippet,
      note: (
        <>
          Paste this once in the <code className="rounded bg-stone-100 px-1 py-0.5 text-[11px]">&lt;head&gt;</code> of every page, or in
          your layout template.
        </>
      ),
    },
    'Next.js': {
      label: 'app/layout.tsx',
      code: `import Script from 'next/script';\n\nexport default function RootLayout({ children }) {\n  return (\n    <html>\n      <head>\n        <Script\n          defer\n          data-website-id="${site.id}"\n          src="${origin}/js/kestrel.js"\n          strategy="afterInteractive"\n        />\n      </head>\n      <body>{children}</body>\n    </html>\n  );\n}`,
      note: <>Place it in your root layout so client-side route changes are tracked automatically.</>,
    },
    Astro: {
      label: 'src/layouts/Layout.astro',
      code: `---\n// Your layout frontmatter\n---\n<html>\n  <head>\n    <script\n      is:inline\n      defer\n      data-website-id="${site.id}"\n      src="${origin}/js/kestrel.js"\n    ></script>\n  </head>\n  <body>\n    <slot />\n  </body>\n</html>`,
      note: <>Use <code className="rounded bg-stone-100 px-1 py-0.5 text-[11px]">is:inline</code> so Astro keeps the attributes exactly as written.</>,
    },
    'Ad-blocker': {
      label: 'next.config.js',
      code: `async rewrites() {\n  return [\n    { source: '/stats/script.js', destination: '${origin}/js/kestrel.js' },\n    { source: '/stats/event', destination: '${origin}/api/event' },\n  ];\n}\n\n// Then load the tracker from your own domain:\n<script defer data-website-id="${site.id}" data-api="/stats/event" src="/stats/script.js"></script>`,
      note: <>Serve the tracker and event endpoint from your own domain. Ad blockers that block analytics domains won’t see it.</>,
    },
  };
  const current = snippets[installTab];

  return (
    <>
      <PanelCard
        title="Install the tracking script"
        description="One small script. No dependencies, no third-party requests, and it works with every framework."
        icon="pulse"
        action={
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
              trackingLive ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${trackingLive ? 'bg-emerald-500' : 'bg-amber-400'}`} />
            {trackingLive ? 'Receiving data' : 'Waiting for first visit'}
          </span>
        }
      >
        <div className="flex flex-wrap gap-1.5">
          {INSTALL_TABS.map((t) => (
            <button
              key={t}
              onClick={() => setInstallTab(t)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                installTab === t ? 'bg-ink text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200/70'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="mt-3">
          <CodeBlock code={current.code} label={current.label} />
        </div>
        <p className="mt-2.5 text-xs leading-5 text-stone-500">{current.note}</p>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-stone-200 p-3.5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Icon name="check" size={15} className="text-emerald-600" /> Verify it works
            </div>
            <p className="mt-1.5 text-xs leading-5 text-stone-500">
              Open your website, then check{' '}
              <button className="font-medium text-ink underline-offset-2 hover:underline" onClick={() => navigate(`/site/${site.id}/realtime`)}>
                Realtime
              </button>{' '}
              in the dashboard. A visitor should appear within seconds.
            </p>
          </div>
          <div className="rounded-xl border border-stone-200 p-3.5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Icon name="shield" size={15} className="text-stone-500" /> Exclude your own visits
            </div>
            <p className="mt-1.5 text-xs leading-5 text-stone-500">
              Visit <code className="break-all rounded bg-stone-100 px-1 py-0.5 text-[11px]">https://{site.domain}/?kt_ignore=true</code> once. Use{' '}
              <code className="rounded bg-stone-100 px-1 py-0.5 text-[11px]">false</code> to undo it.
            </p>
          </div>
        </div>
      </PanelCard>

      <PanelCard
        title="Set up with AI"
        description="Copy one prompt into Claude Code, Cursor or any coding assistant open in your project. It uses this site’s real values."
        icon="sparkles"
        action={
          <CopyButton
            text={buildAiPrompt(site, origin)}
            label="Copy AI prompt"
            className="btn-dark shrink-0 text-xs"
          />
        }
      >
        <AiPromptPreview site={site} origin={origin} />
      </PanelCard>

      <PanelCard title="Tag your campaigns" description="See which exact post, article or newsletter made the sale." icon="tag">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg text-sm font-medium text-stone-700">
            <span>Build a UTM link</span>
            <Icon name="chevronDown" size={16} className="text-stone-400 transition group-open:rotate-180" />
          </summary>
          <div className="mt-4">
            <LinkBuilder domain={site.domain} notify={notify} />
          </div>
        </details>
      </PanelCard>
    </>
  );
}

function AiPromptPreview({ site, origin }: { site: Site; origin: string }) {
  const [open, setOpen] = useState(false);
  const prompt = buildAiPrompt(site, origin);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
        <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-stone-200">Installs tracking</span>
        <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-stone-200">Adds goals</span>
        <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-stone-200">Identifies users</span>
      </div>
      <button className="mt-3 text-sm font-medium text-ink hover:underline" onClick={() => setOpen((o) => !o)}>
        {open ? 'Hide prompt' : 'Preview prompt'}
      </button>
      {open && <pre className="code mt-3 max-h-80 whitespace-pre-wrap">{prompt}</pre>}
    </div>
  );
}

function GoalsPanel({ site, onJump }: { site: Site; onJump: (tab: TabKey) => void }) {
  return (
    <>
      <PanelCard
        title="Track a goal"
        description="Goals appear in the Goals tab and can be used in funnels, filters and revenue reports."
        icon="target"
        action={
          <button className="btn h-8 py-0 text-xs" onClick={() => navigate(`/site/${site.id}/goals`)}>
            View goals
            <Icon name="chevronRight" size={13} />
          </button>
        }
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-stone-200 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-stone-100 text-[11px] font-bold text-stone-500">1</span>
              On a button or link
            </div>
            <p className="mt-1.5 text-xs leading-5 text-stone-500">Add a data attribute. No JavaScript needed.</p>
            <div className="mt-3">
              <CodeBlock
                label="Any page"
                code={`<button data-kestrel-goal="signup_click">\n  Get started\n</button>\n\n<!-- Extra details become properties -->\n<a\n  href="/pricing"\n  data-kestrel-goal="pricing_click"\n  data-kestrel-goal-plan="pro"\n>\n  See pricing\n</a>`}
              />
            </div>
          </div>

          <div className="rounded-xl border border-stone-200 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-stone-100 text-[11px] font-bold text-stone-500">2</span>
              From your own code
            </div>
            <p className="mt-1.5 text-xs leading-5 text-stone-500">Call the tracker after a signup, checkout or any custom event.</p>
            <div className="mt-3">
              <CodeBlock
                label="JavaScript"
                code={`// Send a goal with optional properties\nwindow.kestrel('goal', 'signup', {\n  plan: 'pro',\n  source: 'pricing_page',\n});\n\n// Attach a name or email to the visitor\nwindow.kestrel('identify', {\n  user_id: '123',\n  email: 'jane@acme.com',\n  name: 'Jane',\n});`}
              />
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-stone-50 p-3.5">
          <p className="text-xs leading-5 text-stone-500">
            Outbound link clicks are tracked automatically. Add details with <code className="rounded bg-white px-1 py-0.5">data-kestrel-goal-plan="pro"</code>.
          </p>
          <CopyButton text={`<button data-kestrel-goal="signup_click">Get started</button>`} className="btn h-8 shrink-0 py-0 text-xs" />
        </div>
      </PanelCard>

      <PanelCard
        title="Send goals from your backend"
        description="Useful for renewals, refunds, offline conversions or events that happen after a webhook."
        icon="server"
      >
        <p className="text-sm leading-6 text-stone-600">
          Post to the goals API with your site key. You can find the key in{' '}
          <button className="font-medium text-ink underline-offset-2 hover:underline" onClick={() => onJump('data')}>
            Data &amp; advanced
          </button>
          .
        </p>
        <div className="mt-3">
          <CodeBlock
            label="Terminal"
            code={`curl -X POST ${window.location.origin}/api/v1/goals \\\n  -H "Authorization: Bearer ${site.api_key}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"visitor_id":"<kt_vid cookie>","name":"signup"}'`}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <CopyButton text={`${window.location.origin}/api/v1/goals`} className="btn h-8 py-0 text-xs" label="Copy endpoint" />
          <a
            className="btn h-8 py-0 text-xs"
            href="https://github.com/rahulxdevv/kestrel#readme"
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="book" size={13} /> API reference
          </a>
        </div>
      </PanelCard>
    </>
  );
}

function RevenuePanel({
  site,
  origin,
  busy,
  save,
  onJump,
}: {
  site: Site;
  origin: string;
  busy: boolean;
  save: (patch: Partial<Site>, message?: string) => Promise<void>;
  onJump: (tab: TabKey) => void;
}) {
  const [secret, setSecret] = useState('');
  const [replace, setReplace] = useState(false);
  const connected = Boolean(site.dodo_webhook_secret);
  const webhookUrl = `${origin}/api/webhooks/dodo/${site.id}`;

  return (
    <>
      <PanelCard
        title="Revenue attribution"
        description="Connect payments once. Kestrel then credits every payment to the visit that caused it, not just the last click."
        icon="dollar"
        action={
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
              connected ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-stone-100 text-stone-500 ring-1 ring-stone-200'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-stone-400'}`} />
            {connected ? 'Dodo connected' : 'Not connected'}
          </span>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { title: 'Last non-direct touch', body: '“Saw the tweet, came back 17 days later and paid” is credited to the tweet.' },
            { title: 'Fallbacks included', body: 'Return page, customer history, identified email and checkout timing.' },
            { title: 'Every payment explained', body: 'The Journey tab shows exactly how each payment was matched.' },
          ].map((item) => (
            <div key={item.title} className="rounded-xl border border-stone-200 p-3.5">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <Icon name="check" size={13} className="text-emerald-600" />
                {item.title}
              </div>
              <p className="mt-1.5 text-xs leading-5 text-stone-500">{item.body}</p>
            </div>
          ))}
        </div>
      </PanelCard>

      <PanelCard
        title="Connect Dodo Payments"
        description="Add the webhook endpoint, paste the signing secret, and payments will start flowing in automatically."
        icon="creditCard"
      >
        <div className="space-y-5">
          <div className="rounded-xl border border-stone-200 overflow-hidden">
            <div className="flex items-center gap-2 border-b border-stone-100 bg-stone-50/70 px-3.5 py-2 text-xs font-medium text-stone-600">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-bold text-stone-500 ring-1 ring-stone-200">1</span>
              Add the webhook endpoint
            </div>
            <div className="p-3.5">
              <p className="text-xs leading-5 text-stone-500">
                Dodo Dashboard → Developer → Webhooks. Subscribe to <b>payment.succeeded</b> and <b>refund.succeeded</b>.
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 font-mono text-[11.5px] text-stone-700">
                  {webhookUrl}
                </code>
                <CopyButton text={webhookUrl} className="btn h-9 shrink-0 py-0 text-xs" />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-stone-200 overflow-hidden">
            <div className="flex items-center gap-2 border-b border-stone-100 bg-stone-50/70 px-3.5 py-2 text-xs font-medium text-stone-600">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-bold text-stone-500 ring-1 ring-stone-200">2</span>
              Paste the signing secret
            </div>
            <div className="p-3.5">
              {connected && !replace ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm text-emerald-700">
                    <Icon name="check" size={15} /> Webhook secret is configured
                  </div>
                  <button className="btn h-8 py-0 text-xs" onClick={() => setReplace(true)}>
                    Replace secret
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <input
                    className="input min-w-0 flex-1 font-mono text-xs"
                    type="password"
                    placeholder="whsec_..."
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    aria-label="Dodo webhook signing secret"
                  />
                  <button
                    className="btn-dark shrink-0"
                    disabled={busy || !secret.trim()}
                    onClick={async () => {
                      await save({ dodo_webhook_secret: secret.trim() }, 'Webhook secret saved');
                      setSecret('');
                      setReplace(false);
                    }}
                  >
                    {busy ? 'Saving…' : 'Save secret'}
                  </button>
                  {connected && (
                    <button className="btn shrink-0" onClick={() => setReplace(false)}>
                      Cancel
                    </button>
                  )}
                </div>
              )}
              <p className="mt-2 text-xs leading-5 text-stone-500">
                Found under the same webhook settings in Dodo. It starts with <code className="rounded bg-stone-100 px-1 py-0.5">whsec_</code>.
                The secret is stored on your server and never sent to a third party.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-stone-200 overflow-hidden">
            <div className="flex items-center gap-2 border-b border-stone-100 bg-stone-50/70 px-3.5 py-2 text-xs font-medium text-stone-600">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-bold text-stone-500 ring-1 ring-stone-200">3</span>
              Set your return URL
            </div>
            <div className="p-3.5">
              <p className="text-sm leading-6 text-stone-600">
                In Dodo, set the product return URL to a page on your site, for example{' '}
                <code className="rounded bg-stone-100 px-1 py-0.5 text-xs">https://{site.domain}/thanks</code>. Dodo adds a{' '}
                <code className="rounded bg-stone-100 px-1 py-0.5 text-xs">payment_id</code>, which links the payment to the exact visitor even
                without metadata.
              </p>
              <p className="mt-2 text-xs leading-5 text-stone-500">
                For the most precise matching, pass <code className="rounded bg-stone-100 px-1 py-0.5">kt_vid</code> and{' '}
                <code className="rounded bg-stone-100 px-1 py-0.5">kt_sid</code> from the visitor cookies as checkout metadata. Missing
                metadata is handled automatically.
              </p>
            </div>
          </div>
        </div>
      </PanelCard>

      <PanelCard
        title="Native provider webhooks"
        description="Receive signed payment events directly. Configure the endpoint in each provider dashboard and paste its endpoint signing secret here."
        icon="pulse"
      >
        <div className="space-y-3">
          <NativeWebhookCard site={site} origin={origin} busy={busy} save={save} provider="polar"
            label="Polar" events="order.paid, refund.updated" placeholder="polar_whs_…"
            docs="https://polar.sh/docs/api-reference/webhooks/endpoints/create"
            instructions="Create a raw format endpoint. Subscribe to paid orders and refund updates." />
          <NativeWebhookCard site={site} origin={origin} busy={busy} save={save} provider="stripe"
            label="Stripe" events="checkout.session.completed, checkout.session.async_payment_succeeded, payment_intent.succeeded, refund.created, refund.updated" placeholder="whsec_…"
            docs="https://docs.stripe.com/webhooks/signature"
            instructions="Create an endpoint for the events listed above. Use the endpoint signing secret (not an API key)." />
          <NativeWebhookCard site={site} origin={origin} busy={busy} save={save} provider="razorpay"
            label="Razorpay" events="payment.captured, refund.processed" placeholder="Webhook secret"
            docs="https://razorpay.com/docs/webhooks/validate-test/"
            instructions="Subscribe to captured payments and processed refunds, then use the webhook secret configured for this endpoint." />
        </div>
      </PanelCard>

      <details className="card group p-5 sm:p-6">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
          <div className="flex gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-500">
              <Icon name="terminal" size={16} />
            </span>
            <div>
              <h2 className="text-[16px] font-semibold tracking-tight">Another payment provider</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-500">
                Lemon Squeezy, Gumroad, Paddle or your own billing system can send normalized events through the server-side API. Dodo, Stripe, Polar and Razorpay have signed native webhooks above.
              </p>
            </div>
          </div>
          <Icon name="chevronDown" size={17} className="mt-1 shrink-0 text-stone-400 transition group-open:rotate-180" />
        </summary>
        <div className="mt-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
            <span className="text-xs text-stone-500">Your site API key</span>
            <button className="text-xs font-medium text-stone-600 hover:text-ink" onClick={() => onJump('data')}>
              Manage key
            </button>
          </div>
          <CodeBlock
            label="Terminal"
            code={`curl -X POST ${origin}/api/v1/payments \\\n  -H "Authorization: Bearer ${site.api_key}" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "transaction_id": "txn_123",\n    "amount": 29.99,\n    "currency": "${site.currency}",\n    "visitor_id": "<kt_vid cookie>",\n    "email": "jane@acme.com"\n  }'`}
          />
          <p className="mt-3 text-xs leading-5 text-stone-500">
            Normalize the provider webhook in your server and call this endpoint. Pass the visitor ID saved at checkout when available;
            otherwise Kestrel tries a return-page claim, customer/email history, and a unique recent checkout signal. Keep the API key on your server.
          </p>
          <p className="mt-2 text-xs leading-5 text-stone-500">Set the optional <code className="rounded bg-stone-100 px-1 py-0.5">provider</code> field to <code className="rounded bg-stone-100 px-1 py-0.5">lemon_squeezy</code>, <code className="rounded bg-stone-100 px-1 py-0.5">paddle</code>, <code className="rounded bg-stone-100 px-1 py-0.5">gumroad</code> or your own provider name.</p>
        </div>
      </details>
    </>
  );
}

function NativeWebhookCard({
  site, origin, busy, save, provider, label, events, placeholder, docs, instructions,
}: {
  site: Site;
  origin: string;
  busy: boolean;
  save: (patch: Partial<Site>, message?: string) => Promise<void>;
  provider: 'polar' | 'stripe' | 'razorpay';
  label: string;
  events: string;
  placeholder: string;
  docs: string;
  instructions: string;
}) {
  const key = `${provider}_webhook_secret` as 'polar_webhook_secret' | 'stripe_webhook_secret' | 'razorpay_webhook_secret';
  const [secret, setSecret] = useState('');
  const [replace, setReplace] = useState(false);
  const connected = Boolean(site[key]);
  const url = `${origin}/api/webhooks/${provider}/${site.id}`;
  return (
    <div className="rounded-xl border border-stone-200 p-3.5 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold"><ProviderBrand provider={provider} size={20} />{label}</div>
        <span className={`rounded-full px-2 py-1 text-[10px] font-medium ${connected ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-500'}`}>
          {connected ? 'Connected' : 'Not connected'}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-stone-500">{instructions} Events: <code className="break-all">{events}</code>.</p>
      <div className="mt-3 flex min-w-0 flex-col gap-2 sm:flex-row">
        <code className="min-w-0 flex-1 break-all rounded-lg bg-stone-50 px-3 py-2 text-[11px] text-stone-600">{url}</code>
        <CopyButton text={url} className="btn h-9 shrink-0 py-0 text-xs" />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {connected && !replace ? <>
          <span className="self-center text-xs text-emerald-700">Signing secret saved securely</span>
          <button className="btn h-8 py-0 text-xs" onClick={() => setReplace(true)}>Replace secret</button>
        </> : <>
          <input className="input min-w-0 flex-1 font-mono text-xs" type="password" autoComplete="new-password" aria-label={`${label} webhook signing secret`}
            placeholder={placeholder} value={secret} onChange={(event) => setSecret(event.target.value)} />
          <button className="btn-dark shrink-0" disabled={busy || !secret.trim()} onClick={async () => {
            await save({ [key]: secret.trim() }, `${label} webhook secret saved`);
            setSecret(''); setReplace(false);
          }}>{busy ? 'Saving…' : 'Save secret'}</button>
          {connected && <button className="btn" onClick={() => { setSecret(''); setReplace(false); }}>Cancel</button>}
        </>}
      </div>
      <a className="mt-3 inline-flex text-xs font-medium text-stone-500 underline-offset-2 hover:text-ink hover:underline" href={docs} target="_blank" rel="noreferrer">Official {label} webhook docs ↗</a>
    </div>
  );
}

function ProviderBrand({ provider, size = 20 }: { provider: 'polar' | 'stripe' | 'razorpay' | 'dodo'; size?: number }) {
  const src = {
    polar: 'https://polar.sh/favicon.ico', stripe: 'https://cdn.simpleicons.org/stripe/635bff',
    razorpay: 'https://razorpay.com/favicon.ico', dodo: 'https://cdn.simpleicons.org/dodopayments/17130f',
  }[provider];
  return <img src={src} width={size} height={size} className="shrink-0 rounded object-contain" alt="" loading="lazy" />;
}

function SharingPanel({
  site,
  applySite,
  origin,
  notify,
}: {
  site: Site;
  applySite: (site: Site) => void;
  origin: string;
  notify: (message: string, kind?: 'ok' | 'error') => void;
}) {
  const [busy, setBusy] = useState(false);
  const shareUrl = site.share_token ? `${origin}/share/${site.share_token}` : '';

  async function toggle(enable: boolean) {
    setBusy(true);
    try {
      if (enable) {
        const r = await api<{ share_token: string }>(`/api/sites/${site.id}/share`, { method: 'POST' });
        applySite({ ...site, share_token: r.share_token });
        navigator.clipboard?.writeText(`${origin}/share/${r.share_token}`).catch(() => {});
        notify('Share link created and copied');
      } else {
        await api(`/api/sites/${site.id}/share`, { method: 'DELETE' });
        applySite({ ...site, share_token: null });
        notify('Share link disabled');
      }
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PanelCard
        title="Public share link"
        description="Send a client, investor or teammate a read-only dashboard. No account needed, and you can turn it off at any time."
        icon="share"
      >
        <div className="flex items-center justify-between gap-4 rounded-xl border border-stone-200 px-3.5 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium">
              {site.share_token ? 'Share link is on' : 'Share link is off'}
              {site.share_token && (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                  Live
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs leading-5 text-stone-500">
              {site.share_token
                ? 'Anyone with the link can view aggregate traffic and revenue — never individual visitors.'
                : 'Turn it on to create a private, read-only link for clients and teammates.'}
            </p>
          </div>
          <Switch checked={Boolean(site.share_token)} disabled={busy} onChange={toggle} label="Public share link" />
        </div>

        {site.share_token && (
          <div className="mt-3 rounded-xl border border-stone-200 p-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="input w-full min-w-0 font-mono text-xs sm:w-auto sm:flex-1"
                readOnly
                value={shareUrl}
                aria-label="Share URL"
              />
              <CopyButton text={shareUrl} className="btn h-10 shrink-0 py-0 text-xs" />
              <a className="btn h-10 shrink-0 py-0 text-xs" href={shareUrl} target="_blank" rel="noreferrer">
                Open
                <Icon name="arrowUpRight" size={13} />
              </a>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-stone-500">
              <span className="inline-flex items-center gap-1.5">
                <Icon name="check" size={13} className="text-emerald-600" /> Aggregate traffic and revenue
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="check" size={13} className="text-emerald-600" /> No visitors, emails or API keys
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="check" size={13} className="text-emerald-600" /> Works without a Kestrel account
              </span>
            </div>
          </div>
        )}
      </PanelCard>

      <PanelCard title="Export CSV" description="Download the last 30 days. Open it in a spreadsheet, a BI tool or hand it to finance." icon="download">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {EXPORTS.map((item) => (
            <a
              key={item.label}
              className="group flex items-center gap-3 rounded-xl border border-stone-200 px-3.5 py-3 transition hover:border-stone-300 hover:bg-stone-50"
              href={`/api/sites/${site.id}/export?${qs(
                { period: '30d', filters: {} },
                { type: item.type, ...(item.dim ? { dim: item.dim } : {}) },
              )}`}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-500 transition group-hover:bg-white">
                <Icon name="download" size={15} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{item.label}</span>
                <span className="block text-[11px] text-stone-400">{item.note}</span>
              </span>
              <Icon name="chevronRight" size={14} className="shrink-0 text-stone-300 transition group-hover:translate-x-0.5 group-hover:text-stone-500" />
            </a>
          ))}
        </div>
      </PanelCard>
    </>
  );
}

function DataPanel({
  site,
  applySite,
  origin,
  notify,
}: {
  site: Site;
  applySite: (site: Site) => void;
  origin: string;
  notify: (message: string, kind?: 'ok' | 'error') => void;
}) {
  const [revealKey, setRevealKey] = useState(false);
  const [rotateOpen, setRotateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmDomain, setConfirmDomain] = useState('');
  const [busy, setBusy] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const masked = `${site.api_key.slice(0, 4)}${'•'.repeat(18)}${site.api_key.slice(-4)}`;

  async function rotate() {
    setBusy(true);
    try {
      const r = await api<{ api_key: string }>(`/api/sites/${site.id}/rotate-key`, { method: 'POST' });
      applySite({ ...site, api_key: r.api_key });
      setRevealKey(true);
      setRotateOpen(false);
      notify('New API key created. The old key stopped working.');
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api(`/api/sites/${site.id}`, { method: 'DELETE' });
      setCachedApiResponse('/api/sites', (getCachedApiResponse<Site[]>('/api/sites') ?? []).filter((s) => s.id !== site.id));
      navigate('/');
    } catch (e) {
      notify((e as Error).message, 'error');
      setBusy(false);
    }
  }

  async function importPlausible() {
    if (!importFile) return;
    setImporting(true);
    try {
      const csv = await importFile.text();
      const result = await api<{ imported: number; from: string; to: string }>(`/api/sites/${site.id}/imports/plausible`, { method: 'POST', json: { csv } });
      notify(`Imported ${result.imported} daily rows (${result.from} to ${result.to}).`);
      setImportFile(null);
    } catch (e) { notify((e as Error).message, 'error'); }
    finally { setImporting(false); }
  }

  return (
    <>
      <PanelCard title="API key" description="Use this key for server-side goals and payments. Treat it like a password." icon="lock">
        <div className="flex flex-wrap items-center gap-2">
          <code className="w-full min-w-0 truncate rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 font-mono text-xs text-stone-700 sm:w-auto sm:flex-1">
            {revealKey ? site.api_key : masked}
          </code>
          <button className="btn h-10 shrink-0 py-0 text-xs" onClick={() => setRevealKey((v) => !v)}>
            {revealKey ? 'Hide' : 'Reveal'}
          </button>
          <CopyButton text={site.api_key} className="btn h-10 shrink-0 py-0 text-xs" />
          <button className="btn h-10 shrink-0 py-0 text-xs" onClick={() => setRotateOpen(true)}>
            Rotate
          </button>
        </div>
        <p className="mt-3 text-xs leading-5 text-stone-500">
          Rotating immediately invalidates the old key. Any webhook or script still using it will need the new value.
        </p>
      </PanelCard>

      <PanelCard title="Your data" description="Kestrel stores everything in one SQLite file on your own server." icon="database">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-stone-200 p-3.5">
            <div className="text-[11px] font-medium uppercase tracking-wide text-stone-400">Health check</div>
            <a className="mt-1 inline-flex items-center gap-1.5 font-mono text-xs text-stone-700 hover:text-ink" href={`${origin}/api/health`} target="_blank" rel="noreferrer">
              /api/health <Icon name="arrowUpRight" size={11} />
            </a>
          </div>
          <div className="rounded-xl border border-stone-200 p-3.5">
            <div className="text-[11px] font-medium uppercase tracking-wide text-stone-400">Database file</div>
            <div className="mt-1 font-mono text-xs text-stone-700">data/kestrel.db</div>
            <div className="mt-0.5 text-[11px] text-stone-400">Docker: /data/kestrel.db</div>
          </div>
        </div>
        <div className="mt-3 rounded-xl border border-stone-200 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">Back up the whole product</div>
              <p className="mt-0.5 text-xs text-stone-500">One command. No database server required.</p>
            </div>
            <CopyButton text={`sqlite3 data/kestrel.db ".backup 'kestrel-backup.db'"`} className="btn h-8 shrink-0 py-0 text-xs" />
          </div>
          <code className="mt-2.5 block overflow-x-auto rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 font-mono text-[11.5px] text-stone-700">
            sqlite3 data/kestrel.db ".backup 'kestrel-backup.db'"
          </code>
        </div>
        <p className="mt-3 text-xs leading-5 text-stone-500">
          Environment: <code className="rounded bg-stone-100 px-1 py-0.5">ADMIN_PASSWORD</code>,{' '}
          <code className="rounded bg-stone-100 px-1 py-0.5">SESSION_SECRET</code>,{' '}
          <code className="rounded bg-stone-100 px-1 py-0.5">DATABASE_PATH</code>,{' '}
          <code className="rounded bg-stone-100 px-1 py-0.5">PORT</code>. Migrations run automatically on boot.
        </p>
      </PanelCard>

      <PanelCard title="Import Plausible history" description="Bring in daily aggregate metrics from a Plausible CSV export. Imported totals stay labeled separately and do not create visitor profiles or attribution." icon="database">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input type="file" accept=".csv,text/csv" className="input min-w-0 flex-1 py-2 text-xs" onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} />
          <button className="btn h-10 shrink-0" disabled={!importFile || importing} onClick={importPlausible}>{importing ? 'Importing…' : 'Import CSV'}</button>
        </div>
        <p className="mt-2 text-xs leading-5 text-stone-500">Daily report columns: date, visitors, visits, pageviews, bounce_rate, visit_duration. Reimporting the same dates replaces those imported aggregates. Keep the export under 5 MB.</p>
      </PanelCard>

      <section className="card border-red-200/80 p-5 sm:p-6">
        <div className="flex gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-500">
            <Icon name="x" size={16} />
          </span>
          <div>
            <h2 className="text-[16px] font-semibold tracking-tight">Delete this website</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-500">
              Permanently remove visitors, sessions, engagement records, chart notes, imports, funnels and payments for <b>{site.domain}</b>. There is no undo.
            </p>
          </div>
        </div>
        <button className="btn mt-4 border-red-200 text-red-600 hover:bg-red-50" onClick={() => setDeleteOpen(true)}>
          Delete website and data
        </button>
      </section>

      <Modal open={rotateOpen} onClose={() => setRotateOpen(false)} title="Rotate API key?" width="max-w-md">
        <p className="text-sm leading-6 text-stone-600">
          The current key stops working immediately. If you use it in a webhook, update that webhook with the new key.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn" onClick={() => setRotateOpen(false)}>
            Cancel
          </button>
          <button className="btn-dark" disabled={busy} onClick={rotate}>
            {busy ? 'Rotating…' : 'Rotate key'}
          </button>
        </div>
      </Modal>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete website" width="max-w-md">
        <p className="text-sm leading-6 text-stone-600">
          This deletes <b>{site.domain}</b> and every event, goal and payment attached to it. Type the domain to confirm.
        </p>
        <input
          className="input mt-4"
          value={confirmDomain}
          onChange={(e) => setConfirmDomain(e.target.value)}
          placeholder={site.domain}
          aria-label={`Type ${site.domain} to confirm`}
          autoFocus
        />
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn" onClick={() => setDeleteOpen(false)}>
            Cancel
          </button>
          <button
            className="btn bg-red-600 text-white hover:bg-red-700"
            disabled={busy || confirmDomain.trim() !== site.domain}
            onClick={remove}
          >
            {busy ? 'Deleting…' : 'Delete forever'}
          </button>
        </div>
      </Modal>
    </>
  );
}

function Switch({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-emerald-500' : 'bg-stone-300'} ${
        disabled ? 'opacity-50' : ''
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition ${checked ? 'left-[22px]' : 'left-0.5'}`}
      />
    </button>
  );
}

const PRESETS = [
  { label: 'X / Twitter', source: 'x', medium: 'social' },
  { label: 'LinkedIn', source: 'linkedin', medium: 'social' },
  { label: 'Reddit', source: 'reddit', medium: 'social' },
  { label: 'YouTube', source: 'youtube', medium: 'video' },
  { label: 'Medium', source: 'medium', medium: 'article' },
  { label: 'Newsletter', source: 'newsletter', medium: 'email' },
  { label: 'Product Hunt', source: 'producthunt', medium: 'referral' },
];

function LinkBuilder({ domain, notify }: { domain: string; notify: (message: string, kind?: 'ok' | 'error') => void }) {
  const [url, setUrl] = useState(`https://${domain}/`);
  const [preset, setPreset] = useState(PRESETS[0]);
  const [campaign, setCampaign] = useState('');
  let built = '';
  try {
    const u = new URL(url);
    u.searchParams.set('utm_source', preset.source);
    u.searchParams.set('utm_medium', preset.medium);
    if (campaign) u.searchParams.set('utm_campaign', campaign.trim().toLowerCase().replace(/\s+/g, '-'));
    built = u.toString();
  } catch {
    // Keep the preview empty while the URL is incomplete.
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <Field label="Page" htmlFor="builder-url">
            <input id="builder-url" className="input" value={url} onChange={(e) => setUrl(e.target.value)} />
          </Field>
        </div>
        <div>
          <Field label="Where you post it" htmlFor="builder-preset">
            <select
              id="builder-preset"
              className="input"
              value={preset.label}
              onChange={(e) => setPreset(PRESETS.find((p) => p.label === e.target.value)!)}
            >
              {PRESETS.map((p) => (
                <option key={p.label}>{p.label}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Post name" htmlFor="builder-campaign" hint="For example: launch-tweet or seo-guide-article.">
            <input
              id="builder-campaign"
              className="input"
              placeholder="launch-tweet"
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
            />
          </Field>
        </div>
      </div>
      {built && (
        <div className="mt-4">
          <CodeBlock code={built} label="Your tagged link" />
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs leading-5 text-stone-500">
          Tag each post and it shows up by name in Campaign, including the revenue it made.
        </p>
        {built && (
          <button
            className="btn h-8 py-0 text-xs"
            onClick={() => {
              navigator.clipboard.writeText(built).catch(() => {});
              notify('Tagged link copied');
            }}
          >
            <Icon name="copy" size={13} /> Copy link
          </button>
        )}
      </div>
    </div>
  );
}

const MCP_TOOLS: { name: string; hint: string }[] = [
  { name: 'get_overview', hint: 'Visitors, revenue, conversion and who is online now' },
  { name: 'get_traffic_sources', hint: 'Channel, referrer, campaign or keyword, with revenue' },
  { name: 'get_content_performance', hint: 'The post, video or page behind each visit, plus the best day' },
  { name: 'get_top_pages', hint: 'Most-read pages and the money they brought in' },
  { name: 'get_audience', hint: 'Countries, cities, devices, browsers and OS' },
  { name: 'get_live_visitors', hint: 'Who is on the site right now' },
  { name: 'get_site_info', hint: 'Domain, timezone, snippet and endpoints' },
];

function AgentsPanel({ site, origin }: { site: Site; origin: string }) {
  const endpoint = `${origin}/api/mcp`;
  const config = JSON.stringify(
    { mcpServers: { kestrel: { type: 'http', url: endpoint, headers: { Authorization: `Bearer ${site.api_key}` } } } },
    null,
    2,
  );
  const cli = [
    `claude mcp add --transport http kestrel ${endpoint}`,
    `  --header "Authorization: Bearer ${site.api_key}"`,
  ].join('\n');
  const probe = [
    `curl -s ${endpoint}`,
    `  -H "Authorization: Bearer ${site.api_key}"`,
    `  -H "Content-Type: application/json"`,
    `  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
  ].join('\n');

  return (
    <>
      <PanelCard
        title="Connect an AI agent"
        description="Kestrel speaks the Model Context Protocol, so Claude, Cursor, ChatGPT connectors or your own script can read this site's traffic and revenue directly. The server is read-only and scoped to this website's API key."
        icon="sparkles"
      >
        <div className="flex flex-wrap items-center gap-2">
          <code className="w-full min-w-0 truncate rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 font-mono text-xs text-stone-700 sm:w-auto sm:flex-1">
            {endpoint}
          </code>
          <CopyButton text={endpoint} className="btn h-10 shrink-0 py-0 text-xs" />
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-400">Claude Code</div>
            <div className="relative">
              <pre className="code max-h-40 pr-16">{cli}</pre>
              <CopyButton text={cli} className="btn absolute right-2 top-2 h-7 px-2 py-0 text-[11px]" />
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-400">Cursor / Claude Desktop</div>
            <div className="relative">
              <pre className="code max-h-40 pr-16">{config}</pre>
              <CopyButton text={config} className="btn absolute right-2 top-2 h-7 px-2 py-0 text-[11px]" />
            </div>
          </div>
        </div>

        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-stone-500 hover:text-ink">Test it with curl</summary>
          <div className="relative mt-2">
            <pre className="code pr-16">{probe}</pre>
            <CopyButton text={probe} className="btn absolute right-2 top-2 h-7 px-2 py-0 text-[11px]" />
          </div>
        </details>
        <p className="mt-3 text-xs leading-5 text-stone-500">
          The key can read this site and nothing else. Rotate it in Data &amp; advanced if you shared it by mistake.
        </p>
      </PanelCard>

      <PanelCard title="What an agent can ask" description="Seven read-only tools. No tool can write, delete or spend anything." icon="layers">
        <div className="divide-y divide-stone-100">
          {MCP_TOOLS.map((tool) => (
            <div key={tool.name} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
              <code className="font-mono text-[12.5px] text-stone-800">{tool.name}</code>
              <span className="text-[12.5px] text-stone-500">{tool.hint}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50/70 p-3.5">
          <div className="text-[11px] font-medium uppercase tracking-wide text-stone-400">Prompts that work well</div>
          <ul className="mt-1.5 space-y-1 text-[13px] text-stone-600">
            <li>“Why did traffic jump this week? Which post caused it?”</li>
            <li>“Which page earns the most per visitor, and what should I write next?”</li>
            <li>“Summarise last month for a changelog post, with numbers.”</li>
          </ul>
        </div>
      </PanelCard>

      <PanelCard title="Language" description="Navigation, metrics and the websites grid are translated into eight languages here. The choice is stored in your browser only." icon="globe">
        <LanguagePicker />
      </PanelCard>
    </>
  );
}
