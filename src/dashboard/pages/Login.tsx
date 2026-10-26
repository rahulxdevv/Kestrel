import { useEffect, useState } from 'react';
import { LogoMark } from '../components/Logo';
import { api } from '../lib/api';

export function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    api<{ configured: boolean }>('/api/auth/me')
      .then((r) => setConfigured(r.configured))
      .catch(() => setConfigured(true));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/login', { method: 'POST', json: { password } });
      onLogin();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <div className="flex items-center justify-between px-5 py-4 sm:px-8">
        <a href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <LogoMark size={26} /> Kestrel
        </a>
        <a href="/" className="text-sm text-stone-500 hover:text-ink">
          ← Homepage
        </a>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 pb-20">
        <div className="w-full max-w-sm">
          <form onSubmit={submit} className="card p-8">
            <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
            <p className="mt-1 text-sm text-stone-500">Sign in to your Kestrel analytics.</p>

            <label className="label mt-6" htmlFor="pw">
              Password
            </label>
            <input
              id="pw"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              autoFocus
            />
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <button className="btn-dark mt-5 w-full" disabled={busy || !password}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {configured === false && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <b>ADMIN_PASSWORD is not set.</b> Add it to your environment (or <code>.env</code>) and restart Kestrel.
              On Docker: <code>-e ADMIN_PASSWORD=…</code>.
            </div>
          )}

          <p className="mt-5 text-center text-xs text-stone-400">
            Your data stays on this server. No third-party analytics, ever.
          </p>
        </div>
      </div>
    </div>
  );
}
