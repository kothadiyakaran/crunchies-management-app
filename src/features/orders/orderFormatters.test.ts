import { describe, it, expect } from 'vitest';
import { formatDayHeader, formatINR, formatOrderTimestamp, groupOrdersByDay } from './orderFormatters';
import type { OrderListItem } from './api';

function makeOrder(over: Partial<OrderListItem> = {}): OrderListItem {
  return {
    id: 'o1',
    customer_id: 'c1',
    ordered_at: '2026-05-20T08:42:00+05:30',
    fulfilled_at: null,
    payment_status: 'unpaid',
    target_fulfilment_date: null,
    notes: null,
    source: 'whatsapp',
    customer_name: 'Sunita Patil',
    total: 420,
    item_summary: '2 boxes laddu, 1 kg chivda',
    ...over,
  };
}

describe('formatDayHeader', () => {
  it('returns TODAY for the same date as today', () => {
    expect(formatDayHeader('2026-05-20', '2026-05-20')).toBe('TODAY');
  });
  it('returns YESTERDAY for the day before today', () => {
    expect(formatDayHeader('2026-05-19', '2026-05-20')).toBe('YESTERDAY');
  });
  it('returns DAY DATE MON format for older dates', () => {
    // 2026-05-13 is a Wednesday
    expect(formatDayHeader('2026-05-13', '2026-05-20')).toBe('WED 13 MAY');
  });
});

describe('formatINR', () => {
  it('renders ₹ with Indian grouping and 2 decimals', () => {
    expect(formatINR(120500)).toBe('₹1,20,500.00');
    expect(formatINR(420)).toBe('₹420.00');
    expect(formatINR(0)).toBe('₹0.00');
  });
});

describe('formatOrderTimestamp', () => {
  it('returns HH:MM for same-day orders', () => {
    expect(formatOrderTimestamp('2026-05-20T08:42:00+05:30', '2026-05-20')).toBe('08:42');
  });
  it('returns empty string for older days', () => {
    expect(formatOrderTimestamp('2026-05-19T08:42:00+05:30', '2026-05-20')).toBe('');
  });
});

describe('groupOrdersByDay', () => {
  it('buckets orders by ordered_at date (Asia/Kolkata)', () => {
    const orders = [
      makeOrder({ id: 'a', ordered_at: '2026-05-20T08:00:00+05:30' }),
      makeOrder({ id: 'b', ordered_at: '2026-05-20T15:00:00+05:30' }),
      makeOrder({ id: 'c', ordered_at: '2026-05-19T10:00:00+05:30' }),
    ];
    const groups = groupOrdersByDay(orders);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.date).toBe('2026-05-20');
    expect(groups[0]!.orders.map((o) => o.id)).toEqual(['a', 'b']);
    expect(groups[1]!.date).toBe('2026-05-19');
    expect(groups[1]!.orders.map((o) => o.id)).toEqual(['c']);
  });
});
