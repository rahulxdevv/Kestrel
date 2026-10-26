import { useEffect, useState } from 'react';
import { api } from './api';

// Keep successful responses between dashboard sections. Navigating to another tab
// can render immediately from the last result while the request refreshes in place.
const responseCache = new Map<string, unknown>();

function remember(url: string, data: unknown) {
  responseCache.delete(url);
  responseCache.set(url, data);
  if (responseCache.size > 40) {
    const oldest = responseCache.keys().next().value;
    if (oldest) responseCache.delete(oldest);
  }
}

export function getCachedApiResponse<T>(url: string): T | null {
  return (responseCache.get(url) as T | undefined) ?? null;
}

export function setCachedApiResponse<T>(url: string, data: T): void {
  remember(url, data);
}

/** Fetch `url` whenever it changes (or `reloadKey` bumps). `null` skips fetching. */
export function useApi<T>(url: string | null, reloadKey = 0) {
  const [data, setData] = useState<T | null>(() => (url ? (responseCache.get(url) as T | undefined) ?? null : null));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!url) return;
    let alive = true;
    setLoading(!responseCache.has(url));
    setError(null);
    api<T>(url)
      .then((d) => {
        remember(url, d);
        if (alive) setData(d);
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [url, reloadKey]);

  return { data, error, loading, setData };
}
