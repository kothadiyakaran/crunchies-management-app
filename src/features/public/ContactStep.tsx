import type { PublicProduct } from './api';
import { isValidIndianMobile } from './phoneValidation';

type Props = {
  products: PublicProduct[];
  qtys: Record<string, number>;
  name: string;
  setName: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  onBack: () => void;
  onContinue: () => void;
};

export function ContactStep({
  products,
  qtys,
  name,
  setName,
  phone,
  setPhone,
  notes,
  setNotes,
  onBack,
  onContinue,
}: Props) {
  const itemCount = Object.values(qtys).filter((q) => q > 0).length;
  const total = products.reduce((sum, p) => {
    const q = qtys[p.id] ?? 0;
    return sum + q * p.default_price;
  }, 0);

  const phoneValid = isValidIndianMobile(phone);
  const showPhoneError = phone.length > 0 && !phoneValid;
  const canContinue = name.trim().length > 0 && phoneValid;

  return (
    <div>
      <div className="mb-4 rounded-card bg-paper-elevated p-3 shadow-card">
        <p className="text-label uppercase text-ink-500">Your order</p>
        <p className="mt-1 text-body text-ink-900">
          {itemCount} item{itemCount === 1 ? '' : 's'} ·{' '}
          <span className="font-semibold tabular-nums">₹{total.toFixed(2)}</span>
        </p>
      </div>

      <label className="block">
        <span className="text-label uppercase text-ink-500">Name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          required
          className="mt-1 h-11 input-shell"
        />
      </label>

      <label className="mt-4 block">
        <span className="text-label uppercase text-ink-500">Phone</span>
        <input
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          placeholder="10-digit mobile"
          aria-invalid={showPhoneError}
          className={`mt-1 h-11 w-full rounded-input border bg-paper-elevated px-3 text-body ${
            showPhoneError ? 'border-status-danger-fg' : 'border-ink-900/10'
          }`}
        />
        {showPhoneError && (
          <span className="mt-1 block text-body-sm text-status-danger-fg">
            Please enter a 10-digit Indian mobile number.
          </span>
        )}
      </label>

      <label className="mt-4 block">
        <span className="text-label uppercase text-ink-500">Notes (optional)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything we should know? (delivery preference, etc.)"
          rows={3}
          className="input-shell mt-1 py-2"
        />
      </label>

      <p className="mt-4 text-body-sm text-ink-500">
        We&apos;ll use your name and phone number only to confirm and deliver this order. We
        don&apos;t share your details.
      </p>

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="h-12 flex-1 rounded-btn border border-ink-900/10 bg-paper-elevated text-body font-semibold text-ink-900"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={onContinue}
          disabled={!canContinue}
          className="h-12 flex-[2] rounded-btn bg-brand-orange text-body font-semibold text-white disabled:opacity-40"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}
