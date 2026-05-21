import { describe, it, expect } from 'vitest';
import { computeProductionWeek, type AlgorithmInput } from './algorithm';

const baseProduct = { id: 'p1', name: 'Chivda', unit: '250g', is_seasonal: false, is_aggregated: false };

function input(over: Partial<AlgorithmInput> = {}): AlgorithmInput {
  return {
    weekStart: '2026-05-18',
    products: [baseProduct],
    rollingDemand: {},
    committedDemand: {},
    producedQty: {},
    seedQty: {},
    firstOrderedAt: {},
    ...over,
  };
}

describe('computeProductionWeek', () => {
  it('uses seed when no order history', () => {
    const rows = computeProductionWeek(input({ seedQty: { p1: 5 } }));
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.uses_seed).toBe(true);
    expect(row.weeks_of_history).toBe(0);
    expect(row.base).toBe(5);
    expect(row.suggested).toBe(5);
  });

  it('uses rolling average once weeks_of_history >= 4', () => {
    // first order 5 weeks before weekStart
    const fiveWeeksAgo = '2026-04-13T00:00:00Z';
    const rows = computeProductionWeek(
      input({
        rollingDemand: { p1: 16 }, // 16/4 = 4
        seedQty: { p1: 100 },       // should be ignored
        firstOrderedAt: { p1: fiveWeeksAgo },
      }),
    );
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.weeks_of_history).toBe(5);
    expect(row.uses_seed).toBe(false);
    expect(row.base).toBe(4);
    expect(row.suggested).toBe(4);
  });

  it('returns 0 (not negative) when produced exceeds base', () => {
    const rows = computeProductionWeek(input({ seedQty: { p1: 5 }, producedQty: { p1: 7 } }));
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.suggested).toBe(0);
  });

  it('clamps suggested to committed when committed > base', () => {
    const rows = computeProductionWeek(input({ seedQty: { p1: 2 }, committedDemand: { p1: 10 } }));
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.suggested).toBe(10);
  });

  it('excludes aggregated products entirely', () => {
    const rows = computeProductionWeek(
      input({
        products: [baseProduct, { ...baseProduct, id: 'p2', name: 'Ladoo', is_aggregated: true }],
        seedQty: { p1: 3, p2: 5 },
      }),
    );
    expect(rows.map((r) => r.product_id)).toEqual(['p1']);
  });

  it('uses seed for seasonal products even with order history', () => {
    const rows = computeProductionWeek(
      input({
        products: [{ ...baseProduct, is_seasonal: true }],
        rollingDemand: { p1: 40 }, // 10/wk if used
        seedQty: { p1: 0 },
        firstOrderedAt: { p1: '2026-04-13T00:00:00Z' }, // 5w ago
      }),
    );
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.uses_seed).toBe(true);
    expect(row.base).toBe(0);
    expect(row.suggested).toBe(0);
    // seed is present (value 0), so needs_seed is false
    expect(row.needs_seed).toBe(false);
  });

  it('uses_seed flag is true when ANY row uses seed (per-row), not aggregated', () => {
    // Just sanity check shape — uses_seed is per row not global
    const rows = computeProductionWeek(input({ seedQty: { p1: 3 } }));
    expect(rows[0]!.uses_seed).toBe(true);
  });

  it('sorts by suggested descending, alphabetical tie-break', () => {
    const rows = computeProductionWeek(
      input({
        products: [
          { ...baseProduct, id: 'a', name: 'Anaarse' },
          { ...baseProduct, id: 'b', name: 'Bhakarwadi' },
          { ...baseProduct, id: 'c', name: 'Chakli' },
        ],
        seedQty: { a: 2, b: 5, c: 5 },
      }),
    );
    expect(rows.map((r) => r.product_id)).toEqual(['b', 'c', 'a']);
    //                                            ^^^^^^^ tie at 5: B before C alphabetically
  });

  it('flags needs_seed when no seed and <4 weeks of history (non-seasonal)', () => {
    const rows = computeProductionWeek(input({})); // no seed, no history
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.needs_seed).toBe(true);
    expect(row.seed_qty).toBeNull();
    expect(row.suggested).toBe(0);
  });

  it('does NOT flag needs_seed once weeks_of_history >= 4 (rolling-avg case)', () => {
    const rows = computeProductionWeek(
      input({
        rollingDemand: { p1: 12 },
        firstOrderedAt: { p1: '2026-04-13T00:00:00Z' }, // 5w ago
      }),
    );
    expect(rows[0]!.needs_seed).toBe(false);
  });

  it('flags needs_seed for seasonal products without a seed', () => {
    const rows = computeProductionWeek(
      input({
        products: [{ id: 'p1', name: 'Chivda', unit: '250g', is_seasonal: true, is_aggregated: false }],
        firstOrderedAt: { p1: '2026-04-13T00:00:00Z' }, // even with 5w history
      }),
    );
    expect(rows[0]!.needs_seed).toBe(true);
  });
});
