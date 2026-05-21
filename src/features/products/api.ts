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

export async function listProductsByIds(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const { data, error } = await supabase
    .from('products')
    .select('id, name')
    .in('id', ids);
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map((p) => [p.id, p.name]));
}
