import { supabase } from '@/lib/supabase';
import { todayInTz } from '@/lib/utils';

export type ProductionLogRow = {
  id: string;
  product_id: string;
  made_on: string;
  qty: number;
};

export async function listRecentProduction(): Promise<ProductionLogRow[]> {
  const { data, error } = await supabase
    .from('production_logs')
    .select('id, product_id, made_on, qty')
    .order('made_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createProductionLog(input: {
  product_id: string;
  qty: number;
}): Promise<string> {
  const today = todayInTz();
  const { data, error } = await supabase
    .from('production_logs')
    .insert({ product_id: input.product_id, qty: input.qty, made_on: today })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'log insert failed');
  return data.id;
}
