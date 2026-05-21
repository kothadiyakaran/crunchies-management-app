export type AlgorithmInput = {
  weekStart: string;
  products: { id: string; name: string; unit: string; is_seasonal: boolean; is_aggregated: boolean }[];
  rollingDemand: Record<string, number>;
  committedDemand: Record<string, number>;
  producedQty: Record<string, number>;
  seedQty: Record<string, number>;
  firstOrderedAt: Record<string, string>;
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

    const base = p.is_seasonal
      ? seed_qty ?? 0
      : weeks_of_history >= 4
      ? rolling_avg
      : seed_qty ?? 0;

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
    });
  }
  rows.sort((a, b) => {
    if (b.suggested !== a.suggested) return b.suggested - a.suggested;
    return a.name.localeCompare(b.name);
  });
  return rows;
}
