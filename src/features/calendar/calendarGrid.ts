import { addDays, shortWeekday, weekdayOf } from '@shared/reminders';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export function monthOf(ymd: string): string {
  return ymd.slice(0, 7);
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export function dayLabel(ymd: string): string {
  const m = Number(ymd.slice(5, 7));
  return `${shortWeekday(ymd)} ${Number(ymd.slice(8, 10))} ${MONTH_NAMES[m - 1]}`;
}

/** 42 dates (6 weeks), Monday-first, covering the month. */
export function monthGrid(month: string): string[] {
  const first = `${month}-01`;
  const offset = (weekdayOf(first) + 6) % 7; // days since Monday
  const start = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export type DaySummary = { pending: number; total: number; overdue: boolean; allFulfilled: boolean };

export function summariseDay<T extends { target_fulfilment_date: string | null; fulfilled_at: string | null }>(
  orders: T[],
  day: string,
  today: string,
): DaySummary {
  const onDay = orders.filter((o) => o.target_fulfilment_date === day);
  const pending = onDay.filter((o) => o.fulfilled_at === null).length;
  return {
    pending,
    total: onDay.length,
    overdue: day < today && pending > 0,
    allFulfilled: onDay.length > 0 && pending === 0,
  };
}

export function eventsOnDay<E extends { starts_on: string; ends_on: string }>(events: E[], day: string): E[] {
  return events.filter((e) => e.starts_on <= day && day <= e.ends_on);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

export function eventDayIndex(ev: { starts_on: string; ends_on: string }, day: string): { n: number; of: number } {
  return { n: daysBetween(ev.starts_on, day) + 1, of: daysBetween(ev.starts_on, ev.ends_on) + 1 };
}
