/**
 * LineChart — small SVG line chart with gap support (null = no segment).
 * Used in TrendsTab as the accuracy-over-time hero.
 *
 * Raw <svg>, no chart library.
 */

type Point = { x: string; y: number | null };

type Props = {
  points: Point[];
  height?: number;
  yMin?: number;
  yMax?: number;
  ariaLabel?: string;
  onPointClick?: (x: string) => void;
};

const VB_WIDTH = 320;
const PAD_LEFT = 32; // leave room for y-axis labels
const PAD_RIGHT = 8;
const PAD_TOP = 8;
const PAD_BOTTOM = 18; // room for x-axis labels

export function LineChart({
  points,
  height = 120,
  yMin = 0,
  yMax = 100,
  ariaLabel,
  onPointClick,
}: Props) {
  const anyData = points.some((p) => p.y != null);

  if (!anyData) {
    return (
      <div
        className="flex items-center justify-center text-ink-500 text-body-sm"
        style={{ height }}
        role="img"
        aria-label={ariaLabel ?? 'No data'}
      >
        No data
      </div>
    );
  }

  const plotW = VB_WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotH = height - PAD_TOP - PAD_BOTTOM;
  const ySpan = yMax - yMin || 1;

  const stepX =
    points.length > 1 ? plotW / (points.length - 1) : 0;

  const xAt = (i: number): number => PAD_LEFT + i * stepX;
  const yAt = (v: number): number =>
    PAD_TOP + (1 - (v - yMin) / ySpan) * plotH;

  // Build a single SVG path with M jumps across null gaps.
  const path = buildPath(points, xAt, yAt);

  // Gridlines at 0%, 50%, 100% of y-range.
  const gridYs: Array<{ label: string; y: number }> = [
    { label: `${yMin}`, y: yAt(yMin) },
    { label: `${Math.round((yMin + yMax) / 2)}`, y: yAt((yMin + yMax) / 2) },
    { label: `${yMax}`, y: yAt(yMax) },
  ];

  const first = points[0];
  const last = points[points.length - 1];

  // First/last points that actually carry a value, for inline value labels.
  let firstDataIdx = -1;
  let lastDataIdx = -1;
  for (let i = 0; i < points.length; i++) {
    if (points[i]?.y != null) {
      if (firstDataIdx === -1) firstDataIdx = i;
      lastDataIdx = i;
    }
  }
  const firstData = firstDataIdx >= 0 ? points[firstDataIdx] : undefined;
  const lastData = lastDataIdx >= 0 ? points[lastDataIdx] : undefined;
  const showEndpointLabels = firstDataIdx >= 0 && firstDataIdx !== lastDataIdx;

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${VB_WIDTH} ${height}`}
      role="img"
      aria-label={ariaLabel ?? 'Line chart'}
    >
      {/* Gridlines + y-axis labels */}
      {gridYs.map((g) => (
        <g key={g.label}>
          <line
            x1={PAD_LEFT}
            x2={VB_WIDTH - PAD_RIGHT}
            y1={g.y}
            y2={g.y}
            strokeWidth={1}
            className="stroke-ink-900/10"
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={PAD_LEFT - 4}
            y={g.y + 3}
            textAnchor="end"
            className="fill-ink-500"
            style={{ fontSize: 10 }}
          >
            {g.label}
          </text>
        </g>
      ))}

      {/* Target rule at y = max (100%) — a goal line, distinct from the chart cap */}
      <line
        x1={PAD_LEFT}
        x2={VB_WIDTH - PAD_RIGHT}
        y1={yAt(yMax)}
        y2={yAt(yMax)}
        strokeWidth={1}
        strokeDasharray="3 3"
        className="stroke-ink-3"
        vectorEffect="non-scaling-stroke"
      />
      <text
        x={VB_WIDTH - PAD_RIGHT}
        y={yAt(yMax) - 3}
        textAnchor="end"
        className="fill-ink-3"
        style={{ fontSize: 10 }}
      >
        target
      </text>

      {/* Line */}
      <path
        d={path}
        fill="none"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-brand-orange"
        vectorEffect="non-scaling-stroke"
      />

      {/* Points */}
      {points.map((p, i) => {
        if (p.y == null) return null;
        const cx = xAt(i);
        const cy = yAt(p.y);
        if (onPointClick) {
          return (
            <g
              key={`${p.x}-${i}`}
              role="button"
              tabIndex={0}
              onClick={() => onPointClick(p.x)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onPointClick(p.x);
                }
              }}
              style={{ cursor: 'pointer' }}
            >
              {/* Larger invisible hit area for touch */}
              <circle cx={cx} cy={cy} r={10} fill="transparent" />
              <circle
                cx={cx}
                cy={cy}
                r={4}
                className="fill-brand-orange"
              />
            </g>
          );
        }
        return (
          <circle
            key={`${p.x}-${i}`}
            cx={cx}
            cy={cy}
            r={4}
            className="fill-brand-orange"
          />
        );
      })}

      {/* Inline value labels on the first + last data points */}
      {showEndpointLabels && firstData?.y != null && (
        <text
          x={xAt(firstDataIdx) + 2}
          y={yAt(firstData.y) - 2}
          textAnchor="start"
          className="fill-ink"
          style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em' }}
        >
          {Math.round(firstData.y)}%
        </text>
      )}
      {showEndpointLabels && lastData?.y != null && (
        <text
          x={xAt(lastDataIdx) - 2}
          y={yAt(lastData.y) - 2}
          textAnchor="end"
          className="fill-ink"
          style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em' }}
        >
          {Math.round(lastData.y)}%
        </text>
      )}

      {/* X-axis labels: first + last */}
      {first && (
        <text
          x={xAt(0)}
          y={height - 4}
          textAnchor="start"
          className="fill-ink-500"
          style={{ fontSize: 10 }}
        >
          {formatXLabel(first.x)}
        </text>
      )}
      {last && points.length > 1 && (
        <text
          x={xAt(points.length - 1)}
          y={height - 4}
          textAnchor="end"
          className="fill-ink-500"
          style={{ fontSize: 10 }}
        >
          {formatXLabel(last.x)}
        </text>
      )}
    </svg>
  );
}

function buildPath(
  points: Point[],
  xAt: (i: number) => number,
  yAt: (v: number) => number,
): string {
  let d = '';
  let penDown = false;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!p || p.y == null) {
      penDown = false;
      continue;
    }
    const x = xAt(i);
    const y = yAt(p.y);
    if (!penDown) {
      d += `M ${x} ${y} `;
      penDown = true;
    } else {
      d += `L ${x} ${y} `;
    }
  }
  return d.trim();
}

function formatXLabel(x: string): string {
  try {
    const d = new Date(`${x}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return x;
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      timeZone: 'UTC',
    });
  } catch {
    return x;
  }
}
