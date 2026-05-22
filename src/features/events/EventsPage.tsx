import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listEvents, type EventListItem, type EventFilter } from './api';
import { weeksUntil, eventWindowState } from './eventLogic';
import { todayInTz } from '@/lib/utils';

const FILTERS: { value: EventFilter; label: string }[] = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past', label: 'Past' },
  { value: 'all', label: 'All' },
];

function isEventFilter(v: string): v is EventFilter {
  return v === 'upcoming' || v === 'past' || v === 'all';
}

export function EventsPage() {
  const [params, setParams] = useSearchParams();
  const filterRaw = params.get('filter') ?? 'upcoming';
  const filter: EventFilter = isEventFilter(filterRaw) ? filterRaw : 'upcoming';

  const [rows, setRows] = useState<EventListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    listEvents(filter)
      .then((rs) => {
        setRows(rs);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, [filter]);

  function setFilter(value: EventFilter) {
    const next = new URLSearchParams(params);
    if (value === 'upcoming') next.delete('filter');
    else next.set('filter', value);
    setParams(next, { replace: true });
  }

  const today = todayInTz();

  return (
    <div>
      <header className="flex items-baseline justify-between">
        <h1 className="text-title text-ink-900">Events</h1>
        <Link to="/events/new" className="text-body-sm font-semibold text-brand-orange">
          + Add event
        </Link>
      </header>

      <div className="mt-4 flex flex-wrap gap-2 overflow-x-auto text-body-sm">
        {FILTERS.map((f) => {
          const active = filter === f.value;
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`h-8 rounded-pill border px-3 ${
                active
                  ? 'border-brand-orange bg-brand-orange text-white'
                  : 'border-ink-900/20 bg-paper text-ink-900'
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {error && <p className="mt-4 text-body-sm text-status-danger-fg">{error}</p>}
      {loading && rows.length === 0 && <p className="mt-4 text-body-sm text-ink-500">Loading…</p>}

      {!loading && rows.length === 0 && <EmptyState filter={filter} />}

      <ul className="mt-4 space-y-2">
        {rows.map((e) => (
          <li key={e.id}>
            <Link to={`/events/${e.id}`} className="block rounded-card bg-paper-elevated p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-body font-semibold text-ink-900">
                  {e.name}
                  {!e.active && (
                    <span className="ml-2 rounded-pill bg-paper-muted px-2 text-body-sm text-ink-500">
                      inactive
                    </span>
                  )}
                </span>
                <span className="text-body-sm text-ink-500">
                  {relativeLabel(e.starts_on, e.ends_on, today)} →
                </span>
              </div>
              <p className="mt-1 text-body-sm text-ink-500">
                {kindLabel(e.kind)} · {formatDateRange(e.starts_on, e.ends_on)} · {e.lead_weeks} weeks
                lead · {e.product_demand_count} products set
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyState({ filter }: { filter: EventFilter }) {
  if (filter === 'upcoming') {
    return (
      <p className="mt-6 text-body text-ink-500">
        No upcoming events.{' '}
        <Link to="/events/new" className="underline">
          Add the next one →
        </Link>
      </p>
    );
  }
  if (filter === 'past') {
    return <p className="mt-6 text-body text-ink-500">No past events yet.</p>;
  }
  return (
    <div className="mt-6">
      <p className="text-body text-ink-500">No events yet. Add your first festival or exhibition.</p>
      <Link
        to="/events/new"
        className="mt-3 inline-block h-11 rounded-btn bg-brand-orange px-4 text-body font-semibold leading-[2.75rem] text-white"
      >
        + Add event
      </Link>
    </div>
  );
}

function relativeLabel(starts_on: string, ends_on: string, today: string): string {
  const state = eventWindowState(starts_on, ends_on, today);
  if (state === 'in_progress') return 'In progress';
  const w = weeksUntil(starts_on, today);
  if (w > 0) return `in ${w} week${w === 1 ? '' : 's'}`;
  const past = Math.abs(w);
  return `${past} week${past === 1 ? '' : 's'} ago`;
}

function kindLabel(k: 'festival' | 'exhibition' | 'other'): string {
  if (k === 'festival') return 'Festival';
  if (k === 'exhibition') return 'Exhibition';
  return 'Other';
}

function formatDateRange(starts_on: string, ends_on: string): string {
  const fmt = (ymd: string) =>
    new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-IN', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    });
  return starts_on === ends_on ? fmt(starts_on) : `${fmt(starts_on)} – ${fmt(ends_on)}`;
}
