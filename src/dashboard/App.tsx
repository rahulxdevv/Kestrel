import { useEffect, useState } from 'react';
import { api } from './lib/api';
import { usePath } from './lib/router';
import { LogoMark } from './components/Logo';
import { Audience } from './pages/Audience';
import { Content } from './pages/Content';
import { Goals } from './pages/Goals';
import { Login } from './pages/Login';
import { Overview } from './pages/Overview';
import { Realtime } from './pages/Realtime';
import { Settings } from './pages/Settings';
import { ShareView } from './pages/ShareView';
import { Sites } from './pages/Sites';

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper">
      <div className="flex animate-pulse items-center gap-2.5 text-stone-400">
        <LogoMark size={28} />
        <span className="text-sm font-medium">Loading Kestrel…</span>
      </div>
    </div>
  );
}

export function App() {
  const path = usePath();
  const share = /^\/share\/([\w-]+)\/?$/.exec(path);
  const [auth, setAuth] = useState<{ loggedIn: boolean; demoMode: boolean } | null>(null);

  useEffect(() => {
    api<{ loggedIn: boolean; demoMode?: boolean }>('/api/auth/me')
      .then((r) => setAuth({ loggedIn: r.loggedIn, demoMode: Boolean(r.demoMode) }))
      .catch(() => setAuth({ loggedIn: false, demoMode: false }));
    const out = () => setAuth({ loggedIn: false, demoMode: false });
    window.addEventListener('kestrel:logout', out);
    return () => window.removeEventListener('kestrel:logout', out);
  }, []);

  if (auth === null) return <Splash />;
  if (share && !auth.demoMode) return <ShareView token={share[1]} />;

  const demoSiteId = 'kestrel-demo';
  const route = /^\/site\/([\w-]+)(?:\/(settings|realtime|audience|goals|content))?\/?$/.exec(path);
  if (auth.demoMode) {
    const demoPage = route?.[1] === demoSiteId ? route[2] : undefined;
    if (demoPage === 'realtime') return <Realtime siteId={demoSiteId} demoMode />;
    if (demoPage === 'audience') return <Audience siteId={demoSiteId} demoMode />;
    if (demoPage === 'goals') return <Goals siteId={demoSiteId} demoMode />;
    if (demoPage === 'content') return <Content siteId={demoSiteId} demoMode />;
    return <Overview siteId={demoSiteId} demoMode />;
  }

  if (!auth.loggedIn) return <Login onLogin={() => setAuth({ loggedIn: true, demoMode: false })} />;

  const site = route;
  if (site) {
    const [, siteId, page] = site;
    if (page === 'settings') return <Settings siteId={siteId} />;
    if (page === 'realtime') return <Realtime siteId={siteId} />;
    if (page === 'audience') return <Audience siteId={siteId} />;
    if (page === 'goals') return <Goals siteId={siteId} />;
    if (page === 'content') return <Content siteId={siteId} />;
    return <Overview siteId={siteId} />;
  }
  return <Sites />;
}
