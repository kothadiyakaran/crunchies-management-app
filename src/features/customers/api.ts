import { supabase } from '@/lib/supabase';

export type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  channel_id: string;
};

export async function listActiveCustomers(): Promise<CustomerRow[]> {
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, phone, channel_id')
    .eq('active', true)
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listCustomersByIds(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const { data, error } = await supabase
    .from('customers')
    .select('id, name')
    .in('id', ids);
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map((c) => [c.id, c.name]));
}

export async function searchCustomersByName(q: string, limit = 8): Promise<{ id: string; name: string; phone: string | null; channel_id: string }[]> {
  const trimmed = q.trim();
  if (trimmed.length === 0) return [];
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, phone, channel_id')
    .eq('active', true)
    .ilike('name', `%${trimmed}%`)
    .order('name', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createCustomerQuick(input: {
  name: string;
  phone: string | null;
  channel_id: string;
}): Promise<string> {
  const { data, error } = await supabase
    .from('customers')
    .insert(input)
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'customer insert failed');
  return data.id;
}

export async function listChannels(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase
    .from('channels')
    .select('id, name')
    .eq('active', true)
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ============================================================================
// Extended types (Sprint 6)
// ============================================================================

export type CustomerFullRow = CustomerRow & {
  size_tier: 'small' | 'large' | null;
  source_event_id: string | null;
  notes: string | null;
  active: boolean;
  last_contacted_at: string | null;
  last_ordered_at: string | null;
  created_at: string;
  channel_name: string;
};

export type CustomerDetailRow = CustomerFullRow & {
  source_event_name: string | null;
  order_count: number;
  outstanding_total: number;
};

export type CustomerListItem = CustomerFullRow & {
  order_count: number;
};

export type CustomerFilter =
  | { kind: 'all' }
  | { kind: 'size'; value: 'large' | 'small' | 'unsorted' }
  | { kind: 'channel'; channelId: string }
  | { kind: 'quiet' };

export type CustomerSort = 'recent_order' | 'a_z' | 'most_ordered';

// ============================================================================
// Customer reads (Sprint 6)
// ============================================================================

export async function getCustomerDetail(id: string): Promise<CustomerDetailRow | null> {
  const { data, error } = await supabase
    .from('customers')
    .select(
      'id, name, phone, channel_id, size_tier, source_event_id, notes, active, last_contacted_at, last_ordered_at, created_at, channels(name), events:source_event_id(name), orders(payment_status, order_items(qty, unit_price))',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  type Raw = CustomerFullRow & {
    channels: { name: string } | null;
    events: { name: string } | null;
    orders: { payment_status: string; order_items: { qty: number; unit_price: number }[] | null }[] | null;
  };
  const r = data as unknown as Raw;
  const orders = r.orders ?? [];
  const outstanding_total = orders
    .filter((o) => o.payment_status === 'unpaid' || o.payment_status === 'partial')
    .reduce(
      (sum, o) => sum + (o.order_items ?? []).reduce((s, i) => s + Number(i.qty) * Number(i.unit_price), 0),
      0,
    );
  return {
    id: r.id,
    name: r.name,
    phone: r.phone,
    channel_id: r.channel_id,
    size_tier: r.size_tier,
    source_event_id: r.source_event_id,
    notes: r.notes,
    active: r.active,
    last_contacted_at: r.last_contacted_at,
    last_ordered_at: r.last_ordered_at,
    created_at: r.created_at,
    channel_name: r.channels?.name ?? '(unknown)',
    source_event_name: r.events?.name ?? null,
    order_count: orders.length,
    outstanding_total,
  };
}

export async function listOrdersForCustomer(customerId: string): Promise<
  {
    id: string;
    ordered_at: string;
    target_fulfilment_date: string | null;
    fulfilled_at: string | null;
    payment_status: 'unpaid' | 'paid' | 'partial';
    item_summary: string;
    total: number;
  }[]
> {
  const { data, error } = await supabase
    .from('orders')
    .select(
      'id, ordered_at, target_fulfilment_date, fulfilled_at, payment_status, order_items(qty, unit_price, products(name))',
    )
    .eq('customer_id', customerId)
    .order('ordered_at', { ascending: false });
  if (error) throw new Error(error.message);

  type Raw = {
    id: string;
    ordered_at: string;
    target_fulfilment_date: string | null;
    fulfilled_at: string | null;
    payment_status: 'unpaid' | 'paid' | 'partial';
    order_items: { qty: number; unit_price: number; products: { name: string } | null }[] | null;
  };
  return (data as unknown as Raw[]).map((r) => {
    const items = r.order_items ?? [];
    const total = items.reduce((s, i) => s + Number(i.qty) * Number(i.unit_price), 0);
    const names = items.map((i) => `${i.qty} ${i.products?.name ?? '?'}`);
    const item_summary =
      names.slice(0, 2).join(', ') + (names.length > 2 ? `, +${names.length - 2} more` : '');
    return {
      id: r.id,
      ordered_at: r.ordered_at,
      target_fulfilment_date: r.target_fulfilment_date,
      fulfilled_at: r.fulfilled_at,
      payment_status: r.payment_status,
      item_summary,
      total,
    };
  });
}

export async function listOpenComplaintsForCustomer(customerId: string): Promise<
  { id: string; order_id: string; kind: string; description: string; reported_at: string }[]
> {
  const { data, error } = await supabase
    .from('complaints')
    .select('id, order_id, kind, description, reported_at, orders!inner(customer_id)')
    .eq('orders.customer_id', customerId)
    .is('resolved_at', null)
    .order('reported_at', { ascending: false });
  if (error) throw new Error(error.message);
  type Raw = { id: string; order_id: string; kind: string; description: string; reported_at: string };
  return (data ?? []) as Raw[];
}

export async function listCustomersFiltered(
  search: string,
  filter: CustomerFilter,
  sort: CustomerSort,
): Promise<CustomerListItem[]> {
  let q = supabase
    .from('customers')
    .select(
      'id, name, phone, channel_id, size_tier, source_event_id, notes, active, last_contacted_at, last_ordered_at, created_at, channels(name), orders(id)',
    )
    .eq('active', true);

  const trimmed = search.trim();
  if (trimmed.length > 0) {
    q = q.or(`name.ilike.%${trimmed}%,phone.ilike.%${trimmed}%`);
  }

  if (filter.kind === 'size') {
    if (filter.value === 'unsorted') q = q.is('size_tier', null);
    else q = q.eq('size_tier', filter.value);
  } else if (filter.kind === 'channel') {
    q = q.eq('channel_id', filter.channelId);
  }
  // 'quiet' filter is post-query (predicate uses derived fields)

  if (sort === 'a_z') q = q.order('name', { ascending: true });
  else if (sort === 'recent_order') q = q.order('last_ordered_at', { ascending: false, nullsFirst: false });
  // 'most_ordered' is post-query (count derived)

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  type Raw = CustomerFullRow & {
    channels: { name: string } | null;
    orders: { id: string }[] | null;
  };
  let rows: CustomerListItem[] = (data as unknown as Raw[]).map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    channel_id: r.channel_id,
    size_tier: r.size_tier,
    source_event_id: r.source_event_id,
    notes: r.notes,
    active: r.active,
    last_contacted_at: r.last_contacted_at,
    last_ordered_at: r.last_ordered_at,
    created_at: r.created_at,
    channel_name: r.channels?.name ?? '(unknown)',
    order_count: (r.orders ?? []).length,
  }));

  if (filter.kind === 'quiet') {
    const { isQuiet } = await import('./quiet');
    const { todayInTz } = await import('@/lib/utils');
    const today = todayInTz();
    rows = rows.filter((r) =>
      isQuiet(
        {
          channel_name: r.channel_name,
          last_ordered_at: r.last_ordered_at,
          last_contacted_at: r.last_contacted_at,
          created_at: r.created_at,
        },
        today,
      ).isQuiet,
    );
  }

  if (sort === 'most_ordered') {
    rows.sort((a, b) => b.order_count - a.order_count || a.name.localeCompare(b.name));
  }

  return rows;
}

