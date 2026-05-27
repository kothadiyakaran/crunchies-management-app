import { supabase } from '@/lib/supabase';
import { todayInTz } from '@/lib/utils';
import { weekStartFor } from '@/lib/week';

export type OrderRow = {
  id: string;
  customer_id: string;
  ordered_at: string;
  fulfilled_at: string | null;
  payment_status: 'unpaid' | 'paid' | 'partial';
  paid_at: string | null;
  target_fulfilment_date: string | null;
  notes: string | null;
  source: 'whatsapp' | 'exhibition_form' | 'in_person' | 'phone';
  bill_number: number | null;
};

export type OrderFilter = 'all' | 'pending' | 'unpaid' | 'this_week' | 'this_month';

export type OrderListItem = OrderRow & {
  customer_name: string;
  total: number;
  item_summary: string;
};

export type OrderDetailRow = OrderRow & {
  customer_name: string;
  customer_phone: string | null;
  items: {
    id: string;
    product_id: string;
    product_name: string;
    qty: number;
    unit_price: number;
    line_total: number;
  }[];
  subtotal: number;
};

export async function listOrders(): Promise<OrderRow[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('id, customer_id, ordered_at, fulfilled_at, payment_status, paid_at, target_fulfilment_date, notes, source, bill_number')
    .order('ordered_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as OrderRow[];
}

export async function listOrdersFiltered(filter: OrderFilter): Promise<OrderListItem[]> {
  let q = supabase
    .from('orders')
    .select(
      'id, customer_id, ordered_at, fulfilled_at, payment_status, paid_at, target_fulfilment_date, notes, source, bill_number, customers(name), order_items(qty, unit_price, products(name))',
    )
    .order('ordered_at', { ascending: false })
    .limit(100);

  if (filter === 'pending') {
    q = q.is('fulfilled_at', null);
  } else if (filter === 'unpaid') {
    q = q.in('payment_status', ['unpaid', 'partial']);
  } else if (filter === 'this_week') {
    const weekStart = weekStartFor(todayInTz());
    q = q.gte('ordered_at', `${weekStart}T00:00:00+05:30`);
  } else if (filter === 'this_month') {
    const today = todayInTz();
    const monthStart = `${today.slice(0, 7)}-01`;
    q = q.gte('ordered_at', `${monthStart}T00:00:00+05:30`);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  type Raw = OrderRow & {
    customers: { name: string } | null;
    order_items: { qty: number; unit_price: number; products: { name: string } | null }[] | null;
  };
  const rows = (data ?? []) as unknown as Raw[];
  return rows.map(toListItem);
}

function toListItem(r: OrderRow & {
  customers: { name: string } | null;
  order_items: { qty: number; unit_price: number; products: { name: string } | null }[] | null;
}): OrderListItem {
  const items = r.order_items ?? [];
  const total = items.reduce((sum, i) => sum + Number(i.qty) * Number(i.unit_price), 0);
  const itemNames = items.map((i) => `${i.qty} ${i.products?.name ?? '?'}`);
  const item_summary = itemNames.slice(0, 2).join(', ') + (itemNames.length > 2 ? `, +${itemNames.length - 2} more` : '');
  return {
    id: r.id,
    customer_id: r.customer_id,
    ordered_at: r.ordered_at,
    fulfilled_at: r.fulfilled_at,
    payment_status: r.payment_status,
    paid_at: r.paid_at,
    target_fulfilment_date: r.target_fulfilment_date,
    notes: r.notes,
    source: r.source,
    bill_number: r.bill_number,
    customer_name: r.customers?.name ?? '(unknown customer)',
    total,
    item_summary,
  };
}

export async function listTodayPendingOrders(): Promise<OrderListItem[]> {
  // Spec §4 Block 2: (target_fulfilment_date <= today OR target_fulfilment_date IS NULL) AND fulfilled_at IS NULL
  // Sort: overdue first (target_fulfilment_date asc, NULL last).
  const today = todayInTz();
  const { data, error } = await supabase
    .from('orders')
    .select(
      'id, customer_id, ordered_at, fulfilled_at, payment_status, paid_at, target_fulfilment_date, notes, source, bill_number, customers(name), order_items(qty, unit_price, products(name))',
    )
    .is('fulfilled_at', null)
    .or(`target_fulfilment_date.lte.${today},target_fulfilment_date.is.null`)
    .order('target_fulfilment_date', { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);

  type Raw = OrderRow & {
    customers: { name: string } | null;
    order_items: { qty: number; unit_price: number; products: { name: string } | null }[] | null;
  };
  const rows = (data ?? []) as unknown as Raw[];
  return rows.map(toListItem);
}

export async function getOrderDetail(id: string): Promise<OrderDetailRow | null> {
  const { data, error } = await supabase
    .from('orders')
    .select(
      'id, customer_id, ordered_at, fulfilled_at, payment_status, paid_at, target_fulfilment_date, notes, source, bill_number, customers(name, phone), order_items(id, product_id, qty, unit_price, products(name))',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  type Raw = OrderRow & {
    customers: { name: string; phone: string | null } | null;
    order_items: { id: string; product_id: string; qty: number; unit_price: number; products: { name: string } | null }[] | null;
  };
  const r = data as unknown as Raw;
  const items = (r.order_items ?? []).map((i) => ({
    id: i.id,
    product_id: i.product_id,
    product_name: i.products?.name ?? '(unknown product)',
    qty: Number(i.qty),
    unit_price: Number(i.unit_price),
    line_total: Number(i.qty) * Number(i.unit_price),
  }));
  const subtotal = items.reduce((sum, i) => sum + i.line_total, 0);
  return {
    id: r.id,
    customer_id: r.customer_id,
    ordered_at: r.ordered_at,
    fulfilled_at: r.fulfilled_at,
    payment_status: r.payment_status,
    paid_at: r.paid_at,
    target_fulfilment_date: r.target_fulfilment_date,
    notes: r.notes,
    source: r.source,
    bill_number: r.bill_number,
    customer_name: r.customers?.name ?? '(unknown customer)',
    customer_phone: r.customers?.phone ?? null,
    items,
    subtotal,
  };
}

export type OrderItemInput = { product_id: string; qty: number; unit_price: number };

/**
 * Multi-item order creation. Sequential inserts with cleanup-on-item-failure.
 * Single-tenant; race-free at v1 scale. Migrate to Postgres function if multi-tenant.
 */
export async function createOrderWithItems(input: {
  customer_id: string;
  source: OrderRow['source'];
  ordered_at?: string;
  target_fulfilment_date: string;
  payment_status: OrderRow['payment_status'];
  notes: string | null;
  items: OrderItemInput[];
}): Promise<string> {
  if (input.items.length === 0) throw new Error('At least one item is required.');
  if (!input.target_fulfilment_date) throw new Error('target_fulfilment_date is required.');

  const orderInsert = {
    customer_id: input.customer_id,
    source: input.source,
    target_fulfilment_date: input.target_fulfilment_date,
    payment_status: input.payment_status,
    notes: input.notes,
    ...(input.ordered_at ? { ordered_at: input.ordered_at } : {}),
  };
  const { data: order, error: oErr } = await supabase
    .from('orders')
    .insert(orderInsert)
    .select('id')
    .single();
  if (oErr || !order) throw new Error(oErr?.message ?? 'order insert failed');

  const itemRows = input.items.map((it) => ({
    order_id: order.id,
    product_id: it.product_id,
    qty: it.qty,
    unit_price: it.unit_price,
  }));
  const { error: iErr } = await supabase.from('order_items').insert(itemRows);
  if (iErr) {
    await supabase.from('orders').delete().eq('id', order.id);
    throw new Error(iErr.message);
  }
  return order.id;
}

export async function updateOrder(
  id: string,
  patch: {
    customer_id?: string;
    source?: OrderRow['source'];
    ordered_at?: string;
    target_fulfilment_date?: string;
    notes?: string | null;
    payment_status?: OrderRow['payment_status'];
  },
): Promise<void> {
  const { error } = await supabase.from('orders').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Replaces all order_items for an order. Simple delete-then-insert. Single-tenant
 * so race-free; v1 scale (~5 items per order). Atomicity: on insert failure the
 * original rows are gone — acceptable trade-off because (a) mom is the sole writer
 * and (b) the Edit form keeps the original items in component state, so she can
 * retry by re-tapping Save. Hardening (RPC transaction) deferred until needed.
 */
export async function updateOrderItems(
  orderId: string,
  items: OrderItemInput[],
): Promise<void> {
  if (items.length === 0) throw new Error('At least one item is required.');
  const { error: dErr } = await supabase.from('order_items').delete().eq('order_id', orderId);
  if (dErr) throw new Error(dErr.message);
  const rows = items.map((it) => ({
    order_id: orderId,
    product_id: it.product_id,
    qty: it.qty,
    unit_price: it.unit_price,
  }));
  const { error: iErr } = await supabase.from('order_items').insert(rows);
  if (iErr) throw new Error(iErr.message);
}

export async function markFulfilled(id: string): Promise<void> {
  // fulfilled_at is a Postgres `date` column (not timestamptz) — use today-in-IST.
  const { error } = await supabase
    .from('orders')
    .update({ fulfilled_at: todayInTz() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function markPaid(id: string): Promise<void> {
  // paid_at is a Postgres `date` column — use today-in-IST.
  const { error } = await supabase
    .from('orders')
    .update({ payment_status: 'paid', paid_at: todayInTz() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function revertFulfilled(id: string): Promise<void> {
  const { error } = await supabase.from('orders').update({ fulfilled_at: null }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function revertPaid(id: string): Promise<void> {
  const { error } = await supabase
    .from('orders')
    .update({ payment_status: 'unpaid', paid_at: null })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteOrder(id: string): Promise<void> {
  const { error } = await supabase.from('orders').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function allocateBillNumber(orderId: string): Promise<number> {
  const { data, error } = await supabase.rpc('allocate_bill_number', { p_order_id: orderId });
  if (error) throw new Error(error.message);
  if (typeof data !== 'number') throw new Error('allocate_bill_number returned non-numeric');
  return data;
}
