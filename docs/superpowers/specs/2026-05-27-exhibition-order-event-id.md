# Exhibition order → event link (orders.event_id) — design

**Date:** 2026-05-27
**Status:** Approved (Karan: fix now + backfill yes)
**Covers:** task #7 — repeat exhibition customer ordering at a *different* event sees "Order not found." on their confirmation.

## Bug (confirmed empirically)

`orders` has no `event_id`. `public_get_order_by_ref`'s anti-leak infers an order's event via `customers.source_event_id`, which `public_create_exhibition_order`'s dedup-on-phone pins to the customer's FIRST event (provenance, by design — `0005_public_rpcs.sql:147`). So a repeat customer (same phone) ordering at a different event B fails the check `customer.source_event_id == event_B` → null → "Order not found." The order is still created; only the confirmation/receipt breaks. Same-event repeat works. Proven: control read-back FOUND, cross-event read-back NULL, 1 customer (dedup) — REST diagnostic, 2026-05-27.

## Fix

Link each order to its event directly.

**Migration `0009_order_event_id.sql`** (additive, live prod DB):
1. `alter table orders add column event_id uuid references events(id) on delete set null;` — nullable (null for non-exhibition orders); `on delete set null` keeps event-deletion behaviour unchanged.
2. Backfill existing exhibition orders: `event_id = customers.source_event_id` where `source='exhibition_form'` and `source_event_id is not null` — preserves all currently-working confirmations (no regression).
3. `create or replace public_create_exhibition_order` — unchanged except the order insert now also sets `event_id = v_event.id`.
4. `create or replace public_get_order_by_ref` — anti-leak changes from `customer.source_event_id <> v_event.id` to `v_order.event_id <> v_event.id` (keeps the `source = 'exhibition_form'` check; still fetches the customer for name/phone in the return).

**Security:** at least as leak-proof — the order is tied to its actual event, and order ids are unguessable UUIDs. An attacker can still only view orders belonging to the event whose public page they're already on.

## Verification

- Regenerate `src/lib/database.types.ts` (orders gains `event_id`); `npx tsc -b --force`. No app-code change needed (the hand-defined `OrderRow` does not select `event_id`; the confirmation JSON shape is unchanged).
- New REST regression smoke `scripts/verify-exhibition-repeat.py`: same phone orders at events A and B; assert BOTH confirmations resolve (`public_get_order_by_ref` returns the order for each). Self-cleaning.
- Re-run events-flow + launch-readiness(chromium) + a11y (RPC change could affect the public surface); advisor; push; live-verify the new smoke against crunchies.app.

## Out of scope

- No `event_id` on the app's `OrderRow`/order lists (not needed; the fix is server-side). Could surface "which event" on order detail later if useful.
- Non-exhibition orders keep `event_id = null`.
