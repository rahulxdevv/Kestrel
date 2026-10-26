import type { ReactNode } from 'react';
import { api, type Site } from '../lib/api';
import { navigate } from '../lib/router';
import { useT } from '../lib/i18n';
import { Chevron, Dropdown, itemCls } from './Dropdown';
import { Favicon } from './Icons';
import { LanguagePicker } from './LanguagePicker';
import { Logo, LogoMark } from './Logo';
import { Icon } from './NavIcons';

export type Section = 'overview' | 'realtime' | 'content' | 'audience' | 'goals' | 'settings';

const NAV: { key: Section; labelKey: string; icon: string; path: string }[] = [
  { key: 'overview', labelKey: 'nav.overview', icon: 'overview', path: '' },
  { key: 'realtime', labelKey: 'nav.realtime', icon: 'pulse', path: '/realtime' },
  { key: 'content', labelKey: 'nav.content', icon: 'tag', path: '/content' },
  { key: 'audience', labelKey: 'nav.audience', icon: 'users', path: '/audience' },
  { key: 'goals', labelKey: 'nav.goals', icon: 'target', path: '/goals' },
];

function SiteSwitcher({ site, sites, compact = false }: { site: Site; sites: Site[]; compact?: boolean }) {
  return (
    <Dropdown
      className="w-full"
      button={
        <span
          className={`flex w-full items-center gap-2.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-left shadow-card transition hover:border-stone-300 ${
            compact ? 'max-w-[210px]' : ''
          }`}
        >
          <Favicon domain={site.domain} size={20} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold leading-tight">{site.name}</span>
            {!compact && <span className="block truncate text-[11px] leading-tight text-stone-500">{site.domain}</span>}
          </span>
          <Chevron />
        </span>
      }
    >
      {(close) => (
        <>
          <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-stone-400">Websites</div>
          {sites.map((s) => (
            <button
              key={s.id}
              className={itemCls(s.id === site.id)}
              onClick={() => {
                close();
                navigate(`/site/${s.id}`);
              }}
            >
              <Favicon domain={s.domain} size={16} />
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              {s.id === site.id && <Icon name="check" size={14} className="text-stone-400" />}
            </button>
          ))}
          <div className="my-1 border-t border-stone-100" />
          <button
            className={itemCls(false)}
            onClick={() => {
              close();
              navigate('/');
            }}
          >
            <Icon name="globe" size={15} /> All websites
          </button>
          <button
            className={itemCls(false)}
            onClick={() => {
              close();
              navigate(`/site/${site.id}/settings`);
            }}
          >
            <Icon name="settings" size={15} /> Site settings
          </button>
        </>
      )}
    </Dropdown>
  );
}

