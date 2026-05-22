import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChannelChipPicker } from './ChannelChipPicker';
import {
  createCustomerFull,
  findCustomerByPhone,
  getCustomerDetail,
  listChannels,
  updateCustomer,
} from './api';

const SIZES: { value: 'small' | 'large' | null; label: string }[] = [
  { value: null, label: '—' },
  { value: 'small', label: 'Small' },
  { value: 'large', label: 'Large' },
];

export function AddCustomerPage({ editingCustomerId }: { editingCustomerId?: string } = {}) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [channelId, setChannelId] = useState<string | null>(null);
  const [channelName, setChannelName] = useState<string>('');
  const [sizeTier, setSizeTier] = useState<'small' | 'large' | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dupExisting, setDupExisting] = useState<{ id: string; name: string; active: boolean } | null>(null);

  // Resolve channel name from id for phone-required-by-channel logic
  useEffect(() => {
    if (!channelId) { setChannelName(''); return; }
    listChannels().then((cs) => setChannelName(cs.find((c) => c.id === channelId)?.name ?? ''));
  }, [channelId]);

  // Hydrate in edit mode
  useEffect(() => {
    if (!editingCustomerId) return;
    (async () => {
      try {
        const c = await getCustomerDetail(editingCustomerId);
        if (!c) { setError('Customer not found.'); return; }
        setName(c.name);
        setPhone(c.phone ?? '');
        setChannelId(c.channel_id);
        setSizeTier(c.size_tier);
        setNotes(c.notes ?? '');
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [editingCustomerId]);

  const channelLower = channelName.trim().toLowerCase();
  const phoneRequired = channelLower !== 'exhibition'; // spec §8 "phone optional for exhibition only"
  const phoneOk = !phoneRequired || phone.trim().length > 0;
  const canSubmit = name.trim().length > 0 && channelId !== null && phoneOk && !submitting;

  async function persist(skipDupCheck = false): Promise<void> {
    const trimmedPhone = phone.trim() || null;

    if (!skipDupCheck && trimmedPhone && !editingCustomerId) {
      const existing = await findCustomerByPhone(trimmedPhone);
      if (existing) {
        setDupExisting(existing);
        setSubmitting(false);
        return;
      }
    }

    if (editingCustomerId) {
      await updateCustomer(editingCustomerId, {
        name: name.trim(),
        phone: trimmedPhone,
        channel_id: channelId!,
        size_tier: sizeTier,
        notes: notes.trim() || null,
      });
      navigate(`/customers/${editingCustomerId}`);
    } else {
      const id = await createCustomerFull({
        name: name.trim(),
        phone: trimmedPhone,
        channel_id: channelId!,
        size_tier: sizeTier,
        source_event_id: null, // Sprint 7 wires the events dropdown
        notes: notes.trim() || null,
      });
      navigate(`/customers/${id}`);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await persist(false);
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  async function onUseExisting() {
    if (!dupExisting) return;
    const id = dupExisting.id;
    setDupExisting(null);
    // Reactivate if archived — see §10 exhibition-form behaviour + ADR-26.
    if (!dupExisting.active) {
      try {
        await updateCustomer(id, { active: true });
      } catch (e) {
        setError((e as Error).message);
        return;
      }
    }
    navigate(`/customers/${id}`);
  }

  async function onSaveAsNew() {
    setDupExisting(null);
    setSubmitting(true);
    setError(null);
    try {
      await persist(true);
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  const inputClass = 'mt-1 h-11 w-full rounded-input border border-ink-900/10 bg-paper-elevated px-3 text-body';
  const labelSpan = 'text-label uppercase text-ink-500';

  return (
    <div>
      <h1 className="text-title text-ink-900">{editingCustomerId ? 'Edit customer' : 'Add customer'}</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
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
          <span className={labelSpan}>Phone {phoneRequired ? '' : '(optional)'}</span>
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
            <ChannelChipPicker value={channelId} onChange={setChannelId} />
          </div>
        </div>

        <div>
          <span className={labelSpan}>Size tier (optional)</span>
          <div className="mt-1 flex gap-2">
            {SIZES.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => setSizeTier(s.value)}
                className={`h-9 rounded-pill border px-3 text-body-sm ${
                  sizeTier === s.value
                    ? 'border-brand-orange bg-brand-orange text-white'
                    : 'border-ink-900/20 bg-paper text-ink-900'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className={labelSpan}>Notes (optional)</span>
          <textarea
            className="mt-1 w-full rounded-input border border-ink-900/10 bg-paper-elevated px-3 py-2 text-body"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        {error && <p className="text-body-sm text-status-danger-fg">{error}</p>}

        <button
          type="submit"
          disabled={!canSubmit}
          className="h-11 w-full rounded-btn bg-brand-orange text-body font-semibold text-white disabled:opacity-50"
        >
          {submitting ? 'Saving…' : editingCustomerId ? 'Save changes' : 'Save customer'}
        </button>

        <p className="text-body-sm text-ink-500">
          <Link to="/customers" className="underline">← Back to customers</Link>
        </p>
      </form>

      {dupExisting && (
        <>
          <div className="fixed inset-0 z-40 bg-ink-900/40" onClick={() => setDupExisting(null)} />
          <div
            role="dialog"
            className="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-paper-elevated p-5 shadow-2xl"
          >
            <h2 className="text-subtitle text-ink-900">{dupExisting.name} already exists</h2>
            <p className="mt-2 text-body text-ink-700">
              A customer with this phone number is already in the directory.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={onUseExisting}
                className="h-11 flex-1 rounded-btn bg-brand-orange text-body font-semibold text-white"
              >
                Use existing
              </button>
              <button
                type="button"
                onClick={onSaveAsNew}
                className="h-11 flex-1 rounded-btn-sm border border-ink-900/10 bg-paper-elevated text-body text-ink-900"
              >
                Save as new
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
