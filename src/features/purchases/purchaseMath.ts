export type ItemEntry = {
  item_name: string;
  qty: number | null;
  unit: string | null;
  amount: number;
  category_id: string;
  purchased_on: string;
  vendor_name: string;
};

export function receiptTotal(items: { amount: number }[]): number {
  return items.reduce((sum, i) => sum + i.amount, 0);
}

export function unitPrice(amount: number, qty: number | null): number | null {
  if (qty === null || qty <= 0) return null;
  return Math.round((amount / qty) * 100) / 100;
}

export function groupByDay<T extends { purchased_on: string }>(
  rows: T[],
): { date: string; rows: T[] }[] {
  const byDate = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = byDate.get(row.purchased_on) ?? [];
    bucket.push(row);
    byDate.set(row.purchased_on, bucket);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([date, dayRows]) => ({ date, rows: dayRows }));
}

export type ItemSummary = {
  name: string;
  timesBought: number;
  last: ItemEntry;
  history: ItemEntry[];
};

export function aggregateItems(entries: ItemEntry[]): ItemSummary[] {
  const byName = new Map<string, ItemEntry[]>();
  for (const e of entries) {
    const key = e.item_name.trim().toLowerCase();
    const bucket = byName.get(key) ?? [];
    bucket.push(e);
    byName.set(key, bucket);
  }
  const summaries: ItemSummary[] = [];
  for (const bucket of byName.values()) {
    const history = [...bucket].sort((a, b) => (a.purchased_on < b.purchased_on ? 1 : -1));
    const last = history[0];
    if (!last) continue;
    summaries.push({ name: last.item_name, timesBought: history.length, last, history });
  }
  return summaries.sort((a, b) => (a.last.purchased_on < b.last.purchased_on ? 1 : -1));
}

export function categoryTotals(
  entries: { amount: number; category_name: string }[],
): { name: string; total: number }[] {
  const totals = new Map<string, number>();
  for (const e of entries) {
    totals.set(e.category_name, (totals.get(e.category_name) ?? 0) + e.amount);
  }
  return [...totals.entries()]
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);
}
