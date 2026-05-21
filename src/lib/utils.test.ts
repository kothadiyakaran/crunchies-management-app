import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { todayInTz } from './utils';

describe('todayInTz', () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('returns Asia/Kolkata date during the IST early-morning UTC-yesterday window', () => {
    // 2026-05-22 01:00 IST = 2026-05-21 19:30 UTC
    vi.setSystemTime(new Date('2026-05-21T19:30:00Z'));
    expect(todayInTz('Asia/Kolkata')).toBe('2026-05-22');
  });

  it('returns the same UTC date during daytime IST', () => {
    // 2026-05-22 12:00 IST = 2026-05-22 06:30 UTC
    vi.setSystemTime(new Date('2026-05-22T06:30:00Z'));
    expect(todayInTz('Asia/Kolkata')).toBe('2026-05-22');
  });

  it('returns UTC date when timeZone=UTC', () => {
    vi.setSystemTime(new Date('2026-05-21T19:30:00Z'));
    expect(todayInTz('UTC')).toBe('2026-05-21');
  });
});
