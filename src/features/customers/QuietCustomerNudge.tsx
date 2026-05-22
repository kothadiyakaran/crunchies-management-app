import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  bumpLastContacted,
  listQuietCustomers,
  type CustomerListItem,
} from './api';

export function QuietCustomerNudge() {
  const [rows, setRows] = useState<CustomerListItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setRows(await listQuietCustomers(3));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => { load(); }, []);

  async function dismiss(id: string) {
    await bumpLastContacted(id);
    // Optimistic: drop the row locally; next mount/load would re-fetch
    setRows((arr) => arr.filter((r) => r.id !== id));
  }

  if (error) return <p className="mt-6 text-body-sm text-status-danger-fg">{error}</p>;
  if (rows.length === 0) return null;

  return (
    <section className="mt-6">
      <h2 className="text-subtitle text-ink-900">Quiet customers</h2>
      <ul className="mt-2 space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-2 rounded-card bg-paper-elevated p-3">
            <Link to={`/customers/${r.id}`} className="flex-1">
              <div className="text-body font-semibold text-ink-900">{r.name}</div>
              <div className="text-body-sm text-ink-500">{r.channel_name}</div>
            </Link>
            <button
              type="button"
              onClick={() => dismiss(r.id)}
              aria-label={`Dismiss ${r.name}`}
              className="text-body-sm text-ink-500"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
