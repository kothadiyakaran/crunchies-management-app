import { describe, it, expect, vi, beforeEach } from 'vitest';

const fromMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
}));

// Pin todayInTz for the one function that reads it (getPastEventRetrospectives).
vi.mock('@/lib/utils', () => ({
  todayInTz: () => '2026-05-22',
  cn: (...args: unknown[]) => args.join(' '),
}));

import {
  getCalibrationRowsForWeek,
  getOrderSummary,
  getTopProducts,
  getExhibitionRepeatRate,
  getPastEventRetrospectives,
} from './api';

beforeEach(() => fromMock.mockReset());

// ----------------------------------------------------------------------------
// Builder helpers: each query is a chain of methods that ultimately resolves
// to `{ data, error }`. We mock by recording call args on a fluent object that
// returns itself for chain methods and resolves on the final terminal call.
// ----------------------------------------------------------------------------

type Resp = { data: unknown; error: unknown };

/** Build a chain-able mock that resolves to `resp` when awaited. Every chain
 *  method (select/eq/gte/lt/in/is/order/maybeSingle/single/limit) returns the
 *  same thenable, so the builder always resolves to `resp` regardless of how
 *  deep the chain is. `count` lets us supply `count` for {head:true} queries. */
function chain(resp: Resp & { count?: number }) {
  const c: Record<string, unknown> = {};
  const methods = [
    'select',
    'eq',
    'neq',
    'gte',
    'lt',
    'lte',
    'in',
    'is',
    'or',
    'order',
    'limit',
  ];
  for (const m of methods) c[m] = () => c;
  c.maybeSingle = () => Promise.resolve(resp);
  c.single = () => Promise.resolve(resp);
  // PostgREST queries are PromiseLike — awaiting at the end of any chain yields resp.
  c.then = (onFulfilled: (v: unknown) => unknown) => Promise.resolve(resp).then(onFulfilled);
  return c;
}

// ----------------------------------------------------------------------------
// 1. getCalibrationRowsForWeek shapes a single product's plan/made/demand.
// ----------------------------------------------------------------------------

describe('getCalibrationRowsForWeek', () => {
  it('composes plan/made/demand for a single in-house product', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'products') {
        return chain({
          data: [{ id: 'p1', name: 'Chakli', unit: 'pack' }],
          error: null,
        });
      }
      if (table === 'production_plans') {
        return chain({
          data: [
            {
              product_id: 'p1',
              original_planned_qty: 10,
              // entered_at well before week-end (2026-05-25T00:00:00+05:30)
              entered_at: '2026-05-19T10:00:00+05:30',
            },
          ],
          error: null,
        });
      }
      if (table === 'production_logs') {
        return chain({
          data: [
            { product_id: 'p1', qty: 4 },
            { product_id: 'p1', qty: 3 },
          ],
          error: null,
        });
      }
      if (table === 'order_items') {
        return chain({
          data: [
            // In-week dated demand: target=2026-05-20 in week [05-18, 05-25)
            {
              product_id: 'p1',
              qty: 5,
              orders: {
                ordered_at: '2026-05-16T09:00:00+05:30',
                target_fulfilment_date: '2026-05-20',
              },
            },
            // Outside the week
            {
              product_id: 'p1',
              qty: 100,
              orders: {
                ordered_at: '2026-05-01T09:00:00+05:30',
                target_fulfilment_date: '2026-05-02',
              },
            },
          ],
          error: null,
        });
      }
      return chain({ data: [], error: null });
    });

    const rows = await getCalibrationRowsForWeek('2026-05-18');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      product_id: 'p1',
      product_name: 'Chakli',
      unit: 'pack',
      plan: 10,
      made: 7,
      demand: 5,
      plan_set_retrospectively: false,
    });
  });
});

// ----------------------------------------------------------------------------
// 2 + 3. getOrderSummary: fulfilled_count from fulfilled_at; outstanding excludes paid.
// ----------------------------------------------------------------------------

