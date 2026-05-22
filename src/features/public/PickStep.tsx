import type { PublicProduct } from './api';

type Props = {
  products: PublicProduct[];
  qtys: Record<string, number>;
  setQtys: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  onContinue: () => void;
};

export function PickStep({ products, qtys, setQtys, onContinue }: Props) {
  const hasAny = Object.values(qtys).some((q) => q > 0);

  function setQty(productId: string, next: number) {
    setQtys((curr) => {
      const copy = { ...curr };
      if (next <= 0) {
        delete copy[productId];
      } else {
        copy[productId] = next;
      }
      return copy;
    });
  }

  if (products.length === 0) {
    return (
      <div className="py-8 text-center text-body text-ink-700">
        No items available right now.
      </div>
    );
  }

  return (
    <div>
      <p className="mb-4 text-body text-ink-700">
        Place your order — we&apos;ll be in touch to confirm.
      </p>
      <ul className="space-y-2">
        {products.map((p) => {
          const qty = qtys[p.id] ?? 0;
          return (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-card bg-paper-elevated p-3 shadow-card"
            >
              <div className="min-w-0 flex-1 pr-3">
                <p className="text-body font-semibold text-ink-900">
                  {p.name}{' '}
                  <span className="text-body-sm font-normal text-ink-500">
                    · {p.unit} · ₹{p.default_price}
                  </span>
                </p>
                {p.is_aggregated && p.source_maker_name && (
                  <p className="text-body-sm text-ink-500">by {p.source_maker_name}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={`Decrease ${p.name}`}
                  onClick={() => setQty(p.id, qty - 1)}
                  disabled={qty === 0}
                  className="flex h-11 w-11 items-center justify-center rounded-btn border border-ink-900/10 bg-paper-surface text-title text-ink-900 disabled:opacity-40"
                >
                  −
                </button>
                <span
                  className="min-w-[2ch] text-center text-body font-semibold tabular-nums text-ink-900"
                  aria-live="polite"
                >
                  {qty}
                </span>
                <button
                  type="button"
                  aria-label={`Increase ${p.name}`}
                  onClick={() => setQty(p.id, qty + 1)}
                  className="flex h-11 w-11 items-center justify-center rounded-btn border border-ink-900/10 bg-paper-surface text-title text-ink-900"
                >
                  +
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={onContinue}
        disabled={!hasAny}
        className="mt-6 h-12 w-full rounded-btn bg-brand-orange text-body font-semibold text-white disabled:opacity-40"
      >
        Continue →
      </button>
    </div>
  );
}
