import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listActiveCustomers, type CustomerRow } from '@/features/customers/api';
import { listActiveProducts, type ProductRow } from '@/features/products/api';
import { createOrder } from '@/features/orders/api';

export function AddOrderPage() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('1');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listActiveCustomers(), listActiveProducts()])
      .then(([cs, ps]) => {
        setCustomers(cs);
        setProducts(ps);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const qtyNum = Number(qty);
  const canSubmit = !!customerId && !!productId && Number.isFinite(qtyNum) && qtyNum > 0 && !submitting;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await createOrder({ customer_id: customerId, product_id: productId, qty: qtyNum });
      navigate('/orders');
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1 className="text-title text-ink-900">Add order</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label className="block">
          <span className="text-label uppercase text-ink-500">Customer</span>
          <select
            className="mt-1 h-11 w-full rounded-input border border-ink-900/10 bg-paper-elevated px-3 text-body"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
          >
            <option value="">— Select —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-label uppercase text-ink-500">Product</span>
          <select
            className="mt-1 h-11 w-full rounded-input border border-ink-900/10 bg-paper-elevated px-3 text-body"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            <option value="">— Select —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-label uppercase text-ink-500">Quantity</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="mt-1 h-11 w-full rounded-input border border-ink-900/10 bg-paper-elevated px-3 text-body"
          />
        </label>

        {error && <p className="text-body-sm text-status-danger-fg">{error}</p>}

        <button
          type="submit"
          disabled={!canSubmit}
          className="h-11 w-full rounded-btn bg-brand-orange text-body font-semibold text-white disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save'}
        </button>
      </form>
    </div>
  );
}
