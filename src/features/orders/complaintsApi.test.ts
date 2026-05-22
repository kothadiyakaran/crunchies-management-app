import { describe, it, expect, vi, beforeEach } from 'vitest';

const fromMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
}));

import { createComplaint, listComplaintsForOrder, updateComplaint } from './complaintsApi';

beforeEach(() => fromMock.mockReset());

describe('complaints API', () => {
  it('listComplaintsForOrder queries by order_id and orders by reported_at desc', async () => {
    const order = vi.fn().mockResolvedValueOnce({ data: [], error: null });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    fromMock.mockReturnValueOnce({ select });

    await listComplaintsForOrder('order-1');
    expect(fromMock).toHaveBeenCalledWith('complaints');
    expect(eq).toHaveBeenCalledWith('order_id', 'order-1');
    expect(order).toHaveBeenCalledWith('reported_at', { ascending: false });
  });

  it('createComplaint inserts kind + description + today date', async () => {
    const single = vi.fn().mockResolvedValueOnce({ data: { id: 'c1' }, error: null });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn((_row: Record<string, unknown>) => ({ select }));
    fromMock.mockReturnValueOnce({ insert });

    const id = await createComplaint({ order_id: 'o', kind: 'quality', description: 'salty' });
    expect(id).toBe('c1');
    const insertedPayload = insert.mock.calls[0]![0]!;
    expect(insertedPayload).toMatchObject({
      order_id: 'o',
      kind: 'quality',
      description: 'salty',
    });
    expect(insertedPayload.reported_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('updateComplaint patches resolution + sets resolved_at when resolved=true', async () => {
    const eq = vi.fn().mockResolvedValueOnce({ error: null });
    const update = vi.fn((_patch: Record<string, unknown>) => ({ eq }));
    fromMock.mockReturnValueOnce({ update });

    await updateComplaint('c1', { resolution: 'refunded', resolved: true });
    const patch = update.mock.calls[0]![0]!;
    expect(patch.resolution).toBe('refunded');
    expect(patch.resolved_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('updateComplaint clears resolved_at when resolved=false', async () => {
    const eq = vi.fn().mockResolvedValueOnce({ error: null });
    const update = vi.fn((_patch: Record<string, unknown>) => ({ eq }));
    fromMock.mockReturnValueOnce({ update });

    await updateComplaint('c1', { resolution: null, resolved: false });
    const patch = update.mock.calls[0]![0]!;
    expect(patch.resolved_at).toBeNull();
  });
});
