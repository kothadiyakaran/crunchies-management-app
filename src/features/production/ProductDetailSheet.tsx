import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  listProductionLogsForProductInWeek,
  type ProductionLogRow,
} from './api';
import type { ProductionWeekRowFull } from './planLayer';
import { weekStartFor } from '@/lib/week';
import { todayInTz } from '@/lib/utils';

type Props = {
  row: ProductionWeekRowFull;
  onClose: () => void;
};

export function ProductDetailSheet({ row, onClose }: Props) {
  const [logs, setLogs] = useState<ProductionLogRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const weekStart = weekStartFor(todayInTz());

  useEffect(() => {
    listProductionLogsForProductInWeek(row.product_id, weekStart)
      .then((rs) => { setLogs(rs); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, [row.product_id, weekStart]);

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-ink-900/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-label={`${row.name} — this week`}
        className="fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-paper-elevated p-5 shadow-2xl"
      >
        <header className="flex items-start justify-between">
          <div>
            <h2 className="text-subtitle text-ink-900">{row.name}</h2>
            <p className="text-body-sm text-ink-500">this week</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="h-8 w-8 rounded-full text-body text-ink-500"
          >
            ✕
          </button>
        </header>

        <dl className="mt-4 grid grid-cols-3 gap-2 text-body-sm">
          <div>
            <dt className="text-ink-500">Plan</dt>
            <dd className="text-ink-900">{row.planned_qty ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-ink-500">Suggested</dt>
            <dd className="text-ink-900">{row.suggested}</dd>
          </div>
          <div>
            <dt className="text-ink-500">Made</dt>
            <dd className="text-ink-900">{row.produced_qty}</dd>
          </div>
        </dl>

        <div className="mt-5">
          <Link
            to={`/production/new?product_id=${row.product_id}`}
            className="block h-11 w-full rounded-btn bg-brand-orange text-center text-body font-semibold leading-[2.75rem] text-white"
          >
            + Log new batch
          </Link>
        </div>

        <section className="mt-6">
          <h3 className="text-label uppercase text-ink-500">This week's logs</h3>
          {error && <p className="mt-2 text-body-sm text-status-danger-fg">{error}</p>}
          {loading ? (
            <p className="mt-2 text-body-sm text-ink-500">Loading…</p>
          ) : logs.length === 0 ? (
            <p className="mt-2 text-body-sm text-ink-500">No logs yet this week.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {logs.map((log) => (
                <li key={log.id}>
                  <Link
                    to={`/production/log/${log.id}`}
                    className="block rounded-card border border-ink-900/10 p-3"
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="text-body text-ink-900">
                        {log.made_on} · {log.qty} {row.unit}
                      </span>
                      <span className="text-body-sm text-ink-500">edit ⋯</span>
                    </div>
                    {log.notes && (
                      <p className="mt-1 text-body-sm text-ink-500">{log.notes}</p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
