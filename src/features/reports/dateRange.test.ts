import { describe, it, expect } from 'vitest';
import {
  weekRange,
  previousWeekStart,
  nextWeekStart,
  lastCompletedWeekStart,
  monthRange,
  previousMonth,
  nextMonth,
  currentMonth,
  formatWeekLabel,
  formatMonthLabel,
  isCurrentWeek,
  isCurrentMonth,
} from './dateRange';

describe('weekRange', () => {
  it('returns [Mon, next-Mon) for a Monday-start', () => {
    expect(weekRange('2026-05-18')).toEqual({
      start: '2026-05-18',
      endExclusive: '2026-05-25',
    });
  });

  it('handles month-boundary weeks', () => {
    expect(weekRange('2026-04-27')).toEqual({
      start: '2026-04-27',
      endExclusive: '2026-05-04',
    });
  });
});

describe('previousWeekStart / nextWeekStart', () => {
  it('previousWeekStart subtracts 7 days', () => {
    expect(previousWeekStart('2026-05-18')).toBe('2026-05-11');
  });

  it('nextWeekStart adds 7 days', () => {
    expect(nextWeekStart('2026-05-18')).toBe('2026-05-25');
  });

  it('crosses month boundary going back', () => {
    expect(previousWeekStart('2026-05-04')).toBe('2026-04-27');
  });

  it('crosses year boundary going back', () => {
    // Mon 2026-01-05 - 7 = Mon 2025-12-29
    expect(previousWeekStart('2026-01-05')).toBe('2025-12-29');
  });
});

describe('lastCompletedWeekStart', () => {
  it('Friday 2026-05-22 → 2026-05-11 (Mon-18 week is still in progress)', () => {
    expect(lastCompletedWeekStart('2026-05-22')).toBe('2026-05-11');
  });

  it('Sunday 2026-05-24 → 2026-05-11 (current week not complete until Sun ends)', () => {
    expect(lastCompletedWeekStart('2026-05-24')).toBe('2026-05-11');
  });

  it('Monday 2026-05-25 → 2026-05-18 (Mon-18 week just completed)', () => {
    expect(lastCompletedWeekStart('2026-05-25')).toBe('2026-05-18');
  });
});

describe('monthRange', () => {
  it('May 2026', () => {
    expect(monthRange('2026-05')).toEqual({
      start: '2026-05-01',
      endExclusive: '2026-06-01',
    });
  });

  it('December rolls into next year January', () => {
    expect(monthRange('2026-12')).toEqual({
      start: '2026-12-01',
      endExclusive: '2027-01-01',
    });
  });

  it('January 2027 points to February 2027', () => {
    expect(monthRange('2027-01')).toEqual({
      start: '2027-01-01',
      endExclusive: '2027-02-01',
    });
  });

  it('February in a non-leap year ends on March 1', () => {
    expect(monthRange('2026-02')).toEqual({
      start: '2026-02-01',
      endExclusive: '2026-03-01',
    });
  });
});

describe('previousMonth / nextMonth', () => {
  it('previousMonth: 2026-05 → 2026-04', () => {
    expect(previousMonth('2026-05')).toBe('2026-04');
  });

  it('previousMonth rolls year back: 2026-01 → 2025-12', () => {
    expect(previousMonth('2026-01')).toBe('2025-12');
  });

  it('nextMonth: 2026-05 → 2026-06', () => {
    expect(nextMonth('2026-05')).toBe('2026-06');
  });

  it('nextMonth rolls year forward: 2026-12 → 2027-01', () => {
    expect(nextMonth('2026-12')).toBe('2027-01');
  });
});

describe('currentMonth', () => {
  it('returns the YYYY-MM prefix of today', () => {
    expect(currentMonth('2026-05-22')).toBe('2026-05');
  });

  it('handles first-of-month', () => {
    expect(currentMonth('2026-01-01')).toBe('2026-01');
  });
});

describe('formatWeekLabel', () => {
  it('same-month week → single trailing month', () => {
    // Mon 2026-05-18 .. Sun 2026-05-24
    expect(formatWeekLabel('2026-05-18')).toBe('Mon 18 – Sun 24 May');
  });

  it('cross-month week → both month names', () => {
    // Mon 2026-04-27 .. Sun 2026-05-03
    expect(formatWeekLabel('2026-04-27')).toBe('Mon 27 Apr – Sun 03 May');
  });

  it('year-boundary week', () => {
    // Mon 2025-12-29 .. Sun 2026-01-04
    expect(formatWeekLabel('2025-12-29')).toBe('Mon 29 Dec – Sun 04 Jan');
  });
});

describe('formatMonthLabel', () => {
  it('formats May 2026', () => {
    expect(formatMonthLabel('2026-05')).toBe('May 2026');
  });

  it('formats December 2026', () => {
    expect(formatMonthLabel('2026-12')).toBe('December 2026');
  });

  it('formats January 2027', () => {
    expect(formatMonthLabel('2027-01')).toBe('January 2027');
  });
});

describe('isCurrentWeek', () => {
  it('true when weekStart equals weekStartFor(today)', () => {
    // 2026-05-22 is a Friday; ISO Monday is 2026-05-18.
    expect(isCurrentWeek('2026-05-18', '2026-05-22')).toBe(true);
  });

  it('false for the previous week', () => {
    expect(isCurrentWeek('2026-05-11', '2026-05-22')).toBe(false);
  });

  it('true on Monday itself', () => {
    expect(isCurrentWeek('2026-05-18', '2026-05-18')).toBe(true);
  });

  it('true on Sunday (last day of the same ISO week)', () => {
    expect(isCurrentWeek('2026-05-18', '2026-05-24')).toBe(true);
  });
});

describe('isCurrentMonth', () => {
  it('true when yyyymm matches today prefix', () => {
    expect(isCurrentMonth('2026-05', '2026-05-22')).toBe(true);
  });

  it('false for the previous month', () => {
    expect(isCurrentMonth('2026-04', '2026-05-22')).toBe(false);
  });

  it('false across year boundary', () => {
    expect(isCurrentMonth('2025-12', '2026-01-01')).toBe(false);
  });
});
