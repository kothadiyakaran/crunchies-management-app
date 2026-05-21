import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInsertOrder = vi.fn();
const mockInsertItem = vi.fn();
const mockSelectProduct = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'orders') {
        return {
          insert: (row: unknown) => ({
            select: () => ({
              single: () => mockInsertOrder(row),
            }),
          }),
        };
      }
      if (table === 'order_items') {
        return { insert: (row: unknown) => mockInsertItem(row) };
      }
      if (table === 'products') {
        return {
          select: () => ({
            eq: () => ({
              single: () => mockSelectProduct(),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  },
}));

import { createOrder } from './api';

beforeEach(() => {
  mockInsertOrder.mockReset();
  mockInsertItem.mockReset();
  mockSelectProduct.mockReset();
});

describe('createOrder', () => {
  it('reads product price, inserts order + order_item, returns new order id', async () => {
    mockSelectProduct.mockResolvedValue({ data: { default_price: 120 }, error: null });
    mockInsertOrder.mockResolvedValue({ data: { id: 'order-1' }, error: null });
    mockInsertItem.mockResolvedValue({ error: null });

    const id = await createOrder({ customer_id: 'c-1', product_id: 'p-1', qty: 2 });

    expect(id).toBe('order-1');
    expect(mockInsertOrder).toHaveBeenCalledWith(
      expect.objectContaining({ customer_id: 'c-1', source: 'whatsapp' }),
    );
    expect(mockInsertItem).toHaveBeenCalledWith(
      expect.objectContaining({
        order_id: 'order-1',
        product_id: 'p-1',
        qty: 2,
        unit_price: 120,
      }),
    );
  });

  it('throws if order insert fails', async () => {
    mockSelectProduct.mockResolvedValue({ data: { default_price: 120 }, error: null });
    mockInsertOrder.mockResolvedValue({ data: null, error: { message: 'boom' } });

    await expect(
      createOrder({ customer_id: 'c-1', product_id: 'p-1', qty: 2 }),
    ).rejects.toThrow('boom');
  });
});
