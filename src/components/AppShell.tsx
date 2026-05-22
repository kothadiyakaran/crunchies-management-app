import type { ReactNode } from 'react';
import { BottomNav } from './BottomNav';
import { SettingsProvider } from '@/features/settings/SettingsContext';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SettingsProvider>
      <div className="flex min-h-full flex-col bg-paper-surface">
        <main className="flex-1 px-edge pb-20 pt-6">{children}</main>
        <BottomNav />
      </div>
    </SettingsProvider>
  );
}
