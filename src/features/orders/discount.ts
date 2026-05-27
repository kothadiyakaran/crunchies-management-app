export type OrderTotals = {
  subtotal: number;
  discountPercent: number;
  discount: number;
  total: number;
};

/** Applies a whole-order discount to a subtotal, rounding the discount to the
 *  nearest rupee. The single source of truth for every total/balance site. */
export function orderTotal(subtotal: number, discountPercent: number): OrderTotals {
  const discount = Math.round((subtotal * discountPercent) / 100);
  return { subtotal, discountPercent, discount, total: subtotal - discount };
}

/** Resolves the discount to snapshot onto a new order: a customer's explicit
 *  value (including 0) overrides the channel default; null inherits it. */
export function resolveDiscount(input: { customerDiscount: number | null; channelDefault: number }): number {
  return input.customerDiscount ?? input.channelDefault;
}
