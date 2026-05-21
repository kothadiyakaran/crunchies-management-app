import { supabase } from '@/lib/supabase';
import { todayInTz } from '@/lib/utils';
import { weekStartFor } from '@/lib/week';
import { listAllSeedDemand } from '@/features/products/api';
import { computeProductionWeek, type AlgorithmInput, type ProductionWeekRow } from './algorithm';

export type { ProductionWeekRow } from './algorithm';

export type ProductionLogRow = {
  id: string;
  product_id: string;
  made_on: string;
  qty: number;
};

export async function listRecentProduction(): Promise<ProductionLogRow[]> {
  const { data, error } = await supabase
    .from('production_logs')
    .select('id, product_id, made_on, qty')
    .order('made_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createProductionLog(input: {
  product_id: string;
  qty: number;
}): Promise<string> {
  const today = todayInTz();
  const { data, error } = await supabase
    .from('production_logs')
    .insert({ product_id: input.product_id, qty: input.qty, made_on: today })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'log insert failed');
  return data.id;
}

/**
 * Fetches raw inputs and computes the production-suggestion rows for THIS week
 * (in Asia/Kolkata). Aggregates client-side because at v1 scale (≤15 products)
 * the row counts are small. Migrate to a Postgres RPC later if needed.
 */
export async function getProductionThisWeek(): Promise<ProductionWeekRow[]> {
  const today = todayInTz();
  const weekStart = weekStartFor(today);
  const weekStartIso = `${weekStart}T00:00:00+05:30`;
  const weekStartUtcMs = new Date(`${weekStart}T00:00:00Z`).getTime();
  const fourWeeksAgo = new Date(weekStartUtcMs - 28 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const fourWeeksAgoIso = `${fourWeeksAgo}T00:00:00+05:30`;
  const weekEnd = new Date(weekStartUtcMs + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const weekEndIso = `${weekEnd}T00:00:00+05:30`;

  // In-house, active products
  const { data: productsData, error: pErr } = await supabase
    .from('products')
    .select('id, name, unit, is_seasonal, is_aggregated')
    .eq('active', true)
    .eq('is_aggregated', false);
  if (pErr) throw new Error(pErr.message);
  const products = (productsData ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    unit: p.unit,
    is_seasonal: p.is_seasonal,
    is_aggregated: p.is_aggregated,
  }));

  // For demand aggregations: fetch order_items with their orders embed,
  // filter by date in JS. PostgREST cross-table filters are fiddly under
  // strict TS; this is the safe path at v1 scale (≤15 products).
  const { data: itemsRaw, error: iErr } = await supabase
    .from('order_items')
    .select('product_id, qty, orders(ordered_at, target_fulfilment_date)');
  if (iErr) throw new Error(iErr.message);

  // PostgREST embed type inference under the JS client varies between
  // object-shape and array-shape depending on FK relationships. The cast
  // below is the pragmatic exit — at runtime `orders` is the single related
  // row (or null) because order_items.order_id is a non-null FK.
  type ItemWithOrder = {
    product_id: string;
    qty: number;
    orders: { ordered_at: string; target_fulfilment_date: string | null } | null;
  };
  const items = (itemsRaw ?? []) as unknown as ItemWithOrder[];

  const rollingDemand: Record<string, number> = {};
  const committedDemand: Record<string, number> = {};
  const firstOrderedAt: Record<string, string> = {};

  for (const it of items) {
    if (!it.orders) continue;
    const orderedAt = it.orders.ordered_at;
    const target = it.orders.target_fulfilment_date;

    // Rolling: orders.ordered_at in [weekStart - 4w, weekStart)
    if (orderedAt >= fourWeeksAgoIso && orderedAt < weekStartIso) {
      rollingDemand[it.product_id] = (rollingDemand[it.product_id] ?? 0) + Number(it.qty);
    }

    // Committed: target in [weekStart, weekEnd) OR (target null AND ordered_at in same)
    const targetInWeek = target !== null && target >= weekStart && target < weekEnd;
    const undatedInWeek = target === null && orderedAt >= weekStartIso && orderedAt < weekEndIso;
    if (targetInWeek || undatedInWeek) {
      committedDemand[it.product_id] = (committedDemand[it.product_id] ?? 0) + Number(it.qty);
    }

    // First ordered_at per product
    const cur = firstOrderedAt[it.product_id];
    if (cur === undefined || orderedAt < cur) {
      firstOrderedAt[it.product_id] = orderedAt;
    }
  }

  // Produced this week
  const { data: producedRaw, error: prErr } = await supabase
    .from('production_logs')
    .select('product_id, qty')
    .gte('made_on', weekStart)
    .lt('made_on', weekEnd);
  if (prErr) throw new Error(prErr.message);
  const producedQty: Record<string, number> = {};
  for (const r of producedRaw ?? []) {
    producedQty[r.product_id] = (producedQty[r.product_id] ?? 0) + Number(r.qty);
  }

  const seedQty = await listAllSeedDemand();

  const input: AlgorithmInput = {
    weekStart,
    products,
    rollingDemand,
    committedDemand,
    producedQty,
    seedQty,
    firstOrderedAt,
  };
  return computeProductionWeek(input);
}
