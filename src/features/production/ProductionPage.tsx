import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listRecentProduction, type ProductionLogRow } from './api';

export function ProductionPage() {
  const [rows, setRows] = useState<ProductionLogRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listRecentProduction().then(setRows).catch((e: Error) => setError(e.message));
  }, []);

  return (
    <div>
      <header className="flex items-baseline justify-between">
        <h1 className="text-title text-ink-900">Production</h1>
        <Link
          to="/production/new"
          className="rounded-btn-sm bg-brand-orange px-3 py-2 text-body-sm font-semibold text-white"
        >
          + Log production
        </Link>
      </header>
      {error && <p className="mt-4 text-body-sm text-status-danger-fg">{error}</p>}
      <ul className="mt-4 space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="rounded-card bg-paper-elevated p-3 text-body-sm">
            <div className="text-ink-700">{r.made_on} · qty {r.qty}</div>
            <div className="font-mono text-ink-500">{r.product_id.slice(0, 8)}</div>
          </li>
        ))}
        {rows.length === 0 && !error && (
          <li className="text-body-sm text-ink-500">No production logs yet.</li>
        )}
      </ul>
    </div>
  );
}
