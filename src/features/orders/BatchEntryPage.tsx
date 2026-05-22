import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CustomerSearchPicker } from './CustomerSearchPicker';
import { createOrderWithItems, type OrderItemInput, type OrderRow } from './api';
import { listActiveProducts, type ProductRow } from '@/features/products/api';
import { todayInTz } from '@/lib/utils';
import { formatINR } from './orderFormatters';

type SavedRow = {
  id: string;
  customer_name: string;
  total: number;
};

export function BatchEntryPage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [customer, setCustomer] = useState<{ id: string; name: string; phone: string | null } | null>(null);
  const [items, setItems] = useState<OrderItemInput[]>([]);
  const [paymentStatus, setPaymentStatus] = useState<OrderRow['payment_status']>('unpaid');
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState<SavedRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setProducts(await listActiveProducts());
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  function addItem(product_id: string) {
    const p = products.find((x) => x.id === product_id);
    if (!p) return;
    setItems((arr) => [...arr, { product_id, qty: 1, unit_price: p.default_price }]);
  }
  function setQty(idx: number, qty: number) {
    setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, qty } : it)));
  }
  function removeItem(idx: number) {
    setItems((arr) => arr.filter((_, i) => i !== idx));
  }

  async function onSaveAndNext() {
    if (!customer) { setError('Pick a customer.'); return; }
    if (items.length === 0) { setError('Add at least one item.'); return; }
    setSaving(true);
    setError(null);
    try {
      const id = await createOrderWithItems({
        customer_id: customer.id,
        source: 'whatsapp',
        target_fulfilment_date: todayInTz(),
        payment_status: paymentStatus,
        notes: notes.trim() || null,
        items,
      });
      const total = items.reduce((s, it) => s + it.qty * it.unit_price, 0);
      setSaved((arr) => [{ id, customer_name: customer.name, total }, ...arr]);
      // reset for next
      setCustomer(null);
      setItems([]);
      setPaymentStatus('unpaid');
      setNotes('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <header className="flex items-baseline justify-between">
        <h1 className="text-title text-ink-900">
          Batch entry — {saved.length} saved
        </h1>
        <button
          type="button"
          onClick={() => navigate('/orders')}
          className="text-body-sm text-ink-500 underline"
        >
          Done
        </button>
      </header>

      <section className="mt-4 space-y-4 rounded-card bg-paper-elevated p-4">
        <CustomerSearchPicker
          selected={customer}
          onSelect={(c) => setCustomer(c)}
        />

        <div>
          <label className="block text-body-sm text-ink-700">Add item</label>
          <select
            onChange={(e) => { if (e.target.value) { addItem(e.target.value); e.target.value = ''; } }}
            className="mt-1 h-11 w-full rounded-btn-sm border border-ink-900/10 bg-paper px-3 text-body text-ink-900"
            defaultValue=""
          >
            <option value="">Pick a product…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {items.length > 0 && (
            <ul className="mt-2 space-y-2">
              {items.map((it, idx) => {
                const p = products.find((x) => x.id === it.product_id);
                return (
                  <li key={idx} className="flex items-center gap-2">
                    <span className="flex-1 text-body text-ink-900">{p?.name ?? '?'}</span>
                    <input
                      type="number"
                      min={1}
                      value={it.qty}
                      onChange={(e) => setQty(idx, Number(e.target.value))}
                      className="h-9 w-16 rounded border border-ink-900/10 bg-paper px-2 text-right text-body text-ink-900"
                    />
                    <span className="w-20 text-right text-body-sm text-ink-500">
                      {formatINR(it.qty * it.unit_price)}
                    </span>
                    <button type="button" onClick={() => removeItem(idx)} className="text-body-sm text-status-danger-fg">
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          <label className="block text-body-sm text-ink-700">Payment</label>
          <div className="mt-1 flex gap-2">
            {(['unpaid', 'paid', 'partial'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setPaymentStatus(s)}
                className={`h-9 rounded-btn-sm border px-3 text-body-sm ${
                  paymentStatus === s
                    ? 'border-brand-orange bg-brand-orange text-white'
                    : 'border-ink-900/10 bg-paper text-ink-700'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-body-sm text-ink-700">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-btn-sm border border-ink-900/10 bg-paper px-3 py-2 text-body text-ink-900"
          />
        </div>

        {error && <p className="text-body-sm text-status-danger-fg">{error}</p>}

        <button
          type="button"
          onClick={onSaveAndNext}
          disabled={saving}
          className="h-11 w-full rounded-btn bg-brand-orange text-body font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save & next'}
        </button>
      </section>

      {saved.length > 0 && (
        <section className="mt-6">
          <h2 className="text-subtitle text-ink-900">Saved this batch</h2>
          <ul className="mt-2 space-y-2">
            {saved.map((s) => (
              <li key={s.id} className="rounded-card bg-paper-elevated p-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-body font-semibold text-ink-900">{s.customer_name}</span>
                  <span className="text-body-sm text-ink-700">{formatINR(s.total)}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
