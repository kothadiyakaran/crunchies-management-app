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
    const subtitle = r.committed_qty > r.base ? 'includes pending orders' : null;
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
