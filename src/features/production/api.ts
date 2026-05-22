import { supabase } from '@/lib/supabase';
import { todayInTz } from '@/lib/utils';
import { weekStartFor } from '@/lib/week';
import { listAllSeedDemand } from '@/features/products/api';
import {
  computeProductionWeek,
  type AlgorithmInput,
  type EventSource,
  type ProductionWeekRow,
} from './algorithm';

export type { ProductionWeekRow } from './algorithm';

/**
 * Pure helper: given a week and a list of (event, event_demand_rows) tuples,
 * compute per-product uplift totals + per-product contributing-event lists.
 *
 * An event "touches" the week when:
 *     (starts_on - lead_weeks*7 days) < weekEnd  AND  ends_on >= weekStart
 *
 * Per-week contribution from a touching event E to product P:
 *     event_demand(E, P).expected_qty / (E.lead_weeks + 1)
 *
 * Even split across prep weeks + event week per §11. (For a multi-week event,
 * uplift fires every prep week AND every event week, so total contribution
 * across the lifecycle can exceed expected_qty — that's per spec, not a bug.)
 *
 * Inactive events (`active=false`) should be filtered upstream; this helper
 * does not re-check. Aggregated products are handled by the algorithm step.
 */
export function computeEventUplift(
  weekStart: string, // YYYY-MM-DD (Monday)
  touchingEvents: {
    id: string;
    name: string;
    starts_on: string;
    ends_on: string;
    lead_weeks: number;
    demand: { product_id: string; expected_qty: number }[];
  }[],
): { eventUplift: Record<string, number>; eventSources: Record<string, EventSource[]> } {
  const weekStartMs = new Date(`${weekStart}T00:00:00Z`).getTime();
  const weekEndMs = weekStartMs + 7 * 24 * 60 * 60 * 1000;
  const weekEnd = new Date(weekEndMs).toISOString().slice(0, 10);

  const eventUplift: Record<string, number> = {};
  const eventSources: Record<string, EventSource[]> = {};

  for (const ev of touchingEvents) {
    const startsMs = new Date(`${ev.starts_on}T00:00:00Z`).getTime();
    const startMinusLeadMs = startsMs - ev.lead_weeks * 7 * 24 * 60 * 60 * 1000;
    const startMinusLead = new Date(startMinusLeadMs).toISOString().slice(0, 10);
    // Event touches week if its (starts - lead) is before weekEnd AND ends_on >= weekStart.
    const touches = startMinusLead < weekEnd && ev.ends_on >= weekStart;
    if (!touches) continue;

    const divisor = ev.lead_weeks + 1;
    for (const d of ev.demand) {
      const expected = Number(d.expected_qty);
      if (!expected) continue;
      const perWeek = expected / divisor;
      eventUplift[d.product_id] = (eventUplift[d.product_id] ?? 0) + perWeek;
      if (!eventSources[d.product_id]) eventSources[d.product_id] = [];
      eventSources[d.product_id]!.push({ event_name: ev.name, qty: perWeek });
    }
  }

  // Algorithm re-sorts event_sources defensively, but sort here too so callers
  // (and tests) see a consistent ordering.
  for (const pid of Object.keys(eventSources)) {
    eventSources[pid]!.sort((a, b) => b.qty - a.qty);
  }

  return { eventUplift, eventSources };
}

export type ProductionLogRow = {
  id: string;
  product_id: string;
  qty: number;
  made_on: string;
  notes: string | null;
  created_at: string;
};

