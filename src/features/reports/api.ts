/**
 * Reports aggregation reads (Sprint 8 Task 3).
 *
 * Mirrors the client-side aggregation pattern in
 * `src/features/production/api.ts:getProductionThisWeek` — fetch raw rows from
 * Postgres, group/sum in TypeScript. v1 scale (≤15 products, ≤100s of customers,
 * ≤thousands of orders) tolerates this comfortably; migrate to RPCs later if needed.
 *
 * All functions take YYYY-MM-DD strings (or YYYY-MM for months / yyyymm). Range
 * filters use `[start, endExclusive)` semantics throughout. NULL
 * `target_fulfilment_date` orders attribute to the week of `ordered_at` (per §12)
 * by comparing against `weekStart` / `weekEnd` ISO timestamps at +05:30 — same
 * rule as `getProductionThisWeek`.
 *
 * Spec: docs/v1-spec.md §9.
 */

import { supabase } from '@/lib/supabase';
import { todayInTz } from '@/lib/utils';
import { orderTotal } from '@/features/orders/discount';
import {
  weekRange,
  monthRange,
  lastCompletedWeekStart,
  previousWeekStart,
  previousMonth,
  currentMonth,
} from './dateRange';
import {
  type CalibrationRow,
  weeklyAccuracyPct,
  rowAccuracyPct,
  calibrationVariancePct,
} from './calibration';

const DAY_MS = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD → ISO string at +05:30 (Asia/Kolkata midnight). */
function ymdToIstIso(ymd: string): string {
  return `${ymd}T00:00:00+05:30`;
}

// ============================================================================
// Calibration rows for a week — drives Week-tab hero + Trends accuracy.
// ============================================================================

/**
 * Per active in-house product: plan / made / demand for the week, plus
 * the `plan_set_retrospectively` flag. Aggregated products excluded.
 *
 * - plan: production_plans.original_planned_qty (frozen first-saved value, §12).
 * - made: SUM(production_logs.qty) for made_on in [weekStart, weekEnd).
 * - demand: SUM(order_items.qty) for orders with target_fulfilment_date in
 *   the week OR (target_fulfilment_date IS NULL AND ordered_at in the week
 *   at Asia/Kolkata). Same logic as `getProductionThisWeek`.
 * - plan_set_retrospectively: production_plans.entered_at >= end-of-week
 *   ISO timestamp (Monday 00:00 IST after the week). Spec line 1083 uses
 *   `>` semantically; at timestamptz precision `>=` is equivalent and easier
 *   to assert in tests.
 */
export async function getCalibrationRowsForWeek(weekStart: string): Promise<CalibrationRow[]> {
  const { endExclusive: weekEnd } = weekRange(weekStart);
  const weekStartIso = ymdToIstIso(weekStart);
  const weekEndIso = ymdToIstIso(weekEnd);

  // In-house active products
  const { data: productsData, error: pErr } = await supabase
    .from('products')
    .select('id, name, unit')
    .eq('active', true)
    .eq('is_aggregated', false);
  if (pErr) throw new Error(pErr.message);
  const products = (productsData ?? []) as { id: string; name: string; unit: string }[];

  // Plans for this week
  const { data: plansData, error: plErr } = await supabase
    .from('production_plans')
    .select('product_id, original_planned_qty, entered_at')
    .eq('week_start', weekStart);
  if (plErr) throw new Error(plErr.message);
  const planByProduct: Record<string, { qty: number; retrospective: boolean }> = {};
  for (const p of plansData ?? []) {
    planByProduct[p.product_id] = {
      qty: Number(p.original_planned_qty),
      retrospective: p.entered_at >= weekEndIso,
    };
  }

  // Made: SUM(production_logs.qty) for made_on in [weekStart, weekEnd)
  const { data: madeData, error: mErr } = await supabase
    .from('production_logs')
    .select('product_id, qty')
    .gte('made_on', weekStart)
    .lt('made_on', weekEnd);
  if (mErr) throw new Error(mErr.message);
  const madeByProduct: Record<string, number> = {};
  for (const r of madeData ?? []) {
    madeByProduct[r.product_id] = (madeByProduct[r.product_id] ?? 0) + Number(r.qty);
  }

  // Demand: order_items embedded with orders, filtered in JS by target/ordered_at
  type ItemWithOrder = {
    product_id: string;
    qty: number;
    orders: { ordered_at: string; target_fulfilment_date: string | null } | null;
  };
  const { data: itemsRaw, error: iErr } = await supabase
    .from('order_items')
    .select('product_id, qty, orders(ordered_at, target_fulfilment_date)');
  if (iErr) throw new Error(iErr.message);
  const items = (itemsRaw ?? []) as unknown as ItemWithOrder[];

  const demandByProduct: Record<string, number> = {};
  for (const it of items) {
    if (!it.orders) continue;
    const target = it.orders.target_fulfilment_date;
    const orderedAt = it.orders.ordered_at;
    const targetInWeek = target !== null && target >= weekStart && target < weekEnd;
    const undatedInWeek =
      target === null && orderedAt >= weekStartIso && orderedAt < weekEndIso;
    if (targetInWeek || undatedInWeek) {
      demandByProduct[it.product_id] = (demandByProduct[it.product_id] ?? 0) + Number(it.qty);
    }
  }

  return products.map((p) => {
    const plan = planByProduct[p.id];
    return {
      product_id: p.id,
      product_name: p.name,
      unit: p.unit,
      plan: plan ? plan.qty : null,
      made: madeByProduct[p.id] ?? 0,
      demand: demandByProduct[p.id] ?? 0,
      plan_set_retrospectively: plan ? plan.retrospective : false,
    };
  });
}

