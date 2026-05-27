import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInsertOrder = vi.fn();
const mockInsertItems = vi.fn();
const mockDeleteOrder = vi.fn();
const mockUpdateOrder = vi.fn();

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
          delete: () => ({
            eq: (_col: string, id: string) => mockDeleteOrder(id),
          }),
          update: (patch: unknown) => ({
            eq: (_col: string, id: string) => mockUpdateOrder(patch, id),
          }),
        };
      }
      if (table === 'order_items') {
        return { insert: (rows: unknown) => mockInsertItems(rows) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  },
}));

import { createOrderWithItems, revertFulfilled, revertPaid } from './api';

beforeEach(() => {
  mockInsertOrder.mockReset();
  mockInsertItems.mockReset();
  mockDeleteOrder.mockReset();
  mockUpdateOrder.mockReset();
});

describe('createOrderWithItems', () => {
  it('inserts an order then its items and returns the new order id', async () => {
    mockInsertOrder.mockResolvedValue({ data: { id: 'order-1' }, error: null });
    mockInsertItems.mockResolvedValue({ error: null });

    const id = await createOrderWithItems({
      customer_id: 'c-1',
      source: 'whatsapp',
      target_fulfilment_date: '2026-05-22',
      payment_status: 'unpaid',
      notes: null,
      items: [
        { product_id: 'p-1', qty: 2, unit_price: 120 },
        { product_id: 'p-2', qty: 1, unit_price: 80 },
      ],
    });

    expect(id).toBe('order-1');
    expect(mockInsertOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        customer_id: 'c-1',
        source: 'whatsapp',
        target_fulfilment_date: '2026-05-22',
        payment_status: 'unpaid',
        notes: null,
      }),
    );
    // ordered_at is omitted (defaults DB-side) when not supplied
    const firstCall = mockInsertOrder.mock.calls[0];
    expect(firstCall?.[0]).not.toHaveProperty('ordered_at');
    expect(mockInsertItems).toHaveBeenCalledWith([
      { order_id: 'order-1', product_id: 'p-1', qty: 2, unit_price: 120 },
      { order_id: 'order-1', product_id: 'p-2', qty: 1, unit_price: 80 },
    ]);
    expect(mockDeleteOrder).not.toHaveBeenCalled();
  });

  it('passes ordered_at through when supplied', async () => {
    mockInsertOrder.mockResolvedValue({ data: { id: 'order-2' }, error: null });
    mockInsertItems.mockResolvedValue({ error: null });

    await createOrderWithItems({
      customer_id: 'c-1',
      source: 'in_person',
      ordered_at: '2026-05-20T10:00:00+05:30',
      target_fulfilment_date: '2026-05-22',
      payment_status: 'paid',
      notes: 'cash on delivery',
      items: [{ product_id: 'p-1', qty: 1, unit_price: 100 }],
    });

    expect(mockInsertOrder).toHaveBeenCalledWith(
      expect.objectContaining({ ordered_at: '2026-05-20T10:00:00+05:30' }),
    );
  });

  it('passes discount_percent through when supplied', async () => {
    mockInsertOrder.mockResolvedValue({ data: { id: 'order-4' }, error: null });
    mockInsertItems.mockResolvedValue({ error: null });

    await createOrderWithItems({
      customer_id: 'c-1',
      source: 'whatsapp',
      target_fulfilment_date: '2026-05-22',
      payment_status: 'unpaid',
      notes: null,
      discount_percent: 20,
      items: [{ product_id: 'p-1', qty: 1, unit_price: 100 }],
    });

    expect(mockInsertOrder).toHaveBeenCalledWith(
      expect.objectContaining({ discount_percent: 20 }),
    );
  });

  it('omits discount_percent when not supplied (defaults DB-side)', async () => {
    mockInsertOrder.mockResolvedValue({ data: { id: 'order-5' }, error: null });
    mockInsertItems.mockResolvedValue({ error: null });

    await createOrderWithItems({
      customer_id: 'c-1',
      source: 'whatsapp',
      target_fulfilment_date: '2026-05-22',
      payment_status: 'unpaid',
      notes: null,
      items: [{ product_id: 'p-1', qty: 1, unit_price: 100 }],
    });

    const firstCall = mockInsertOrder.mock.calls[0];
    expect(firstCall?.[0]).not.toHaveProperty('discount_percent');
  });

  it('throws synchronously when items is empty', async () => {
    await expect(
      createOrderWithItems({
        customer_id: 'c-1',
        source: 'whatsapp',
        target_fulfilment_date: '2026-05-22',
        payment_status: 'unpaid',
        notes: null,
        items: [],
      }),
    ).rejects.toThrow(/at least one item/i);
    expect(mockInsertOrder).not.toHaveBeenCalled();
  });

  it('throws when target_fulfilment_date is blank', async () => {
    await expect(
      createOrderWithItems({
        customer_id: 'c-1',
        source: 'whatsapp',
        target_fulfilment_date: '',
        payment_status: 'unpaid',
        notes: null,
        items: [{ product_id: 'p-1', qty: 1, unit_price: 100 }],
      }),
    ).rejects.toThrow(/target_fulfilment_date/);
    expect(mockInsertOrder).not.toHaveBeenCalled();
  });

  it('cleans up the orphan order if the items insert fails', async () => {
    mockInsertOrder.mockResolvedValue({ data: { id: 'order-3' }, error: null });
    mockInsertItems.mockResolvedValue({ error: { message: 'items boom' } });
    mockDeleteOrder.mockResolvedValue({ error: null });

    await expect(
      createOrderWithItems({
        customer_id: 'c-1',
        source: 'whatsapp',
        target_fulfilment_date: '2026-05-22',
        payment_status: 'unpaid',
        notes: null,
        items: [{ product_id: 'p-1', qty: 1, unit_price: 100 }],
      }),
    ).rejects.toThrow('items boom');

    expect(mockDeleteOrder).toHaveBeenCalledWith('order-3');
  });

  it('throws if the order insert itself fails', async () => {
    mockInsertOrder.mockResolvedValue({ data: null, error: { message: 'order boom' } });

    await expect(
      createOrderWithItems({
        customer_id: 'c-1',
        source: 'whatsapp',
        target_fulfilment_date: '2026-05-22',
        payment_status: 'unpaid',
        notes: null,
        items: [{ product_id: 'p-1', qty: 1, unit_price: 100 }],
      }),
    ).rejects.toThrow('order boom');
    expect(mockInsertItems).not.toHaveBeenCalled();
  });
});

describe('revert actions', () => {
  it('revertFulfilled clears fulfilled_at', async () => {
    mockUpdateOrder.mockResolvedValue({ error: null });

    await revertFulfilled('order-1');
    expect(mockUpdateOrder).toHaveBeenCalledWith({ fulfilled_at: null }, 'order-1');
  });

  it('revertPaid resets to unpaid and clears paid_at', async () => {
    mockUpdateOrder.mockResolvedValue({ error: null });

    await revertPaid('order-1');
    expect(mockUpdateOrder).toHaveBeenCalledWith(
      { payment_status: 'unpaid', paid_at: null },
      'order-1',
    );
  });

  it('throws when the update fails', async () => {
    mockUpdateOrder.mockResolvedValue({ error: { message: 'boom' } });

    await expect(revertFulfilled('x')).rejects.toThrow('boom');
  });
});
