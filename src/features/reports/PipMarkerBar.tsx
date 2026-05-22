/**
 * PipMarkerBar — horizontal bar showing made (fill) vs plan (dashed tick)
 * vs demand (solid tick). Used in WeekTab's calibration card.
 *
 * Raw <svg>, no chart library.
 */

type Props = {
  plan: number | null;
  made: number;
  demand: number;
  height?: number;
  ariaLabel?: string;
};

export function PipMarkerBar({
  plan,
  made,
  demand,
  height = 24,
  ariaLabel,
}: Props) {
  // Never let max be zero — that would divide-by-zero the tick positions.
  const max = Math.max(plan ?? 0, demand, made, 1);

  const madePct = clamp01(made / max) * 100;
  const planPct = plan != null ? clamp01(plan / max) * 100 : null;
  const demandPct = clamp01(demand / max) * 100;

  return (
    <svg
      width="100%"
      height={height}
      viewBox="0 0 100 24"
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel ?? `Made ${made}, plan ${plan ?? 'n/a'}, demand ${demand}`}
    >
      {/* Track */}
      <rect
        x={0}
        y={11}
        width={100}
        height={2}
        className="fill-paper-muted"
      />
      {/* Fill bar (made) */}
      <rect
        x={0}
        y={8}
        width={madePct}
        height={8}
        rx={2}
        className="fill-brand-orange"
      />
      {/* Dashed plan tick */}
      {planPct != null && (
        <line
          x1={planPct}
          x2={planPct}
          y1={2}
          y2={22}
          strokeWidth={1.5}
          strokeDasharray="2,2"
          className="stroke-ink-900"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {/* Solid demand tick */}
      <line
        x1={demandPct}
        x2={demandPct}
        y1={2}
        y2={22}
        strokeWidth={1.5}
        className="stroke-ink-900"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
