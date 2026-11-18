import { supabase } from '@/lib/supabase';
import type { DueOrder } from '@shared/reminders';

export type CalendarOrder = DueOrder & {
  fulfilled_at: string | null;
  payment_status: string;
  item_summary: string;
};

export type CalendarEvent = { id: string; name: string; starts_on: string; ends_on: string };

type RawOrder = {
  id: string;
  ordered_at: string;
  target_fulfilment_date: string;
  fulfilled_at: string | null;
  payment_status: string;
  customers: { name: string } | null;
  order_items: { qty: number | string; products: { name: string; unit: string } | null }[] | null;
};

export async function listCalendarOrders(from: string, to: string): Promise<CalendarOrder[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(
      'id, ordered_at, target_fulfilment_date, fulfilled_at, payment_status, customers(name), order_items(qty, products(name, unit))',
    )
    .gte('target_fulfilment_date', from)
    .lte('target_fulfilment_date', to)
    .order('ordered_at', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as RawOrder[]).map((r) => {
    const items = (r.order_items ?? []).map((i) => ({
      product_name: i.products?.name ?? '?',
      unit: i.products?.unit ?? '',
      qty: Number(i.qty),
    }));
    const names = items.map((i) => `${i.qty} ${i.product_name}`);
    return {
      id: r.id,
      ordered_at: r.ordered_at,
      target_fulfilment_date: r.target_fulfilment_date,
      fulfilled_at: r.fulfilled_at,
      payment_status: r.payment_status,
      customer_name: r.customers?.name ?? '(unknown customer)',
      items,
      item_summary: names.slice(0, 2).join(', ') + (names.length > 2 ? `, +${names.length - 2} more` : ''),
    };
  });
}

export async function listCalendarEvents(from: string, to: string): Promise<CalendarEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select('id, name, starts_on, ends_on')
    .eq('active', true)
    .lte('starts_on', to)
    .gte('ends_on', from)
    .order('starts_on', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CalendarEvent[];
}
