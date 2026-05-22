/**
 * Pure calibration math for the Reports surface.
 *
 * Spec: docs/v1-spec.md §9.1 (Week tab calibration card) + §9.3 (Plan accuracy).
 *
 * Per-week plan accuracy is defined as:
 *   100 - absolute_variance_percent
 * where absolute_variance_percent is the volume-weighted average of
 *   |demand - plan| / max(demand, plan)
 * across all products that had a plan that week (per-row weight = max(demand, plan)).
 *
 * Rows where `plan = NULL AND made = 0 AND demand = 0` are hidden entirely.
 * Rows with `plan_set_retrospectively = true` display with a footnote but are
 * excluded from the Trends accuracy aggregate (i.e. excluded from weeklyAccuracyPct).
 */

export type CalibrationRow = {
  product_id: string;
  product_name: string;
  unit: string;
  /** original_planned_qty for the week; null when no plan was saved. */
  plan: number | null;
  /** SUM(production_logs.qty) for the week. */
  made: number;
  /** SUM(order_items.qty) for orders whose target_fulfilment_date lies in the week. */
  demand: number;
  /** True when the plan row was first saved AFTER the week ended. */
  plan_set_retrospectively: boolean;
};

/** (demand - plan), or null when plan is null. */
export function calibrationVariance(row: { plan: number | null; demand: number }): number | null {
  if (row.plan === null) return null;
  return row.demand - row.plan;
}

/**
 * Variance as integer percent of plan: round((demand - plan) / plan * 100).
 * Returns null when plan is null OR (plan === 0 AND demand === 0).
 * When plan === 0 AND demand > 0, return 100 (per the API contract — special-case
 * for spec readability, since dividing by zero is otherwise undefined).
 */
export function calibrationVariancePct(row: { plan: number | null; demand: number }): number | null {
  if (row.plan === null) return null;
  if (row.plan === 0) {
    if (row.demand === 0) return null;
    return 100;
  }
  const pct = ((row.demand - row.plan) / row.plan) * 100;
  return Math.round(pct);
}

/**
 * Per-row accuracy %:
 *   100 - (|demand - plan| / max(demand, plan)) * 100
 * rounded to integer.
 *
 * Returns null when plan is null OR (plan === 0 AND demand === 0).
 * When plan === 0 AND demand > 0, returns 0 (worst-case miss against a zero plan).
 */
export function rowAccuracyPct(row: { plan: number | null; demand: number }): number | null {
  if (row.plan === null) return null;
  const denom = Math.max(row.demand, row.plan);
  if (denom === 0) return null;
  const diff = Math.abs(row.demand - row.plan);
  const acc = 100 - (diff / denom) * 100;
  return Math.round(acc);
}

/**
 * Weighted weekly accuracy % across all eligible rows.
 *
 * Eligibility: plan !== null AND NOT plan_set_retrospectively AND max(demand, plan) > 0.
 * Per-row weight = max(demand, plan). Rounds final result to integer.
 * Returns null when no eligible rows.
 */
export function weeklyAccuracyPct(rows: CalibrationRow[]): number | null {
  let totalWeight = 0;
  let weightedSum = 0;
  for (const r of rows) {
    if (r.plan === null) continue;
    if (r.plan_set_retrospectively) continue;
    const weight = Math.max(r.demand, r.plan);
    if (weight <= 0) continue;
    const diff = Math.abs(r.demand - r.plan);
    const acc = 100 - (diff / weight) * 100;
    weightedSum += acc * weight;
    totalWeight += weight;
  }
  if (totalWeight === 0) return null;
  return Math.round(weightedSum / totalWeight);
}

/** Filters out rows where plan === null AND made === 0 AND demand === 0 (spec §9.1). */
export function visibleCalibrationRows(rows: CalibrationRow[]): CalibrationRow[] {
  return rows.filter((r) => !(r.plan === null && r.made === 0 && r.demand === 0));
}

/**
 * Sort by |variance| descending. Rows with null plan sort to the end.
 * Stable on product_name as tiebreak.
 */
export function sortByVarianceDescending(rows: CalibrationRow[]): CalibrationRow[] {
  const indexed = rows.map((r, i) => ({ r, i }));
  indexed.sort((a, b) => {
    const va = calibrationVariance(a.r);
    const vb = calibrationVariance(b.r);
    // null plan sorts last
    if (va === null && vb === null) {
      const byName = a.r.product_name.localeCompare(b.r.product_name);
      return byName !== 0 ? byName : a.i - b.i;
    }
    if (va === null) return 1;
    if (vb === null) return -1;
    const absA = Math.abs(va);
    const absB = Math.abs(vb);
    if (absA !== absB) return absB - absA;
    const byName = a.r.product_name.localeCompare(b.r.product_name);
    return byName !== 0 ? byName : a.i - b.i;
  });
  return indexed.map((x) => x.r);
}
