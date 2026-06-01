import { useEffect, useState } from 'react';
import { getAggregatedThisWeek, type AggregatedRow } from './api';

export function AggregatedSection() {
  const [rows, setRows] = useState<AggregatedRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAggregatedThisWeek()
      .then((rs) => { setRows(rs); setLoaded(true); })
      .catch((e: Error) => { setError(e.message); setLoaded(true); });
  }, []);

  if (!loaded) return null;
  if (error) return <p className="mt-6 text-body-sm text-status-danger-fg">{error}</p>;
  if (rows.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="text-subtitle text-ink-900">From other makers</h2>
      <ul className="mt-2 space-y-2">
        {rows.map((r) => (
          <li key={r.product_id} className="rounded-card bg-paper-elevated p-3">
            <div className="grid grid-cols-[1fr_56px_70px_56px] items-baseline gap-2">
              <div>
                <span className="text-body font-semibold text-ink-900">{r.name}</span>
                {r.source_maker_name && (
                  <span className="ml-2 rounded-badge bg-paper-2 px-1.5 py-0.5 text-[11px] text-brown">
                    by {r.source_maker_name}
                  </span>
                )}
              </div>
              <span className="text-right text-base font-bold text-ink-2">—</span>
              <span className="text-right text-base font-bold text-ink-2">{r.committed_qty}</span>
              <span className="text-right text-base font-bold text-ink-2">—</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
