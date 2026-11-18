import { useReminders } from './useReminders';

const WHAT =
  'At 10 am (Mon–Sat): orders due in the next two working days, a Monday reminder to plan the week, and a heads-up when an exhibition needs prep.';

export function RemindersCard({ headingClassName }: { headingClassName: string }) {
  const { state, busy, error, turnOn, turnOff } = useReminders();

  return (
    <section className="mt-8 border-t border-rule pt-6" aria-labelledby="reminders-heading">
      <h2 id="reminders-heading" className={headingClassName}>
        Reminders on this phone
      </h2>
      {state === null ? (
        <p className="mt-2 text-body-sm text-ink-500">Checking…</p>
      ) : state === 'unsupported' ? (
        <p className="mt-2 text-body-sm text-ink-500">
          This browser can’t show reminders. Open Crunchies from the app icon on your Android phone.
        </p>
      ) : state === 'blocked' ? (
        <p className="mt-2 text-body-sm text-ink-700">
          Notifications are blocked for Crunchies. To allow them: press and hold the Crunchies app icon → App info →
          Notifications → turn on. Then come back here.
        </p>
      ) : (
        <>
          <p className="mt-2 text-body-sm text-ink-700">
            {state === 'on' ? 'On. ' : ''}
            {WHAT}
          </p>
          {state === 'on' ? (
            <button
              type="button"
              onClick={turnOff}
              disabled={busy}
              className="mt-3 h-11 w-full rounded-btn border border-ink-900/10 bg-paper-elevated text-body text-ink-900 disabled:text-ink-3"
            >
              {busy ? 'Turning off…' : 'Turn off reminders'}
            </button>
          ) : (
            <button type="button" onClick={turnOn} disabled={busy} className="btn-primary mt-3 h-11 w-full">
              {busy ? 'Turning on…' : 'Turn on reminders'}
            </button>
          )}
        </>
      )}
      {error && <p className="mt-2 text-body-sm text-status-danger-fg">Couldn’t change reminders: {error}</p>}
    </section>
  );
}
