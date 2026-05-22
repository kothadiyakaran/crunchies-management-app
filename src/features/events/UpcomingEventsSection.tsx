import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listUpcomingEvents, type EventListItem } from './api';
import { weeksUntil } from './eventLogic';
import { todayInTz } from '@/lib/utils';

export function UpcomingEventsSection() {
  const [rows, setRows] = useState<EventListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const all = await listUpcomingEvents();
        setRows(all.slice(0, 3));
        setTotal(all.length);
      } catch {
        setRows([]);
        setTotal(0);
      }
      setLoading(false);
    })();
  }, []);

  if (loading) return null;
  const today = todayInTz();

  return (
    <section className="mt-6">
      <header className="flex items-baseline justify-between">
        <h2 className="text-subtitle text-ink-900">Upcoming events</h2>
        <Link to="/events" className="text-body-sm text-ink-500 underline">
          All events →
        </Link>
      </header>
      {rows.length === 0 ? (
        <p className="mt-2 text-body-sm text-ink-500">
          No upcoming events. <Link to="/events/new" className="underline">Add the next one →</Link>
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {rows.map((e) => {
            const w = weeksUntil(e.starts_on, today);
            const wLabel = w <= 0 ? 'in progress' : `in ${w} ${w === 1 ? 'week' : 'weeks'}`;
            return (
              <li key={e.id}>
                <Link to={`/events/${e.id}`} className="block rounded-card bg-paper-elevated p-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-body font-semibold text-ink-900">{e.name}</span>
                    <span className="text-body-sm text-ink-500">{wLabel}</span>
                  </div>
                  <div className="mt-1 text-body-sm text-ink-500">
                    {kindLabel(e.kind)} · {e.product_demand_count} products set
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-2 flex gap-2">
        <Link
          to="/events"
          className="h-9 flex-1 rounded-btn-sm border border-ink-900/10 bg-paper-elevated text-center text-body-sm leading-9 text-ink-900"
        >
          See all ({total})
        </Link>
        <Link
          to="/events/new"
          className="h-9 flex-1 rounded-btn-sm bg-brand-orange text-center text-body-sm font-semibold leading-9 text-white"
        >
          + Add event
        </Link>
      </div>
    </section>
  );
}

function kindLabel(k: 'festival' | 'exhibition' | 'other'): string {
  if (k === 'festival') return 'Festival';
  if (k === 'exhibition') return 'Exhibition';
  return 'Other';
}
