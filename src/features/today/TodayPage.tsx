import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings as SettingsIcon } from 'lucide-react';
import { useRouteFocus } from '@/lib/a11y';
import {
  getProductionThisWeek,
  getProductionPlansForWeek,
} from '@/features/production/api';
import { composeWithPlan, type ProductionWeekRowFull } from '@/features/production/planLayer';
import { listTodayPendingOrders, type OrderListItem } from '@/features/orders/api';
import { QuietCustomerNudge } from '@/features/customers/QuietCustomerNudge';
import { weekStartFor } from '@/lib/week';
import { todayInTz } from '@/lib/utils';

export function TodayPage() {
  const [productionRows, setProductionRows] = useState<ProductionWeekRowFull[]>([]);
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const h1Ref = useRef<HTMLHeadingElement>(null);
  useRouteFocus(h1Ref);

  useEffect(() => {
    (async () => {
      try {
        const weekStart = weekStartFor(todayInTz());
        const [pr, plans, os] = await Promise.all([
          getProductionThisWeek(),
          getProductionPlansForWeek(weekStart),
          listTodayPendingOrders(),
        ]);
        setProductionRows(composeWithPlan(pr, plans));
        setOrders(os);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  // Hide products where target === 0 AND produced === 0 (per spec §4)
  const visibleProduction = productionRows
    .filter((r) => !(r.target === 0 && r.produced_qty === 0))
    .sort((a, b) => {
      if (b.gap !== a.gap) return b.gap - a.gap;
      return a.name.localeCompare(b.name);
    });
  const allSeeded = visibleProduction.length > 0 && visibleProduction.every((r) => r.uses_seed);

  return (
    <>
      <header className="flex items-baseline justify-between">
        <h1 ref={h1Ref} tabIndex={-1} className="text-title text-ink-900 focus:outline-none">Today</h1>
        <Link
          to="/settings"
          aria-label="Settings"
          className="flex h-9 w-9 items-center justify-center rounded-btn-sm text-ink-700"
        >
          <SettingsIcon size={20} aria-hidden="true" />
        </Link>
      </header>

      {error && <p className="mt-4 text-body-sm text-status-danger-fg">{error}</p>}

      {/* Block 1 — This week, make */}
      <section className="mt-6">
        <h2 className="text-subtitle text-ink-900">This week, make</h2>
        <ul className="mt-2 space-y-2">
          {visibleProduction.map((r) => (
            <li key={r.product_id}>
              <Link
                to={`/production/new?product_id=${r.product_id}`}
                className="block rounded-card bg-paper-elevated p-3"
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-body font-bold text-ink">{r.name}</span>
                  <span className="text-body font-bold">
                    <span className="text-ink">{r.produced_qty}</span>
                    <span className="text-ink-2"> of {r.target}</span>
                  </span>
                </div>
                <div className="mt-2 h-1 rounded-pill bg-paper-2">
                  <div
                    className={`h-full rounded-pill ${r.produced_qty > r.target ? 'bg-mustard' : 'bg-brand'}`}
                    style={{
                      width: `${
                        r.produced_qty > r.target
                          ? 100
                          : r.target > 0
                            ? Math.min(100, (r.produced_qty / r.target) * 100)
                            : 0
                      }%`,
                    }}
                  />
                </div>
                {r.produced_qty > r.target && (
                  <p className="mt-2 text-meta text-ink-2">{r.produced_qty - r.target} above target</p>
                )}
                {r.subtitle && (
                  <p className="mt-2 text-meta text-ink-2">{r.subtitle}</p>
                )}
              </Link>
            </li>
          ))}
          {visibleProduction.length === 0 && productionRows.length === 0 && (
            <li className="text-body-sm text-ink-500">
              Add products and seed averages to see your weekly plan.{' '}
              <Link to="/products" className="underline">Set up products →</Link>
            </li>
          )}
          {visibleProduction.length === 0 && productionRows.length > 0 && (
            <li className="text-body-sm text-ink-500">All covered for this week.</li>
          )}
        </ul>
        {allSeeded && (
          <p className="mt-2 text-body-sm text-ink-500">
            Based on your initial estimates. Will refine as real orders accumulate.
          </p>
        )}
      </section>

      {/* Block 2 — Pending today (spec §4: up to 5 + see all →) */}
      <section className="mt-6">
        <header className="flex items-baseline justify-between">
          <h2 className="text-subtitle text-ink-900">Pending today ({orders.length})</h2>
          {orders.length > 5 && (
            <Link to="/orders?filter=pending" className="text-body-sm text-ink-500 underline">
              see all →
            </Link>
          )}
        </header>
        <ul className="mt-2 space-y-2">
          {orders.slice(0, 5).map((o) => (
            <li key={o.id}>
              <Link
                to={`/orders/${o.id}`}
                className="block rounded-card bg-paper-elevated p-3"
              >
                <div className="text-body font-semibold text-ink-900">{o.customer_name}</div>
                <div className="mt-1 text-body-sm text-ink-500">{o.item_summary || '(no items)'}</div>
              </Link>
            </li>
          ))}
          {orders.length === 0 && (
            <li className="text-body-sm text-ink-500">All caught up. ✓</li>
          )}
        </ul>
      </section>

      <QuietCustomerNudge />
    </>
  );
}
