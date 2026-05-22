import { useSearchParams } from 'react-router-dom';
import { WeekTab } from './WeekTab';
import { MonthTab } from './MonthTab';
import { TrendsTab } from './TrendsTab';

type Tab = 'week' | 'month' | 'trends';
const TABS: { value: Tab; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'trends', label: 'Trends' },
];

function isTab(v: string): v is Tab {
  return v === 'week' || v === 'month' || v === 'trends';
}

export function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') ?? 'week';
  const tab: Tab = isTab(raw) ? raw : 'week';

  function setTab(next: Tab) {
    const sp = new URLSearchParams(params);
    if (next === 'week') sp.delete('tab');
    else sp.set('tab', next);
    setParams(sp, { replace: true });
  }

  return (
    <div>
      <h1 className="text-title text-ink-900">Reports</h1>

      <div className="mt-4 flex gap-1 border-b border-ink-900/10">
        {TABS.map((t) => {
          const active = t.value === tab;
          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.value)}
              className={`h-10 px-4 text-body-sm border-b-2 -mb-px ${
                active
                  ? 'border-brand-orange text-ink-900 font-semibold'
                  : 'border-transparent text-ink-500'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        {tab === 'week' && <WeekTab />}
        {tab === 'month' && <MonthTab />}
        {tab === 'trends' && <TrendsTab />}
      </div>
    </div>
  );
}
