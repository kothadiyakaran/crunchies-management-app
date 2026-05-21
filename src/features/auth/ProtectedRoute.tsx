import { Navigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import type { ReactNode } from 'react';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-paper-surface text-ink-500">
        Loading…
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;

  return <>{children}</>;
}
