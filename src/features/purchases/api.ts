import { supabase } from '@/lib/supabase';
import { receiptTotal, type ItemEntry } from './purchaseMath';

export type VendorRow = { id: string; name: string };
export type PurchaseCategoryRow = { id: string; name: string };
export type PurchaseItemRow = {
  id: string;
  item_name: string;
  qty: number | null;
  unit: string | null;
  amount: number;
  category_id: string;
};
export type PurchaseRow = {
  id: string;
  purchased_on: string;
  note: string | null;
  vendor: VendorRow;
  items: PurchaseItemRow[];
  total: number; // receiptTotal(items) — computed in the mapper, never stored
};

const PURCHASE_SELECT =
  'id, purchased_on, note, vendor:vendors(id, name), items:purchase_items(id, item_name, qty, unit, amount, category_id)';

type RawPurchaseItem = {
  id: string;
  item_name: string;
  qty: number | string | null;
  unit: string | null;
  amount: number | string;
  category_id: string;
};

type RawPurchase = {
  id: string;
  purchased_on: string;
  note: string | null;
  vendor: { id: string; name: string } | null;
  items: RawPurchaseItem[] | null;
};

function toPurchaseRow(r: RawPurchase): PurchaseRow {
  const items: PurchaseItemRow[] = (r.items ?? []).map((i) => ({
    id: i.id,
    item_name: i.item_name,
    qty: i.qty == null ? null : Number(i.qty),
    unit: i.unit,
    amount: Number(i.amount),
    category_id: i.category_id,
  }));
  return {
    id: r.id,
    purchased_on: r.purchased_on,
    note: r.note,
    vendor: { id: r.vendor?.id ?? '', name: r.vendor?.name ?? '(unknown)' },
    items,
    total: receiptTotal(items),
  };
}

export async function listPurchases(
  startInclusive: string,
  endExclusive: string,
): Promise<PurchaseRow[]> {
  const { data, error } = await supabase
    .from('purchases')
    .select(PURCHASE_SELECT)
    .gte('purchased_on', startInclusive)
    .lt('purchased_on', endExclusive)
    .order('purchased_on', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as unknown as RawPurchase[]).map(toPurchaseRow);
}

