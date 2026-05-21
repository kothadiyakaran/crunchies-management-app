import { useAuth } from '@/features/auth/AuthProvider';

export function TodayPage() {
  const { user, isAdmin, signOut } = useAuth();

  return (
    <div className="flex min-h-full flex-col bg-paper-surface px-edge py-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-title text-ink-900">Today</h1>
        <span className="text-label uppercase text-ink-500">
          {isAdmin ? 'Admin' : 'Signed in'}
        </span>
      </header>

      <section className="mt-6 rounded-card bg-paper-elevated p-edge shadow-card">
        <p className="text-body text-ink-700">
          Sprint 0 stub. The real Today screen ships in Sprint 1.
        </p>
        <p className="mt-2 text-body-sm text-ink-500">{user?.email}</p>
      </section>

      <div className="mt-auto pt-8">
        <button
          type="button"
          onClick={signOut}
          className="h-11 w-full rounded-btn-sm border border-ink-900/10 bg-paper-elevated text-body text-ink-900"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
