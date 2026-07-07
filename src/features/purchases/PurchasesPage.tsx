import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { listPurchases, listAllItemEntries, type PurchaseRow } from './api';
import {
  aggregateItems,
  groupByDay,
  unitPrice,
  type ItemSummary,
} from './purchaseMath';
import { formatINR, formatDayHeader } from '@/features/orders/orderFormatters';
import { formatShortDate } from './purchaseFormatters';
import {
  monthRange,
  previousMonth,
  nextMonth,
  formatMonthLabel,
  isCurrentMonth,
} from '@/features/reports/dateRange';
import { todayInTz } from '@/lib/utils';
import { useRouteFocus } from '@/lib/a11y';

type View = 'receipts' | 'items';

function itemBlurb(r: PurchaseRow): string {
  const names = r.items.map((i) => i.item_name);
  const shown = names.slice(0, 2).join(', ');
  const more = names.length > 2 ? '…' : '';
  const n = r.items.length;
  return `${n} item${n === 1 ? '' : 's'} · ${shown}${more}`;
}

function ItemRow({ summary }: { summary: ItemSummary }) {
  const [open, setOpen] = useState(false);
  const last = summary.last;
  const up = unitPrice(last.amount, last.qty);
  const lastLine =
    `Last: ${formatINR(last.amount)}` +
    (last.qty ? ` · ${last.qty} ${last.unit ?? ''}`.trimEnd() : '') +
    (up !== null ? ` · ${formatINR(up)}/${last.unit ?? ''}`.trimEnd() : '');

  return (
    <li className="rounded-card bg-paper-elevated">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="block w-full rounded-card p-3 text-left"
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 flex-1 truncate text-body font-semibold text-ink-900">
            {summary.name}
          </span>
          <span className="shrink-0 text-body-sm text-ink-2">{summary.timesBought}×</span>
        </div>
        <p className="mt-0.5 text-body-sm text-ink-700">{lastLine}</p>
        <p className="mt-0.5 text-small text-ink-2">
          {last.vendor_name} · {formatShortDate(last.purchased_on)}
        </p>
      </button>
      {open && (
        <ul className="border-t border-rule px-3 py-2 space-y-1">
          {summary.history.slice(0, 10).map((h, i) => {
            const hup = unitPrice(h.amount, h.qty);
            return (
              <li key={i} className="flex justify-between gap-2 text-small text-ink-700">
                <span className="min-w-0 flex-1 truncate">
                  {formatShortDate(h.purchased_on)} · {h.vendor_name}
                  {h.qty ? ` · ${h.qty} ${h.unit ?? ''}`.trimEnd() : ''}
                </span>
                <span className="shrink-0 tabular-nums">
                  {formatINR(h.amount)}
                  {hup !== null ? ` · ${formatINR(hup)}/${h.unit ?? ''}`.trimEnd() : ''}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

export function PurchasesPage() {
  const [view, setView] = useState<View>('receipts');
  const [month, setMonth] = useState<string>(todayInTz().slice(0, 7));
  const [rows, setRows] = useState<PurchaseRow[]>([]);
  const [items, setItems] = useState<ItemSummary[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [itemsLoaded, setItemsLoaded] = useState(false);
  const h1Ref = useRef<HTMLHeadingElement>(null);
  useRouteFocus(h1Ref);

  const today = todayInTz();

  useEffect(() => {
    setLoading(true);
    const { start, endExclusive } = monthRange(month);
    listPurchases(start, endExclusive)
      .then((rs) => { setRows(rs); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, [month]);

  useEffect(() => {
    listAllItemEntries()
      .then((entries) => { setItems(aggregateItems(entries)); setItemsLoaded(true); })
      .catch((e: Error) => setError(e.message));
  }, []);

  const q = search.trim().toLowerCase();

  const filteredRows = q.length === 0
    ? rows
    : rows.filter(
        (r) =>
          r.vendor.name.toLowerCase().includes(q) ||
          r.items.some((i) => i.item_name.toLowerCase().includes(q)),
      );

  const filteredItems = q.length === 0
    ? items
    : items.filter((i) => i.name.toLowerCase().includes(q));

  const monthTotal = rows.reduce((s, r) => s + r.total, 0);
  const dayGroups = groupByDay(filteredRows);

  return (
    <div>
      <header className="flex items-baseline justify-between">
        <h1 ref={h1Ref} tabIndex={-1} className="text-title text-ink-900 focus:outline-none">Purchases</h1>
      </header>

      <div
        role="tablist"
        aria-label="Purchases view"
        className="mt-4 flex gap-1 border-b border-ink-900/10"
      >
        {(['receipts', 'items'] as View[]).map((v) => {
          const active = v === view;
          return (
            <button
              key={v}
              type="button"
              role="tab"
              id={`purchases-tab-${v}`}
              aria-selected={active}
              aria-controls={`purchases-panel-${v}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setView(v)}
              className={`h-10 px-4 text-body-sm border-b-2 -mb-px capitalize ${
                active
                  ? 'border-brand-orange text-ink-900 font-semibold'
                  : 'border-transparent text-ink-500'
              }`}
            >
              {v}
            </button>
          );
        })}
      </div>

      {view === 'receipts' && (
        <div className="mt-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMonth(previousMonth(month))}
              aria-label="Previous month"
              className="h-9 w-9 rounded-btn-sm border border-ink-900/10 text-ink-700 hover:bg-paper-muted"
            >
              ←
            </button>
            <div className="flex-1 text-center text-subtitle text-ink-900">
              {formatMonthLabel(month)}
            </div>
            <button
              type="button"
              onClick={() => setMonth(nextMonth(month))}
              disabled={isCurrentMonth(month, today)}
              aria-label="Next month"
              className="h-9 w-9 rounded-btn-sm border border-ink-900/10 text-ink-700 hover:bg-paper-muted disabled:opacity-40"
            >
              →
            </button>
          </div>
          <p className="mt-3 text-center">
            <span className="text-amount text-ink">{formatINR(monthTotal)}</span>
          </p>
        </div>
      )}

      <div className="mt-4">
        <label htmlFor="purchase-search" className="sr-only">Search item or shop</label>
        <input
          id="purchase-search"
          type="search"
          placeholder="Search item or shop"
          className="input-shell h-11"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && <p className="mt-4 text-body-sm text-status-danger-fg">{error}</p>}

      <div
        role="tabpanel"
        id={`purchases-panel-${view}`}
        aria-labelledby={`purchases-tab-${view}`}
        className="mt-4"
      >
        {view === 'receipts' ? (
          loading ? (
            <p className="text-body-sm text-ink-500">Loading…</p>
          ) : dayGroups.length === 0 ? (
            <p className="text-body-sm text-ink-500">
              {q.length > 0 ? 'No purchases match this search.' : 'No purchases this month yet.'}
            </p>
          ) : (
            <div className="space-y-6">
              {dayGroups.map((g) => (
                <section key={g.date}>
                  <h2 className="text-eyebrow-tight uppercase text-ink-2">{formatDayHeader(g.date, today)}</h2>
                  <ul className="mt-2 space-y-2">
                    {g.rows.map((r) => (
                      <li key={r.id}>
                        <Link
                          to={`/purchases/${r.id}`}
                          className="flex items-start justify-between gap-2.5 rounded-card bg-paper-elevated p-3"
                        >
                          <div className="min-w-0 flex-1">
                            <span className="text-body font-semibold text-ink-900">{r.vendor.name}</span>
                            <p className="mt-0.5 text-body-sm text-ink-700">{itemBlurb(r)}</p>
                          </div>
                          <span className="shrink-0 text-body font-bold text-ink tabular-nums">{formatINR(r.total)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )
        ) : !itemsLoaded ? (
          <p className="text-body-sm text-ink-500">Loading…</p>
        ) : filteredItems.length === 0 ? (
          <p className="text-body-sm text-ink-500">
            {q.length > 0 ? 'No items match this search.' : 'Log your first purchase to start price memory.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {filteredItems.map((s) => (
              <ItemRow key={s.name.toLowerCase()} summary={s} />
            ))}
          </ul>
        )}
      </div>

      <div className="mt-8">
        <Link
          to="/purchases/new"
          className="block h-11 w-full rounded-btn bg-brand-orange text-center text-body font-semibold leading-[2.75rem] text-white"
        >
          + Log purchase
        </Link>
      </div>
    </div>
  );
}
