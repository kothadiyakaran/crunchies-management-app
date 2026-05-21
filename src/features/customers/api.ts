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
