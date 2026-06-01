import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  deleteOrder,
  getOrderDetail,
  markFulfilled,
  markPaid,
  revertFulfilled,
  revertPaid,
  type OrderDetailRow,
} from './api';
import { formatINR } from './orderFormatters';
import { BillPreviewModal } from './BillPreviewModal';
import { ComplaintSheet } from './ComplaintSheet';
import { listComplaintsForOrder, type ComplaintRow } from './complaintsApi';

export function OrderDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<OrderDetailRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  const [complaints, setComplaints] = useState<ComplaintRow[]>([]);
  const [complaintSheet, setComplaintSheet] = useState<{ existing: ComplaintRow | null } | null>(null);

  async function load() {
    try {
      const o = await getOrderDetail(id);
      if (!o) {
        setError('Order not found.');
        return;
      }
      setOrder(o);
      setComplaints(await listComplaintsForOrder(id));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function onMarkFulfilled() {
    setWorking(true);
    try {
      await markFulfilled(id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }
  async function onMarkPaid() {
    setWorking(true);
    try {
      await markPaid(id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }
  async function onRevertFulfilled() {
    if (!confirm('Mark this order as not fulfilled?')) return;
    setWorking(true);
    try {
      await revertFulfilled(id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }
  async function onRevertPaid() {
    if (!confirm('Mark this order as unpaid?')) return;
    setWorking(true);
    try {
      await revertPaid(id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }
  async function onDelete() {
    if (!confirm("Delete this order? This can't be undone.")) return;
    setWorking(true);
    try {
      await deleteOrder(id);
      navigate('/orders');
    } catch (e) {
      setError((e as Error).message);
      setWorking(false);
    }
  }

  if (error && !order) return <p className="text-body-sm text-status-danger-fg">{error}</p>;
  if (!order) return <p className="text-body-sm text-ink-500">Loading…</p>;

  const fulfilled = order.fulfilled_at !== null;
  const paid = order.payment_status === 'paid';

  return (
    <div>
      <header>
        <h1 className="text-title text-ink-900">{order.customer_name}</h1>
        {order.customer_phone && (
          <p className="mt-1 text-body-sm text-ink-500">{order.customer_phone}</p>
        )}
        <div className="mt-2 flex flex-wrap gap-2 text-body-sm">
          <span className="rounded-pill bg-paper-muted px-2 py-0.5 text-ink-700">
            {order.source}
          </span>
          <span
            className={`rounded-pill px-2 py-0.5 ${fulfilled ? 'bg-status-ok-bg' : 'bg-status-warn-bg'} text-ink-700`}
          >
            {fulfilled ? 'Fulfilled' : 'Pending'}
          </span>
          <span
            className={`rounded-pill px-2 py-0.5 ${paid ? 'bg-status-ok-bg' : 'bg-status-warn-bg'} text-ink-700`}
          >
            {order.payment_status}
          </span>
        </div>
      </header>

      <section className="mt-6 space-y-1 text-body-sm text-ink-700">
        <p>Ordered {order.ordered_at.slice(0, 10)}</p>
        {order.target_fulfilment_date && <p>Due by {order.target_fulfilment_date}</p>}
        {order.fulfilled_at && <p>Fulfilled on {order.fulfilled_at.slice(0, 10)}</p>}
      </section>

      <section className="mt-6">
        <h2 className="text-subtitle text-ink-900">Items</h2>
        <ul className="mt-2 space-y-1 text-body-sm">
          {order.items.map((it) => (
            <li key={it.id} className="flex justify-between">
              <span className="text-ink-900">
                {it.product_name} × {it.qty}
              </span>
              <span className="text-ink-700">{formatINR(it.line_total)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 border-t border-rule pt-2">
          {order.discount_percent > 0 ? (
            <>
              <div className="flex justify-between text-small text-ink-2">
                <span>Subtotal</span>
                <span>{formatINR(order.subtotal)}</span>
              </div>
              <div className="flex justify-between text-small text-ink-2">
                <span>Discount ({order.discount_percent}%)</span>
                <span>−{formatINR(order.discount)}</span>
              </div>
              <div className="mt-2 flex items-baseline justify-between border-t border-rule pt-2">
                <span className="text-amount text-ink">Total</span>
                <span className="text-amount text-ink">{formatINR(order.total)}</span>
              </div>
            </>
          ) : (
            <div className="flex items-baseline justify-between">
              <span className="text-amount text-ink">Total</span>
              <span className="text-amount text-ink">{formatINR(order.total)}</span>
            </div>
          )}
        </div>
      </section>

      {order.notes && (
        <section className="mt-6">
          <h2 className="text-subtitle text-ink-900">Notes</h2>
          <p className="mt-2 whitespace-pre-wrap text-body-sm text-ink-700">{order.notes}</p>
        </section>
      )}

      {error && <p className="mt-4 text-body-sm text-status-danger-fg">{error}</p>}

      {complaints.length > 0 && (
        <section className="mt-6">
          <h2 className="text-subtitle text-ink-900">Complaints</h2>
          <ul className="mt-2 space-y-2">
            {complaints.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setComplaintSheet({ existing: c })}
                  className="block w-full rounded-card bg-paper-elevated p-3 text-left"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-body font-semibold text-ink-900">{c.kind.replace('_', ' ')}</span>
                    <span className="text-body-sm text-ink-500">
                      {c.reported_at}{c.resolved_at ? ' · resolved' : ' · open'}
                    </span>
                  </div>
                  <p className="mt-1 text-body-sm text-ink-700">{c.description}</p>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8 space-y-2">
        {fulfilled ? (
          <button
            type="button"
            onClick={onRevertFulfilled}
            disabled={working}
            className="h-11 w-full rounded-btn-sm border border-ink-900/10 bg-paper-elevated text-body text-ink-900"
          >
            Mark as not fulfilled
          </button>
        ) : (
          <button
            type="button"
            onClick={onMarkFulfilled}
            disabled={working}
            className="h-11 w-full rounded-btn bg-brand-orange text-body font-semibold text-white disabled:opacity-50"
          >
            Mark fulfilled
          </button>
        )}
        {paid ? (
          <button
            type="button"
            onClick={onRevertPaid}
            disabled={working}
            className="h-11 w-full rounded-btn-sm border border-ink-900/10 bg-paper-elevated text-body text-ink-900"
          >
            Mark as unpaid
          </button>
        ) : (
          <button
            type="button"
            onClick={onMarkPaid}
            disabled={working}
            className="h-11 w-full rounded-btn bg-brand-orange text-body font-semibold text-white disabled:opacity-50"
          >
            Mark paid
          </button>
        )}
        <button
          type="button"
          onClick={() => setBillOpen(true)}
          className="h-11 w-full rounded-btn-sm border border-ink-900/10 bg-paper-elevated text-body text-ink-900"
        >
          Generate bill{order.bill_number ? ` (#${order.bill_number})` : ''}
        </button>
        <button
          type="button"
          onClick={() => setComplaintSheet({ existing: null })}
          className="h-11 w-full rounded-btn-sm border border-ink-900/10 bg-paper-elevated text-body text-ink-900"
        >
          Log complaint
        </button>
        <Link
          to={`/orders/${id}/edit`}
          className="block h-11 w-full rounded-btn-sm border border-ink-900/10 bg-paper-elevated text-body text-ink-900 text-center leading-[44px]"
        >
          Edit order
        </Link>
      </section>

      <div className="mt-6 border-t border-rule pt-6">
        <button
          type="button"
          onClick={onDelete}
          disabled={working}
          className="h-11 w-full text-body text-danger disabled:opacity-50"
        >
          Delete order
        </button>
      </div>

      <p className="mt-6 text-body-sm text-ink-500">
        <Link to="/orders" className="underline">
          ← Back to orders
        </Link>
      </p>
      {billOpen && (
        <BillPreviewModal
          order={order}
          onClose={() => setBillOpen(false)}
          onAllocated={() => load()}
        />
      )}
      {complaintSheet && (
        <ComplaintSheet
          orderId={id}
          existing={complaintSheet.existing}
          onClose={() => setComplaintSheet(null)}
          onSaved={() => load()}
        />
      )}
    </div>
  );
}
