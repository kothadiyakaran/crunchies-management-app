import {
  addMonths,
  dayLabel,
  eventDayIndex,
  eventsOnDay,
  monthGrid,
  monthLabel,
  monthOf,
  summariseDay,
} from './calendarGrid';

describe('months', () => {
  it('derives and shifts months across year boundaries', () => {
    expect(monthOf('2026-11-24')).toBe('2026-11');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(monthLabel('2026-11')).toBe('November 2026');
  });

  it('builds a Monday-first 42-cell grid', () => {
    const g = monthGrid('2026-11'); // Nov 1 2026 is a Sunday
    expect(g).toHaveLength(42);
    expect(g[0]).toBe('2026-10-26');
    expect(g[6]).toBe('2026-11-01');
    expect(g[41]).toBe('2026-12-06');
  });

  it('starts on day 1 when the month starts on Monday', () => {
    expect(monthGrid('2026-06')[0]).toBe('2026-06-01');
  });

  it('labels a day for screen readers', () => {
    expect(dayLabel('2026-11-24')).toBe('Tue 24 November');
  });
});

describe('summariseDay', () => {
  const day = '2026-11-20';
  const orders = [
    { target_fulfilment_date: day, fulfilled_at: null },
    { target_fulfilment_date: day, fulfilled_at: '2026-11-20' },
    { target_fulfilment_date: '2026-11-21', fulfilled_at: null },
  ];

  it('counts pending and total for the day', () => {
    expect(summariseDay(orders, day, '2026-11-18')).toEqual({
      pending: 1,
      total: 2,
      overdue: false,
      allFulfilled: false,
    });
  });

  it('flags overdue only for past days with pending orders', () => {
    expect(summariseDay(orders, day, '2026-11-21').overdue).toBe(true);
    expect(summariseDay(orders, day, day).overdue).toBe(false);
  });

  it('marks all fulfilled when every order is done', () => {
    const done = [{ target_fulfilment_date: day, fulfilled_at: day }];
    expect(summariseDay(done, day, '2026-11-25')).toEqual({ pending: 0, total: 1, overdue: false, allFulfilled: true });
    expect(summariseDay([], day, '2026-11-25').allFulfilled).toBe(false);
  });
});

describe('events', () => {
  const ev = { starts_on: '2026-11-23', ends_on: '2026-11-25' };
  it('includes both ends of the event', () => {
    expect(eventsOnDay([ev], '2026-11-23')).toHaveLength(1);
    expect(eventsOnDay([ev], '2026-11-25')).toHaveLength(1);
    expect(eventsOnDay([ev], '2026-11-26')).toHaveLength(0);
  });
  it('numbers the event day', () => {
    expect(eventDayIndex(ev, '2026-11-24')).toEqual({ n: 2, of: 3 });
  });
});