export async function listRecentProduction(): Promise<ProductionLogRow[]> {
  const { data, error } = await supabase
    .from('production_logs')
    .select('id, product_id, qty, made_on, notes, created_at')
    .order('made_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as ProductionLogRow[];
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

  // --- §11 event_uplift -----------------------------------------------------
  // Pull all active events whose window could possibly intersect this week
  // (starts_on - lead_weeks*7 <= weekEnd AND ends_on >= weekStart). We
  // approximate the lower bound by fetching everything with ends_on >= weekStart
  // and refining in JS (`computeEventUplift` does the precise touches-check).
  // At v1 scale (a handful of events) this is fine; the JS-side filter keeps
  // the SQL trivially correct.
  const { data: eventsRaw, error: evErr } = await supabase
    .from('events')
    .select('id, name, starts_on, ends_on, lead_weeks, active')
    .eq('active', true)
    .gte('ends_on', weekStart);
  if (evErr) throw new Error(evErr.message);
  type EvRow = {
    id: string;
    name: string;
    starts_on: string;
    ends_on: string;
    lead_weeks: number;
    active: boolean;
  };
  const allEvents = (eventsRaw ?? []) as EvRow[];

  let eventUplift: Record<string, number> = {};
  let eventSources: Record<string, EventSource[]> = {};
  if (allEvents.length > 0) {
    // Bulk-fetch event_demand for all candidate events in one round-trip.
    const eventIds = allEvents.map((e) => e.id);
    const { data: demandRaw, error: dmErr } = await supabase
      .from('event_demand')
      .select('event_id, product_id, expected_qty')
      .in('event_id', eventIds);
    if (dmErr) throw new Error(dmErr.message);
    type DmRow = { event_id: string; product_id: string; expected_qty: number };
    const demandRows = (demandRaw ?? []) as DmRow[];
    const demandByEvent = new Map<string, { product_id: string; expected_qty: number }[]>();
    for (const d of demandRows) {
      if (!demandByEvent.has(d.event_id)) demandByEvent.set(d.event_id, []);
      demandByEvent.get(d.event_id)!.push({ product_id: d.product_id, expected_qty: Number(d.expected_qty) });
    }
    const eventsForUplift = allEvents.map((e) => ({
      id: e.id,
      name: e.name,
      starts_on: e.starts_on,
      ends_on: e.ends_on,
      lead_weeks: e.lead_weeks,
      demand: demandByEvent.get(e.id) ?? [],
    }));
    const out = computeEventUplift(weekStart, eventsForUplift);
    eventUplift = out.eventUplift;
    eventSources = out.eventSources;
  }

  const input: AlgorithmInput = {
    weekStart,
    products,
    rollingDemand,
    committedDemand,
    producedQty,
    seedQty,
    firstOrderedAt,
    eventUplift,
    eventSources,
  };
  return computeProductionWeek(input);
}

export type WeekPlanRow = {
  planned_qty: number;
  original_planned_qty: number;
  entered_at: string;
};

export async function getProductionPlansForWeek(weekStart: string): Promise<Record<string, WeekPlanRow>> {
  const { data, error } = await supabase
    .from('production_plans')
    .select('product_id, planned_qty, original_planned_qty, entered_at')
    .eq('week_start', weekStart);
  if (error) throw new Error(error.message);
  const out: Record<string, WeekPlanRow> = {};
  for (const r of data ?? []) {
    out[r.product_id] = {
      planned_qty: Number(r.planned_qty),
      original_planned_qty: Number(r.original_planned_qty),
      entered_at: r.entered_at,
    };
  }
  return out;
}

/**
 * Upserts a production_plans row.
 * - On first insert: original_planned_qty is set to qty (the calibration anchor — see §12).
 * - On update: only planned_qty changes. original_planned_qty stays frozen.
 *
 * Implementation: SELECT first, then INSERT or UPDATE. Single-tenant (mom is sole writer),
 * so a race here is impossible at v1 scale. If concurrency ever becomes a concern, migrate
 * to a Postgres function with the same semantics.
 */
export async function upsertProductionPlan(
  productId: string,
  weekStart: string,
  qty: number,
): Promise<void> {
  const { data: existing, error: selErr } = await supabase
    .from('production_plans')
    .select('product_id')
    .eq('product_id', productId)
    .eq('week_start', weekStart)
    .maybeSingle();
  if (selErr) throw new Error(selErr.message);
  if (existing) {
    const { error } = await supabase
      .from('production_plans')
      .update({ planned_qty: qty })
      .eq('product_id', productId)
      .eq('week_start', weekStart);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('production_plans').insert({
      product_id: productId,
      week_start: weekStart,
      planned_qty: qty,
      original_planned_qty: qty,
    });
    if (error) throw new Error(error.message);
  }
}

export async function listProductionLogsForProductInWeek(
  productId: string,
  weekStart: string,
): Promise<ProductionLogRow[]> {
  const weekEndMs = new Date(`${weekStart}T00:00:00Z`).getTime() + 7 * 24 * 60 * 60 * 1000;
  const weekEnd = new Date(weekEndMs).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('production_logs')
    .select('id, product_id, qty, made_on, notes, created_at')
    .eq('product_id', productId)
    .gte('made_on', weekStart)
    .lt('made_on', weekEnd)
    .order('made_on', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProductionLogRow[];
}

export async function getProductionLog(id: string): Promise<ProductionLogRow | null> {
  const { data, error } = await supabase
    .from('production_logs')
    .select('id, product_id, qty, made_on, notes, created_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as ProductionLogRow | null;
}

export async function updateProductionLog(
  id: string,
  patch: { qty?: number; made_on?: string; notes?: string | null },
): Promise<void> {
  const { error } = await supabase.from('production_logs').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteProductionLog(id: string): Promise<void> {
  const { error } = await supabase.from('production_logs').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Returns aggregated (from-other-makers) products with committed demand THIS WEEK.
 * Used by §5 Section D. Empty when no aggregated products have demand this week.
 */
export type AggregatedRow = {
  product_id: string;
  name: string;
  source_maker_name: string | null;
  unit: string;
  committed_qty: number;
};

export async function getAggregatedThisWeek(): Promise<AggregatedRow[]> {
  const today = todayInTz();
  const weekStart = weekStartFor(today);
  const weekEndMs = new Date(`${weekStart}T00:00:00Z`).getTime() + 7 * 24 * 60 * 60 * 1000;
  const weekEnd = new Date(weekEndMs).toISOString().slice(0, 10);

  // Active aggregated products
  const { data: products, error: pErr } = await supabase
    .from('products')
    .select('id, name, unit, source_maker_name')
    .eq('active', true)
    .eq('is_aggregated', true);
  if (pErr) throw new Error(pErr.message);
  if (!products || products.length === 0) return [];

  type ItemWithOrder = {
    product_id: string;
    qty: number;
    orders: { target_fulfilment_date: string | null; ordered_at: string } | null;
  };
  const { data: itemsData, error: iErr } = await supabase
    .from('order_items')
    .select('product_id, qty, orders(target_fulfilment_date, ordered_at)')
    .in('product_id', products.map((p) => p.id));
  if (iErr) throw new Error(iErr.message);
  const items = (itemsData ?? []) as unknown as ItemWithOrder[];

  const weekStartIso = `${weekStart}T00:00:00+05:30`;
  const weekEndIso = `${weekEnd}T00:00:00+05:30`;
  const committed: Record<string, number> = {};
  for (const it of items) {
    const o = it.orders;
    if (!o) continue;
    const matchesDated = o.target_fulfilment_date && o.target_fulfilment_date >= weekStart && o.target_fulfilment_date < weekEnd;
    const matchesUndated = o.target_fulfilment_date === null && o.ordered_at >= weekStartIso && o.ordered_at < weekEndIso;
    if (matchesDated || matchesUndated) {
      committed[it.product_id] = (committed[it.product_id] ?? 0) + Number(it.qty);
    }
  }

  return products
    .map((p) => ({
      product_id: p.id,
      name: p.name,
      source_maker_name: p.source_maker_name,
      unit: p.unit,
      committed_qty: committed[p.id] ?? 0,
    }))
    .filter((r) => r.committed_qty > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Weeks elapsed since this product's first order, in Asia/Kolkata.
 * Returns 0 if the product has no orders yet. Used by EditProductPage to
 * decide whether to make the seed field read-only (>=4 weeks -> read-only per §11).
 */
export async function getWeeksOfHistoryForProduct(productId: string): Promise<number> {
  const { data, error } = await supabase
    .from('order_items')
    .select('orders!inner(ordered_at)')
    .eq('product_id', productId)
    .order('orders(ordered_at)', { ascending: true })
    .limit(1);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as { orders: { ordered_at: string } }[];
  if (rows.length === 0) return 0;
  const firstRow = rows[0];
  if (!firstRow) return 0;
  const first = new Date(firstRow.orders.ordered_at).getTime();
  const weekStart = weekStartFor(todayInTz());
  const now = new Date(`${weekStart}T00:00:00Z`).getTime();
  const days = Math.floor((now - first) / (24 * 60 * 60 * 1000));
  return Math.max(0, Math.floor(days / 7));
}