export function Shell({
  site,
  sites,
  active,
  online,
  demoMode = false,
  children,
}: {
  site: Site;
  sites: Site[];
  active: Section;
  online: number;
  demoMode?: boolean;
  children: ReactNode;
}) {
  const { t } = useT();

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    window.dispatchEvent(new Event('kestrel:logout'));
  }

  const navItems = (mobile: boolean) =>
    NAV.map((item) => {
      const isActive = active === item.key;
      const href = `/site/${site.id}${item.path}`;
      return (
        <button
          key={item.key}
          onClick={() => navigate(href)}
          className={
            mobile
              ? `flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] ${
                  isActive ? 'bg-white font-medium text-ink shadow-card' : 'text-stone-500 hover:text-ink'
                }`
              : `flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition ${
                  isActive ? 'bg-white font-medium text-ink shadow-card' : 'text-stone-600 hover:bg-white/70 hover:text-ink'
                }`
          }
        >
          <Icon name={item.icon} size={17} className={isActive ? 'text-rust' : 'text-stone-400'} />
          {t(item.labelKey)}
        </button>
      );
    });

  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-stone-200/80 bg-[#fbf8f3] px-3 py-5 lg:flex">
        <a
          href="/app"
          className="px-2"
          onClick={(e) => {
            e.preventDefault();
            navigate('/');
          }}
        >
          <Logo />
        </a>
        <div className="mt-5">
          {demoMode ? <DemoSiteBadge site={site} /> : <SiteSwitcher site={site} sites={sites} />}
        </div>
        <nav className="mt-5 space-y-0.5" aria-label="Dashboard">
          {navItems(false)}
        </nav>

        <div className="mt-auto space-y-3">
          <div className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 shadow-card">
            <div className="flex items-center gap-2 text-xs text-stone-500">
              <span className={`h-2 w-2 rounded-full ${online > 0 ? 'animate-pulse bg-green-500' : 'bg-stone-300'}`} />
              {t('common.online')}
            </div>
            <div className="mt-0.5 text-lg font-semibold leading-tight">{online}</div>
            <div className="text-[11px] text-stone-500">last 5 minutes</div>
          </div>

          {!demoMode && <button
            onClick={() => navigate(`/site/${site.id}/settings`)}
            className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition ${
              active === 'settings' ? 'bg-white font-medium text-ink shadow-card' : 'text-stone-600 hover:bg-white/70 hover:text-ink'
            }`}
          >
            <Icon name="settings" size={17} className={active === 'settings' ? 'text-rust' : 'text-stone-400'} />
            {t('nav.settings')}
          </button>}

          <LanguagePicker className="px-2" />

          <div className="flex items-center justify-between border-t border-stone-200/80 px-2 pt-3 text-xs text-stone-500">
            <a href="https://github.com/rahulxdevv/kestrel#readme" target="_blank" rel="noreferrer" className="hover:text-ink">
              Docs
            </a>
            <a href="/" className="hover:text-ink">
              Homepage
            </a>
            {!demoMode && <button onClick={logout} className="hover:text-ink">Log out</button>}
          </div>
        </div>
      </aside>

      <div className="lg:pl-60">
        {/* Mobile header */}
        <header className="sticky top-0 z-30 border-b border-stone-200/80 bg-paper/90 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-2 px-3 py-2.5">
            <a
              href="/app"
              onClick={(e) => {
                e.preventDefault();
                navigate('/');
              }}
              className="flex items-center gap-2"
            >
              <LogoMark size={24} />
              <span className="text-sm font-semibold">Kestrel</span>
            </a>
            {demoMode ? <DemoSiteBadge site={site} compact /> : <SiteSwitcher site={site} sites={sites} compact />}
          </div>
          <nav className="flex gap-1 overflow-x-auto px-2 pb-2" aria-label="Dashboard">
            {navItems(true)}
            {!demoMode && <button
              onClick={() => navigate(`/site/${site.id}/settings`)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] ${
                active === 'settings' ? 'bg-white font-medium text-ink shadow-card' : 'text-stone-500 hover:text-ink'
              }`}
            >
              <Icon name="settings" size={16} /> {t('nav.settings')}
            </button>}
          </nav>
        </header>

        {demoMode && (
          <div className="border-b border-amber-200/70 bg-amber-50 px-4 py-2 text-center text-xs text-amber-900 sm:px-6">
            Demo showcase · sample analytics and simulated live visitors · writes and tracking are disabled
          </div>
        )}
        <main className="mx-auto w-full max-w-[1500px] px-3 pb-16 pt-3 sm:px-5 lg:px-8 lg:pt-6">{children}</main>
      </div>
    </div>
  );
}

function DemoSiteBadge({ site, compact = false }: { site: Site; compact?: boolean }) {
  return (
    <div className={`flex w-full items-center gap-2.5 rounded-xl border border-stone-200 bg-white px-3 py-2 ${compact ? 'max-w-[210px]' : ''}`}>
      <Favicon domain={site.domain} size={20} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold leading-tight">{site.name}</span>
        {!compact && <span className="block truncate text-[11px] leading-tight text-stone-500">{site.domain}</span>}
      </span>
      <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700">Demo</span>
    </div>
  );
}
