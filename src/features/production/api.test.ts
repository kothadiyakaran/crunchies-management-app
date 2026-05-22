import { describe, it, expect, vi, beforeEach } from 'vitest';

const fromMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
}));

// Pin todayInTz so weekStart math is deterministic. 2026-05-22 (Friday) →
// week start 2026-05-18 (Monday).
vi.mock('@/lib/utils', () => ({
  todayInTz: () => '2026-05-22',
  cn: (...args: unknown[]) => args.join(' '),
}));

// listAllSeedDemand reaches into seed_demand via supabase; the chain-mock
// below covers it. No separate vi.mock needed for the products module.

import { computeEventUplift, getProductionThisWeek } from './api';

beforeEach(() => fromMock.mockReset());

// ---------------------------------------------------------------------------
// 1. computeEventUplift — pure unit tests covering the touches-week math.
// ---------------------------------------------------------------------------

describe('computeEventUplift', () => {
  it('returns empty maps when no events provided', () => {
    const out = computeEventUplift('2026-05-18', []);
    expect(out.eventUplift).toEqual({});
    expect(out.eventSources).toEqual({});
  });

  it('event 2 weeks before festival (lead_weeks=3) contributes per-week uplift', () => {
    // weekStart = 2026-05-18; event starts 2026-06-08 (3 weeks later); lead_weeks=3
    // → touches range is [2026-05-18, 2026-06-08]. weekEnd=2026-05-25 falls inside.
    // expected_qty=12 → per-week contribution = 12/(3+1) = 3.
    const out = computeEventUplift('2026-05-18', [
      {
        id: 'ev1',
        name: 'Diwali Mela',
        starts_on: '2026-06-08',
        ends_on: '2026-06-08',
        lead_weeks: 3,
        demand: [{ product_id: 'p1', expected_qty: 12 }],
      },
    ]);
    expect(out.eventUplift['p1']).toBeCloseTo(3, 6);
    expect(out.eventSources['p1']).toEqual([{ event_name: 'Diwali Mela', qty: 3 }]);
  });

  it('event already past does NOT contribute (ends_on < weekStart)', () => {
    const out = computeEventUplift('2026-05-18', [
      {
        id: 'ev1',
        name: 'Past Event',
        starts_on: '2026-05-01',
        ends_on: '2026-05-10',
        lead_weeks: 2,
        demand: [{ product_id: 'p1', expected_qty: 10 }],
      },
    ]);
    expect(out.eventUplift).toEqual({});
    expect(out.eventSources).toEqual({});
  });

  it('event far in the future beyond its lead window does NOT contribute', () => {
    // event starts 2026-08-01, lead_weeks=2 → touches range starts 2026-07-18.
    // weekStart=2026-05-18 < 2026-07-18, weekEnd=2026-05-25 < 2026-07-18 → no touch.
    const out = computeEventUplift('2026-05-18', [
      {
        id: 'ev1',
        name: 'Far Future Event',
        starts_on: '2026-08-01',
        ends_on: '2026-08-01',
        lead_weeks: 2,
        demand: [{ product_id: 'p1', expected_qty: 10 }],
      },
    ]);
    expect(out.eventUplift).toEqual({});
  });

  it('multiple overlapping events sum per product, sources sorted desc by qty', () => {
    const out = computeEventUplift('2026-05-18', [
      {
        id: 'evSmall',
        name: 'Small Fair',
        starts_on: '2026-06-01',
        ends_on: '2026-06-01',
        lead_weeks: 2,
        demand: [{ product_id: 'p1', expected_qty: 6 }], // 6/3 = 2
      },
      {
        id: 'evBig',
        name: 'Big Mela',
        starts_on: '2026-06-08',
        ends_on: '2026-06-08',
        lead_weeks: 3,
        demand: [{ product_id: 'p1', expected_qty: 24 }], // 24/4 = 6
      },
    ]);
    expect(out.eventUplift['p1']).toBeCloseTo(8, 6); // 2 + 6
    expect(out.eventSources['p1']!.map((s) => s.event_name)).toEqual(['Big Mela', 'Small Fair']);
  });

  it('event spanning into the week itself (ends_on inside week) contributes', () => {
    // weekStart=2026-05-18, weekEnd=2026-05-25
    // event starts 2026-05-20, ends 2026-05-22, lead_weeks=0 → touches=[2026-05-20, 2026-05-22]
    const out = computeEventUplift('2026-05-18', [
      {
        id: 'ev1',
        name: 'Local Event',
        starts_on: '2026-05-20',
        ends_on: '2026-05-22',
        lead_weeks: 0,
        demand: [{ product_id: 'p1', expected_qty: 5 }], // 5/(0+1) = 5
      },
    ]);
    expect(out.eventUplift['p1']).toBeCloseTo(5, 6);
  });

  it('zero expected_qty rows are skipped (no entry in maps)', () => {
    const out = computeEventUplift('2026-05-18', [
      {
        id: 'ev1',
        name: 'Empty Demand Event',
        starts_on: '2026-06-01',
        ends_on: '2026-06-01',
        lead_weeks: 2,
        demand: [
          { product_id: 'p1', expected_qty: 0 },
          { product_id: 'p2', expected_qty: 9 }, // 9/3 = 3
        ],
      },
    ]);
    expect(out.eventUplift['p1']).toBeUndefined();
    expect(out.eventUplift['p2']).toBeCloseTo(3, 6);
  });
});

