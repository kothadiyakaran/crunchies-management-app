/**
 * Sparkline — tiny line, no axes, no labels. Caller colors via
 * a parent `text-*` class (we stroke with `currentColor`).
 *
 * Values are assumed to be on a 0..100 scale (accuracy %). Nulls
 * create gaps via `M` moves in the path.
 *
 * Raw <svg>, no chart library.
 */

type Props = {
  values: (number | null)[];
  width?: number;
  height?: number;
};

export function Sparkline({ values, width = 80, height = 24 }: Props) {
  const n = values.length;
  if (n === 0) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true"
      />
    );
  }

  const stepX = n > 1 ? width / (n - 1) : 0;
  // Pad y so r=0/100 don't clip the stroke.
  const padY = 2;
  const plotH = height - padY * 2;

  const yAt = (v: number): number =>
    padY + (1 - clamp01(v / 100)) * plotH;

  let d = '';
  let penDown = false;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (v == null) {
      penDown = false;
      continue;
    }
    const x = n === 1 ? width / 2 : i * stepX;
    const y = yAt(v);
    if (!penDown) {
      d += `M ${x} ${y} `;
      penDown = true;
    } else {
      d += `L ${x} ${y} `;
    }
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      <path
        d={d.trim()}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
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
