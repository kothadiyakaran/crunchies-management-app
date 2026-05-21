import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  archiveProduct,
  getProductById,
  getSeedDemand,
  setSeedDemand,
  updateProduct,
  type ProductFullRow,
} from './api';
import { getWeeksOfHistoryForProduct } from '@/features/production/api';

export function EditProductPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<ProductFullRow | null>(null);
  const [seed, setSeed] = useState('');
  const [seedReadOnly, setSeedReadOnly] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editable fields
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [defaultPrice, setDefaultPrice] = useState('0');
  const [isSeasonal, setIsSeasonal] = useState(false);
  const [isAggregated, setIsAggregated] = useState(false);
  const [sourceMaker, setSourceMaker] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const p = await getProductById(id);
        if (!p) {
          setError('Product not found.');
          return;
        }
        setProduct(p);
        setName(p.name);
        setUnit(p.unit);
        setDefaultPrice(String(p.default_price));
        setIsSeasonal(p.is_seasonal);
        setIsAggregated(p.is_aggregated);
        setSourceMaker(p.source_maker_name ?? '');
        const [s, weeks] = await Promise.all([
          getSeedDemand(id),
          getWeeksOfHistoryForProduct(id),
        ]);
        setSeed(s === null ? '' : String(s));
        // Per spec §11: once a product has ≥4 weeks of order history, its seed is
        // read-only ("No longer used — suggestions now use your actual order history.").
        setSeedReadOnly(weeks >= 4);
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }, [id]);

  const priceNum = Number(defaultPrice);
  const seedNum = seed === '' ? null : Number(seed);
  const seedValid = seedNum === null || (Number.isFinite(seedNum) && seedNum >= 0);
  const canSubmit =
    !!product &&
    name.trim().length > 0 &&
    unit.trim().length > 0 &&
    Number.isFinite(priceNum) &&
    priceNum >= 0 &&
    seedValid &&
    (!isAggregated || sourceMaker.trim().length > 0) &&
    !submitting;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await updateProduct(id, {
        name: name.trim(),
        unit: unit.trim(),
        default_price: priceNum,
        is_seasonal: isSeasonal,
        is_aggregated: isAggregated,
        source_maker_name: isAggregated ? sourceMaker.trim() : null,
      });
      if (!seedReadOnly && seedNum !== null && seedNum >= 0 && !isAggregated) {
        await setSeedDemand(id, seedNum);
      }
      navigate('/products');
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  async function onArchive() {
    if (!confirm('Archive this product? It will hide from all lists but history is preserved.')) return;
    setSubmitting(true);
    try {
      await archiveProduct(id);
      navigate('/products');
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  if (error && !product) {
    return <p className="text-body-sm text-status-danger-fg">{error}</p>;
  }
  if (!product) {
    return <p className="text-body-sm text-ink-500">Loading…</p>;
  }

  const inputClass = 'mt-1 h-11 w-full rounded-input border border-ink-900/10 bg-paper-elevated px-3 text-body';
  const labelSpan = 'text-label uppercase text-ink-500';

  return (
    <div>
      <h1 className="text-title text-ink-900">Edit product</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label className="block">
          <span className={labelSpan}>Name</span>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <label className="block">
          <span className={labelSpan}>Unit</span>
          <input className={inputClass} value={unit} onChange={(e) => setUnit(e.target.value)} />
        </label>

        <label className="block">
          <span className={labelSpan}>Default price (₹)</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            className={inputClass}
            value={defaultPrice}
            onChange={(e) => setDefaultPrice(e.target.value)}
          />
        </label>

        <label className="block">
          <span className={labelSpan}>Weekly average (your guess)</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            disabled={seedReadOnly}
            className={inputClass + (seedReadOnly ? ' opacity-50' : '')}
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
          />
          {seedReadOnly && (
            <span className="mt-1 block text-body-sm text-ink-500">
              No longer used — suggestions now use your actual order history.
            </span>
          )}
        </label>

        <label className="flex items-center gap-2 text-body text-ink-900">
          <input type="checkbox" checked={isSeasonal} onChange={(e) => setIsSeasonal(e.target.checked)} />
          Seasonal
        </label>

        <label className="flex items-center gap-2 text-body text-ink-900">
          <input
            type="checkbox"
            checked={isAggregated}
            onChange={(e) => {
              setIsAggregated(e.target.checked);
              if (!e.target.checked) setSourceMaker('');
            }}
          />
          From another maker (aggregated)
        </label>

        {isAggregated && (
          <label className="block">
            <span className={labelSpan}>Source maker name</span>
            <input className={inputClass} value={sourceMaker} onChange={(e) => setSourceMaker(e.target.value)} />
          </label>
        )}

        {error && <p className="text-body-sm text-status-danger-fg">{error}</p>}

        <button
          type="submit"
          disabled={!canSubmit}
          className="h-11 w-full rounded-btn bg-brand-orange text-body font-semibold text-white disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save'}
        </button>

        {product.active && (
          <button
            type="button"
            onClick={onArchive}
            className="h-11 w-full rounded-btn-sm border border-ink-900/10 bg-paper-elevated text-body text-ink-900"
          >
            Archive product
          </button>
        )}
      </form>
    </div>
  );
}
