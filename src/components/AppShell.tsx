import type { ReactNode } from 'react';
import { BottomNav } from './BottomNav';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col bg-paper-surface">
      <main className="flex-1 px-edge pb-20 pt-6">{children}</main>
      <BottomNav />
    </div>
  );
}
