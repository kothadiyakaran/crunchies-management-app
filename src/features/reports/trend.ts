/**
 * Pure helpers for the Reports → Trends surface.
 *
 * `trendChip` summarises an 8-week accuracy series as a direction + magnitude
 * for the per-product trend cards (replaces a bare em-dash). Direction is not
 * good/bad — it's just slope, so the caller renders it in neutral ink.
 */

export type TrendChip = { dir: 'up' | 'down' | 'none'; pct: number | null };

export function trendChip(weekly: number[]): TrendChip {
  if (weekly.length < 4) return { dir: 'none', pct: null };
  const first = weekly[0];
  const last = weekly[weekly.length - 1];
  if (first === undefined || last === undefined || first === 0) {
    return { dir: 'none', pct: null };
  }
  const pct = Math.round((Math.abs(last - first) / first) * 100);
  const dir = last > first ? 'up' : last < first ? 'down' : 'none';
  return { dir, pct };
}
