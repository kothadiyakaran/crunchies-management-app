import { useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { listTodayPendingOrders, type OrderRow } from '@/features/orders/api';
import { listRecentProduction, type ProductionLogRow } from '@/features/production/api';
import { listCustomersByIds } from '@/features/customers/api';
import { listProductsByIds } from '@/features/products/api';
import { todayInTz } from '@/lib/utils';

export function TodayPage() {
  const { user, isAdmin, signOut } = useAuth();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [logs, setLogs] = useState<ProductionLogRow[]>([]);
  const [customerNames, setCustomerNames] = useState<Record<string, string>>({});
  const [productNames, setProductNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [os, ls] = await Promise.all([listTodayPendingOrders(), listRecentProduction()]);
        setOrders(os);
        setLogs(ls);
        const today = todayInTz();
        const todayLogs = ls.filter((l) => l.made_on === today);
        const [cnames, pnames] = await Promise.all([
          listCustomersByIds(os.map((o) => o.customer_id)),
          listProductsByIds(todayLogs.map((l) => l.product_id)),
        ]);
        setCustomerNames(cnames);
        setProductNames(pnames);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  const today = todayInTz();
  const todayLogs = logs.filter((l) => l.made_on === today);

  return (
    <>
      <header className="flex items-baseline justify-between">
        <h1 className="text-title text-ink-900">Today</h1>
        <span className="text-label uppercase text-ink-500">
          {isAdmin ? 'Admin' : 'Signed in'}
        </span>
      </header>

      {error && <p className="mt-4 text-body-sm text-status-danger-fg">{error}</p>}

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
            <li className="text-body-sm text-ink-500">Nothing pending for today.</li>
          )}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="text-subtitle text-ink-900">Production today ({todayLogs.length})</h2>
        <ul className="mt-2 space-y-2">
          {todayLogs.map((l) => (
            <li key={l.id} className="rounded-card bg-paper-elevated p-3 text-body-sm">
              <div className="font-semibold text-ink-900">
                {productNames[l.product_id] ?? '(unknown product)'}
              </div>
              <div className="text-ink-500">qty {l.qty}</div>
            </li>
          ))}
          {todayLogs.length === 0 && (
            <li className="text-body-sm text-ink-500">Nothing logged yet.</li>
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
