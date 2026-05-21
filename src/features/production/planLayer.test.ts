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
});
