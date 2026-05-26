# Discounts — design

**Date:** 2026-05-26
**Status:** Approved (brainstorm), pending implementation
**Covers:** Improvement #4 — reseller-category default discount + per-customer + per-order overrides.

## Need

Mom wants to give discounts:
- A **default 20%** for the **Reseller** channel as a category (all reseller orders/products).
- A **per-customer** universal discount, settable for **any** customer in any channel (Personal, Exhibition, Reseller, custom) — not reseller-only.
- A **per-order** discount that **supersedes** the customer default for that one order.
- **0%** default for everyone else.

Precedence: **order > customer > channel-default > 0**.

## Key decisions (locked in brainstorm)

- **Snapshot, not live.** Each order freezes the discount that applied when it was created. Changing a customer's or the reseller channel's default later affects only NEW orders — a bill already handed over never silently changes. The per-order override is simply editing this frozen value.
- **Percentage only** (0–100), no flat-₹ amounts.
- **One rate per order**, applied to the whole subtotal (matches "all products").
- **Nearest-rupee rounding.**
- **Reseller blanket 20% is seeded, with no in-app editor in this pass** (per-customer / per-order overrides give case-by-case control; a screen to change the blanket reseller rate is a small future add).

## Data model (3 columns, no new tables)

- `channels.default_discount_percent numeric not null default 0` — Reseller seeded to **20**, all others 0.
- `customers.discount_percent numeric` **nullable** — `null` = inherit the customer's channel default; an explicit value (**including 0**) = override. Present on every customer regardless of channel.
- `orders.discount_percent numeric not null default 0` — the **snapshot**; the only value the bill and all totals ever read.

Constraints: `discount_percent between 0 and 100` (where not null) on customers and orders; channel default likewise 0–100.

Existing rows default to 0 → no historical order or bill changes. Turning this on does **not** retroactively discount resellers' past orders (snapshot + default 0); only new orders pick up the 20%.

## Resolution & UI placement

At **order creation**, the form pre-fills:
```
order.discount_percent = customer.discount_percent ?? channel.default_discount_percent
```
- Re-resolves if mom changes the selected customer while still composing the order (until she manually edits the discount field, which then wins).
- Editable per-order → gives the order > customer > channel precedence naturally, since the order's stored value is the single source at bill time.

- **Customer page (Add/Edit):** optional "Discount %" field, blank = inherit, with a hint ("Resellers get 20% by default — leave blank to use it").
- **Order form (Add/Edit):** a "Discount" field showing the resolved %, editable, with the live discount amount + new total displayed beneath.
- **On Edit order:** the stored `discount_percent` is shown and editable; changing the customer does not silently rewrite it (snapshot semantics) — mom adjusts manually if she wants.

## Calculation

Centralised in one pure helper so every site agrees:
```
orderTotal(subtotal, discountPercent):
  discount = round(subtotal * discountPercent / 100)   // nearest rupee
  total    = subtotal - discount
  return { subtotal, discountPercent, discount, total }
```

## Bill display

Totals block (the Discount line shown **only when discount > 0**):
```
Subtotal          ₹1,000
Discount (20%)    −₹200
Total             ₹800
```
`BillInput` gains `discountPercent` (and the derived discount/total flow through `buildBillPdf`). When 0%, the bill is unchanged from today (single Total line).

## Consistency sweep (the real work)

The discounted total must replace raw `Σ qty×unit_price` **everywhere** a total or balance is shown, or figures will disagree:
- `toListItem` (order list `total`)
- `getOrderDetail` (`subtotal` → add `discount_percent`, derived discount + total)
- `listOrdersForCustomer` (customer api `total`)
- `getCustomerDetail` (`outstanding_total` — unpaid orders use the **discounted** total)
- Reports / revenue computations
- `buildBillPdf`

All routed through the single `orderTotal()` helper.

## Persistence

- `createOrderWithItems` / `updateOrder` accept and persist `discount_percent`.
- `createCustomerFull` / `updateCustomer` accept and persist `discount_percent` (nullable).
- Migration: add the three columns + constraints; seed Reseller channel default to 20.

## Testing

- Unit tests: `orderTotal()` (rounding, 0%, 100%), the resolution chain (`null` inherit vs explicit 0 override; order > customer > channel), bill snapshot with a discount line.
- Behaviour smoke: create reseller customer → new order pre-fills 20% → bill shows discount + correct total; per-order override; per-customer override on a Personal customer.
- Re-run **all** `scripts/verify-*.py`.

## Out of scope

- No in-app editor for the blanket channel/reseller default (seeded only).
- No flat-₹ discounts, no per-product/per-line differing rates.
- No retroactive recompute of historical orders.
- No tax/GST interaction beyond what exists (discount applies to subtotal; the bill has no tax line today).
