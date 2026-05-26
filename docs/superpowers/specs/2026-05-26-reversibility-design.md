# Reversibility of mistaken actions — design

**Date:** 2026-05-26
**Status:** Approved (brainstorm), pending implementation
**Covers:** Improvement #2 (revert Mark fulfilled / Mark paid) + folded-in backlog item (delete a complaint logged by mistake).

## Need

Mom occasionally taps a forward action by mistake and needs a way back. She may notice **immediately or much later** (confirmed: "both/varies"), so the remedy must be **permanently available on the order**, not a transient prompt. The forward actions are high-frequency, so they stay **one-tap** (no up-front confirm); mistakes are handled by an easy revert (prevention-by-confirm on the forward tap was explicitly rejected as too much daily friction).

The complaint case is the same shape: a complaint logged in error today can only be *resolved*, never removed — leaving a permanent false record. Deletion closes that gap.

## Design

### Revert affordance (chosen: approach A)

Today the orange "Mark fulfilled" / "Mark paid" buttons render only while the order is *not* in that state, then vanish. Replace the vanished state with a **de-emphasized secondary button in the same slot**, styled identically to the existing Edit / Delete / Generate-bill secondary buttons already on `OrderDetailPage`:

- Not fulfilled → orange **"Mark fulfilled"** (unchanged, one-tap).
- Fulfilled → secondary **"Mark as not fulfilled"**.
- Not paid → orange **"Mark paid"** (unchanged, one-tap).
- Paid → secondary **"Mark as unpaid"**.

Rationale: reuses an existing on-page pattern (consistent, discoverable), visually quiet so it won't be mis-tapped, and clearly an action. Rejected alternatives: a tiny "↩ undo" link under the status pill (second pattern to maintain, easy to overlook later); a tappable status pill (too easy to mis-tap — reintroduces the original problem).

> Exact button wording is English placeholder; Karan may localise.

### Behaviour

- **Revert fulfilled** → set `fulfilled_at = null`. Order correctly reappears in the pending list. No other effects — production planning reads `production_logs`, not order fulfilment.
- **Revert paid** → set `payment_status = 'unpaid'`, `paid_at = null`.
- **Delete complaint** → a quiet danger-styled **"Delete complaint"** action inside the existing complaint sheet, shown when viewing an already-logged complaint. Hard-deletes the row.

### Safeguard

Each of the three actions asks a **one-line native `confirm()`** — the same mechanism the existing "Delete order" button uses. No new modal component.

- "Mark this order as not fulfilled?"
- "Mark this order as unpaid?"
- "Delete this complaint?"

### Edge cases (intentional decisions)

1. **Partial payments:** if an order was `partial` and Mark paid was tapped, reverting lands it at `unpaid` (the natural inverse of "undo the mark-paid"), not back to `partial`. Mom can fine-tune via Edit. Rare; not worth preserving prior state.
2. **Bill already generated:** revert does not touch `bill_number`. If she regenerates the bill afterward, the new PDF reflects the new status. No warning shown.
3. **Complaint deletion vs. `on delete restrict`:** the restrict constraint is on deleting an *order* that still has complaints — it does not block deleting a complaint row itself. RLS already grants `authenticated` full access to `complaints`.

## Plumbing

New API functions (mirroring existing `markFulfilled` / `markPaid` in `src/features/orders/api.ts`, and complaint fns in `complaintsApi.ts`):

- `revertFulfilled(id)` → `update orders set fulfilled_at = null where id = …`
- `revertPaid(id)` → `update orders set payment_status = 'unpaid', paid_at = null where id = …`
- `deleteComplaint(id)` → `delete from complaints where id = …`

No schema migration required.

## Testing

- Unit tests for the three API functions (mocked supabase client), following the existing `api.test.ts` patterns.
- Behaviour smoke: mark fulfilled → revert → assert order back in pending; mark paid → revert → assert unpaid; log complaint → delete → assert gone.
- Per repo rule: re-run **all** `scripts/verify-*.py` after the change (route/component edits have silently broken sibling smokes before).

## Out of scope

- No undo for order deletion (already a hard, confirmed, intentionally irreversible action).
- No edit history / audit trail.
- No transient toast — the persistent affordance covers the immediate case too.
