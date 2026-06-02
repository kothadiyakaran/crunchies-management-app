import type { PublicEvent, PublicProduct } from './api';

type Props = {
  event: PublicEvent;
  products: PublicProduct[];
  qtys: Record<string, number>;
  name: string;
  phone: string;
  notes: string;
  error: string | null;
  submitting: boolean;
  onBack: () => void;
  onPlace: () => void;
};

export function ConfirmStep({
  event,
  products,
  qtys,
  name,
  phone,
  notes,
  error,
  submitting,
  onBack,
  onPlace,
}: Props) {
  const lineItems = products
    .map((p) => {
      const qty = qtys[p.id] ?? 0;
      return { product: p, qty };
    })
    .filter((li) => li.qty > 0);

  const total = lineItems.reduce((s, li) => s + li.qty * li.product.default_price, 0);

  return (
    <div>
      <section className="rounded-card bg-paper-elevated p-3 shadow-card">
        <h2 className="text-label uppercase text-ink-500">Order summary</h2>
        <ul className="mt-2 divide-y divide-ink-900/10">
          {lineItems.map((li) => (
            <li key={li.product.id} className="flex justify-between py-2 text-body">
              <span>
                {li.qty} × {li.product.name}{' '}
                <span className="text-body-sm text-ink-500">({li.product.unit})</span>
              </span>
              <span className="tabular-nums">
                ₹{(li.qty * li.product.default_price).toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex justify-between border-t border-ink-900/10 pt-2 text-body font-semibold">
          <span>Total</span>
          <span className="tabular-nums">₹{total.toFixed(2)}</span>
        </div>
      </section>

      <section className="mt-4 rounded-card bg-paper-elevated p-3 shadow-card">
        <h2 className="text-label uppercase text-ink-500">Picking up at</h2>
        <p className="mt-1 text-body text-ink-900">{event.name}</p>
        <p className="text-body-sm text-ink-700">
          {event.starts_on} – {event.ends_on}
        </p>
        {event.pickup_window_start && event.pickup_window_end && (
          <p className="text-body-sm text-ink-700">
            Pickup: {event.pickup_window_start} – {event.pickup_window_end}
          </p>
        )}
        {event.venue_line && <p className="text-body-sm text-ink-700">{event.venue_line}</p>}
      </section>

      <section className="mt-4 rounded-card bg-paper-elevated p-3 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-label uppercase text-ink-500">Contact</h2>
            <p className="mt-1 text-body text-ink-900">{name}</p>
            <p className="text-body-sm text-ink-700">{phone}</p>
            {notes.trim().length > 0 && (
              <p className="mt-1 text-body-sm text-ink-700">Notes: {notes}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onBack}
            className="text-body-sm text-brand-orange underline"
          >
            tap to edit
          </button>
        </div>
      </section>

      {error && (
        <p className="mt-4 rounded-card bg-status-warn-bg p-3 text-body-sm text-status-danger-fg">
          {error}
        </p>
      )}

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="h-12 flex-1 rounded-btn border border-ink-900/10 bg-paper-elevated text-body font-semibold text-ink-900 disabled:opacity-40"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={onPlace}
          disabled={submitting}
          className="h-12 flex-[2] rounded-btn bg-brand-orange text-body font-semibold text-white disabled:bg-brand-soft disabled:text-brown"
        >
          {submitting ? 'Placing…' : 'Place order'}
        </button>
      </div>
    </div>
  );
}