// ============================================================================
// Order summary — Week + Month tabs.
// ============================================================================

export type OrderSummary = {
  total_orders: number;
  total_value: number;
  fulfilled_count: number;
  outstanding_value: number;
  outstanding_count: number;
};

export async function getOrderSummary(start: string, endExclusive: string): Promise<OrderSummary> {
  const startIso = ymdToIstIso(start);
  const endIso = ymdToIstIso(endExclusive);
  type Raw = {
    id: string;
    fulfilled_at: string | null;
    payment_status: 'unpaid' | 'paid' | 'partial';
    discount_percent: number;
    order_items: { qty: number; unit_price: number }[] | null;
  };
  const { data, error } = await supabase
    .from('orders')
    .select('id, fulfilled_at, payment_status, discount_percent, order_items(qty, unit_price)')
    .gte('ordered_at', startIso)
    .lt('ordered_at', endIso);
  if (error) throw new Error(error.message);
  const orders = (data ?? []) as unknown as Raw[];

  let total_orders = 0;
  let total_value = 0;
  let fulfilled_count = 0;
  let outstanding_value = 0;
  let outstanding_count = 0;

  for (const o of orders) {
    total_orders += 1;
    const subtotal = (o.order_items ?? []).reduce(
      (s, i) => s + Number(i.qty) * Number(i.unit_price),
      0,
    );
    const value = orderTotal(subtotal, Number(o.discount_percent)).total;
    total_value += value;
    if (o.fulfilled_at !== null) fulfilled_count += 1;
    if (o.payment_status === 'unpaid' || o.payment_status === 'partial') {
      outstanding_value += value;
      outstanding_count += 1;
    }
  }

  return { total_orders, total_value, fulfilled_count, outstanding_value, outstanding_count };
}

// ============================================================================
// New customers by channel — Week + Month tabs.
// ============================================================================

export type ChannelSplitRow = { channel_name: string; count: number };

export async function getNewCustomersByChannel(
  start: string,
  endExclusive: string,
): Promise<ChannelSplitRow[]> {
  const startIso = ymdToIstIso(start);
  const endIso = ymdToIstIso(endExclusive);
  const { data, error } = await supabase
    .from('customers')
    .select('id, channel_id, channels(name)')
    .gte('created_at', startIso)
    .lt('created_at', endIso);
  if (error) throw new Error(error.message);
  type Raw = { channel_id: string; channels: { name: string } | null };
  const rows = (data ?? []) as unknown as Raw[];

  const counts: Record<string, number> = {};
  const names: Record<string, string> = {};
  for (const r of rows) {
    counts[r.channel_id] = (counts[r.channel_id] ?? 0) + 1;
    names[r.channel_id] = r.channels?.name ?? '(unknown)';
  }
  return Object.entries(counts)
    .map(([channel_id, count]) => ({ channel_name: names[channel_id] ?? '(unknown)', count }))
    .sort((a, b) => b.count - a.count || a.channel_name.localeCompare(b.channel_name));
}

