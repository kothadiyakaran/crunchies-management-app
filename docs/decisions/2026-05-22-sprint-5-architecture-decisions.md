# Sprint 5 — Architecture Decisions

Locked-in calls made during Sprint 5 (Order lens part 2 — bill generation, complaints, edit order, batch entry). Builds on `2026-05-21-sprint-2-architecture-decisions.md` (ADR-1..7) and `2026-05-21-sprint-3-4-architecture-decisions.md` (ADR-8..16). Numbering continues.

---

## ADR-17: Bill PDF is a pure generator function, separate from the React modal

**Context:** Sprint 5 needs to generate a PDF invoice from an order, preview it in-app, and share via the OS share sheet. Two shapes: (a) a React component that renders the PDF as a side-effect of mounting, (b) a pure function that takes input and returns a `jsPDF` instance, consumed by a thin React modal.

**Decision:** Option (b). `buildBillPdf(input, business, opts)` in `src/features/orders/billPdf.ts` is a pure function returning `jsPDF`. The `BillPreviewModal` component is a thin consumer that allocates the bill number, calls the generator, wraps the output in an iframe URL, and exposes the Share button. Tests live with the generator (10 invariants on rendered text); the modal is verified via browser smoke.

**Why:**
- Pure functions are testable without DOM. We assert on text invariants (business name, item names, totals, payment stamp, signature) using a private-API peek into `pdf.internal.pages` — no Playwright needed for layout regressions.
- The modal can regenerate the PDF cheaply for re-share without re-running React effects.
- Future use cases (CLI bill export, email attachment) get the generator for free.

**Cross-references:** `src/features/orders/billPdf.ts`, `billPdf.test.ts`, `BillPreviewModal.tsx`.

---

## ADR-18: Bill number allocation via Postgres RPC, not client `nextval`

**Context:** Spec §7 — bill numbers are sequential, app-wide, starting at 1001, **persisted on first generate and reused on regeneration**. Allocation options: (a) client-side `select nextval; update`, (b) Postgres function with select-or-allocate-and-update body, (c) trigger on update of `orders.bill_number`.

**Decision:** Option (b). `allocate_bill_number(p_order_id uuid) returns int` is a SECURITY DEFINER plpgsql function:
- If the order already has a `bill_number`, return it (no sequence advance).
- Otherwise, `nextval('bill_number_seq')`, persist, return.

Single transaction, atomic within the function body. JS side is a thin `supabase.rpc('allocate_bill_number', { p_order_id })` wrapper.

**Why:**
- Idempotency rule ("regenerate returns same number") is encoded once, server-side, where it can't be bypassed by a parallel client tab.
- Single-tenant makes the race theoretical, but encapsulating the logic server-side is cheaper than maintaining the same invariant in TS.
- Existing `bill_number_seq` (Sprint 0 migration) is reused as-is — no schema change to the sequence itself.

**Cross-references:** `supabase/migrations/0004_bill_number_rpc.sql`, `src/features/orders/api.ts:allocateBillNumber`.

---

## ADR-19: Web Share API Level 2 (files) with download fallback

**Context:** Mom's flow: tap Share on the bill → OS share sheet opens → pick WhatsApp → bill PDF attached. On desktop browsers (Karan's dev environment) the file-share Level 2 capability is inconsistent.

**Decision:** `navigator.canShare?.({ files: [file] }) && navigator.share`-gated share; when unsupported, fall back to programmatic `<a download>` trigger. Pre-filled share text: *"Hi {customer name}, please find your bill attached."* The customer-recipient is implicit (mom picks them in the share sheet).

**Why:**
- Karan's Android Chrome (mom's target) supports Level 2 file share with WhatsApp as a target.
- Desktop fallback keeps the dev preview useful — Karan can download and inspect the PDF locally.
- No third-party share library required; `navigator.share` is in every relevant target.

**Trade-off:** Karan still has to verify the actual WhatsApp hand-off on his Android post-deploy — no test surrogate exists for the OS share sheet.

**Cross-references:** `src/features/orders/BillPreviewModal.tsx:onShare`.

---

## ADR-20: Edit Order reuses AddOrderPage via `editingOrderId` prop — no field-level locking

**Context:** Spec §7 Edit-order requires every field be editable (no locks). Implementation options: (a) duplicate the 7-step accordion into a parallel `EditOrderPage` component, (b) parametrise `AddOrderPage` with an `editingOrderId` prop and branch internally.

**Decision:** Option (b). `AddOrderPage({ editingOrderId })` hydrates from `getOrderDetail` when the prop is set, branches the submit handler to `updateOrder` + `updateOrderItems` (instead of `createOrderWithItems`), and renames the title/CTA. `EditOrderPage` is a 7-line wrapper that reads the route param and mounts `<AddOrderPage editingOrderId={id} />`.

