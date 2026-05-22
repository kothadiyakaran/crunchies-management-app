import { supabase } from '@/lib/supabase';
import type { Json } from '@/lib/database.types';

export type PublicEvent = {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  pickup_window_start: string | null;
  pickup_window_end: string | null;
  venue_line: string | null;
  slug: string;
};

export type PublicProduct = {
  id: string;
  name: string;
  unit: string;
  default_price: number;
  is_aggregated: boolean;
  source_maker_name: string | null;
};

export type PublicEventResponse = {
  event: PublicEvent;
  window_state: 'open' | 'not_yet_open' | 'ended' | 'inactive';
  products: PublicProduct[];
};

export async function fetchEventBySlug(slug: string): Promise<PublicEventResponse | null> {
  const { data, error } = await supabase.rpc('public_get_event_by_slug', { p_slug: slug });
  if (error) throw new Error(error.message);
  return (data ?? null) as PublicEventResponse | null;
}

export async function submitExhibitionOrder(input: {
  slug: string;
  name: string;
  phone: string;
  notes: string;
  items: { product_id: string; qty: number }[];
  honeypot: string;
}): Promise<{ order_id: string; public_order_number: string } | null> {
  const { data, error } = await supabase.rpc('public_create_exhibition_order', {
    p_slug: input.slug,
    p_name: input.name,
    p_phone: input.phone,
    p_notes: input.notes,
    p_items: input.items as unknown as Json,
    p_honeypot: input.honeypot,
  });
  if (error) throw new Error(error.message);
  return (data ?? null) as { order_id: string; public_order_number: string } | null;
}

export type PublicOrderDetail = {
  order: {
    id: string;
    public_order_number: string;
    ordered_at: string;
    notes: string | null;
    total: number;
  };
  customer: { name: string; phone: string };
  event: PublicEvent;
  items: { product_id: string; name: string; unit: string; qty: number; unit_price: number }[];
};

export async function fetchOrderByRef(
  slug: string,
  orderId: string,
): Promise<PublicOrderDetail | null> {
  const { data, error } = await supabase.rpc('public_get_order_by_ref', {
    p_slug: slug,
    p_order_id: orderId,
  });
  if (error) throw new Error(error.message);
  return (data ?? null) as PublicOrderDetail | null;
}
