import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  getProductionThisWeek,
  getProductionPlansForWeek,
  upsertProductionPlan,
  type WeekPlanRow,
} from './api';
import type { ProductionWeekRow } from './algorithm';
import { todayInTz } from '@/lib/utils';
import { weekStartFor } from '@/lib/week';

export function PlanWeekPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ProductionWeekRow[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const weekStart = weekStartFor(todayInTz());

  useEffect(() => {
    (async () => {
      try {
        const [r, p] = await Promise.all([
          getProductionThisWeek(),
          getProductionPlansForWeek(weekStart),
        ]);
        setRows(r);
        const v: Record<string, string> = {};
        for (const row of r) {
          const plan: WeekPlanRow | undefined = p[row.product_id];
          v[row.product_id] = String(plan ? plan.planned_qty : row.suggested);
        }
        setValues(v);
        setLoading(false);
      } catch (e) {
        setError((e as Error).message);
        setLoading(false);
      }
    })();
  }, [weekStart]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      for (const row of rows) {
        const raw = values[row.product_id] ?? '';
        const num = Number(raw);
        if (!Number.isFinite(num) || num < 0) continue;
        await upsertProductionPlan(row.product_id, weekStart, num);
      }
      navigate('/production');
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  const inputClass = 'mt-1 h-11 w-24 input-shell text-right';
  const labelSpan = 'block text-body font-semibold text-ink-900';

  return (
    <div>
      <h1 className="text-title text-ink-900">Plan this week</h1>
      <p className="mt-2 text-body-sm text-ink-500">Week of {weekStart}</p>

      {error && <p className="mt-4 text-body-sm text-status-danger-fg">{error}</p>}

      {loading ? (
        <p className="mt-6 text-body-sm text-ink-500">Loading…</p>
      ) : (
        <form onSubmit={onSave} className="mt-6 space-y-4">
          {rows.map((row) => (
            <label key={row.product_id} className="flex items-baseline justify-between gap-3">
              <div className="flex-1">
                <span className={labelSpan}>{row.name}</span>
                <span className="text-body-sm text-ink-500">
                  suggested {row.suggested} {row.unit}
                </span>
              </div>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                aria-label={row.name}
                className={inputClass}
                value={values[row.product_id] ?? ''}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [row.product_id]: e.target.value }))
                }
              />
            </label>
          ))}
          {rows.length === 0 && (
            <p className="text-body-sm text-ink-500">No in-house products yet.</p>
          )}

          <button
            type="submit"
            disabled={submitting || rows.length === 0}
            className="btn-primary"
          >
            {submitting ? 'Saving…' : 'Save plan'}
          </button>
        </form>
      )}

      <p className="mt-6 text-body-sm text-ink-500">
        <Link to="/production" className="underline">← Back to production</Link>
      </p>
    </div>
  );
}
