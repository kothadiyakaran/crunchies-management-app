import { describe, it, expect, vi } from 'vitest';

// Mock the supabase client at the module boundary
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

import { supabase } from '@/lib/supabase';
import { allocateBillNumber } from './api';

describe('allocateBillNumber', () => {
  it('returns the number from the RPC', async () => {
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: 1042, error: null });
    const n = await allocateBillNumber('00000000-0000-0000-0000-000000000001');
    expect(n).toBe(1042);
    expect(supabase.rpc).toHaveBeenCalledWith('allocate_bill_number', {
      p_order_id: '00000000-0000-0000-0000-000000000001',
    });
  });

  it('throws when RPC returns an error', async () => {
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    await expect(allocateBillNumber('x')).rejects.toThrow('boom');
  });

  it('throws when RPC returns a non-numeric payload', async () => {
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: 'oops', error: null });
    await expect(allocateBillNumber('x')).rejects.toThrow('non-numeric');
  });
});
