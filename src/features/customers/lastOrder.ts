/**
 * Compact, fixed-width label for a customer's last-order date.
 * Both inputs are read as their YYYY-MM-DD date portion and diffed in whole
 * days as UTC midnights, so a timestamptz like `2026-06-01T08:30:00+00:00`
 * and the IST-day string from `todayInTz()` compare without TZ drift.
 */
export function lastOrderLabel(
  dateISO: string | null,
  today: string,
): { text: string; stale: boolean } {
  if (dateISO == null) return { text: 'never', stale: true };

  const then = Date.parse(`${dateISO.slice(0, 10)}T00:00:00Z`);
  const now = Date.parse(`${today.slice(0, 10)}T00:00:00Z`);
  const d = Math.round((now - then) / 86_400_000);

  if (d === 0) return { text: 'today', stale: false };
  if (d === 1) return { text: 'yesterday', stale: false };
  if (d < 30) return { text: `${d}d ago`, stale: false };
  return { text: `${Math.floor(d / 30)}mo ago`, stale: true };
}
