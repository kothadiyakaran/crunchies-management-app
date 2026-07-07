import { describe, expect, it } from 'vitest';
import {
  aggregateItems,
  categoryTotals,
  groupByDay,
  receiptTotal,
  unitPrice,
  type ItemEntry,
} from './purchaseMath';

const entry = (over: Partial<ItemEntry>): ItemEntry => ({
  item_name: 'Besan',
  qty: 5,
  unit: 'kg',
  amount: 450,
  category_id: 'c1',
  purchased_on: '2026-07-01',
  vendor_name: 'Ram Kirana',
  ...over,
});

describe('receiptTotal', () => {
  it('sums item amounts', () => {
    expect(receiptTotal([{ amount: 450 }, { amount: 30.5 }])).toBe(480.5);
  });
  it('is 0 for no items', () => {
    expect(receiptTotal([])).toBe(0);
  });
});

describe('unitPrice', () => {
  it('divides amount by qty, 2dp', () => {
    expect(unitPrice(450, 5)).toBe(90);
    expect(unitPrice(100, 3)).toBe(33.33);
  });
  it('is null without a positive qty', () => {
    expect(unitPrice(450, null)).toBeNull();
    expect(unitPrice(450, 0)).toBeNull();
  });
});

describe('groupByDay', () => {
  it('groups by purchased_on, newest day first', () => {
    const rows = [
      { purchased_on: '2026-07-01' },
      { purchased_on: '2026-07-03' },
      { purchased_on: '2026-07-01' },
    ];
    const grouped = groupByDay(rows);
    expect(grouped.map((g) => g.date)).toEqual(['2026-07-03', '2026-07-01']);
    expect(grouped[1]?.rows).toHaveLength(2);
  });
});

describe('aggregateItems', () => {
  it('groups case-insensitively, keeps most recent casing, history newest first', () => {
    const entries = [
      entry({ item_name: 'besan', purchased_on: '2026-06-01', amount: 400 }),
      entry({ item_name: 'Besan', purchased_on: '2026-07-01', amount: 450 }),
      entry({ item_name: 'Oil', purchased_on: '2026-06-15' }),
    ];
    const out = aggregateItems(entries);
    expect(out).toHaveLength(2);
    expect(out[0]?.name).toBe('Besan'); // most recently bought first
    expect(out[0]?.timesBought).toBe(2);
    expect(out[0]?.last.amount).toBe(450);
    expect(out[0]?.history.map((h) => h.purchased_on)).toEqual(['2026-07-01', '2026-06-01']);
  });
});

describe('categoryTotals', () => {
  it('sums per category name, sorted desc by total', () => {
    const out = categoryTotals([
      { amount: 100, category_name: 'Packaging' },
      { amount: 450, category_name: 'Ingredients' },
      { amount: 50, category_name: 'Ingredients' },
    ]);
    expect(out).toEqual([
      { name: 'Ingredients', total: 500 },
      { name: 'Packaging', total: 100 },
    ]);
  });
});
