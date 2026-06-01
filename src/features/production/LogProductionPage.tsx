import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { listActiveProducts, type ProductRow } from '@/features/products/api';
import { createProductionLog } from './api';

export function LogProductionPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefilledId = searchParams.get('product_id');
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('1');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listActiveProducts()
      .then((ps) => {
        setProducts(ps);
        if (prefilledId && ps.some((p) => p.id === prefilledId)) {
          setProductId(prefilledId);
        }
      })
      .catch((e: Error) => setError(e.message));
  }, [prefilledId]);

  const qtyNum = Number(qty);
  const canSubmit = !!productId && Number.isFinite(qtyNum) && qtyNum > 0 && !submitting;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await createProductionLog({ product_id: productId, qty: qtyNum });
      navigate('/production');
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1 className="text-title text-ink-900">Log production</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label className="block">
          <span className="text-label uppercase text-ink-500">Product</span>
          <select
            className="mt-1 h-11 input-shell"
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
            className="mt-1 h-11 input-shell"
          />
        </label>

        {error && <p className="text-body-sm text-status-danger-fg">{error}</p>}

        <button
          type="submit"
          disabled={!canSubmit}
          className="btn-primary"
        >
          {submitting ? 'Saving…' : 'Save'}
        </button>
      </form>
    </div>
  );
}
