import { useEffect, useState } from 'react';
import { api } from './api';

// Keep successful responses between dashboard sections. Navigating to another tab
// can render immediately from the last result while the request refreshes in place.
const responseCache = new Map<string, { data: unknown; at: number }>();
const inFlight = new Map<string, Promise<unknown>>();
const CACHE_FRESH_MS = 30_000;

function remember(url: string, data: unknown) {
  responseCache.delete(url);
  responseCache.set(url, { data, at: Date.now() });
  if (responseCache.size > 40) {
    const oldest = responseCache.keys().next().value;
    if (oldest) responseCache.delete(oldest);
  }
}

export function getCachedApiResponse<T>(url: string): T | null {
  return (responseCache.get(url)?.data as T | undefined) ?? null;
}

export function setCachedApiResponse<T>(url: string, data: T): void {
  remember(url, data);
}

/** Fetch `url` whenever it changes (or `reloadKey` bumps). `null` skips fetching. */
export function useApi<T>(url: string | null, reloadKey = 0) {
  const [data, setData] = useState<T | null>(() => (url ? (responseCache.get(url)?.data as T | undefined) ?? null : null));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!url) return;
    let alive = true;
    const cached = responseCache.get(url);
    if (cached && Date.now() - cached.at < CACHE_FRESH_MS && reloadKey === 0) {
      setData(cached.data as T);
      setLoading(false);
      return;
    }
    setLoading(!cached);
    setError(null);
    const request = (inFlight.get(url) as Promise<T> | undefined) ?? api<T>(url);
    inFlight.set(url, request);
    request
      .then((d) => {
        remember(url, d);
        if (alive) setData(d);
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => {
        if (inFlight.get(url) === request) inFlight.delete(url);
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [url, reloadKey]);

  return { data, error, loading, setData };
}
