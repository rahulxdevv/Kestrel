import { createContext, useContext } from 'react';
import type { Overview, Query, Site } from './api';

export interface Dash {
  site: Site;
  q: Query;
  reloadKey: number;
  decimals: number;
  money: (minor: number, compact?: boolean) => string;
  addFilter: (key: string, value: string) => void;
  openVisitor: (visitorId: string) => void;
  /** API prefix: `/api/sites/<id>` for the app, `/api/public/<token>` for shared dashboards. */
  apiBase: string;
  /** Shared dashboards can't filter, open visitors or export identities. */
  readOnly: boolean;
  /** Public demo mode; GET-only APIs and no account or site management. */
  demoMode: boolean;
  refresh: () => void;
  /** Fetched once by the frame so every page shares one overview request. */
  overview: Overview | null;
  overviewLoading: boolean;
}

export const DashContext = createContext<Dash | null>(null);

export function useDash(): Dash {
  const d = useContext(DashContext);
  if (!d) throw new Error('useDash outside dashboard');
  return d;
}
