import { supabase } from '@/lib/supabase';

export type ProductRow = {
  id: string;
  name: string;
  unit: string;
  default_price: number;
};

export async function listActiveProducts(): Promise<ProductRow[]> {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, unit, default_price')
    .eq('active', true)
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}
