// Settings context — exposes the business identity row to all consumers.
// Sprint 9 T9.1. T9.2 wires <SettingsProvider /> into App.tsx; T9.3 swaps
// BUSINESS_INFO callers (BillPreviewModal / OrderConfirmationPage /
// PublicOrderFormPage) to read from useSettings() instead.
//
// Children render even while loading. Consumers must check `settings === null`
// themselves and either show a skeleton or fall back to a sensible default —
// blocking the whole tree on a one-off network call would degrade first paint
// across every authenticated route.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { getSettings, type BusinessInfo } from './api';

type SettingsContextValue = {
  settings: BusinessInfo | null;
  refresh: () => Promise<void>;
  loading: boolean;
  error: Error | null;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<BusinessInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await getSettings();
      setSettings(next);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <SettingsContext.Provider value={{ settings, refresh, loading, error }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings must be used inside <SettingsProvider />');
  }
  return ctx;
}
