import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import { useRouteFocus } from '@/lib/a11y';
import { todayInTz } from '@/lib/utils';
import { addDays, formatQty, productTotals, weekdayOf } from '@shared/reminders';
import {
  addMonths,
  dayLabel,
  eventDayIndex,
  eventsOnDay,
  monthGrid,
  monthLabel,
  monthOf,
  summariseDay,
} from './calendarGrid';
import { listCalendarEvents, listCalendarOrders, type CalendarEvent, type CalendarOrder } from './api';

const WEEKDAY_HEADERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(s: string): boolean {
  if (!YMD.test(s)) return false;
  try {
    return addDays(s, 0) === s;
  } catch {
    return false;
  }
}

export function CalendarPage() {
  const today = todayInTz();
  const [searchParams, setSearchParams] = useSearchParams();
  const param = searchParams.get('date');
  const selected = param && isRealDate(param) ? param : today;
  const month = monthOf(selected);
  const grid = useMemo(() => monthGrid(month), [month]);
  const from = grid[0] ?? selected;
  const to = grid[grid.length - 1] ?? selected;

  const [orders, setOrders] = useState<CalendarOrder[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const h1Ref = useRef<HTMLHeadingElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const focusAfterMove = useRef(false);
  useRouteFocus(h1Ref);

  // Only the newest request may write state; a slow response for a month the
  // user already left would otherwise paint the wrong data into the grid.
  const latestRequest = useRef(0);
  const load = useCallback(async () => {
    const request = ++latestRequest.current;
    try {
      const [os, evs] = await Promise.all([listCalendarOrders(from, to), listCalendarEvents(from, to)]);
      if (request !== latestRequest.current) return;
      setOrders(os);
      setEvents(evs);
      setError(null);
    } catch (e) {
      if (request === latestRequest.current) setError((e as Error).message);
    } finally {
      if (request === latestRequest.current) setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    setLoading(true);
    void load();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  useEffect(() => {
    if (!focusAfterMove.current) return;
    focusAfterMove.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${selected}"]`)?.focus();
  }, [selected]);

  const select = (day: string) => setSearchParams({ date: day }, { replace: true });

  const goMonth = (delta: number) => {
    const m = addMonths(month, delta);
    select(monthOf(today) === m ? today : `${m}-01`);
  };

  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    focusAfterMove.current = true;
    select(addDays(selected, step));
  };

  const dayOrders = orders.filter((o) => o.target_fulfilment_date === selected);
  const dayPending = dayOrders.filter((o) => o.fulfilled_at === null);
  const toMake = productTotals(dayPending);
  const dayEvents = eventsOnDay(events, selected);
  const weeks = Array.from({ length: 6 }, (_, w) => grid.slice(w * 7, w * 7 + 7));

  return (
    <div>
      <header className="flex items-baseline justify-between">
        <h1 ref={h1Ref} tabIndex={-1} className="text-title text-ink-900 focus:outline-none">
          Calendar
        </h1>
        <button
          type="button"
          onClick={() => select(today)}
          className="rounded-pill border border-ink-900/10 px-3 py-1 text-body-sm text-ink-900"
        >
          Today
        </button>
      </header>

      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => goMonth(-1)}
          aria-label="Previous month"
          className="flex h-9 w-9 items-center justify-center rounded-btn-sm text-ink-700"
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <h2 className="text-subtitle text-ink-900" aria-live="polite">
          {monthLabel(month)}
        </h2>
        <button
          type="button"
          onClick={() => goMonth(1)}
          aria-label="Next month"
          className="flex h-9 w-9 items-center justify-center rounded-btn-sm text-ink-700"
        >
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>

      {error && <p className="mt-2 text-body-sm text-status-danger-fg">{error}</p>}

      <div
        ref={gridRef}
        role="grid"
        aria-label={monthLabel(month)}
        onKeyDown={onGridKey}
        className="mt-2 rounded-card bg-paper-elevated p-1"
      >
        <div role="row" className="grid grid-cols-7">
          {WEEKDAY_HEADERS.map((d, i) => (
            <div key={i} role="columnheader" className="py-1 text-center text-eyebrow-tight text-ink-2">
              {d}
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <div role="row" key={week[0]} className="grid grid-cols-7">
            {week.map((day) => {
              const s = summariseDay(orders, day, today);
              const inMonth = monthOf(day) === month;
              const isSelected = day === selected;
              const hasEvent = eventsOnDay(events, day).length > 0;
              const label =
                `${dayLabel(day)}, ` +
                (s.pending > 0
                  ? `${s.pending} order${s.pending === 1 ? '' : 's'} due${s.overdue ? ', overdue' : ''}`
                  : s.allFulfilled
                    ? 'all orders fulfilled'
                    : 'no orders') +
                (hasEvent ? ', event' : '');
              return (
                <div role="gridcell" key={day} aria-selected={isSelected}>
                  <button
                    type="button"
                    data-date={day}
                    tabIndex={isSelected ? 0 : -1}
                    aria-label={label}
                    onClick={() => select(day)}
                    className={clsx(
                      'relative flex h-14 w-full flex-col items-center justify-start gap-1 overflow-hidden rounded-btn-sm pt-1',
                      weekdayOf(day) === 0 && !isSelected && 'bg-paper-2',
                      isSelected && 'bg-brand',
                      day === today && !isSelected && 'ring-2 ring-inset ring-brand',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={clsx(
                        'text-body',
                        isSelected ? 'font-bold text-white' : inMonth ? 'text-ink' : 'text-ink-2',
                      )}
                    >
                      {Number(day.slice(8, 10))}
                    </span>
                    {s.pending > 0 ? (
                      <span
                        aria-hidden="true"
                        className={clsx(
                          'min-w-[20px] rounded-pill px-1.5 text-eyebrow-tight leading-4',
                          s.overdue ? 'bg-danger text-white' : 'bg-brand-muted text-brand-deep',
                        )}
                      >
                        {s.pending}
                      </span>
                    ) : s.allFulfilled ? (
                      <span
                        aria-hidden="true"
                        className={clsx('text-eyebrow-tight', isSelected ? 'text-white' : 'text-ok-stamp')}
                      >
                        ✓
                      </span>
                    ) : null}
                    {hasEvent && <span aria-hidden="true" className="absolute inset-x-1 bottom-0.5 h-1 rounded-pill bg-mustard" />}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <section className="mt-4" aria-labelledby="calendar-day-heading">
        <h2 id="calendar-day-heading" className="text-subtitle text-ink-900">
          {dayLabel(selected)}
        </h2>

        {dayEvents.map((ev) => {
          const { n, of } = eventDayIndex(ev, selected);
          return (
            <Link key={ev.id} to={`/events/${ev.id}`} className="mt-2 flex items-center gap-2 text-body text-ink">
              <span aria-hidden="true" className="h-2.5 w-2.5 rotate-45 bg-mustard" />
              <span>
                {ev.name}
                {of > 1 && <span className="text-ink-2"> · day {n} of {of}</span>}
              </span>
            </Link>
          );
        })}

        {loading ? (
          <p className="mt-3 text-body-sm text-ink-500">Loading…</p>
        ) : dayOrders.length === 0 ? (
          <p className="mt-3 text-body-sm text-ink-500">Nothing due.</p>
        ) : (
          <>
            {toMake.length > 0 && (
              <div className="mt-3">
                <h3 className="text-eyebrow-tight uppercase text-ink-2">To make</h3>
                <p className="mt-1 text-body text-ink">
                  {toMake.map((t, i) => (
                    <span key={`${t.product_name}|${t.unit}`}>
                      {i > 0 && ' · '}
                      {t.product_name} <span className="font-bold">{formatQty(t.qty)}</span>
                      {t.unit && ` × ${t.unit}`}
                    </span>
                  ))}
                </p>
              </div>
            )}
            <div className="mt-3">
              <h3 className="text-eyebrow-tight uppercase text-ink-2">Orders</h3>
              <ul className="mt-2 space-y-2">
                {dayOrders.map((o) => (
                  <li key={o.id}>
                    <Link
                      to={`/orders/${o.id}`}
                      className="flex items-start justify-between gap-2.5 rounded-card bg-paper-elevated p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="text-body font-semibold text-ink-900">{o.customer_name}</span>
                        <p className="mt-0.5 truncate text-body-sm text-ink-700">{o.item_summary || '(no items)'}</p>
                      </div>
                      <span
                        className={clsx(
                          'shrink-0 rounded-pill px-2 py-0.5 text-eyebrow-tight',
                          o.fulfilled_at ? 'bg-ok-soft text-ok-stamp' : 'bg-brand-muted text-brand-deep',
                        )}
                      >
                        {o.fulfilled_at ? 'Fulfilled' : 'Pending'}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
