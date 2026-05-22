/**
 * Pure date-range helpers backing the Reports period selectors.
 *
 * All inputs/outputs are YYYY-MM-DD strings (or YYYY-MM for months) unless
 * otherwise noted. Day math uses UTC-noon parsing (same pattern as
 * `src/lib/week.ts`) to avoid timezone flipping.
 */

import { weekStartFor } from '../../lib/week';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Parse a YYYY-MM-DD as a Date anchored at UTC noon to avoid TZ flips. */
function parseYmdUtcNoon(ymd: string): Date {
  return new Date(`${ymd}T12:00:00Z`);
}

/** Format a Date as YYYY-MM-DD using its UTC fields. */
function toYmdUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Add `days` calendar days to a YYYY-MM-DD, returning YYYY-MM-DD. */
function addDays(ymd: string, days: number): string {
  const d = parseYmdUtcNoon(ymd);
  return toYmdUtc(new Date(d.getTime() + days * DAY_MS));
}

export function weekRange(weekStart: string): { start: string; endExclusive: string } {
  return { start: weekStart, endExclusive: addDays(weekStart, 7) };
}

export function previousWeekStart(weekStart: string): string {
  return addDays(weekStart, -7);
}

export function nextWeekStart(weekStart: string): string {
  return addDays(weekStart, 7);
}

/**
 * The Monday of the most-recent fully-completed week.
 *
 * If today is Mon..Sat, the current Mon-week is still in progress, so the last
 * completed week's Monday is `weekStartFor(today) - 7d`. If today is Sunday,
 * the current week ends today (not yet complete until Sun ends), so we still
 * return the prior Monday. In both cases: `weekStartFor(today) - 7d`.
 */
export function lastCompletedWeekStart(today: string): string {
  return addDays(weekStartFor(today), -7);
}

export function monthRange(yyyymm: string): { start: string; endExclusive: string } {
  const start = `${yyyymm}-01`;
  const d = parseYmdUtcNoon(start);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth(); // 0..11
  // Next month's first day, UTC noon. Date.UTC handles Dec→Jan rollover.
  const endMs = Date.UTC(year, month + 1, 1, 12, 0, 0);
  const endExclusive = toYmdUtc(new Date(endMs));
  return { start, endExclusive };
}

export function previousMonth(yyyymm: string): string {
  const d = parseYmdUtcNoon(`${yyyymm}-01`);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const prevMs = Date.UTC(year, month - 1, 1, 12, 0, 0);
  return toYmdUtc(new Date(prevMs)).slice(0, 7);
}

export function nextMonth(yyyymm: string): string {
  const d = parseYmdUtcNoon(`${yyyymm}-01`);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const nextMs = Date.UTC(year, month + 1, 1, 12, 0, 0);
  return toYmdUtc(new Date(nextMs)).slice(0, 7);
}

export function currentMonth(today: string): string {
  return today.slice(0, 7);
}

const weekdayFmt = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  timeZone: 'UTC',
});
const dayFmt = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  timeZone: 'UTC',
});
const monthFmt = new Intl.DateTimeFormat('en-IN', {
  month: 'short',
  timeZone: 'UTC',
});

/**
 * Format a week label given the Monday-start of the week.
 *
 * Same month  : 'Mon 18 – Sun 24 May'
 * Cross-month : 'Mon 27 Apr – Sun 03 May'
 *
 * Uses en-IN locale and an en-dash separator.
 */
export function formatWeekLabel(weekStart: string): string {
  const startDate = parseYmdUtcNoon(weekStart);
  const endDate = parseYmdUtcNoon(addDays(weekStart, 6));

  const startWeekday = weekdayFmt.format(startDate);
  const startDay = dayFmt.format(startDate);
  const startMonth = monthFmt.format(startDate);

  const endWeekday = weekdayFmt.format(endDate);
  const endDay = dayFmt.format(endDate);
  const endMonth = monthFmt.format(endDate);

  if (startMonth === endMonth) {
    return `${startWeekday} ${startDay} – ${endWeekday} ${endDay} ${endMonth}`;
  }
  return `${startWeekday} ${startDay} ${startMonth} – ${endWeekday} ${endDay} ${endMonth}`;
}

const monthYearFmt = new Intl.DateTimeFormat('en-IN', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** '2026-05' → 'May 2026'. */
export function formatMonthLabel(yyyymm: string): string {
  return monthYearFmt.format(parseYmdUtcNoon(`${yyyymm}-01`));
}

export function isCurrentWeek(weekStart: string, today: string): boolean {
  return weekStart === weekStartFor(today);
}

export function isCurrentMonth(yyyymm: string, today: string): boolean {
  return yyyymm === today.slice(0, 7);
}
