/**
 * Week tab — Reports surface.
 *
 * Spec: docs/v1-spec.md §9.1.
 *
 * Layout (top → bottom):
 *   1. Period selector (← week label → ; defaults to last completed week)
 *   2. Calibration card (hero) — pip-marker rows sorted by |variance| desc
 *   3. Order summary 4-tile grid
 *   4. New customers by channel
 *   5. Top products this week (tap → /products/:id)
 *   6. Top customers this week (tap → /customers/:id)
 *   7. Complaints this week (tap → /orders/:id; hidden when 0)
 *
 * URL state: `?week=YYYY-MM-DD` overrides default. Read-only surface — no mutations.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { todayInTz } from '@/lib/utils';
import {
  getCalibrationRowsForWeek,
  getOrderSummary,
  getNewCustomersByChannel,
  getTopProducts,
  getTopCustomers,
  getComplaintsInRange,
  type OrderSummary,
  type ChannelSplitRow,
  type TopProductRow,
  type TopCustomerRow,
  type ComplaintListItem,
} from './api';
import {
  visibleCalibrationRows,
  sortByVarianceDescending,
  calibrationVariance,
  calibrationVariancePct,
  type CalibrationRow,
} from './calibration';
import {
  weekRange,
  previousWeekStart,
  nextWeekStart,
  lastCompletedWeekStart,
  formatWeekLabel,
  isCurrentWeek,
} from './dateRange';
import { PipMarkerBar } from './PipMarkerBar';
import { ReportSection } from './ReportSection';

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

export function WeekTab() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const today = todayInTz();
  const weekStart = params.get('week') ?? lastCompletedWeekStart(today);
  const { start, endExclusive } = weekRange(weekStart);

  const [calibration, setCalibration] = useState<CalibrationRow[] | null>(null);
  const [summary, setSummary] = useState<OrderSummary | null>(null);
  const [newCustomers, setNewCustomers] = useState<ChannelSplitRow[] | null>(null);
  const [topProducts, setTopProducts] = useState<TopProductRow[] | null>(null);
  const [topCustomers, setTopCustomers] = useState<TopCustomerRow[] | null>(null);
  const [complaints, setComplaints] = useState<ComplaintListItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCalibration(null);
    setSummary(null);
    setNewCustomers(null);
    setTopProducts(null);
    setTopCustomers(null);
    setComplaints(null);
    Promise.all([
      getCalibrationRowsForWeek(weekStart),
      getOrderSummary(start, endExclusive),
      getNewCustomersByChannel(start, endExclusive),
      getTopProducts(start, endExclusive, 5),
      getTopCustomers(start, endExclusive, 5),
      getComplaintsInRange(start, endExclusive),
    ])
      .then(([c, s, n, tp, tc, co]) => {
        if (cancelled) return;
        setCalibration(c);
        setSummary(s);
        setNewCustomers(n);
        setTopProducts(tp);
        setTopCustomers(tc);
        setComplaints(co);
      })
      .catch(() => {
        /* silent — sections fall back to empty / hidden */
      });
    return () => {
      cancelled = true;
    };
  }, [weekStart, start, endExclusive]);

  function setWeek(w: string) {
    const sp = new URLSearchParams(params);
    sp.set('week', w);
    setParams(sp, { replace: true });
  }

  const visible = calibration
    ? sortByVarianceDescending(visibleCalibrationRows(calibration))
    : [];
  const isCurrent = isCurrentWeek(weekStart, today);
  const newCustomersTotal = (newCustomers ?? []).reduce((s, c) => s + c.count, 0);

  return (
    <div>
      {/* 1. Period selector */}
      <header className="flex items-center justify-between rounded-card bg-paper-elevated p-3">
        <button
          type="button"
          aria-label="Previous week"
          onClick={() => setWeek(previousWeekStart(weekStart))}
          className="h-10 px-3 text-body-sm text-ink-700"
        >
          ←
        </button>
        <div className="text-center text-body-sm font-semibold text-ink-900">
          {formatWeekLabel(weekStart)}
          {isCurrent && ' (current)'}
        </div>
        <button
          type="button"
          aria-label="Next week"
          onClick={() => setWeek(nextWeekStart(weekStart))}
          className="h-10 px-3 text-body-sm text-ink-700"
        >
          →
        </button>
      </header>
      {isCurrent && (
        <p className="mt-1 text-body-sm text-ink-500">
          Week in progress — figures will settle Sunday.
        </p>
      )}

      {/* 2. Calibration card (hero) */}
      <ReportSection title="Calibration">
        {visible.length === 0 ? (
          <p className="text-body-sm text-ink-500">No calibration data for this week.</p>
        ) : (
          <>
            <ul className="space-y-3">
              {visible.map((r) => {
                const v = calibrationVariance(r);
                const p = calibrationVariancePct(r);
                const sign = v !== null && v > 0 ? '+' : '';
                const pillColor =
                  v === null
                    ? 'text-ink-500'
                    : v > 0
                      ? 'text-status-danger-fg'
                      : v < 0
                        ? 'text-status-warn-fg'
                        : 'text-ink-500';
                return (
                  <li key={r.product_id} className="rounded-card bg-paper-elevated p-3">
                    <div className="flex items-baseline justify-between">
                      <span className="text-body font-semibold text-ink-900">
                        {r.product_name}
                      </span>
                      <span className="text-body-sm text-ink-500">{r.unit}</span>
                    </div>
                    <div className="mt-2">
                      <PipMarkerBar
                        plan={r.plan}
                        made={r.made}
                        demand={r.demand}
                        ariaLabel={`Made ${r.made} of ${r.demand} demanded, plan ${
                          r.plan ?? '—'
                        }`}
                      />
                    </div>
                    <div className="mt-2 flex items-baseline justify-between text-body-sm">
                      <span className="text-ink-700">
                        Plan {r.plan ?? '—'} · Made {r.made} · Demand {r.demand}
                      </span>
                      {v !== null && p !== null && (
                        <span className={`tabular-nums ${pillColor}`}>
                          {sign}
                          {v} ({sign}
                          {p}%)
                        </span>
                      )}
                    </div>
                    {r.plan_set_retrospectively && (
                      <p className="mt-1 text-body-sm text-ink-500">
                        plan set retrospectively
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-body-sm text-ink-500">
              bar = made · ┊ plan · │ demand
            </p>
          </>
        )}
      </ReportSection>

      {/* 3. Order summary 4-tile */}
      {summary && (
        <ReportSection title="Orders">
          <div className="grid grid-cols-2 gap-3">
            <Tile label="Total orders" value={String(summary.total_orders)} />
            <Tile label="Total value" value={INR.format(summary.total_value)} />
            <Tile
              label="Fulfilment"
              value={`${summary.fulfilled_count}/${summary.total_orders} (${
                summary.total_orders > 0
                  ? Math.round((summary.fulfilled_count / summary.total_orders) * 100)
                  : 0
              }%)`}
            />
            <Tile
              label="Outstanding"
              value={`${INR.format(summary.outstanding_value)} (${summary.outstanding_count} orders)`}
            />
          </div>
        </ReportSection>
      )}

      {/* 4. New customers */}
      {newCustomers && newCustomersTotal > 0 && (
        <ReportSection title="New customers">
          <p className="text-body text-ink-900">
            {newCustomersTotal} new this week —{' '}
            {newCustomers
              .map((c) => `${c.count} ${c.channel_name.toLowerCase()}`)
              .join(', ')}
          </p>
        </ReportSection>
      )}

      {/* 5. Top products */}
      {topProducts && topProducts.length > 0 && (
        <ReportSection title="Top products">
          <ul className="space-y-1">
            {topProducts.map((p) => (
              <li key={p.product_id}>
                <button
                  type="button"
                  onClick={() => navigate(`/products/${p.product_id}`)}
                  className="flex w-full items-baseline justify-between rounded-card bg-paper-elevated p-3 text-left"
                >
                  <span className="text-body text-ink-900">{p.name}</span>
                  <span className="text-body-sm text-ink-500 tabular-nums">
                    {p.qty} · {INR.format(p.value)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </ReportSection>
      )}

      {/* 6. Top customers */}
      {topCustomers && topCustomers.length > 0 && (
        <ReportSection title="Top customers">
          <ul className="space-y-1">
            {topCustomers.map((c) => (
              <li key={c.customer_id}>
                <button
                  type="button"
                  onClick={() => navigate(`/customers/${c.customer_id}`)}
                  className="flex w-full items-baseline justify-between gap-3 rounded-card bg-paper-elevated p-3 text-left"
                >
                  <span className="flex-1 text-body text-ink-900">{c.name}</span>
                  <span className="text-body-sm text-ink-500">
                    {c.channel_name} · {c.order_count} orders
                  </span>
                  <span className="text-body-sm text-ink-900 tabular-nums">
                    {INR.format(c.value)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </ReportSection>
      )}

      {/* 7. Complaints (hidden when 0) */}
      {complaints && complaints.length > 0 && (
        <ReportSection title="Complaints">
          <ul className="space-y-1">
            {complaints.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/orders/${c.order_id}`)}
                  className="block w-full rounded-card bg-paper-elevated p-3 text-left"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-body font-semibold text-ink-900">
                      {c.customer_name}
                    </span>
                    <span
                      className={`text-body-sm ${
                        c.resolved_at ? 'text-status-ok-fg' : 'text-status-warn-fg'
                      }`}
                    >
                      {c.resolved_at ? 'resolved' : 'open'}
                    </span>
                  </div>
                  <p className="mt-1 text-body-sm text-ink-700">
                    {c.kind} · {c.description}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </ReportSection>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card bg-paper-elevated p-3">
      <p className="text-label uppercase text-ink-500">{label}</p>
      <p className="mt-1 text-body font-semibold text-ink-900 tabular-nums">{value}</p>
    </div>
  );
}
