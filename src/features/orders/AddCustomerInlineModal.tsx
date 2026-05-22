import { useState } from 'react';
import { createCustomerQuick } from '@/features/customers/api';
import { ChannelChipPicker } from '@/features/customers/ChannelChipPicker';

type Props = {
  onClose: () => void;
  onCreated: (customer: { id: string; name: string }) => void;
};

export function AddCustomerInlineModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [channelId, setChannelId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && channelId.length > 0 && !submitting;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const id = await createCustomerQuick({
        name: name.trim(),
        phone: phone.trim() || null,
        channel_id: channelId,
      });
      onCreated({ id, name: name.trim() });
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  const inputClass = 'mt-1 h-11 w-full rounded-input border border-ink-900/10 bg-paper-elevated px-3 text-body';
  const labelSpan = 'text-label uppercase text-ink-500';

  return (
    <>
      <div className="fixed inset-0 z-40 bg-ink-900/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-label="Add new customer"
        className="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-paper-elevated p-5 shadow-2xl"
      >
        <h2 className="text-subtitle text-ink-900">New customer</h2>
        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <label className="block">
            <span className={labelSpan}>Name</span>
            <input
              className={inputClass}
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block">
            <span className={labelSpan}>Phone (optional)</span>
            <input
              className={inputClass}
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
          <div>
            <span className={labelSpan}>Channel</span>
            <div className="mt-1">
              <ChannelChipPicker value={channelId || null} onChange={setChannelId} />
            </div>
          </div>

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
              {submitting ? 'Saving…' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
