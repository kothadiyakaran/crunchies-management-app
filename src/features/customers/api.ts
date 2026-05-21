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
