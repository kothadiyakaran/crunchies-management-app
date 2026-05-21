import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listAllProducts, type ProductFullRow } from './api';

export function ProductsPage() {
  const [showArchived, setShowArchived] = useState(false);
  const [rows, setRows] = useState<ProductFullRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAllProducts(showArchived).then(setRows).catch((e: Error) => setError(e.message));
  }, [showArchived]);

  return (
    <div>
      <header className="flex items-baseline justify-between">
        <h1 className="text-title text-ink-900">Products</h1>
        <Link
          to="/products/new"
          className="rounded-btn-sm bg-brand-orange px-3 py-2 text-body-sm font-semibold text-white"
        >
          + Add product
        </Link>
      </header>

      <label className="mt-3 flex items-center gap-2 text-body-sm text-ink-700">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(e) => setShowArchived(e.target.checked)}
        />
        Show archived
      </label>

      {error && <p className="mt-4 text-body-sm text-status-danger-fg">{error}</p>}

      <ul className="mt-4 space-y-2">
        {rows.map((p) => (
          <li key={p.id}>
            <Link
              to={`/products/${p.id}`}
              className="block rounded-card bg-paper-elevated p-3"
            >
              <div className="flex items-baseline justify-between">
                <span className="text-body font-semibold text-ink-900">
                  {p.name} <span className="text-body-sm text-ink-500">({p.unit})</span>
                </span>
                <span className="text-body-sm text-ink-500">₹{p.default_price}</span>
              </div>
              <div className="mt-1 text-body-sm text-ink-500">
                {!p.active && <span className="mr-2 rounded-pill bg-quiet-bg px-2 py-0.5">archived</span>}
                {p.is_seasonal && <span className="mr-2 rounded-pill bg-paper-muted px-2 py-0.5">seasonal</span>}
                {p.is_aggregated && (
                  <span className="rounded-pill bg-paper-muted px-2 py-0.5">aggregated · {p.source_maker_name}</span>
                )}
              </div>
            </Link>
          </li>
        ))}
        {rows.length === 0 && !error && (
          <li className="text-body-sm text-ink-500">No products yet.</li>
        )}
      </ul>
    </div>
  );
}
