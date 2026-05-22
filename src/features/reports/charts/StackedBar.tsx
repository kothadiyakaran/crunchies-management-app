/**
 * StackedBar — horizontal proportional bar of segments. Plain HTML+CSS
 * (flex with proportional widths). When all values sum to zero, renders
 * an empty grey track.
 *
 * Used in MonthTab (channel breakdown) and TrendsTab (channel mix trend).
 */

type Segment = { label: string; value: number; color: string };

type Props = {
  segments: Segment[];
  height?: number;
  showLabels?: boolean;
};

export function StackedBar({
  segments,
  height = 32,
  showLabels = false,
}: Props) {
  const total = segments.reduce((acc, s) => acc + (s.value > 0 ? s.value : 0), 0);

  if (total === 0) {
    return (
      <div>
        <div
          className="w-full rounded bg-paper-muted"
          style={{ height }}
          role="img"
          aria-label="No data"
        />
        {showLabels && (
          <div className="mt-1 text-body-sm text-ink-500">No data</div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div
        className="flex w-full overflow-hidden rounded"
        style={{ height }}
        role="img"
        aria-label={segments
          .map((s) => `${s.label}: ${s.value}`)
          .join(', ')}
      >
        {segments.map((s) => {
          const pct = (s.value > 0 ? s.value : 0) / total;
          if (pct === 0) return null;
          return (
            <div
              key={s.label}
              style={{
                width: `${pct * 100}%`,
                height: '100%',
                backgroundColor: s.color,
              }}
              title={`${s.label}: ${s.value}`}
            />
          );
        })}
      </div>
      {showLabels && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-body-sm text-ink-700">
          {segments.map((s) => (
            <div key={s.label} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-sm"
                style={{ backgroundColor: s.color }}
                aria-hidden="true"
              />
              <span>
                {s.label}
                {s.value !== undefined && (
                  <span className="text-ink-500"> · ₹{s.value}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