// ---------------------------------------------------------------------------
// 2. getProductionThisWeek — integration smoke that the events query + the
//    bulk event_demand fetch wire through to the algorithm input.
// ---------------------------------------------------------------------------

/** Build a chain-able fluent mock per existing pattern (see reports/api.test.ts). */
type Resp = { data: unknown; error: unknown };
function chain(resp: Resp) {
  const c: Record<string, unknown> = {};
  const methods = ['select', 'eq', 'neq', 'gte', 'lt', 'lte', 'in', 'is', 'or', 'order', 'limit'];
  for (const m of methods) c[m] = () => c;
  c.maybeSingle = () => Promise.resolve(resp);
  c.single = () => Promise.resolve(resp);
  c.then = (onFulfilled: (v: unknown) => unknown) => Promise.resolve(resp).then(onFulfilled);
  return c;
}

describe('getProductionThisWeek (event_uplift integration)', () => {
  it('week with no events leaves uplift fields at 0/empty', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'products') {
        return chain({
          data: [{ id: 'p1', name: 'Chakli', unit: 'pack', is_seasonal: false, is_aggregated: false }],
          error: null,
        });
      }
      if (table === 'order_items') {
        return chain({ data: [], error: null });
      }
      if (table === 'production_logs') {
        return chain({ data: [], error: null });
      }
      if (table === 'seed_demand') {
        // listAllSeedDemand selects product_id, weekly_avg_qty; here p1 has 5.
        return chain({
          data: [{ product_id: 'p1', weekly_avg_qty: 5 }],
          error: null,
        });
      }
      if (table === 'events') {
        return chain({ data: [], error: null });
      }
      if (table === 'event_demand') {
        // Should not be queried when events is empty, but handle defensively.
        return chain({ data: [], error: null });
      }
      return chain({ data: [], error: null });
    });

    const rows = await getProductionThisWeek();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.event_uplift).toBe(0);
    expect(rows[0]!.event_sources).toEqual([]);
    expect(rows[0]!.base).toBe(5); // seed only
  });

  it('week with a touching event populates event_uplift per product', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'products') {
        return chain({
          data: [
            { id: 'p1', name: 'Chakli', unit: 'pack', is_seasonal: false, is_aggregated: false },
            { id: 'p2', name: 'Chivda', unit: 'pack', is_seasonal: false, is_aggregated: false },
          ],
          error: null,
        });
      }
      if (table === 'order_items') {
        return chain({ data: [], error: null });
      }
      if (table === 'production_logs') {
        return chain({ data: [], error: null });
      }
      if (table === 'seed_demand') {
        return chain({
          data: [
            { product_id: 'p1', weekly_avg_qty: 5 },
            { product_id: 'p2', weekly_avg_qty: 5 },
          ],
          error: null,
        });
      }
      if (table === 'events') {
        // Festival starting 2026-06-08 (3 weeks after weekStart=2026-05-18),
        // lead_weeks=3 → touches range [2026-05-18, 2026-06-08]. The week
        // 2026-05-18 falls inside it.
        return chain({
          data: [
            {
              id: 'ev1',
              name: 'Diwali Mela',
              starts_on: '2026-06-08',
              ends_on: '2026-06-08',
              lead_weeks: 3,
              active: true,
            },
          ],
          error: null,
        });
      }
      if (table === 'event_demand') {
        return chain({
          data: [
            { event_id: 'ev1', product_id: 'p1', expected_qty: 12 }, // 12/4 = 3/week
            { event_id: 'ev1', product_id: 'p2', expected_qty: 0 }, // 0 → skipped
          ],
          error: null,
        });
      }
      return chain({ data: [], error: null });
    });

    const rows = await getProductionThisWeek();
    expect(rows).toHaveLength(2);
    const byId = Object.fromEntries(rows.map((r) => [r.product_id, r] as const));
    expect(byId['p1']!.event_uplift).toBe(3);
    expect(byId['p1']!.event_sources).toEqual([{ event_name: 'Diwali Mela', qty: 3 }]);
    expect(byId['p1']!.base).toBe(8); // 5 (seed) + 3 (uplift)
    // p2 had expected_qty=0 → no uplift entry
    expect(byId['p2']!.event_uplift).toBe(0);
    expect(byId['p2']!.event_sources).toEqual([]);
    expect(byId['p2']!.base).toBe(5);
  });
});
