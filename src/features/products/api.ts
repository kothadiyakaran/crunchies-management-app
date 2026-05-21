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

export type ProductFullRow = {
  id: string;
  name: string;
  unit: string;
  default_price: number;
  is_seasonal: boolean;
  is_aggregated: boolean;
  source_maker_name: string | null;
  active: boolean;
};

export async function listAllProducts(includeArchived = false): Promise<ProductFullRow[]> {
  const q = supabase
    .from('products')
    .select('id, name, unit, default_price, is_seasonal, is_aggregated, source_maker_name, active')
    .order('name', { ascending: true });
  const { data, error } = includeArchived ? await q : await q.eq('active', true);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getProductById(id: string): Promise<ProductFullRow | null> {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, unit, default_price, is_seasonal, is_aggregated, source_maker_name, active')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

export type ProductInput = {
  name: string;
  unit: string;
  default_price: number;
  is_seasonal: boolean;
  is_aggregated: boolean;
  source_maker_name: string | null;
};

export async function createProduct(input: ProductInput): Promise<string> {
  const { data, error } = await supabase
    .from('products')
    .insert(input)
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'product insert failed');
  return data.id;
}

export async function updateProduct(id: string, patch: Partial<ProductInput>): Promise<void> {
  const { error } = await supabase.from('products').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function archiveProduct(id: string): Promise<void> {
  const { error } = await supabase.from('products').update({ active: false }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function getSeedDemand(productId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('seed_demand')
    .select('weekly_avg_qty')
    .eq('product_id', productId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.weekly_avg_qty ?? null;
}

export async function setSeedDemand(productId: string, weeklyAvgQty: number): Promise<void> {
  const { error } = await supabase
    .from('seed_demand')
    .upsert({ product_id: productId, weekly_avg_qty: weeklyAvgQty }, { onConflict: 'product_id' });
  if (error) throw new Error(error.message);
}

export async function listAllSeedDemand(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from('seed_demand').select('product_id, weekly_avg_qty');
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map((r) => [r.product_id, r.weekly_avg_qty]));
}
