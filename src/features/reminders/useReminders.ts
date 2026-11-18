import { useCallback, useEffect, useState } from 'react';
import { disableReminders, enableReminders, getReminderState, type ReminderState } from './pushClient';

export function useReminders() {
  const [state, setState] = useState<ReminderState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getReminderState()
      .then((s) => alive && setState(s))
      .catch(() => alive && setState('unsupported'));
    return () => {
      alive = false;
    };
  }, []);

  const run = useCallback(async (fn: () => Promise<ReminderState>) => {
    setBusy(true);
    setError(null);
    try {
      setState(await fn());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    state,
    busy,
    error,
    turnOn: () => run(enableReminders),
    turnOff: () =>
      run(async () => {
        await disableReminders();
        return 'off';
      }),
  };
}
