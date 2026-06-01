import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listOrdersFiltered, type OrderFilter, type OrderListItem } from './api';
import { formatDayHeader, formatINR, formatOrderTimestamp, groupOrdersByDay } from './orderFormatters';
import { todayInTz } from '@/lib/utils';
import { useRouteFocus } from '@/lib/a11y';

const FILTERS: { key: OrderFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending fulfilment' },
  { key: 'unpaid', label: 'Unpaid' },
  { key: 'this_week', label: 'This week' },
  { key: 'this_month', label: 'This month' },
];

export function OrdersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = (searchParams.get('filter') ?? 'all') as OrderFilter;
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const h1Ref = useRef<HTMLHeadingElement>(null);
  useRouteFocus(h1Ref);

  useEffect(() => {
    setLoading(true);
    listOrdersFiltered(filter)
      .then((rs) => { setOrders(rs); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, [filter]);

  const today = todayInTz();

  const filtered = search.trim().length === 0
    ? orders
    : orders.filter((o) => o.customer_name.toLowerCase().includes(search.trim().toLowerCase()));

  const groups = groupOrdersByDay(filtered);

  return (
    <div>
      <header className="flex items-baseline justify-between">
        <h1 ref={h1Ref} tabIndex={-1} className="text-title text-ink-900 focus:outline-none">Orders</h1>
        <Link
          to="/orders/new"
          className="rounded-btn-sm bg-brand-orange px-3 py-2 text-body-sm font-semibold text-white"
        >
          + Log new order
        </Link>
      </header>

      <div className="mt-2 flex gap-2 text-body-sm">
        <span className="rounded-pill bg-brand px-3 py-1 font-medium text-white">Browse</span>
        <Link
          to="/orders/batch"
          className="rounded-pill bg-paper-2 px-3 py-1 text-ink"
        >
          Batch entry
        </Link>
      </div>

      <input
        type="search"
        placeholder="Search customer name"
        className="mt-3 h-11 w-full rounded-input border border-ink-900/10 bg-paper-elevated px-3 text-body"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setSearchParams(f.key === 'all' ? {} : { filter: f.key })}
            className={`h-8 shrink-0 rounded-pill px-3 text-body-sm ${
              filter === f.key
                ? 'bg-brand-orange text-white'
                : 'border border-ink-900/10 text-ink-900'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 text-body-sm text-status-danger-fg">{error}</p>}

      {loading ? (
        <p className="mt-6 text-body-sm text-ink-500">Loading…</p>
      ) : groups.length === 0 ? (
        <p className="mt-6 text-body-sm text-ink-500">
          {search.trim().length > 0
            ? 'No orders match this search.'
            : filter === 'all'
              ? 'No orders logged yet. Tap + to start.'
              : (
                <>
                  No orders match this filter.{' '}
                  <button type="button" onClick={() => setSearchParams({})} className="underline">
                    Clear filter
                  </button>
                </>
              )}
        </p>
      ) : (
        <div className="mt-6 space-y-6">
          {groups.map((g) => (
            <section key={g.date}>
              <h2 className="text-label uppercase text-ink-500">{formatDayHeader(g.date, today)}</h2>
              <ul className="mt-2 space-y-2">
                {g.orders.map((o) => {
                  const time = formatOrderTimestamp(o.ordered_at, today);
                  return (
                    <li key={o.id}>
                      <Link
                        to={`/orders/${o.id}`}
                        className="block rounded-card bg-paper-elevated p-3"
                      >
                        <div className="flex items-baseline justify-between">
                          <span className="text-body font-semibold text-ink-900">{o.customer_name}</span>
                          <span className="text-body-sm text-ink-500">
                            {time && `${time} · `}{formatINR(o.total)}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between">
                          <span className="text-body-sm text-ink-700">{o.item_summary || '(no items)'}</span>
                          <span className="flex gap-1 text-body-sm">
                            <span className={`rounded-pill px-2 py-0.5 ${o.fulfilled_at ? 'bg-status-ok-bg' : 'bg-status-warn-bg'} text-ink-700`}>
                              {o.fulfilled_at ? 'fulfilled' : 'pending'}
                            </span>
                            <span className={`rounded-pill px-2 py-0.5 ${o.payment_status === 'paid' ? 'bg-status-ok-bg' : 'bg-status-warn-bg'} text-ink-700`}>
                              {o.payment_status}
                            </span>
                          </span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
