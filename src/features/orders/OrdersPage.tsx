import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listOrdersFiltered, type OrderFilter, type OrderListItem } from './api';
import { formatDayHeader, formatINR, groupOrdersByDay } from './orderFormatters';
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

      <div className="mt-3 flex flex-wrap gap-x-1.5 gap-y-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setSearchParams(f.key === 'all' ? {} : { filter: f.key })}
            className={`h-8 rounded-pill px-3 text-body-sm ${
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
              <h2 className="text-eyebrow-tight uppercase text-ink-2">{formatDayHeader(g.date, today)}</h2>
              <ul className="mt-2 space-y-2">
                {g.orders.map((o) => (
                  <li key={o.id}>
                    <Link
                      to={`/orders/${o.id}`}
                      className="flex items-start justify-between gap-2.5 rounded-card bg-paper-elevated p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="text-body font-semibold text-ink-900">{o.customer_name}</span>
                        <p className="mt-0.5 text-body-sm text-ink-700">{o.item_summary || '(no items)'}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="text-body font-bold text-ink">{formatINR(o.total)}</span>
                        <span className="mt-1 flex justify-end gap-1">
                          <span className={`rounded-pill px-2 py-0.5 text-eyebrow-tight ${o.fulfilled_at ? 'bg-ok-soft text-ok-stamp' : 'bg-brand-muted text-brand-deep'}`}>
                            {o.fulfilled_at ? 'Fulfilled' : 'Pending'}
                          </span>
                          <span className={`rounded-pill px-2 py-0.5 text-eyebrow-tight ${
                            o.payment_status === 'paid'
                              ? 'bg-ok-soft text-ok-stamp'
                              : o.payment_status === 'partial'
                                ? 'bg-mustard-tint text-brown'
                                : 'bg-brand-muted text-brand-deep'
                          }`}>
                            {o.payment_status === 'paid' ? 'Paid' : o.payment_status === 'partial' ? 'Partial' : 'Unpaid'}
                          </span>
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