// ============================================================================
// Top products + Top customers — Week + Month tabs.
// ============================================================================

export type TopProductRow = {
  product_id: string;
  name: string;
  unit: string;
  qty: number;
  value: number;
};

export async function getTopProducts(
  start: string,
  endExclusive: string,
  limit: number,
): Promise<TopProductRow[]> {
  const startIso = ymdToIstIso(start);
  const endIso = ymdToIstIso(endExclusive);
  type Raw = {
    qty: number;
    unit_price: number;
    product_id: string;
    products: { name: string; unit: string } | null;
    orders: { ordered_at: string; discount_percent: number } | null;
  };
  const { data, error } = await supabase
    .from('order_items')
    .select(
      'qty, unit_price, product_id, products(name, unit), orders!inner(ordered_at, discount_percent)',
    )
    .gte('orders.ordered_at', startIso)
    .lt('orders.ordered_at', endIso);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Raw[];

  const acc: Record<string, TopProductRow> = {};
  for (const r of rows) {
    if (!r.orders) continue; // !inner should guarantee, but be defensive
    const lineNet =
      Number(r.qty) * Number(r.unit_price) * ((100 - Number(r.orders.discount_percent)) / 100);
    const existing = acc[r.product_id];
    if (existing) {
      existing.qty += Number(r.qty);
      existing.value += lineNet;
    } else {
      acc[r.product_id] = {
        product_id: r.product_id,
        name: r.products?.name ?? '(unknown)',
        unit: r.products?.unit ?? '',
        qty: Number(r.qty),
        value: lineNet,
      };
    }
  }
  return Object.values(acc)
    .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export type TopCustomerRow = {
  customer_id: string;
  name: string;
  channel_name: string;
  order_count: number;
  value: number;
};

export async function getTopCustomers(
  start: string,
  endExclusive: string,
  limit: number,
): Promise<TopCustomerRow[]> {
  const startIso = ymdToIstIso(start);
  const endIso = ymdToIstIso(endExclusive);
  type Raw = {
    id: string;
    customer_id: string;
    discount_percent: number;
    customers: { name: string; channels: { name: string } | null } | null;
    order_items: { qty: number; unit_price: number }[] | null;
  };
  const { data, error } = await supabase
    .from('orders')
    .select(
      'id, customer_id, discount_percent, customers(name, channels(name)), order_items(qty, unit_price)',
    )
    .gte('ordered_at', startIso)
    .lt('ordered_at', endIso);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Raw[];

  const acc: Record<string, TopCustomerRow> = {};
  for (const o of rows) {
    const subtotal = (o.order_items ?? []).reduce(
      (s, i) => s + Number(i.qty) * Number(i.unit_price),
      0,
    );
    const value = orderTotal(subtotal, Number(o.discount_percent)).total;
    const existing = acc[o.customer_id];
    if (existing) {
      existing.order_count += 1;
      existing.value += value;
    } else {
      acc[o.customer_id] = {
        customer_id: o.customer_id,
        name: o.customers?.name ?? '(unknown)',
        channel_name: o.customers?.channels?.name ?? '(unknown)',
        order_count: 1,
        value,
      };
    }
  }
  return Object.values(acc)
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
    .slice(0, limit);
}

// ============================================================================
// Complaints in range — Week + Month tabs.
// ============================================================================

export type ComplaintListItem = {
  id: string;
  order_id: string;
  customer_name: string;
  kind: string;
  description: string;
  reported_at: string;
  resolved_at: string | null;
};

export async function getComplaintsInRange(
  start: string,
  endExclusive: string,
): Promise<ComplaintListItem[]> {
  type Raw = {
    id: string;
    order_id: string;
    kind: string;
    description: string;
    reported_at: string;
    resolved_at: string | null;
    orders: { customers: { name: string } | null } | null;
  };
  const { data, error } = await supabase
    .from('complaints')
    .select(
      'id, order_id, kind, description, reported_at, resolved_at, orders(customers(name))',
    )
    .gte('reported_at', start)
    .lt('reported_at', endExclusive)
    .order('reported_at', { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Raw[];
  return rows.map((r) => ({
    id: r.id,
    order_id: r.order_id,
    customer_name: r.orders?.customers?.name ?? '(unknown)',
    kind: r.kind,
    description: r.description,
    reported_at: r.reported_at,
    resolved_at: r.resolved_at,
  }));
}

// ============================================================================
// Month-tab extras: channel breakdown, customer base health, exhibition repeat.
// ============================================================================

export type ChannelBreakdownRow = { channel_name: string; count: number; value: number };

export async function getChannelBreakdown(
  start: string,
  endExclusive: string,
): Promise<ChannelBreakdownRow[]> {
  const startIso = ymdToIstIso(start);
  const endIso = ymdToIstIso(endExclusive);
  type Raw = {
    id: string;
    discount_percent: number;
    customers: { channel_id: string; channels: { name: string } | null } | null;
    order_items: { qty: number; unit_price: number }[] | null;
  };
  const { data, error } = await supabase
    .from('orders')
    .select(
      'id, discount_percent, customers(channel_id, channels(name)), order_items(qty, unit_price)',
    )
    .gte('ordered_at', startIso)
    .lt('ordered_at', endIso);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Raw[];

  const acc: Record<string, ChannelBreakdownRow> = {};
  for (const o of rows) {
    const channelName = o.customers?.channels?.name ?? '(unknown)';
    const subtotal = (o.order_items ?? []).reduce(
      (s, i) => s + Number(i.qty) * Number(i.unit_price),
      0,
    );
    const value = orderTotal(subtotal, Number(o.discount_percent)).total;
    const existing = acc[channelName];
    if (existing) {
      existing.count += 1;
      existing.value += value;
    } else {
      acc[channelName] = { channel_name: channelName, count: 1, value };
    }
  }
  return Object.values(acc).sort(
    (a, b) => b.value - a.value || a.channel_name.localeCompare(b.channel_name),
  );
}

export type CustomerBaseHealth = {
  new_this_month: number;
  currently_quiet: number;
  reactivated_this_month: number;
};

export async function getCustomerBaseHealth(
  monthYyyymm: string,
  today: string,
): Promise<CustomerBaseHealth> {
  const { start, endExclusive } = monthRange(monthYyyymm);
  const startIso = ymdToIstIso(start);
  const endIso = ymdToIstIso(endExclusive);

  // 1. New this month — count customers created in the month
  const { count: newCount, error: nErr } = await supabase
    .from('customers')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', startIso)
    .lt('created_at', endIso);
  if (nErr) throw new Error(nErr.message);

  // 2. + 3. Both need all active customers with channel name + activity fields.
  type ActiveRaw = {
    id: string;
    created_at: string;
    last_ordered_at: string | null;
    last_contacted_at: string | null;
    channels: { name: string } | null;
  };
  const { data: activeData, error: aErr } = await supabase
    .from('customers')
    .select('id, created_at, last_ordered_at, last_contacted_at, channels(name)')
    .eq('active', true);
  if (aErr) throw new Error(aErr.message);
  const active = (activeData ?? []) as unknown as ActiveRaw[];

  const { isQuiet } = await import('@/features/customers/quiet');

  let currently_quiet = 0;
  for (const c of active) {
    const channelName = c.channels?.name ?? '';
    const res = isQuiet(
      {
        channel_name: channelName,
        last_ordered_at: c.last_ordered_at,
        last_contacted_at: c.last_contacted_at,
        created_at: c.created_at,
      },
      today,
    );
    if (res.isQuiet) currently_quiet += 1;
  }

  // 3. Reactivated: customers whose last_ordered_at falls in the month AND
  //    who would have been quiet had we ignored that order. (Approximation
  //    per the API contract — see task description.)
  let reactivated_this_month = 0;
  for (const c of active) {
    if (c.last_ordered_at === null) continue;
    // last_ordered_at is a `date` column (YYYY-MM-DD) per the date-columns rule.
    // Compare it lexicographically against the month YYYY-MM-DD range.
    if (c.last_ordered_at < start || c.last_ordered_at >= endExclusive) continue;
    const channelName = c.channels?.name ?? '';
    const counterfactual = isQuiet(
      {
        channel_name: channelName,
        last_ordered_at: null, // ignore this month's order
        last_contacted_at: c.last_contacted_at,
        created_at: c.created_at,
      },
      today,
    );
    if (counterfactual.isQuiet) reactivated_this_month += 1;
  }

  return {
    new_this_month: newCount ?? 0,
    currently_quiet,
    reactivated_this_month,
  };
}

export type ExhibitionRepeatRate = {
  total_acquired: number;
  repeated: number;
  pct: number;
  show: boolean; // false when total_acquired < 5
};

export async function getExhibitionRepeatRate(today: string): Promise<ExhibitionRepeatRate> {
  // Rolling 90 days ending at `today`
  const todayMs = new Date(`${today}T12:00:00Z`).getTime();
  const cutoffMs = todayMs - 90 * DAY_MS;
  const cutoff = new Date(cutoffMs).toISOString().slice(0, 10);
  const cutoffIso = ymdToIstIso(cutoff);

  // Acquired: customers with channel = Exhibition AND created_at >= cutoff.
  // Pre-fetch the Exhibition channel id (case-insensitive on name).
  const { data: channels, error: chErr } = await supabase
    .from('channels')
    .select('id, name');
  if (chErr) throw new Error(chErr.message);
  const exhibition = (channels ?? []).find(
    (c) => c.name.trim().toLowerCase() === 'exhibition',
  );
  if (!exhibition) {
    return { total_acquired: 0, repeated: 0, pct: 0, show: false };
  }

  type CustRaw = { id: string; created_at: string };
  const { data: custData, error: cErr } = await supabase
    .from('customers')
    .select('id, created_at')
    .eq('channel_id', exhibition.id)
    .gte('created_at', cutoffIso);
  if (cErr) throw new Error(cErr.message);
  const acquired = (custData ?? []) as unknown as CustRaw[];
  const total_acquired = acquired.length;

  if (total_acquired === 0) {
    return { total_acquired: 0, repeated: 0, pct: 0, show: false };
  }

  // For each acquired customer, does any order have ordered_at > customer.created_at?
  // Fetch orders for these customers, check ordered_at > created_at (strict).
  const ids = acquired.map((c) => c.id);
  type OrderRaw = { customer_id: string; ordered_at: string };
  const { data: orderData, error: oErr } = await supabase
    .from('orders')
    .select('customer_id, ordered_at')
    .in('customer_id', ids);
  if (oErr) throw new Error(oErr.message);
  const orders = (orderData ?? []) as unknown as OrderRaw[];

  const ordersByCustomer: Record<string, string[]> = {};
  for (const o of orders) {
    const arr = ordersByCustomer[o.customer_id] ?? [];
    arr.push(o.ordered_at);
    ordersByCustomer[o.customer_id] = arr;
  }

  let repeated = 0;
  for (const c of acquired) {
    const list = ordersByCustomer[c.id] ?? [];
    // "Follow-up order strictly after their initial order." We interpret
    // `customer.created_at` as the proxy for the initial-order timestamp
    // (per the task description); any order whose ordered_at is strictly
    // greater than created_at counts as a repeat.
    if (list.some((iso) => iso > c.created_at)) repeated += 1;
  }

  const pct = total_acquired > 0 ? Math.round((repeated / total_acquired) * 100) : 0;
  return {
    total_acquired,
    repeated,
    pct,
    show: total_acquired >= 5,
  };
}

// ============================================================================
// Trends tab reads.
// ============================================================================

export type PerWeekAccuracy = { weekStart: string; accuracy: number | null };

export async function getPerWeekAccuracyLastN(
  weeksBack: number,
  today: string,
): Promise<PerWeekAccuracy[]> {
  // Collect the N most recent COMPLETED week-starts (oldest-first).
  const newest = lastCompletedWeekStart(today);
  const weeks: string[] = [newest];
  for (let i = 1; i < weeksBack; i += 1) {
    const prev = weeks[0];
    if (prev === undefined) break;
    weeks.unshift(previousWeekStart(prev));
  }
  // weeks is currently oldest-first because we unshift; ensure newest is at the end.
  // Actually: we started with [newest], then unshift(prev) repeatedly puts older to
  // front. So final order is oldest..newest, which is what we want.

  const out: PerWeekAccuracy[] = [];
  for (const w of weeks) {
    const rows = await getCalibrationRowsForWeek(w);
    out.push({ weekStart: w, accuracy: weeklyAccuracyPct(rows) });
  }
  return out;
}

export type PerProductTrend = {
  product_id: string;
  name: string;
  unit: string;
  /** Per-week accuracy, oldest-first, length = weeksBack (default 8). */
  sparkline: (number | null)[];
  /** Mean(current 8w) - mean(prior 8w), rounded; null when either window is empty. */
  delta: number | null;
  biggest_miss: { weekStart: string; variancePct: number } | null;
};

export async function getPerProductTrends(today: string): Promise<PerProductTrend[]> {
  const WINDOW = 8;
  // We need 16 weeks of calibration: current 8 (sparkline) + prior 8 (delta baseline).
  const newest = lastCompletedWeekStart(today);
  const allWeeks: string[] = [newest];
  for (let i = 1; i < WINDOW * 2; i += 1) {
    const prev = allWeeks[0];
    if (prev === undefined) break;
    allWeeks.unshift(previousWeekStart(prev));
  }
  // allWeeks is oldest..newest, length WINDOW*2. The last WINDOW entries are
  // the current window; the first WINDOW are the prior window.
  const priorWeeks = allWeeks.slice(0, WINDOW);
  const currentWeeks = allWeeks.slice(WINDOW);

  // Pre-fetch active in-house products once for stable name/unit and result order.
  const { data: prodData, error: pErr } = await supabase
    .from('products')
    .select('id, name, unit')
    .eq('active', true)
    .eq('is_aggregated', false)
    .order('name', { ascending: true });
  if (pErr) throw new Error(pErr.message);
  const products = (prodData ?? []) as { id: string; name: string; unit: string }[];

  // Fetch calibration once per week (each call returns rows for all products).
  const calibByWeek: Record<string, CalibrationRow[]> = {};
  for (const w of allWeeks) {
    calibByWeek[w] = await getCalibrationRowsForWeek(w);
  }

  const result: PerProductTrend[] = products.map((p) => {
    const sparkline: (number | null)[] = currentWeeks.map((w) => {
      const rows = calibByWeek[w] ?? [];
      const row = rows.find((r) => r.product_id === p.id);
      if (!row) return null;
      if (row.plan_set_retrospectively) return null;
      return rowAccuracyPct(row);
    });

    const priorAcc = priorWeeks
      .map((w) => {
        const rows = calibByWeek[w] ?? [];
        const row = rows.find((r) => r.product_id === p.id);
        if (!row || row.plan_set_retrospectively) return null;
        return rowAccuracyPct(row);
      })
      .filter((x): x is number => x !== null);

    const currentAccNumbers = sparkline.filter((x): x is number => x !== null);

    let delta: number | null = null;
    if (currentAccNumbers.length > 0 && priorAcc.length > 0) {
      const currMean = currentAccNumbers.reduce((s, n) => s + n, 0) / currentAccNumbers.length;
      const priorMean = priorAcc.reduce((s, n) => s + n, 0) / priorAcc.length;
      delta = Math.round(currMean - priorMean);
    }

    // biggest_miss: over the current 8 weeks, the (week, variancePct) with max |variancePct|.
    let biggest_miss: { weekStart: string; variancePct: number } | null = null;
    for (const w of currentWeeks) {
      const rows = calibByWeek[w] ?? [];
      const row = rows.find((r) => r.product_id === p.id);
      if (!row) continue;
      const v = calibrationVariancePct(row);
      if (v === null) continue;
      if (biggest_miss === null || Math.abs(v) > Math.abs(biggest_miss.variancePct)) {
        biggest_miss = { weekStart: w, variancePct: v };
      }
    }

    return {
      product_id: p.id,
      name: p.name,
      unit: p.unit,
      sparkline,
      delta,
      biggest_miss,
    };
  });

  // Sort by lifetime volume DESC per spec §9.3 line 1091 ("top 5 by lifetime volume").
  // One extra query against order_items; v1 scale tolerates the SUM client-side.
  const { data: volData, error: volErr } = await supabase
    .from('order_items')
    .select('product_id, qty');
  if (volErr) throw new Error(volErr.message);
  const lifetimeVol: Record<string, number> = {};
  for (const r of volData ?? []) {
    lifetimeVol[r.product_id] = (lifetimeVol[r.product_id] ?? 0) + Number(r.qty);
  }
  result.sort((a, b) => {
    const va = lifetimeVol[a.product_id] ?? 0;
    const vb = lifetimeVol[b.product_id] ?? 0;
    if (vb !== va) return vb - va;
    return a.name.localeCompare(b.name);
  });
  return result;
}

export type MonthlyChannelMix = {
  yyyymm: string;
  channels: ChannelBreakdownRow[];
  totalValue: number;
};

export async function getMonthlyChannelMixLastN(
  months: number,
  today: string,
): Promise<MonthlyChannelMix[]> {
  // Collect the last N months ending with currentMonth(today), oldest-first.
  const newest = currentMonth(today);
  const list: string[] = [newest];
  for (let i = 1; i < months; i += 1) {
    const head = list[0];
    if (head === undefined) break;
    list.unshift(previousMonth(head));
  }
  const out: MonthlyChannelMix[] = [];
  for (const m of list) {
    const { start, endExclusive } = monthRange(m);
    const channels = await getChannelBreakdown(start, endExclusive);
    const totalValue = channels.reduce((s, c) => s + c.value, 0);
    out.push({ yyyymm: m, channels, totalValue });
  }
  return out;
}

export type PastEventRetrospective = {
  event_id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  expected_total: number;
  actual_total: number;
  variance_qty: number;
  variance_pct: number;
};

export async function getPastEventRetrospectives(): Promise<PastEventRetrospective[]> {
  const today = todayInTz();
  type EventRaw = {
    id: string;
    name: string;
    starts_on: string;
    ends_on: string;
    lead_weeks: number;
  };
  const { data: evData, error: evErr } = await supabase
    .from('events')
    .select('id, name, starts_on, ends_on, lead_weeks')
    .lt('ends_on', today)
    .order('ends_on', { ascending: false });
  if (evErr) throw new Error(evErr.message);
  const events = (evData ?? []) as unknown as EventRaw[];
  if (events.length === 0) return [];

  // Expected: SUM(committed_expected_qty) per event over event_demand
  const eventIds = events.map((e) => e.id);
  type DemandRaw = { event_id: string; committed_expected_qty: number | null };
  const { data: dmData, error: dmErr } = await supabase
    .from('event_demand')
    .select('event_id, committed_expected_qty')
    .in('event_id', eventIds);
  if (dmErr) throw new Error(dmErr.message);
  const expectedByEvent: Record<string, number> = {};
  for (const d of (dmData ?? []) as unknown as DemandRaw[]) {
    if (d.committed_expected_qty === null) continue;
    expectedByEvent[d.event_id] =
      (expectedByEvent[d.event_id] ?? 0) + Number(d.committed_expected_qty);
  }

  // Actual: SUM(order_items.qty) for in-house products where orders.target_fulfilment_date
  // in [event.starts_on - lead_weeks*7d, event.ends_on]. Fetch the matching rows once
  // per event for simplicity; v1 scale (handful of past events) makes this fine.
  type ItemRaw = {
    qty: number;
    products: { is_aggregated: boolean } | null;
    orders: { target_fulfilment_date: string | null } | null;
  };

  const result: PastEventRetrospective[] = [];
  for (const ev of events) {
    const windowStart = (() => {
      const ms = new Date(`${ev.starts_on}T12:00:00Z`).getTime();
      return new Date(ms - ev.lead_weeks * 7 * DAY_MS).toISOString().slice(0, 10);
    })();
    // Inclusive of ends_on: use endExclusive = ends_on + 1 day.
    const windowEndExclusive = (() => {
      const ms = new Date(`${ev.ends_on}T12:00:00Z`).getTime();
      return new Date(ms + DAY_MS).toISOString().slice(0, 10);
    })();

    const { data: itemsData, error: iErr } = await supabase
      .from('order_items')
      .select('qty, products(is_aggregated), orders!inner(target_fulfilment_date)')
      .gte('orders.target_fulfilment_date', windowStart)
      .lt('orders.target_fulfilment_date', windowEndExclusive);
    if (iErr) throw new Error(iErr.message);
    const items = (itemsData ?? []) as unknown as ItemRaw[];

    let actual = 0;
    for (const it of items) {
      if (!it.orders) continue;
      if (it.products?.is_aggregated) continue; // in-house only
      actual += Number(it.qty);
    }

    const expected = expectedByEvent[ev.id] ?? 0;
    const variance_qty = actual - expected;
    const variance_pct = expected > 0 ? Math.round((variance_qty / expected) * 100) : 0;
    result.push({
      event_id: ev.id,
      name: ev.name,
      starts_on: ev.starts_on,
      ends_on: ev.ends_on,
      expected_total: expected,
      actual_total: actual,
      variance_qty,
      variance_pct,
    });
  }
  return result;
}
