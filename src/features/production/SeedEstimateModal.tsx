import { useState } from 'react';
import { setSeedDemand } from '@/features/products/api';

type Props = {
  productId: string;
  productName: string;
  unit: string;
  onClose: () => void;
  onSaved: () => void;
};

export function SeedEstimateModal({ productId, productName, unit, onClose, onSaved }: Props) {
  const [qty, setQty] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const num = Number(qty);
  const canSubmit = qty.length > 0 && Number.isFinite(num) && num >= 0 && !submitting;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await setSeedDemand(productId, num);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-ink-900/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-label={`Add a seed estimate for ${productName}`}
        className="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-paper-elevated p-5 shadow-2xl"
      >
        <h2 className="text-subtitle text-ink-900">Seed estimate</h2>
        <p className="mt-1 text-body-sm text-ink-500">
          {productName} — roughly how much per week?
        </p>

        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <label className="block">
            <span className="text-label uppercase text-ink-500">Weekly average ({unit})</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              autoFocus
              className="mt-1 h-11 w-full rounded-input border border-ink-900/10 bg-paper-elevated px-3 text-body"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </label>

          {error && <p className="text-body-sm text-status-danger-fg">{error}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="h-11 flex-1 rounded-btn-sm border border-ink-900/10 bg-paper-elevated text-body text-ink-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="h-11 flex-1 rounded-btn bg-brand-orange text-body font-semibold text-white disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
