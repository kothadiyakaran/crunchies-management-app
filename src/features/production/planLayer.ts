import type { ProductionWeekRow } from './algorithm';
import type { WeekPlanRow } from './api';

export type ProductionWeekRowFull = ProductionWeekRow & {
  planned_qty: number | null;
  original_planned_qty: number | null;
  target: number;
  gap: number;
  done: boolean;
  subtitle: string | null;
};

/** Event-uplift "contributes meaningfully" threshold (§11). 10% of base. */
const EVENT_UPLIFT_MEANINGFUL_RATIO = 0.1;

export function composeWithPlan(
  rows: ProductionWeekRow[],
  plans: Record<string, WeekPlanRow>,
): ProductionWeekRowFull[] {
  return rows.map((r) => {
    const plan = plans[r.product_id];
    const planned_qty = plan ? plan.planned_qty : null;
    const target = planned_qty ?? r.suggested;
    const gap = Math.max(0, target - r.produced_qty);
    const done = target > 0 && r.produced_qty >= target;

    // Subtitle precedence per §11 lines 1293–1296:
    //   1. committed_qty > base  → "includes pending orders" (most actionable)
    //   2. event_uplift contributes meaningfully → "includes ramp-up for {event}"
    //   3. otherwise no subtitle
    // When both apply, "includes pending orders" wins.
    let subtitle: string | null = null;
    if (r.committed_qty > r.base) {
      subtitle = 'includes pending orders';
    } else if (
      r.event_uplift > 0 &&
      r.event_sources.length > 0 &&
      r.event_uplift / Math.max(r.base, 1) >= EVENT_UPLIFT_MEANINGFUL_RATIO
    ) {
      subtitle = `includes ramp-up for ${r.event_sources[0]!.event_name}`;
    }

    return {
      ...r,
      planned_qty,
      original_planned_qty: plan ? plan.original_planned_qty : null,
      target,
      gap,
      done,
      subtitle,
    };
  });
}