export async function getPurchase(id: string): Promise<PurchaseRow | null> {
  const { data, error } = await supabase
    .from('purchases')
    .select(PURCHASE_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return toPurchaseRow(data as unknown as RawPurchase);
}

export async function searchVendors(q: string): Promise<VendorRow[]> {
  const trimmed = q.trim();
  if (trimmed.length === 0) return [];
  const { data, error } = await supabase
    .from('vendors')
    .select('id, name')
    .ilike('name', `%${trimmed}%`)
    .order('name', { ascending: true })
    .limit(8);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listPurchaseCategories(): Promise<PurchaseCategoryRow[]> {
  const { data, error } = await supabase
    .from('purchase_categories')
    .select('id, name')
    .eq('active', true)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

const ITEM_ENTRY_SELECT =
  'item_name, qty, unit, amount, category_id, purchase:purchases(purchased_on, vendor:vendors(name))';

type RawItemEntry = {
  item_name: string;
  qty: number | string | null;
  unit: string | null;
  amount: number | string;
  category_id: string;
  purchase: { purchased_on: string; vendor: { name: string } | null } | null;
};

function toItemEntry(r: RawItemEntry): ItemEntry {
  return {
    item_name: r.item_name,
    qty: r.qty == null ? null : Number(r.qty),
    unit: r.unit,
    amount: Number(r.amount),
    category_id: r.category_id,
    purchased_on: r.purchase?.purchased_on ?? '',
    vendor_name: r.purchase?.vendor?.name ?? '(unknown)',
  };
}

export async function listAllItemEntries(): Promise<ItemEntry[]> {
  const { data, error } = await supabase.from('purchase_items').select(ITEM_ENTRY_SELECT);
  if (error) throw new Error(error.message);
  return (data as unknown as RawItemEntry[]).map(toItemEntry);
}

export async function getItemSuggestions(q: string): Promise<ItemEntry[]> {
  const trimmed = q.trim();
  if (trimmed.length === 0) return [];
  const { data, error } = await supabase
    .from('purchase_items')
    .select(ITEM_ENTRY_SELECT)
    .ilike('item_name', `%${trimmed}%`)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  const entries = (data as unknown as RawItemEntry[]).map(toItemEntry);
  const seen = new Set<string>();
  const deduped: ItemEntry[] = [];
  for (const e of entries) {
    const key = e.item_name.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(e);
  }
  return deduped;
}

export async function getLastItemEntry(name: string): Promise<ItemEntry | null> {
  const trimmed = name.trim();
  if (trimmed.length === 0) return null;
  // created_at recency can lie after a backfill of old receipts — fetch a
  // handful of recent entries and pick the newest purchased_on among them.
  const { data, error } = await supabase
    .from('purchase_items')
    .select(ITEM_ENTRY_SELECT)
    .ilike('item_name', trimmed)
    .order('created_at', { ascending: false })
    .limit(12);
  if (error) throw new Error(error.message);
  const entries = (data as unknown as RawItemEntry[]).map(toItemEntry);
  let latest: ItemEntry | null = null;
  for (const e of entries) {
    if (!latest || e.purchased_on > latest.purchased_on) latest = e;
  }
  return latest;
}

export type PurchaseItemInput = {
  item_name: string;
  category_id: string;
  qty: number | null;
  unit: string | null;
  amount: number;
};
export type PurchaseInput = {
  vendorId: string | null; // null → create/find by vendorName
  vendorName: string;
  purchased_on: string; // YYYY-MM-DD from todayInTz() or the date input
  note: string | null;
  items: PurchaseItemInput[];
};

async function ensureVendor(input: PurchaseInput): Promise<string> {
  if (input.vendorId) return input.vendorId;
  const trimmed = input.vendorName.trim();
  const { data, error } = await supabase
    .from('vendors')
    .insert({ name: trimmed })
    .select('id')
    .single();
  if (error || !data) {
    if (error?.code === '23505') {
      const { data: existing, error: selErr } = await supabase
        .from('vendors')
        .select('id')
        .ilike('name', trimmed)
        .single();
      if (selErr || !existing) throw new Error(selErr?.message ?? 'vendor lookup failed');
      return existing.id;
    }
    throw new Error(error?.message ?? 'vendor insert failed');
  }
  return data.id;
}

export async function createPurchase(input: PurchaseInput): Promise<string> {
  if (input.items.length === 0) throw new Error('At least one item is required.');
  const vendor_id = await ensureVendor(input);

  const { data: purchase, error: pErr } = await supabase
    .from('purchases')
    .insert({ vendor_id, purchased_on: input.purchased_on, note: input.note })
    .select('id')
    .single();
  if (pErr || !purchase) throw new Error(pErr?.message ?? 'purchase insert failed');

  const itemRows = input.items.map((it) => ({
    purchase_id: purchase.id,
    item_name: it.item_name,
    category_id: it.category_id,
    qty: it.qty,
    unit: it.unit,
    amount: it.amount,
  }));
  const { error: iErr } = await supabase.from('purchase_items').insert(itemRows);
  if (iErr) {
    await supabase.from('purchases').delete().eq('id', purchase.id);
    throw new Error(iErr.message);
  }
  return purchase.id;
}

export async function updatePurchase(id: string, input: PurchaseInput): Promise<void> {
  if (input.items.length === 0) throw new Error('At least one item is required.');
  const vendor_id = await ensureVendor(input);

  const { error: uErr } = await supabase
    .from('purchases')
    .update({ vendor_id, purchased_on: input.purchased_on, note: input.note })
    .eq('id', id);
  if (uErr) throw new Error(uErr.message);

  const { error: dErr } = await supabase.from('purchase_items').delete().eq('purchase_id', id);
  if (dErr) throw new Error(dErr.message);

  const itemRows = input.items.map((it) => ({
    purchase_id: id,
    item_name: it.item_name,
    category_id: it.category_id,
    qty: it.qty,
    unit: it.unit,
    amount: it.amount,
  }));
  const { error: iErr } = await supabase.from('purchase_items').insert(itemRows);
  if (iErr) throw new Error(iErr.message);
}

export async function deletePurchase(id: string): Promise<void> {
  const { error } = await supabase.from('purchases').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function createPurchaseCategory(name: string): Promise<PurchaseCategoryRow> {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 20) {
    throw new Error('Category name must be 1-20 characters.');
  }
  const { data, error } = await supabase
    .from('purchase_categories')
    .insert({ name: trimmed, is_system: false, active: true })
    .select('id, name')
    .single();
  if (error || !data) {
    if (error?.code === '23505') throw new Error(`Category "${trimmed}" already exists.`);
    throw new Error(error?.message ?? 'category insert failed');
  }
  return data;
}
