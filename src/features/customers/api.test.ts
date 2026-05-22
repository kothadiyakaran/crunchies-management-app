import { describe, it, expect, vi, beforeEach } from 'vitest';

const fromMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
}));

import { createChannel, findCustomerByPhone, bumpLastContacted } from './api';

beforeEach(() => fromMock.mockReset());

describe('createChannel', () => {
  it('trims and rejects empty', async () => {
    await expect(createChannel('   ')).rejects.toThrow('1-20 characters');
  });

  it('rejects names over 20 chars', async () => {
    await expect(createChannel('a'.repeat(21))).rejects.toThrow('1-20 characters');
  });

  it('translates 23505 unique-violation to a friendly message', async () => {
    const single = vi.fn().mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'unique' } });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    fromMock.mockReturnValueOnce({ insert });
    await expect(createChannel('Personal')).rejects.toThrow(/already exists/);
  });

  it('returns the new channel on success', async () => {
    const single = vi.fn().mockResolvedValueOnce({ data: { id: 'ch1', name: 'Friends' }, error: null });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    fromMock.mockReturnValueOnce({ insert });
    const ch = await createChannel(' Friends ');
    expect(ch).toEqual({ id: 'ch1', name: 'Friends' });
    expect(insert).toHaveBeenCalledWith({ name: 'Friends', is_system: false, active: true });
  });
});

describe('findCustomerByPhone', () => {
  it('returns null on empty input without hitting the DB', async () => {
    const out = await findCustomerByPhone('   ');
    expect(out).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('passes trimmed phone to .eq() and returns match', async () => {
    const maybeSingle = vi.fn().mockResolvedValueOnce({ data: { id: 'c1', name: 'Sunita' }, error: null });
    const eqActive = vi.fn(() => ({ maybeSingle }));
    const eqPhone = vi.fn(() => ({ eq: eqActive }));
    const select = vi.fn(() => ({ eq: eqPhone }));
    fromMock.mockReturnValueOnce({ select });
    const out = await findCustomerByPhone(' 9876543210 ');
    expect(out).toEqual({ id: 'c1', name: 'Sunita' });
    expect(eqPhone).toHaveBeenCalledWith('phone', '9876543210');
  });
});

describe('bumpLastContacted', () => {
  it('writes an ISO timestamp via .update().eq()', async () => {
    const eq = vi.fn().mockResolvedValueOnce({ error: null });
    const update = vi.fn(() => ({ eq }));
    fromMock.mockReturnValueOnce({ update });
    await bumpLastContacted('c1');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ last_contacted_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) }),
    );
    expect(eq).toHaveBeenCalledWith('id', 'c1');
  });
});
