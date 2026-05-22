import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  archiveCustomer,
  bumpLastContacted,
  deleteCustomer,
  getCustomerDetail,
  listOpenComplaintsForCustomer,
  listOrdersForCustomer,
  updateCustomer,
  type CustomerDetailRow,
} from './api';
import { formatINR, formatDayHeader } from '@/features/orders/orderFormatters';
import { todayInTz } from '@/lib/utils';

export function CustomerDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<CustomerDetailRow | null>(null);
  const [orders, setOrders] = useState<Awaited<ReturnType<typeof listOrdersForCustomer>>>([]);
  const [complaints, setComplaints] = useState<Awaited<ReturnType<typeof listOpenComplaintsForCustomer>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  async function load() {
    try {
      const [c, os, cs] = await Promise.all([
        getCustomerDetail(id),
        listOrdersForCustomer(id),
        listOpenComplaintsForCustomer(id),
      ]);
      if (!c) {
        setError('Customer not found.');
        return;
      }
      setCustomer(c);
      setNotesDraft(c.notes ?? '');
      setOrders(os);
      setComplaints(cs);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function onWhatsApp() {
    if (!customer?.phone) return;
    await bumpLastContacted(id);
    window.location.href = `https://wa.me/${customer.phone.replace(/\D/g, '')}`;
  }

  async function saveNotes() {
    setSavingNotes(true);
    try {
      await updateCustomer(id, { notes: notesDraft.trim() || null });
      setEditingNotes(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingNotes(false);
    }
  }

  async function onArchive() {
    if (!customer) return;
    if (!confirm(`Archive ${customer.name}? They'll be hidden from pickers but their order history stays.`)) return;
    try {
      await archiveCustomer(id);
      navigate('/customers');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function onDelete() {
    if (!customer) return;
    if (!confirm(`Delete ${customer.name}? This can't be undone.`)) return;
    try {
      await deleteCustomer(id);
      navigate('/customers');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (error && !customer) return <p className="text-body-sm text-status-danger-fg">{error}</p>;
  if (!customer) return <p className="text-body-sm text-ink-500">Loading…</p>;

  const today = todayInTz();
  const monthYear = new Date(customer.created_at).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div>
      <header>
        <h1 className="text-title text-ink-900">{customer.name}</h1>
        {customer.phone && (
          <p
            className="mt-1 cursor-pointer text-body-sm text-ink-500 underline"
            onClick={() => navigator.clipboard?.writeText(customer.phone!)}
            title="Tap to copy"
          >
            {customer.phone}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-baseline gap-2 text-body-sm">
          <span className="rounded-pill bg-paper-muted px-2 py-0.5 text-ink-700">{customer.channel_name}</span>
          {customer.size_tier && (
            <span className="rounded-pill bg-paper-muted px-2 py-0.5 text-ink-700">{customer.size_tier}</span>
          )}
          <span className="text-ink-500">Customer since {monthYear}</span>
        </div>
        {customer.source_event_name && (
          <p className="mt-1 text-body-sm text-ink-500">Met at: {customer.source_event_name}</p>
        )}
      </header>

      <section className="mt-4 rounded-card bg-paper-elevated p-3 text-body-sm text-ink-700">
        {customer.order_count} orders · {formatINR(customer.outstanding_total)} outstanding · last{' '}
        {customer.last_ordered_at ? formatDayHeader(customer.last_ordered_at.slice(0, 10), today) : 'never'}
      </section>

      <section className="mt-6 space-y-2">
        <Link
          to={`/orders/new`}
          className="block h-11 w-full rounded-btn bg-brand-orange text-center text-body font-semibold leading-[44px] text-white"
        >
          + Log new order
        </Link>
        {customer.phone && (
          <button
            type="button"
            onClick={onWhatsApp}
            className="h-11 w-full rounded-btn-sm border border-ink-900/10 bg-paper-elevated text-body text-ink-900"
          >
            Send WhatsApp
          </button>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-subtitle text-ink-900">Notes</h2>
        {!editingNotes ? (
          <button
            type="button"
            onClick={() => setEditingNotes(true)}
            className="mt-2 block w-full rounded-card bg-paper-elevated p-3 text-left text-body-sm text-ink-700"
          >
            {customer.notes || <span className="text-ink-500">Tap to add notes…</span>}
          </button>
        ) : (
          <div className="mt-2 space-y-2">
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              rows={4}
              className="w-full rounded-btn-sm border border-ink-900/10 bg-paper px-3 py-2 text-body text-ink-900"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditingNotes(false);
                  setNotesDraft(customer.notes ?? '');
                }}
                className="h-9 flex-1 rounded-btn-sm border border-ink-900/10 text-body-sm text-ink-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveNotes}
                disabled={savingNotes}
                className="h-9 flex-1 rounded-btn-sm bg-brand-orange text-body-sm font-semibold text-white disabled:opacity-50"
              >
                {savingNotes ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-subtitle text-ink-900">Order history</h2>
        <ul className="mt-2 space-y-2">
          {orders.map((o) => (
            <li key={o.id}>
              <Link to={`/orders/${o.id}`} className="block rounded-card bg-paper-elevated p-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-body-sm text-ink-700">{o.ordered_at.slice(0, 10)}</span>
                  <span className="text-body-sm text-ink-700">{formatINR(o.total)}</span>
                </div>
                <div className="mt-1 text-body-sm text-ink-500">
                  {o.item_summary || '(no items)'} · {o.fulfilled_at ? 'fulfilled' : 'pending'} · {o.payment_status}
                </div>
              </Link>
            </li>
          ))}
          {orders.length === 0 && <li className="text-body-sm text-ink-500">No orders yet.</li>}
        </ul>
      </section>

      {complaints.length > 0 && (
        <section className="mt-6">
          <h2 className="text-subtitle text-ink-900">Open complaints</h2>
          <ul className="mt-2 space-y-2">
            {complaints.map((c) => (
              <li key={c.id}>
                <Link to={`/orders/${c.order_id}`} className="block rounded-card bg-paper-elevated p-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-body-sm font-semibold text-ink-900">{c.kind.replace('_', ' ')}</span>
                    <span className="text-body-sm text-ink-500">{c.reported_at}</span>
                  </div>
                  <p className="mt-1 text-body-sm text-ink-700">{c.description}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8 space-y-2">
        <Link
          to={`/customers/${id}/edit`}
          className="block h-11 w-full rounded-btn-sm border border-ink-900/10 bg-paper-elevated text-center text-body leading-[44px] text-ink-900"
        >
          Edit profile
        </Link>
        <button
          type="button"
          onClick={onArchive}
          className="h-11 w-full rounded-btn-sm border border-ink-900/10 bg-paper-elevated text-body text-ink-900"
        >
          Archive customer
        </button>
        {customer.order_count === 0 && (
          <button
            type="button"
            onClick={onDelete}
            className="h-11 w-full rounded-btn-sm border border-ink-900/10 bg-paper-elevated text-body text-status-danger-fg"
          >
            Delete customer
          </button>
        )}
      </section>

      <p className="mt-6 text-body-sm text-ink-500">
        <Link to="/customers" className="underline">← Back to customers</Link>
      </p>
    </div>
  );
}
