import { useState } from 'react';
import { useReminders } from './useReminders';

const DISMISS_KEY = 'crunchies.remindersNudgeDismissed';

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function RemindersNudge() {
  const { state, busy, error, turnOn } = useReminders();
  const [dismissed, setDismissed] = useState(readDismissed);

  if (dismissed || state !== 'off') return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // private mode: the card just comes back next time
    }
    setDismissed(true);
  };

  return (
    <section className="mt-4 rounded-card bg-paper-elevated p-3" aria-labelledby="reminders-nudge-heading">
      <h2 id="reminders-nudge-heading" className="text-body font-semibold text-ink-900">
        Get order reminders
      </h2>
      <p className="mt-1 text-body-sm text-ink-700">
        A 10 am reminder (Mon–Sat) of orders due in the next two working days, so you can prep in time.
      </p>
      {error && <p className="mt-1 text-body-sm text-status-danger-fg">Couldn’t turn on: {error}</p>}
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={turnOn} disabled={busy} className="btn-primary h-10 flex-1">
          {busy ? 'Turning on…' : 'Turn on'}
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="h-10 flex-1 rounded-btn border border-ink-900/10 bg-paper-elevated text-body text-ink-900"
        >
          Not now
        </button>
      </div>
    </section>
  );
}
