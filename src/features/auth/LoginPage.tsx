import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';

export function LoginPage() {
  const { session, signIn, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) return null;
  if (session) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: err } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (err) setError(err);
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-paper-surface px-edge py-8">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-card bg-paper-elevated p-6 shadow-card"
      >
        <h1 className="text-title text-ink-900">Crunchies</h1>
        <p className="mt-1 text-body text-ink-500">Sign in to continue.</p>

        <label className="mt-6 block">
          <span className="text-label uppercase text-ink-700">Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="mt-1 block h-11 input-shell"
          />
        </label>

        <label className="mt-4 block">
          <span className="text-label uppercase text-ink-700">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="mt-1 block h-11 input-shell"
          />
        </label>

        {error && (
          <p className="mt-3 text-body-sm text-status-danger-fg" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-6 h-[52px] w-full rounded-btn bg-brand-orange text-subtitle text-paper-elevated disabled:opacity-60"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
