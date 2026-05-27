import { describe, it, expect } from 'vitest';
import { orderTotal, resolveDiscount } from './discount';

describe('orderTotal', () => {
  it('rounds the discount to the nearest rupee', () => {
    expect(orderTotal(1000, 20)).toEqual({ subtotal: 1000, discountPercent: 20, discount: 200, total: 800 });
    // 999 * 20% = 199.8 → 200
    expect(orderTotal(999, 20)).toEqual({ subtotal: 999, discountPercent: 20, discount: 200, total: 799 });
    // 250 * 10% = 25 (exact)
    expect(orderTotal(250, 10)).toEqual({ subtotal: 250, discountPercent: 10, discount: 25, total: 225 });
  });

  it('is a no-op at 0%', () => {
    expect(orderTotal(500, 0)).toEqual({ subtotal: 500, discountPercent: 0, discount: 0, total: 500 });
  });

  it('zeroes the total at 100%', () => {
    expect(orderTotal(500, 100)).toEqual({ subtotal: 500, discountPercent: 100, discount: 500, total: 0 });
  });
});

describe('resolveDiscount', () => {
  it('inherits the channel default when the customer value is null', () => {
    expect(resolveDiscount({ customerDiscount: null, channelDefault: 20 })).toBe(20);
  });

  it('lets an explicit 0 customer value override the channel default (opt-out)', () => {
    expect(resolveDiscount({ customerDiscount: 0, channelDefault: 20 })).toBe(0);
  });

  it('uses a custom customer value over a 0 channel default', () => {
    expect(resolveDiscount({ customerDiscount: 10, channelDefault: 0 })).toBe(10);
  });
});