export async function listQuietCustomers(limit = 3): Promise<CustomerListItem[]> {
  // Cheap implementation: fetch all active customers + apply isQuiet predicate.
  // v1 scale (~100s of customers) makes this fine. Sort by daysSince DESC, cap by limit.
  const all = await listCustomersFiltered('', { kind: 'all' }, 'a_z');
  const { isQuiet } = await import('./quiet');
  const { todayInTz } = await import('@/lib/utils');
  const today = todayInTz();
  return all
    .map((c) => ({
      c,
      q: isQuiet(
        {
          channel_name: c.channel_name,
          last_ordered_at: c.last_ordered_at,
          last_contacted_at: c.last_contacted_at,
          created_at: c.created_at,
        },
        today,
      ),
    }))
    .filter((x) => x.q.isQuiet)
    .sort((a, b) => b.q.daysSince - a.q.daysSince)
    .slice(0, limit)
    .map((x) => x.c);
}

// ============================================================================
// Customer writes (Sprint 6)
// ============================================================================

export async function createCustomerFull(input: {
  name: string;
  phone: string | null;
  channel_id: string;
  size_tier: 'small' | 'large' | null;
  source_event_id: string | null;
  notes: string | null;
}): Promise<string> {
  const { data, error } = await supabase.from('customers').insert(input).select('id').single();
  if (error || !data) throw new Error(error?.message ?? 'customer insert failed');
  return data.id;
}

export async function updateCustomer(
  id: string,
  patch: Partial<{
    name: string;
    phone: string | null;
    channel_id: string;
    size_tier: 'small' | 'large' | null;
    source_event_id: string | null;
    notes: string | null;
  }>,
): Promise<void> {
  const { error } = await supabase.from('customers').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function archiveCustomer(id: string): Promise<void> {
  const { error } = await supabase.from('customers').update({ active: false }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteCustomer(id: string): Promise<void> {
  // Caller must verify zero orders (UI enforces this in CustomerDetailPage footer).
  const { error } = await supabase.from('customers').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function bumpLastContacted(id: string): Promise<void> {
  // `last_contacted_at` is a timestamptz column — ISO string is correct here.
  // (Distinct from the date columns documented in memory/project_date_columns.md.)
  const { error } = await supabase
    .from('customers')
    .update({ last_contacted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function findCustomerByPhone(phone: string): Promise<{ id: string; name: string } | null> {
  const trimmed = phone.trim();
  if (!trimmed) return null;
  const { data, error } = await supabase
    .from('customers')
    .select('id, name')
    .eq('phone', trimmed)
    .eq('active', true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

export async function createChannel(name: string): Promise<{ id: string; name: string }> {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 20) {
    throw new Error('Channel name must be 1-20 characters.');
  }
  const { data, error } = await supabase
    .from('channels')
    .insert({ name: trimmed, is_system: false, active: true })
    .select('id, name')
    .single();
  if (error || !data) {
    // Postgres unique-violation on lower(name) → 23505. Friendlier message.
    if (error?.code === '23505') throw new Error(`Channel "${trimmed}" already exists.`);
    throw new Error(error?.message ?? 'channel insert failed');
  }
  return data;
}
