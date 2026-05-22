import { describe, it, expect } from 'vitest';
import { composeWithPlan } from './planLayer';
import type { ProductionWeekRow } from './algorithm';

function baseRow(over: Partial<ProductionWeekRow> = {}): ProductionWeekRow {
  return {
    product_id: 'p1',
    name: 'Chivda',
    unit: '250g',
    is_seasonal: false,
    rolling_avg: 0,
    seed_qty: null,
    weeks_of_history: 0,
    committed_qty: 0,
    produced_qty: 0,
    base: 0,
    suggested: 0,
    uses_seed: false,
    needs_seed: false,
    event_uplift: 0,
    event_sources: [],
    ...over,
  };
}

describe('composeWithPlan', () => {
  it('uses suggested as target when no plan exists', () => {
    const out = composeWithPlan([baseRow({ suggested: 5 })], {});
    const row = out[0]!;
    expect(row.planned_qty).toBeNull();
    expect(row.target).toBe(5);
    expect(row.gap).toBe(5);
    expect(row.done).toBe(false);
  });

  it('uses plan as target when plan exists, regardless of suggested', () => {
    const out = composeWithPlan(
      [baseRow({ suggested: 5 })],
      { p1: { planned_qty: 3, original_planned_qty: 3, entered_at: '2026-05-18T03:00:00Z' } },
    );
    const row = out[0]!;
    expect(row.planned_qty).toBe(3);
    expect(row.target).toBe(3);
    expect(row.gap).toBe(3);
  });

  it('done=true when produced >= target AND target > 0', () => {
    const out = composeWithPlan(
      [baseRow({ suggested: 5, produced_qty: 5 })],
      {},
    );
    const row = out[0]!;
    expect(row.done).toBe(true);
    expect(row.gap).toBe(0);
  });

  it('done=false when target=0 and produced=0 (skip-week case)', () => {
    const out = composeWithPlan(
      [baseRow({ suggested: 5, produced_qty: 0 })],
      { p1: { planned_qty: 0, original_planned_qty: 0, entered_at: '2026-05-18T03:00:00Z' } },
    );
    const row = out[0]!;
    expect(row.target).toBe(0);
    expect(row.done).toBe(false);
    expect(row.gap).toBe(0);
  });

  it('subtitle "includes pending orders" when committed > base', () => {
    const out = composeWithPlan(
      [baseRow({ base: 2, committed_qty: 5, suggested: 5 })],
      {},
    );
    const row = out[0]!;
    expect(row.subtitle).toBe('includes pending orders');
  });

  it('subtitle null when committed equals base', () => {
    const out = composeWithPlan(
      [baseRow({ base: 5, committed_qty: 5, suggested: 5 })],
      {},
    );
    const row = out[0]!;
    expect(row.subtitle).toBeNull();
  });

  it('subtitle null when committed < base', () => {
    const out = composeWithPlan(
      [baseRow({ base: 5, committed_qty: 2, suggested: 5 })],
      {},
    );
    const row = out[0]!;
    expect(row.subtitle).toBeNull();
  });

  it('plan_qty is preserved alongside original_planned_qty', () => {
    const out = composeWithPlan(
      [baseRow()],
      { p1: { planned_qty: 4, original_planned_qty: 3, entered_at: '2026-05-18T03:00:00Z' } },
    );
    const row = out[0]!;
    expect(row.planned_qty).toBe(4);
    expect(row.original_planned_qty).toBe(3);
    expect(row.target).toBe(4);
  });

  // ---------------------------------------------------------------------------
  // §11 subtitle precedence (T9.4) — committed > base beats event-ramp-up.
  // ---------------------------------------------------------------------------

  it('subtitle "includes ramp-up for X" when event_uplift meaningfully contributes', () => {
    // base=10, uplift=3 → 30% of base, well above the 10% threshold.
    const out = composeWithPlan(
      [
        baseRow({
          base: 10,
          committed_qty: 0,
          event_uplift: 3,
          event_sources: [{ event_name: 'Diwali Mela', qty: 3 }],
        }),
      ],
      {},
    );
    expect(out[0]!.subtitle).toBe('includes ramp-up for Diwali Mela');
  });

  it('subtitle null when event_uplift below the meaningful threshold (<10%)', () => {
    // base=100, uplift=5 → 5% of base, below threshold.
    const out = composeWithPlan(
      [
        baseRow({
          base: 100,
          committed_qty: 0,
          event_uplift: 5,
          event_sources: [{ event_name: 'Tiny Fair', qty: 5 }],
        }),
      ],
      {},
    );
    expect(out[0]!.subtitle).toBeNull();
  });

  it('"includes pending orders" wins when both apply', () => {
    // committed=15 > base=10 AND uplift=4 above threshold.
    const out = composeWithPlan(
      [
        baseRow({
          base: 10,
          committed_qty: 15,
          event_uplift: 4,
          event_sources: [{ event_name: 'Diwali Mela', qty: 4 }],
        }),
      ],
      {},
    );
    expect(out[0]!.subtitle).toBe('includes pending orders');
  });

  it('picks most-contributing event for the subtitle (event_sources[0])', () => {
    const out = composeWithPlan(
      [
        baseRow({
          base: 10,
          committed_qty: 0,
          event_uplift: 7,
          event_sources: [
            { event_name: 'Big Event', qty: 5 },
            { event_name: 'Small Event', qty: 2 },
          ],
        }),
      ],
      {},
    );
    expect(out[0]!.subtitle).toBe('includes ramp-up for Big Event');
  });

  it('subtitle null when event_uplift > 0 but event_sources is empty (defensive)', () => {
    const out = composeWithPlan(
      [baseRow({ base: 10, event_uplift: 3, event_sources: [] })],
      {},
    );
    expect(out[0]!.subtitle).toBeNull();
  });
});
