import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createProduct, setSeedDemand } from './api';

export function AddProductPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [defaultPrice, setDefaultPrice] = useState('0');
  const [seed, setSeed] = useState('');
  const [isSeasonal, setIsSeasonal] = useState(false);
  const [isAggregated, setIsAggregated] = useState(false);
  const [sourceMaker, setSourceMaker] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const priceNum = Number(defaultPrice);
  const seedNum = seed === '' ? null : Number(seed);
  const seedValid = seedNum === null || (Number.isFinite(seedNum) && seedNum >= 0);
  const canSubmit =
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
      const id = await createProduct({
        name: name.trim(),
        unit: unit.trim(),
        default_price: priceNum,
        is_seasonal: isSeasonal,
        is_aggregated: isAggregated,
        source_maker_name: isAggregated ? sourceMaker.trim() : null,
      });
      if (seedNum !== null && seedNum > 0 && !isAggregated) {
        await setSeedDemand(id, seedNum);
      }
      navigate('/products');
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  const inputClass = 'mt-1 h-11 input-shell';
  const labelSpan = 'text-label uppercase text-ink-500';

  return (
    <div>
      <h1 className="text-title text-ink-900">Add product</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label className="block">
          <span className={labelSpan}>Name</span>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <label className="block">
          <span className={labelSpan}>Unit</span>
          <input
            className={inputClass}
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="e.g., 250g pack"
          />
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
            className={inputClass}
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="Roughly how much per week?"
          />
          <span className="mt-1 block text-body-sm text-ink-500">
            Optional. Used until 4 weeks of real orders accumulate.
          </span>
        </label>

        <label className="flex items-center gap-2 text-body text-ink-900">
          <input type="checkbox" checked={isSeasonal} onChange={(e) => setIsSeasonal(e.target.checked)} />
          Seasonal (excluded from rolling average)
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
          className="btn-primary"
        >
          {submitting ? 'Saving…' : 'Save'}
        </button>
      </form>
    </div>
  );
}
