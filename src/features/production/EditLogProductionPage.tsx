import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { listActiveProducts, type ProductRow } from '@/features/products/api';
import {
  getProductionLog,
  updateProductionLog,
  deleteProductionLog,
} from './api';
import { todayInTz } from '@/lib/utils';

export function EditLogProductionPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('0');
  const [madeOn, setMadeOn] = useState(todayInTz());
  const [notes, setNotes] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [log, ps] = await Promise.all([getProductionLog(id), listActiveProducts()]);
        if (!log) {
          setError('Log not found.');
          setLoaded(true);
          return;
        }
        setProducts(ps);
        setProductId(log.product_id);
        setQty(String(log.qty));
        setMadeOn(log.made_on);
        setNotes(log.notes ?? '');
        setLoaded(true);
      } catch (e) {
        setError((e as Error).message);
        setLoaded(true);
      }
    })();
  }, [id]);

  const qtyNum = Number(qty);
  const canSubmit = loaded && Number.isFinite(qtyNum) && qtyNum > 0 && madeOn.length === 10 && !submitting;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await updateProductionLog(id, { qty: qtyNum, made_on: madeOn, notes: notes.trim() || null });
      navigate(-1);
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  async function onDelete() {
    if (!confirm('Delete this log entry? This cannot be undone.')) return;
    setSubmitting(true);
    setError(null);
    try {
      await deleteProductionLog(id);
      navigate(-1);
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  if (!loaded) return <p className="text-body-sm text-ink-500">Loading…</p>;
  if (error && !productId) return <p className="text-body-sm text-status-danger-fg">{error}</p>;

  const inputClass = 'mt-1 h-11 input-shell';
  const labelSpan = 'text-label uppercase text-ink-500';
  const product = products.find((p) => p.id === productId);

  return (
    <div>
      <h1 className="text-title text-ink-900">Edit production log</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div className="block">
          <span className={labelSpan}>Product</span>
          <p className="mt-1 text-body text-ink-900">{product?.name ?? '(unknown)'}</p>
        </div>

        <label className="block">
          <span className={labelSpan}>Quantity</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            className={inputClass}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </label>

        <label className="block">
          <span className={labelSpan}>Date</span>
          <input
            type="date"
            className={inputClass}
            value={madeOn}
            onChange={(e) => setMadeOn(e.target.value)}
          />
        </label>

        <label className="block">
          <span className={labelSpan}>Notes (optional)</span>
          <input
            className={inputClass}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
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

        <button
          type="button"
          onClick={onDelete}
          disabled={submitting}
          className="h-11 w-full rounded-btn-sm border border-ink-900/10 bg-paper-elevated text-body text-status-danger-fg"
        >
          Delete log entry
        </button>
      </form>
    </div>
  );
}
