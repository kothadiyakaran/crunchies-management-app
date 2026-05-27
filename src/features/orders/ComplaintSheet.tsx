import { useId, useState } from 'react';
import {
  createComplaint,
  deleteComplaint,
  updateComplaint,
  type ComplaintKind,
  type ComplaintRow,
} from './complaintsApi';
import { useDialogA11y } from '@/lib/a11y';

type Props = {
  orderId: string;
  existing: ComplaintRow | null;
  onClose: () => void;
  onSaved: () => void;
};

const KINDS: { value: ComplaintKind; label: string }[] = [
  { value: 'quality', label: 'Quality' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'wrong_item', label: 'Wrong item' },
  { value: 'other', label: 'Other' },
];

export function ComplaintSheet({ orderId, existing, onClose, onSaved }: Props) {
  const [kind, setKind] = useState<ComplaintKind>(existing?.kind ?? 'quality');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [resolution, setResolution] = useState(existing?.resolution ?? '');
  const [resolved, setResolved] = useState(existing?.resolved_at !== null && existing?.resolved_at !== undefined);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const titleId = useId();
  const kindId = useId();
  const descId = useId();
  const resolutionId = useId();
  const { closeBtnRef } = useDialogA11y(onClose);

  async function onSave() {
    if (!description.trim()) {
      setError('Description is required.');
      return;
    }
    setSaving(true);
    try {
      if (existing) {
        await updateComplaint(existing.id, {
          resolution: resolution.trim() || null,
          resolved,
        });
      } else {
        await createComplaint({ order_id: orderId, kind, description: description.trim() });
      }
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!existing) return;
    if (!confirm('Delete this complaint?')) return;
    setSaving(true);
    try {
      await deleteComplaint(existing.id);
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-ink-900/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-paper-elevated p-4 shadow-xl"
      >
        <header className="flex items-baseline justify-between">
          <h2 id={titleId} className="text-subtitle text-ink-900">
            {existing ? 'Edit complaint' : 'Log complaint'}
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close complaint sheet"
            className="text-body-sm text-ink-500"
          >
            Close
          </button>
        </header>

        <label htmlFor={kindId} className="mt-4 block text-body-sm text-ink-700">Kind</label>
        <select
          id={kindId}
          value={kind}
          onChange={(e) => setKind(e.target.value as ComplaintKind)}
          disabled={!!existing}
          className="mt-1 h-11 w-full rounded-btn-sm border border-ink-900/10 bg-paper px-3 text-body text-ink-900 disabled:opacity-50"
        >
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>{k.label}</option>
          ))}
        </select>

        <label htmlFor={descId} className="mt-4 block text-body-sm text-ink-700">Description</label>
        <textarea
          id={descId}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={!!existing}
          rows={4}
          className="mt-1 w-full rounded-btn-sm border border-ink-900/10 bg-paper px-3 py-2 text-body text-ink-900 disabled:opacity-50"
        />

        {existing && (
          <>
            <label htmlFor={resolutionId} className="mt-4 block text-body-sm text-ink-700">Resolution</label>
            <textarea
              id={resolutionId}
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-btn-sm border border-ink-900/10 bg-paper px-3 py-2 text-body text-ink-900"
            />
            <label className="mt-3 flex items-center gap-2 text-body-sm text-ink-700">
              <input
                type="checkbox"
                checked={resolved}
                onChange={(e) => setResolved(e.target.checked)}
              />
              Resolved
            </label>
          </>
        )}

        {error && <p className="mt-3 text-body-sm text-status-danger-fg">{error}</p>}

        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="mt-4 h-11 w-full rounded-btn bg-brand-orange text-body font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {existing && (
          <button
            type="button"
            onClick={onDelete}
            disabled={saving}
            className="mt-2 h-11 w-full rounded-btn-sm border border-ink-900/10 bg-paper-elevated text-body text-status-danger-fg disabled:opacity-50"
          >
            Delete complaint
          </button>
        )}
      </div>
    </>
  );
}
