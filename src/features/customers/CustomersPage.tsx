import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useRouteFocus } from '@/lib/a11y';
import {
  listChannels,
  listCustomersFiltered,
  type CustomerFilter,
  type CustomerListItem,
  type CustomerSort,
} from './api';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { isQuiet } from './quiet';
import { todayInTz } from '@/lib/utils';

type Channel = { id: string; name: string };

const FIXED_CHIPS: { label: string; filter: CustomerFilter }[] = [
  { label: 'All', filter: { kind: 'all' } },
  { label: 'Large', filter: { kind: 'size', value: 'large' } },
  { label: 'Small', filter: { kind: 'size', value: 'small' } },
  { label: 'Unsorted', filter: { kind: 'size', value: 'unsorted' } },
  { label: 'Quiet', filter: { kind: 'quiet' } },
];

const SORT_LABELS: Record<CustomerSort, string> = {
  recent_order: 'Recent order',
  a_z: 'A–Z',
  most_ordered: 'Most ordered',
};

export function CustomersPage() {
  const [params, setParams] = useSearchParams();
  const filterParam = params.get('filter') ?? 'all';
  const channelParam = params.get('channel');
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 200);
  const [sort, setSort] = useState<CustomerSort>('recent_order');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [rows, setRows] = useState<CustomerListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const h1Ref = useRef<HTMLHeadingElement>(null);
  useRouteFocus(h1Ref);

  const filter: CustomerFilter = useMemo(() => {
    if (channelParam) return { kind: 'channel', channelId: channelParam };
    const fx = FIXED_CHIPS.find((c) => c.label.toLowerCase() === filterParam);
    return fx ? fx.filter : { kind: 'all' };
  }, [filterParam, channelParam]);

  useEffect(() => {
    listChannels().then(setChannels).catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    setLoading(true);
    listCustomersFiltered(debounced, filter, sort)
      .then((rs) => { setRows(rs); setError(null); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [debounced, filter, sort]);

  function setFixedFilter(label: string) {
    const next = new URLSearchParams(params);
    if (label.toLowerCase() === 'all') next.delete('filter');
    else next.set('filter', label.toLowerCase());
    next.delete('channel');
    setParams(next, { replace: true });
  }
  function setChannelFilter(channelId: string) {
    const next = new URLSearchParams(params);
    next.set('channel', channelId);
    next.delete('filter');
    setParams(next, { replace: true });
  }

  const today = todayInTz();
  const sysChannels = channels.filter((c) => ['reseller', 'personal', 'exhibition'].includes(c.name.toLowerCase()));
  const customChannels = channels.filter((c) => !sysChannels.includes(c));

  return (
    <div>
      <header className="flex items-baseline justify-between">
        <h1 ref={h1Ref} tabIndex={-1} className="text-title text-ink-900 focus:outline-none">Customers</h1>
        <Link
          to="/customers/new"
          className="text-body-sm font-semibold text-brand-orange"
        >
          + Add customer
        </Link>
      </header>

      <input
        type="search"
        placeholder="Search name or phone…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mt-4 h-11 w-full rounded-input border border-ink-900/10 bg-paper-elevated px-3 text-body"
      />

      <div className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1.5 text-body-sm">
        {FIXED_CHIPS.map((c) => {
          const active =
            (c.filter.kind === 'all' && filter.kind === 'all') ||
            (c.filter.kind === 'size' && filter.kind === 'size' && filter.value === c.filter.value) ||
            (c.filter.kind === 'quiet' && filter.kind === 'quiet');
          return (
            <button
              key={c.label}
              type="button"
              onClick={() => setFixedFilter(c.label)}
              className={`h-8 rounded-pill border px-3 ${
                active ? 'border-brand-orange bg-brand-orange text-white' : 'border-ink-900/20 bg-paper text-ink-900'
              }`}
            >
              {c.label}
            </button>
          );
        })}
        {[...sysChannels, ...customChannels].map((ch) => {
          const active = filter.kind === 'channel' && filter.channelId === ch.id;
          return (
            <button
              key={ch.id}
              type="button"
              onClick={() => setChannelFilter(ch.id)}
              className={`h-8 rounded-pill border px-3 ${
                active ? 'border-brand-orange bg-brand-orange text-white' : 'border-ink-900/20 bg-paper text-ink-900'
              }`}
            >
              {ch.name}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex justify-end">
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as CustomerSort)}
          aria-label="Sort customers"
          className="h-8 rounded-pill border border-ink-900/20 bg-paper px-3 text-body-sm text-ink-900"
        >
          {Object.entries(SORT_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {error && <p className="mt-4 text-body-sm text-status-danger-fg">{error}</p>}
      {loading && rows.length === 0 && <p className="mt-4 text-body-sm text-ink-500">Loading…</p>}

      <ul className="mt-4 space-y-2">
        {rows.map((r) => {
          const q = isQuiet(
            {
              channel_name: r.channel_name,
              last_ordered_at: r.last_ordered_at,
              last_contacted_at: r.last_contacted_at,
              created_at: r.created_at,
            },
            today,
          );
          return (
            <li key={r.id}>
              <Link to={`/customers/${r.id}`} className="block rounded-card bg-paper-elevated p-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-body font-semibold text-ink-900">{r.name}</span>
                  <span className="text-body-sm text-ink-500">
                    {r.last_ordered_at ? `ordered ${humanDate(r.last_ordered_at, today)}` : 'never ordered'}
                  </span>
                </div>
                <div className="mt-1 text-body-sm text-ink-500">
                  {r.channel_name} · {r.size_tier ?? '—'} · {r.order_count} orders
                  {q.isQuiet && ` · quiet ${Math.floor(q.daysSince / 7)}w`}
                </div>
              </Link>
            </li>
          );
        })}
        {!loading && rows.length === 0 && (
          <li className="text-body-sm text-ink-500">
            {filter.kind === 'quiet' ? (
              "No quiet customers — you're in touch with everyone."
            ) : filter.kind === 'all' && debounced.trim().length === 0 ? (
              <>
                No customers yet.{' '}
                <Link to="/customers/new" className="underline">Add your first →</Link>
              </>
            ) : (
              <>
                No customers match this filter.{' '}
                <button
                  type="button"
                  onClick={() => setFixedFilter('All')}
                  className="underline"
                >
                  Clear filter →
                </button>
              </>
            )}
          </li>
        )}
      </ul>
    </div>
  );
}

function humanDate(iso: string, todayDate: string): string {
  const then = new Date(iso).getTime();
  const today = new Date(`${todayDate}T00:00:00+05:30`).getTime();
  const days = Math.floor((today - then) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)}y ago`;
}
