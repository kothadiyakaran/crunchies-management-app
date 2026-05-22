import { describe, it, expect } from 'vitest';
import { isQuiet, quietDurationDays, type QuietInput } from './quiet';

const base: QuietInput = {
  channel_name: 'Personal',
  last_ordered_at: null,
  last_contacted_at: null,
  created_at: '2026-01-01T00:00:00+05:30',
};

describe('quietDurationDays', () => {
  it('Reseller → 21', () => expect(quietDurationDays('Reseller', false)).toBe(21));
  it('Personal → 60', () => expect(quietDurationDays('Personal', false)).toBe(60));
  it('Personal → 60 regardless of has_orders flag', () =>
    expect(quietDurationDays('Personal', true)).toBe(60));
  it('Exhibition with no orders → 30', () =>
    expect(quietDurationDays('Exhibition', false)).toBe(30));
  it('Exhibition with orders → 90', () =>
    expect(quietDurationDays('Exhibition', true)).toBe(90));
  it('Unknown / custom channel → 60 (default like Personal)', () =>
    expect(quietDurationDays('Friends', false)).toBe(60));
});

describe('isQuiet', () => {
  const today = '2026-05-22';

  it('Personal customer never ordered, created 90 days ago → quiet', () => {
    const r = isQuiet({ ...base, channel_name: 'Personal', created_at: '2026-02-21T00:00:00+05:30' }, today);
    expect(r.isQuiet).toBe(true);
    expect(r.daysSince).toBeGreaterThanOrEqual(90);
    expect(r.thresholdDays).toBe(60);
  });

  it('Personal customer ordered 30 days ago → NOT quiet (under 60 threshold)', () => {
    const r = isQuiet(
      { ...base, channel_name: 'Personal', last_ordered_at: '2026-04-22T10:00:00+05:30' },
      today,
    );
    expect(r.isQuiet).toBe(false);
  });

  it('Reseller contacted 22 days ago → quiet (over 21 threshold)', () => {
    const r = isQuiet(
      { ...base, channel_name: 'Reseller', last_contacted_at: '2026-04-30T10:00:00+05:30' },
      today,
    );
    expect(r.isQuiet).toBe(true);
  });

  it('Exhibition customer never ordered, created 20 days ago → NOT quiet (under 30)', () => {
    const r = isQuiet(
      { ...base, channel_name: 'Exhibition', created_at: '2026-05-02T00:00:00+05:30' },
      today,
    );
    expect(r.isQuiet).toBe(false);
    expect(r.thresholdDays).toBe(30);
  });

  it('Exhibition customer with orders, last ordered 100 days ago → quiet (over 90)', () => {
    const r = isQuiet(
      {
        ...base,
        channel_name: 'Exhibition',
        last_ordered_at: '2026-02-11T10:00:00+05:30',
      },
      today,
    );
    expect(r.isQuiet).toBe(true);
    expect(r.thresholdDays).toBe(90);
  });

  it('uses the MOST RECENT of last_ordered_at / last_contacted_at / created_at', () => {
    // Personal, created 200d ago, no orders, contacted 10d ago → not quiet
    const r = isQuiet(
      {
        channel_name: 'Personal',
        last_ordered_at: null,
        last_contacted_at: '2026-05-12T10:00:00+05:30',
        created_at: '2025-11-01T00:00:00+05:30',
      },
      today,
    );
    expect(r.isQuiet).toBe(false);
    expect(r.daysSince).toBeLessThan(15);
  });
});
