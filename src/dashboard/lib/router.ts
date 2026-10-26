import { useEffect, useState } from 'react';

/** The dashboard lives under /app so the marketing homepage can own the root URL. */
export const BASE = '/app';

export function navigate(to: string) {
  const path = to.startsWith(BASE) || to.startsWith('/share') ? to : BASE + to;
  window.history.pushState(null, '', path);
  window.dispatchEvent(new Event('kestrel:navigate'));
}

/** Path inside the dashboard, e.g. `/site/abc/realtime`. */
export function usePath() {
  const read = () => window.location.pathname.replace(/^\/app(?=\/|$)/, '') || '/';
  const [path, setPath] = useState(read);
  useEffect(() => {
    const on = () => setPath(read());
    window.addEventListener('popstate', on);
    window.addEventListener('kestrel:navigate', on);
    return () => {
      window.removeEventListener('popstate', on);
      window.removeEventListener('kestrel:navigate', on);
    };
  }, []);
  return path;
}