**No locking** of customer/source/ordered-at per spec §7 "Editability & deletion" — *"No locks. Mom can edit or delete any order, any time. Edits to historical orders shift the rolling-average demand intentionally — she's correcting reality, algorithm should reflect reality."* This made `updateOrder`'s patch type need extension (added `customer_id`, `source`, `ordered_at` as optional fields).

**Why:**
- Single accordion source-of-truth — no risk of layout drift between create and edit flows.
- Hydration cost is one `getOrderDetail` call; cheap.
- The edge case mom needs is real (rare but real): she logs an order against the wrong Sunita, opens edit, switches the customer.

**Cross-references:** `src/features/orders/AddOrderPage.tsx`, `EditOrderPage.tsx`, `api.ts:updateOrder` (extended patch type).

---

## ADR-21: `updateOrderItems` uses delete-then-insert, not RPC transaction

**Context:** Editing an order may add/remove/change items. Atomicity options: (a) Postgres function with transactional begin/commit, (b) sequential JS delete-then-insert, (c) diff-based upsert.

**Decision:** Option (b). `updateOrderItems(orderId, items)` deletes all existing rows for the order, then inserts the new set. If the insert fails the original rows are gone — mom can re-save from the still-in-state form to recover.

**Why:**
- Mirrors ADR-13 (multi-item insert = sequential + cleanup) — same single-tenant + low-volume reasoning.
- Diff-based upsert would need stable item IDs and complicate the form; delete-then-insert is the obvious shape.
- Migration to an RPC if multi-tenancy ever arrives is straightforward.

**Trade-off:** The window between delete and insert is the only failure mode; on mid-write network drop mom loses the items. Form state retains them, so she taps Save again. Acceptable for v1.

**Cross-references:** `src/features/orders/api.ts:updateOrderItems`.

---

## Mid-sprint corrections (not new ADRs, but worth noting)

Three plan bugs were caught during Task 2 implementation and patched before commit:

1. **`(` / `)` in PDF content streams** — jsPDF escapes parens as `\(` / `\)` in the text command stream, breaking raw substring checks in `extractAllText`. Fix: test fixtures avoid parens; assertion still proves the item-name invariant.

2. **U+2014 em-dash + Helvetica WinAnsi** — Helvetica has no em-dash glyph, so `'— Mom'` got silently stripped when the test ran without the embedded font. Fix: ASCII fixture for tests; production uses Noto Sans which renders em-dash correctly.

3. **jsPDF PubSub errors bypass `try/catch`** — `pdf.addFont(...)` reports parse failures through jsPDF's internal PubSub system rather than throwing. A subsequent `pdf.text(...)` call then hits a half-registered font and throws an unrelated `Cannot read 'widths' of undefined`. Fix: pre-validate `fontBase64.length >= 1000` before the addFont call — stubs fall through to helvetica + Rs. The pragmatic guard is sufficient for v1; if mom's font asset ever gets corrupted in transit, the BillPreviewModal's `loadNotoSansBase64().catch(() => undefined)` provides the second line of defense.

These are encoded in the test file and the production code; the plan was updated to match before re-dispatching the implementer.

---

## Open items carrying into Sprint 6+

- **`BUSINESS_INFO` → Settings table swap.** Sprint 9 builds the `settings` table per §13; the `BUSINESS_INFO` constants in `src/lib/business.ts` become a one-find-replace migration to a single-row Settings read.
- **Complaint surfacing on Customer detail.** Spec §8 "Open complaints section" on the customer detail screen is Sprint 6 territory — aggregates unresolved complaints across all orders for a customer. The plumbing is already there (`listComplaintsForOrder` exists, can be lifted to `listOpenComplaintsForCustomer` later).
- **Bold-weight Noto Sans.** Task 2 re-uses `NotoSans-Regular.ttf` as the bold-weight font for jsPDF. If mom dislikes the visual weight on bold rows (totals, table header), add `NotoSans-Bold.ttf` and switch the `addFont('NotoSans', 'bold')` call.
- **Browser smoke for the bill flow.** Deferred from Tasks 4 and 8 — Karan tests on his Android post-deploy where the OS share sheet behaviour is real. No automated coverage of `navigator.share` exists for now.
- **`npm audit` advisories.** Sprint 5 Task 1's `npm install jspdf` reported 7 vulnerabilities (6 moderate, 1 critical) in the broader dependency tree, none attributable to jspdf itself. Not addressed in Sprint 5 — schedule `npm audit fix` as a standalone hygiene pass before the launch sprint.
