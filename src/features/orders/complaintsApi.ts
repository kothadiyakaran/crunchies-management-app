import { supabase } from '@/lib/supabase';
import { todayInTz } from '@/lib/utils';

export type ComplaintKind = 'quality' | 'delivery' | 'wrong_item' | 'other';

export type ComplaintRow = {
  id: string;
  order_id: string;
  reported_at: string; // date YYYY-MM-DD
  kind: ComplaintKind;
  description: string;
  resolution: string | null;
  resolved_at: string | null; // date or null
};

export async function listComplaintsForOrder(orderId: string): Promise<ComplaintRow[]> {
  const { data, error } = await supabase
    .from('complaints')
    .select('id, order_id, reported_at, kind, description, resolution, resolved_at')
    .eq('order_id', orderId)
    .order('reported_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ComplaintRow[];
}

export async function createComplaint(input: {
  order_id: string;
  kind: ComplaintKind;
  description: string;
}): Promise<string> {
  const { data, error } = await supabase
    .from('complaints')
    .insert({
      order_id: input.order_id,
      kind: input.kind,
      description: input.description,
      reported_at: todayInTz(), // `date` column — see project_date_columns memory
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'create complaint failed');
  return data.id;
}

export async function updateComplaint(
  id: string,
  patch: { resolution: string | null; resolved: boolean },
): Promise<void> {
  const { error } = await supabase
    .from('complaints')
    .update({
      resolution: patch.resolution,
      resolved_at: patch.resolved ? todayInTz() : null,
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteComplaint(id: string): Promise<void> {
  const { error } = await supabase.from('complaints').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
