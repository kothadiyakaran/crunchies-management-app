import { useEffect, type ReactNode } from 'react';
import { BottomNav } from './BottomNav';
import { SettingsProvider } from '@/features/settings/SettingsContext';
import { refreshSubscription } from '@/features/reminders/pushClient';

export function AppShell({ children }: { children: ReactNode }) {
  useEffect(() => {
    refreshSubscription().catch(() => undefined);
  }, []);

  return (
    <SettingsProvider>
      <div className="flex min-h-full flex-col bg-paper-surface">
        <main className="flex-1 px-edge pb-20 pt-6">{children}</main>
        <BottomNav />
      </div>
    </SettingsProvider>
  );
}
