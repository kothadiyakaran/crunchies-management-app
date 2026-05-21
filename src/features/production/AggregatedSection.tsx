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
      <table className="mt-2 w-full text-body-sm">
        <thead className="text-ink-500">
          <tr>
            <th className="text-left font-normal">Product</th>
            <th className="text-left font-normal">Source</th>
            <th className="text-right font-normal">This week</th>
          </tr>
        </thead>
        <tbody className="text-ink-900">
          {rows.map((r) => (
            <tr key={r.product_id} className="border-t border-ink-900/10">
              <td className="py-2">{r.name}</td>
              <td className="py-2 text-ink-500">{r.source_maker_name ?? '—'}</td>
              <td className="py-2 text-right">{r.committed_qty} {r.unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
