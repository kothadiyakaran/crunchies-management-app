import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
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
  const { user, isAdmin, signOut } = useAuth();
  const [productionRows, setProductionRows] = useState<ProductionWeekRowFull[]>([]);
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [error, setError] = useState<string | null>(null);

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
        <h1 className="text-title text-ink-900">Today</h1>
        <span className="text-label uppercase text-ink-500">
          {isAdmin ? 'Admin' : 'Signed in'}
        </span>
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
                  <span className="text-body font-semibold text-ink-900">{r.name}</span>
                  <span className="text-body-sm text-ink-500">
                    target {r.target} · made {r.produced_qty}
                  </span>
                </div>
                {r.subtitle && (
                  <p className="mt-1 text-body-sm text-ink-500">{r.subtitle}</p>
                )}
              </Link>
            </li>
          ))}
          {visibleProduction.length === 0 && (
            <li className="text-body-sm text-ink-500">
              Nothing to make this week. <Link to="/products/new" className="underline">Add a product →</Link>
            </li>
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

      <p className="mt-6 text-body-sm text-ink-500">{user?.email}</p>

      <div className="mt-8">
        <button
          type="button"
          onClick={signOut}
          className="h-11 w-full rounded-btn-sm border border-ink-900/10 bg-paper-elevated text-body text-ink-900"
        >
          Sign out
        </button>
      </div>
    </>
  );
}
