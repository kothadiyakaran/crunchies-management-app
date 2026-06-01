/**
 * PipMarkerBar — self-describing calibration bar for WeekTab.
 *
 * A single 8px pill track on bg-paper-2. Made fills from the left in `brand`.
 * Plan is a 2px dashed vertical tick (ink-2); demand is a 2px solid tick (ink).
 * All three share one per-product scale: value / max(plan, made, demand).
 * Below the track, a labelled value row: "N made · plan N · demand N".
 *
 * Raw <svg> for the track (no chart library). Percentage x-coordinates with a
 * real-px corner radius keep the pill geometry clean (no viewBox stretch).
 */

type Props = {
  plan: number | null;
  made: number;
  demand: number;
  ariaLabel?: string;
};

export function PipMarkerBar({ plan, made, demand, ariaLabel }: Props) {
  // Never let max be zero — that would divide-by-zero the tick positions.
  const max = Math.max(plan ?? 0, demand, made, 1);

  const madePct = clamp01(made / max) * 100;
  const planPct = plan != null ? clamp01(plan / max) * 100 : null;
  const demandPct = clamp01(demand / max) * 100;

  return (
    <div>
      <svg
        width="100%"
        height={14}
        role="img"
        aria-label={ariaLabel ?? `Made ${made}, plan ${plan ?? 'n/a'}, demand ${demand}`}
      >
        {/* Track */}
        <rect x={0} y={3} width="100%" height={8} rx={4} className="fill-paper-2" />
        {/* Fill bar (made) */}
        <rect x={0} y={3} width={`${madePct}%`} height={8} rx={4} className="fill-brand" />
        {/* Dashed plan tick — 3px above and below the 8px track */}
        {planPct != null && (
          <line
            x1={`${planPct}%`}
            x2={`${planPct}%`}
            y1={0}
            y2={14}
            strokeWidth={2}
            strokeDasharray="2,2"
            className="stroke-ink-2"
          />
        )}
        {/* Solid demand tick */}
        <line
          x1={`${demandPct}%`}
          x2={`${demandPct}%`}
          y1={0}
          y2={14}
          strokeWidth={2}
          className="stroke-ink"
        />
      </svg>
      <div className="mt-1.5 flex gap-3.5 text-eyebrow-tight uppercase text-ink-2">
        <span>
          <b className="text-ink">{made}</b> made
        </span>
        <span>
          plan <b className="text-ink">{plan ?? '—'}</b>
        </span>
        <span className="ml-auto">
          demand <b className="text-ink">{demand}</b>
        </span>
      </div>
    </div>
  );
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
