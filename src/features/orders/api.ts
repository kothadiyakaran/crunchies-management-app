import { supabase } from '@/lib/supabase';

export type OrderRow = {
  id: string;
  customer_id: string;
  ordered_at: string;
  fulfilled_at: string | null;
  payment_status: 'unpaid' | 'paid' | 'partial';
  target_fulfilment_date: string | null;
};

export async function listOrders(): Promise<OrderRow[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('id, customer_id, ordered_at, fulfilled_at, payment_status, target_fulfilment_date')
    .order('ordered_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listTodayPendingOrders(): Promise<OrderRow[]> {
  // "Today" = pending fulfilment with target = today OR no target but ordered today.
  // Walking-skeleton heuristic; the real Block 1 spec lives in v1-spec §4 (Sprint 4).
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('orders')
    .select('id, customer_id, ordered_at, fulfilled_at, payment_status, target_fulfilment_date')
    .is('fulfilled_at', null)
    .or(
      `target_fulfilment_date.eq.${today},and(target_fulfilment_date.is.null,ordered_at.gte.${today}T00:00:00)`,
    )
    .order('ordered_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createOrder(input: {
  customer_id: string;
  product_id: string;
  qty: number;
}): Promise<string> {
  // Walking-skeleton: two sequential inserts. Real impl in Sprint 4 wraps in a pg function.
  const { data: product, error: pErr } = await supabase
    .from('products')
    .select('default_price')
    .eq('id', input.product_id)
    .single();
  if (pErr || !product) throw new Error(pErr?.message ?? 'product not found');

  const { data: order, error: oErr } = await supabase
    .from('orders')
    .insert({
      customer_id: input.customer_id,
      source: 'whatsapp',
    })
    .select('id')
    .single();
  if (oErr || !order) throw new Error(oErr?.message ?? 'order insert failed');

  const { error: iErr } = await supabase.from('order_items').insert({
    order_id: order.id,
    product_id: input.product_id,
    qty: input.qty,
    unit_price: product.default_price,
  });
  if (iErr) throw new Error(iErr.message);

  return order.id;
}
