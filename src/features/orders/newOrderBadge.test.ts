import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          gt: () => Promise.resolve({ count: 0, error: null }),
        }),
      }),
    }),
  },
}));

import { getLastSeenAt, markOrdersSeen } from './newOrderBadge';

describe('newOrderBadge', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to epoch when key absent', () => {
    expect(getLastSeenAt()).toBe('1970-01-01T00:00:00Z');
  });

  it('markOrdersSeen writes a recent ISO string', () => {
    markOrdersSeen();
    expect(new Date(getLastSeenAt()).getTime()).toBeGreaterThan(Date.now() - 1000);
  });

  it('roundtrip preserves write', () => {
    markOrdersSeen();
    const stored = getLastSeenAt();
    expect(stored).not.toBe('1970-01-01T00:00:00Z');
    expect(stored).toBe(localStorage.getItem('orders:lastSeenAt'));
  });

  it('subsequent markOrdersSeen advances the timestamp', async () => {
    markOrdersSeen();
    const first = getLastSeenAt();
    await new Promise((r) => setTimeout(r, 5));
    markOrdersSeen();
    const second = getLastSeenAt();
    expect(new Date(second).getTime()).toBeGreaterThanOrEqual(new Date(first).getTime());
  });
});