describe('getOrderSummary', () => {
  it('fulfilled_count counts orders with fulfilled_at set', async () => {
    fromMock.mockReturnValueOnce(
      chain({
        data: [
          {
            id: 'o1',
            fulfilled_at: '2026-05-20',
            payment_status: 'paid',
            order_items: [{ qty: 2, unit_price: 100 }],
          },
          {
            id: 'o2',
            fulfilled_at: null,
            payment_status: 'unpaid',
            order_items: [{ qty: 1, unit_price: 50 }],
          },
          {
            id: 'o3',
            fulfilled_at: '2026-05-21',
            payment_status: 'paid',
            order_items: [{ qty: 3, unit_price: 80 }],
          },
        ],
        error: null,
      }),
    );

    const out = await getOrderSummary('2026-05-18', '2026-05-25');
    expect(out.total_orders).toBe(3);
    expect(out.fulfilled_count).toBe(2);
  });

  it('outstanding_value excludes paid orders, includes unpaid + partial', async () => {
    fromMock.mockReturnValueOnce(
      chain({
        data: [
          {
            id: 'o1',
            fulfilled_at: '2026-05-20',
            payment_status: 'paid',
            order_items: [{ qty: 2, unit_price: 100 }], // 200 — paid, excluded
          },
          {
            id: 'o2',
            fulfilled_at: null,
            payment_status: 'unpaid',
            order_items: [{ qty: 1, unit_price: 50 }], // 50 — included
          },
          {
            id: 'o3',
            fulfilled_at: null,
            payment_status: 'partial',
            order_items: [{ qty: 4, unit_price: 25 }], // 100 — included
          },
        ],
        error: null,
      }),
    );

    const out = await getOrderSummary('2026-05-18', '2026-05-25');
    expect(out.outstanding_value).toBe(150);
    expect(out.outstanding_count).toBe(2);
  });
});

// ----------------------------------------------------------------------------
// 4. getTopProducts sorts by qty DESC.
// ----------------------------------------------------------------------------

describe('getTopProducts', () => {
  it('sorts by qty descending and respects limit', async () => {
    fromMock.mockReturnValueOnce(
      chain({
        data: [
          {
            qty: 3,
            unit_price: 100,
            product_id: 'pA',
            products: { name: 'Chakli', unit: 'pack' },
            orders: { ordered_at: '2026-05-20T10:00:00+05:30' },
          },
          {
            qty: 7,
            unit_price: 50,
            product_id: 'pB',
            products: { name: 'Mathri', unit: 'pack' },
            orders: { ordered_at: '2026-05-21T10:00:00+05:30' },
          },
          {
            qty: 2,
            unit_price: 80,
            product_id: 'pC',
            products: { name: 'Sev', unit: 'pack' },
            orders: { ordered_at: '2026-05-22T10:00:00+05:30' },
          },
          {
            qty: 5,
            unit_price: 50,
            product_id: 'pB',
            products: { name: 'Mathri', unit: 'pack' },
            orders: { ordered_at: '2026-05-22T11:00:00+05:30' },
          },
        ],
        error: null,
      }),
    );

    const out = await getTopProducts('2026-05-18', '2026-05-25', 2);
    expect(out).toHaveLength(2);
    expect(out[0]?.product_id).toBe('pB'); // qty 7+5=12
    expect(out[0]?.qty).toBe(12);
    expect(out[1]?.product_id).toBe('pA'); // qty 3
    expect(out[1]?.qty).toBe(3);
  });
});

// ----------------------------------------------------------------------------
// 5. getExhibitionRepeatRate returns show:false when acquired < 5.
// ----------------------------------------------------------------------------

describe('getExhibitionRepeatRate', () => {
  it('returns show=false when fewer than 5 exhibition customers acquired in 90d', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'channels') {
        return chain({
          data: [
            { id: 'ch-ex', name: 'Exhibition' },
            { id: 'ch-pe', name: 'Personal' },
          ],
          error: null,
        });
      }
      if (table === 'customers') {
        // 3 acquired customers — below the threshold of 5
        return chain({
          data: [
            { id: 'c1', created_at: '2026-04-10T10:00:00+05:30' },
            { id: 'c2', created_at: '2026-04-15T10:00:00+05:30' },
            { id: 'c3', created_at: '2026-05-01T10:00:00+05:30' },
          ],
          error: null,
        });
      }
      if (table === 'orders') {
        return chain({
          data: [
            // c1 repeated (order after created_at)
            { customer_id: 'c1', ordered_at: '2026-04-20T09:00:00+05:30' },
          ],
          error: null,
        });
      }
      return chain({ data: [], error: null });
    });

    const out = await getExhibitionRepeatRate('2026-05-22');
    expect(out.total_acquired).toBe(3);
    expect(out.repeated).toBe(1);
    expect(out.show).toBe(false);
  });
});

// ----------------------------------------------------------------------------
// 6. getPastEventRetrospectives skips events where ends_on >= today.
// ----------------------------------------------------------------------------

describe('getPastEventRetrospectives', () => {
  it('filters to events with ends_on < today (passed to the events query)', async () => {
    const lt = vi.fn(() => ({ order: () => chain({ data: [], error: null }) }));
    const select = vi.fn(() => ({ lt }));

    fromMock.mockImplementation((table: string) => {
      if (table === 'events') return { select };
      return chain({ data: [], error: null });
    });

    const out = await getPastEventRetrospectives();
    expect(out).toEqual([]);
    // The lt() call should have been against ends_on with todayInTz()'s mocked value.
    expect(lt).toHaveBeenCalledWith('ends_on', '2026-05-22');
  });
});
