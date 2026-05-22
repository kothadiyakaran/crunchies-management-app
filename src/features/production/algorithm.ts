export type EventSource = {
  event_name: string;
  qty: number;
};

export type AlgorithmInput = {
  weekStart: string;
  products: { id: string; name: string; unit: string; is_seasonal: boolean; is_aggregated: boolean }[];
  rollingDemand: Record<string, number>;
  committedDemand: Record<string, number>;
  producedQty: Record<string, number>;
  seedQty: Record<string, number>;
  firstOrderedAt: Record<string, string>;
  /**
   * Per-product total event uplift contribution this week, summed across all
   * touching events. Required — pass `{}` for "no events touch this week".
   * See §11 spec: event_uplift(P, W).
   */
  eventUplift: Record<string, number>;
  /**
   * Per-product list of contributing events with their individual per-week
   * uplift contribution. Used to populate row subtitle ("includes ramp-up
   * for X"). Required — pass `{}` when no events contribute. Sorted desc by
   * qty so consumers can pick the most-contributing event with
   * `event_sources[0]`. (Sort is enforced by the algorithm regardless of
   * input order.)
   */
  eventSources: Record<string, EventSource[]>;
};

export type ProductionWeekRow = {
  product_id: string;
  name: string;
  unit: string;
  is_seasonal: boolean;
  rolling_avg: number;
  seed_qty: number | null;
  weeks_of_history: number;
  committed_qty: number;
  produced_qty: number;
  base: number;
  suggested: number;
  uses_seed: boolean;
  needs_seed: boolean;
  /** Total event uplift contribution this week (summed across touching events). */
  event_uplift: number;
  /** Contributing events sorted desc by per-week contribution. */
  event_sources: EventSource[];
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function weeksBetween(fromIso: string, toYmd: string): number {
  const from = new Date(fromIso).getTime();
  const to = new Date(`${toYmd}T00:00:00Z`).getTime();
  const days = Math.floor((to - from) / MS_PER_DAY);
  return Math.max(0, Math.floor(days / 7));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function computeProductionWeek(input: AlgorithmInput): ProductionWeekRow[] {
  const rows: ProductionWeekRow[] = [];
  for (const p of input.products) {
    if (p.is_aggregated) continue;
    const rolling_avg = round1((input.rollingDemand[p.id] ?? 0) / 4);
    const rawSeed = input.seedQty[p.id];
    const seed_qty: number | null = rawSeed === undefined ? null : rawSeed;
    const first = input.firstOrderedAt[p.id];
    const weeks_of_history = first ? weeksBetween(first, input.weekStart) : 0;
    const committed_qty = input.committedDemand[p.id] ?? 0;
    const produced_qty = input.producedQty[p.id] ?? 0;
    const event_uplift = round1(input.eventUplift[p.id] ?? 0);
    // Defensive copy + sort: spec invariant (f) — event_sources sorted desc by qty.
    const event_sources: EventSource[] = (input.eventSources[p.id] ?? [])
      .map((s) => ({ event_name: s.event_name, qty: s.qty }))
      .sort((a, b) => b.qty - a.qty);

    // Per §11: base = (rolling_avg | seed) + event_uplift.
    //   - is_seasonal=true → seed-based regardless of history
    //   - <4w history       → seed-based
    //   - else              → rolling_avg-based
    // Missing seed treated as 0 (mom hasn't seeded yet); needs_seed flag fires
    // separately. event_uplift is additive in all branches.
    const baseline = p.is_seasonal
      ? seed_qty ?? 0
      : weeks_of_history >= 4
      ? rolling_avg
      : seed_qty ?? 0;
    const base = round1(baseline + event_uplift);

    const suggested = round1(Math.max(0, Math.max(base, committed_qty) - produced_qty));
    const uses_seed = p.is_seasonal || weeks_of_history < 4;
    const needs_seed = seed_qty === null && (p.is_seasonal || weeks_of_history < 4);

    rows.push({
      product_id: p.id,
      name: p.name,
      unit: p.unit,
      is_seasonal: p.is_seasonal,
      rolling_avg,
      seed_qty,
      weeks_of_history,
      committed_qty,
      produced_qty,
      base,
      suggested,
      uses_seed,
      needs_seed,
      event_uplift,
      event_sources,
    });
  }
  rows.sort((a, b) => {
    if (b.suggested !== a.suggested) return b.suggested - a.suggested;
    return a.name.localeCompare(b.name);
  });
  return rows;
}
