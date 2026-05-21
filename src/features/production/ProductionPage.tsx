import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getProductionThisWeek, type ProductionWeekRow } from './api';

export function ProductionPage() {
  const [rows, setRows] = useState<ProductionWeekRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProductionThisWeek()
      .then((r) => { setRows(r); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, []);

  return (
    <div>
      <header className="flex items-baseline justify-between">
        <h1 className="text-title text-ink-900">Production</h1>
        <Link to="/products" className="text-body-sm text-ink-500 underline">
          Manage products →
        </Link>
      </header>

      {error && <p className="mt-4 text-body-sm text-status-danger-fg">{error}</p>}

      <section className="mt-6">
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.product_id}>
              <Link
                to={`/production/new?product_id=${r.product_id}`}
                className="block rounded-card bg-paper-elevated p-3"
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-body font-semibold text-ink-900">{r.name}</span>
                  <span className="text-body-sm text-ink-500">{r.unit}</span>
                </div>
                <div className="mt-1 grid grid-cols-3 gap-2 text-body-sm">
                  <span className="text-ink-500">
                    Plan: <span className="text-ink-900">—</span>
                  </span>
                  <span className="text-ink-500">
                    Suggested: <span className="text-ink-900">{r.suggested}</span>
                  </span>
                  <span className="text-ink-500">
                    Made: <span className="text-ink-900">{r.produced_qty}</span>
                  </span>
                </div>
              </Link>
            </li>
          ))}
          {!loading && rows.length === 0 && !error && (
            <li className="text-body-sm text-ink-500">
              No products yet. <Link to="/products/new" className="underline">Add your first product →</Link>
            </li>
          )}
        </ul>
      </section>

      <div className="mt-6">
        <Link
          to="/production/new"
          className="block h-11 w-full rounded-btn bg-brand-orange text-center text-body font-semibold leading-[2.75rem] text-white"
        >
          + Log production
        </Link>
      </div>
    </div>
  );
}
