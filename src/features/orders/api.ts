import { supabase } from '@/lib/supabase';
import { todayInTz } from '@/lib/utils';
import { weekStartFor } from '@/lib/week';

export type OrderRow = {
  id: string;
  customer_id: string;
  ordered_at: string;
  fulfilled_at: string | null;
  payment_status: 'unpaid' | 'paid' | 'partial';
  target_fulfilment_date: string | null;
  notes: string | null;
  source: 'whatsapp' | 'exhibition_form' | 'in_person' | 'phone';
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
    .select('id, customer_id, ordered_at, fulfilled_at, payment_status, target_fulfilment_date, notes, source')
    .order('ordered_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as OrderRow[];
}

export async function listOrdersFiltered(filter: OrderFilter): Promise<OrderListItem[]> {
  let q = supabase
    .from('orders')
    .select(
      'id, customer_id, ordered_at, fulfilled_at, payment_status, target_fulfilment_date, notes, source, customers(name), order_items(qty, unit_price, products(name))',
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
    target_fulfilment_date: r.target_fulfilment_date,
    notes: r.notes,
    source: r.source,
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
      'id, customer_id, ordered_at, fulfilled_at, payment_status, target_fulfilment_date, notes, source, customers(name), order_items(qty, unit_price, products(name))',
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
      'id, customer_id, ordered_at, fulfilled_at, payment_status, target_fulfilment_date, notes, source, customers(name, phone), order_items(id, product_id, qty, unit_price, products(name))',
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
    target_fulfilment_date: r.target_fulfilment_date,
    notes: r.notes,
    source: r.source,
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
    target_fulfilment_date?: string;
    notes?: string | null;
    payment_status?: OrderRow['payment_status'];
  },
): Promise<void> {
  const { error } = await supabase.from('orders').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function markFulfilled(id: string): Promise<void> {
  const { error } = await supabase
    .from('orders')
    .update({ fulfilled_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function markPaid(id: string): Promise<void> {
  const { error } = await supabase
    .from('orders')
    .update({ payment_status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteOrder(id: string): Promise<void> {
  const { error } = await supabase.from('orders').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
