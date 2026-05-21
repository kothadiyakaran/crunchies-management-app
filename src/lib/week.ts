/**
 * Returns the Monday of the week containing the given YYYY-MM-DD date,
 * as a YYYY-MM-DD string. ISO week (Mon=1..Sun=7).
 */
export function weekStartFor(ymd: string): string {
  // Parse as UTC noon to avoid TZ flipping when we use getUTCDay below.
  const d = new Date(`${ymd}T12:00:00Z`);
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const isoDay = day === 0 ? 7 : day; // 1..7 (Mon..Sun)
  const mondayMs = d.getTime() - (isoDay - 1) * 24 * 60 * 60 * 1000;
  return new Date(mondayMs).toISOString().slice(0, 10);
}
