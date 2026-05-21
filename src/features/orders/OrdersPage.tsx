import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listOrders, type OrderRow } from './api';

export function OrdersPage() {
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listOrders().then(setRows).catch((e: Error) => setError(e.message));
  }, []);

  return (
    <div>
      <header className="flex items-baseline justify-between">
        <h1 className="text-title text-ink-900">Orders</h1>
        <Link
          to="/orders/new"
          className="rounded-btn-sm bg-brand-orange px-3 py-2 text-body-sm font-semibold text-white"
        >
          + Add order
        </Link>
      </header>
      {error && <p className="mt-4 text-body-sm text-status-danger-fg">{error}</p>}
      <ul className="mt-4 space-y-2">
        {rows.map((o) => (
          <li key={o.id} className="rounded-card bg-paper-elevated p-3 text-body-sm">
            <div className="font-mono text-ink-700">{o.id.slice(0, 8)}</div>
            <div className="text-ink-500">
              {o.ordered_at.slice(0, 10)} · {o.payment_status} · {o.fulfilled_at ? 'fulfilled' : 'pending'}
            </div>
          </li>
        ))}
        {rows.length === 0 && !error && (
          <li className="text-body-sm text-ink-500">No orders yet.</li>
        )}
      </ul>
    </div>
  );
}
