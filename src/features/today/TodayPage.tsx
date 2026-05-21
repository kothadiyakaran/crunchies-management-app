import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { getProductionThisWeek, type ProductionWeekRow } from '@/features/production/api';
import { listTodayPendingOrders, type OrderRow } from '@/features/orders/api';
import { listCustomersByIds } from '@/features/customers/api';

export function TodayPage() {
  const { user, isAdmin, signOut } = useAuth();
  const [productionRows, setProductionRows] = useState<ProductionWeekRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [customerNames, setCustomerNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [pr, os] = await Promise.all([getProductionThisWeek(), listTodayPendingOrders()]);
        setProductionRows(pr);
        setOrders(os);
        const cnames = await listCustomersByIds(os.map((o) => o.customer_id));
        setCustomerNames(cnames);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  // Hide products where suggested === 0 AND produced === 0 (per spec §4)
  const visibleProduction = productionRows.filter((r) => !(r.suggested === 0 && r.produced_qty === 0));
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
                    target {r.suggested} · made {r.produced_qty}
                  </span>
                </div>
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

      {/* Block 2 (lightweight — full pending logic lands in Sprint 4) */}
      <section className="mt-6">
        <h2 className="text-subtitle text-ink-900">Pending today ({orders.length})</h2>
        <ul className="mt-2 space-y-2">
          {orders.map((o) => (
            <li key={o.id} className="rounded-card bg-paper-elevated p-3 text-body-sm">
              <div className="font-semibold text-ink-900">
                {customerNames[o.customer_id] ?? '(unknown customer)'}
              </div>
              <div className="text-ink-500">
                ordered {o.ordered_at.slice(0, 10)} · {o.payment_status}
              </div>
            </li>
          ))}
          {orders.length === 0 && (
            <li className="text-body-sm text-ink-500">All caught up.</li>
          )}
        </ul>
      </section>

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
