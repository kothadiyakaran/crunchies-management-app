# Maintenance Fixes & Features — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two production bugs (inline add-customer; in-app bill preview) and ship two features (reversible order actions + complaint deletion; discounts), then reconcile spec docs.

**Architecture:** Vite + React 18 + TS strict, Supabase Postgres/RLS, jsPDF lazy-loaded, Vercel auto-deploy from `main`. Single live prod DB (no staging) — migrations are additive/non-breaking and applied with explicit approval. Each Part below is independently shippable: complete it, run unit tests + the relevant `verify-*.py` smoke, then it can be committed and (on green) pushed.

**Tech Stack:** React, react-router-dom, react-dom `createPortal`, jsPDF, pdfjs-dist (new, lazy), Vitest + RTL, Playwright smokes, Supabase migrations.

**Implementer notes (from advisor review):**
- **Push per Part, standalone, the moment it's green** — do NOT batch. Bug 1 (Part A) ships first and alone; each Part is committed then pushed before the next begins (Vercel deploys on push to `main`).
- **All behaviour smokes run against the PRODUCTION build** (`npm run build && npm run preview` on :4173, then Playwright at :4173) — never `npm run dev`. Dev source modules behave differently from hashed prod chunks (this bit Sprint 9→10).
- **Part B pdfjs worker path is version-fragile.** After `npm install pdfjs-dist`, list `node_modules/pdfjs-dist/build/` and use whatever worker file actually exists (4.x vs 3.x differ; not all builds expose `.mjs`). Expect one iteration here.
- **Discount field naming (Part D):** snake_case (`discount_percent`) for DB-shaped row types (matches `fulfilled_at`, `payment_status`); camelCase (`discountPercent`) for derived/UI-state/PDF-input types (matches `customerName` on `BillInput`). Apply consistently to avoid a churn of type fixes.

**Cross-cutting rules (apply to every Part):**
- Typecheck via `npm run typecheck` only (never bare `tsc`).
- Date columns are Postgres `date` — write `todayInTz()`, never `new Date().toISOString()`.
- After any architectural/shared-type change run `npx tsc -b --force`.
- After any change, re-run **all** `scripts/verify-*.py`, not just the area touched.
- No comments unless the *why* is non-obvious. Match local style. No premature abstractions.
- Commit per task; push only after a Part's unit tests AND full smoke suite are green, with user authorization already granted for green pushes.

---

## Progress (updated 2026-05-27)

- **Part A — SHIPPED & live** (merge `58a51ca`). Inline add-customer fixed via `createPortal`; live-verified.
- **Part B — SHIPPED & live** (merge `a150ad8`). Bill preview → canvas via lazy pdfjs, mobile-bounded, render-cancel-on-close; full 3-browser matrix green.
- **Part C — SHIPPED & live** (merge `d81bbfd`). Reversible order actions (revert fulfilled/paid) + delete complaint; persistent secondary buttons + native `confirm()`; new `verify-revert-flow.py`; live-verified on crunchies.app. Pushed despite firefox/webkit launch-readiness console-gate noise that was confirmed pre-existing (reproduces on `main`, in unchanged `newOrderBadge.ts`, absent in chromium) — Karan's call. See SESSION_STATE for details.
- **Parts D, E — not started.** See `docs/superpowers/SESSION_STATE.md` for resume instructions, the carried-forward working rules (esp. `npm run test:run`, Opus subagents, smoke cadence), the pre-existing console-gate noise note, and the now-uncertain `verify-events-flow.py` status (it PASSED at the Part C gate).

---

## Part A — Bug 1: inline add-customer (nested-form → portal)

**Root cause (proven):** `AddCustomerInlineModal` renders its `<form>` inline, nested inside `AddOrderPage`/`EditOrderPage`'s `<form>`. Clicking "Add" fires a native form submit → full page reload → the `createCustomerQuick` insert is aborted before any `POST` leaves the device. Fix: render the modal through `createPortal(…, document.body)` so it is no longer a DOM descendant of the order form.

**Files:**
- Modify: `src/features/orders/AddCustomerInlineModal.tsx`
- Test: `src/features/orders/AddCustomerInlineModal.test.tsx` (create)
- Smoke: `scripts/verify-launch-readiness.py` (extend) — or new `scripts/verify-inline-add-customer.py`

### Task A1: Failing structural test — modal must not nest inside a host form

- [ ] **Step 1: Write the failing test**

`src/features/orders/AddCustomerInlineModal.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { AddCustomerInlineModal } from './AddCustomerInlineModal';

// Channel picker hits the network on mount; stub it so the modal renders in isolation.
vi.mock('@/features/customers/ChannelChipPicker', () => ({
  ChannelChipPicker: () => <div data-testid="channel-picker" />,
}));

test('modal renders outside any host <form> (portaled to body)', () => {
  const { container } = render(
    <form data-testid="host-form">
      <AddCustomerInlineModal onClose={() => {}} onCreated={() => {}} />
    </form>,
  );
  const hostForm = screen.getByTestId('host-form');
  const dialog = screen.getByRole('dialog');
  // Regression guard: a nested <form> is what broke the insert. The dialog
  // (and its own <form>) must be portaled out of the host form.
  expect(hostForm).not.toContainElement(dialog);
  expect(container.querySelector('form[data-testid="host-form"] form')).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- AddCustomerInlineModal`
Expected: FAIL — dialog is currently a descendant of the host form.

- [ ] **Step 3: Implement the portal**

In `src/features/orders/AddCustomerInlineModal.tsx`: add `import { createPortal } from 'react-dom';` and wrap the returned fragment:
```tsx
  return createPortal(
    <>
      {/* existing backdrop div + dialog div unchanged */}
    </>,
    document.body,
  );
```
(Move the existing `<> … </>` body inside `createPortal(`…`, document.body)`. No other logic changes.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- AddCustomerInlineModal`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
```bash
git add src/features/orders/AddCustomerInlineModal.tsx src/features/orders/AddCustomerInlineModal.test.tsx
git commit -m "fix(orders): portal inline add-customer modal out of the order form

Nested <form> caused a native submit/page-reload that aborted the
createCustomerQuick insert before it left the device. createPortal to
document.body removes the nesting.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task A2: End-to-end smoke for inline-add-during-order (closes the test gap)

The launch smoke only ever added customers via `/customers/new` and used pre-existing customers in the order flow — the inline path was never exercised. Add explicit coverage.

- [ ] **Step 1: Add a smoke step** to `scripts/verify-launch-readiness.py` inside the order-creation flow (or create `scripts/verify-inline-add-customer.py` modelled on the existing smokes): from `/orders/new`, on the Customer step, click "+ New customer", fill a unique name (`f"ZZSMOKE Inline {ts}"`), leave phone blank, pick a channel chip, click **Add**; then assert (a) **no navigation occurred** (URL still `/orders/new`), (b) the customer is now shown as selected in the Customer step, and (c) a `customers` row with that name exists (query via the authed PostgREST session, like the existing cleanup helper). Clean up the created customer in the `finally` block.

- [ ] **Step 2: Run it**

Run (via the webapp-testing `with_server.py` against a prod build, per ADR-46): expected PASS, customer created + selected, no reload.

- [ ] **Step 3: Re-run the FULL smoke suite**

Run every `scripts/verify-*.py` (launch-readiness across chromium/firefox/webkit, a11y, bill-flow, customer-flow, events-flow, reports-flow, settings-flow). Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-launch-readiness.py
git commit -m "test(smoke): cover inline add-customer during order entry

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

**Part A ship gate:** unit tests green + full smoke suite green → eligible to push.

---

## Part B — Bug 3: in-app bill preview (Android WebView)

**Root cause (confirmed):** the preview is `<iframe src={blobUrl}>` pointing at the PDF; Android WebView has no native PDF renderer, so it shows a dead "PDF + Open" placeholder. Share works (different path: `navigator.share` with a `File`). Fix: render the PDF's first page to a `<canvas>` via **lazy-loaded `pdfjs-dist`** (no app-startup cost — loaded only when the preview opens, like jspdf). Keep Share exactly as-is.

**Files:**
- Modify: `src/features/orders/BillPreviewModal.tsx`
- Create: `src/features/orders/pdfPreview.ts` (lazy pdfjs loader + render-to-canvas helper)
- Test: `src/features/orders/pdfPreview.test.ts`
- Smoke: `scripts/verify-bill-flow.py` (adjust assertions to the canvas preview)
- Dependency: `pdfjs-dist`

### Task B1: Add pdfjs-dist + lazy render helper

- [ ] **Step 1: Install the dependency**

Run: `npm install pdfjs-dist`
Expected: added to `package.json` dependencies.

- [ ] **Step 2: Write the helper test**

`src/features/orders/pdfPreview.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { loadPdfJs } from './pdfPreview';

describe('loadPdfJs', () => {
  it('dynamically imports pdfjs and returns a getDocument fn + worker config', async () => {
    const pdfjs = await loadPdfJs();
    expect(typeof pdfjs.getDocument).toBe('function');
    expect(pdfjs.GlobalWorkerOptions.workerSrc).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm run test -- pdfPreview`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/features/orders/pdfPreview.ts`**

```ts
// Lazy pdfjs loader — mirrors loadJsPDF() in billPdf.ts so the pdfjs chunk
// (incl. its worker) downloads only when the bill preview opens, never at
// app startup. Android WebView has no native PDF renderer, so we rasterise
// page 1 to a <canvas>.
export async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist');
  // Worker shipped as its own URL-imported chunk by Vite.
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

/** Render page 1 of a PDF blob onto `canvas`, fitting `cssWidth` px wide. */
export async function renderPdfFirstPage(blob: Blob, canvas: HTMLCanvasElement, cssWidth: number): Promise<void> {
  const pdfjs = await loadPdfJs();
  const data = await blob.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  const page = await doc.getPage(1);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const base = page.getViewport({ scale: 1 });
  const scale = (cssWidth / base.width) * dpr;
  const viewport = page.getViewport({ scale });
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${viewport.height / dpr}px`;
  await page.render({ canvasContext: ctx, viewport }).promise;
}
```

- [ ] **Step 5: Run to verify pass; commit**

Run: `npm run test -- pdfPreview` (Expected: PASS) then `npm run typecheck`.
```bash
git add package.json package-lock.json src/features/orders/pdfPreview.ts src/features/orders/pdfPreview.test.ts
git commit -m "feat(orders): lazy pdfjs helper to rasterise bill preview

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task B2: Swap the iframe for a canvas preview

- [ ] **Step 1:** In `BillPreviewModal.tsx`, replace the `<iframe … src={pdfUrl}>` block (lines ~120-125) with a `<canvas ref={canvasRef} className="mt-3 w-full rounded border border-ink-900/10" />`. Keep the existing blob generation, but instead of `setPdfUrl`, call `renderPdfFirstPage(blob, canvasRef.current, canvasRef.current.clientWidth)` once the canvas is mounted and the blob is ready. Show the existing "Generating…" text until render resolves; on render failure set the error state. Remove `URL.createObjectURL`/`revokeObjectURL` for the preview (no longer needed) — Share keeps its own blob path untouched.

- [ ] **Step 2:** Run `npm run typecheck` (Expected: clean) and `npm run test -- BillPreviewModal` if a test exists; otherwise rely on the smoke.

- [ ] **Step 3: Update `scripts/verify-bill-flow.py`** — assert the preview canvas renders (canvas element present with non-zero width/height) instead of the iframe, and that Share still wires up. Run it (prod build). Expected: PASS.

- [ ] **Step 4: Re-run the FULL smoke suite.** Verify the new pdfjs chunk is lazy (no pdfjs network request on order-detail open; one on bill-tap), mirroring the jspdf instrumentation in ADR-47.

- [ ] **Step 5: Commit**

```bash
git add src/features/orders/BillPreviewModal.tsx scripts/verify-bill-flow.py
git commit -m "fix(orders): render bill preview to canvas via pdfjs (Android WebView)

iframe blob PDF doesn't render in Android WebView; rasterise page 1 to a
canvas. Share path unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

**Part B ship gate:** unit tests green + full smoke suite green + lazy-load verified → eligible to push.

---

## Part C — Reversibility (Improvement #2 + complaint deletion)

Spec: `docs/superpowers/specs/2026-05-26-reversibility-design.md`. Persistent secondary "undo" buttons in the order-detail action slot; native `confirm()`; delete-complaint in the complaint sheet. No schema migration.

**Files:**
- Modify: `src/features/orders/api.ts` (add `revertFulfilled`, `revertPaid`)
- Modify: `src/features/orders/complaintsApi.ts` (add `deleteComplaint`)
- Modify: `src/features/orders/OrderDetailPage.tsx` (revert buttons)
- Modify: `src/features/orders/ComplaintSheet.tsx` (delete action)
- Test: `src/features/orders/api.test.ts`, `src/features/orders/complaintsApi.test.ts`
- Smoke: `scripts/verify-customer-flow.py` or `verify-launch-readiness.py` (revert + complaint-delete steps)

### Task C1: API — revertFulfilled / revertPaid (TDD)

- [ ] **Step 1: Write failing tests** in `src/features/orders/api.test.ts`, following the existing mock-supabase pattern in that file:
```ts
test('revertFulfilled clears fulfilled_at', async () => {
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  // wire the mock client so .from('orders').update(...) === update
  await revertFulfilled('order-1');
  expect(update).toHaveBeenCalledWith({ fulfilled_at: null });
});
test('revertPaid resets to unpaid and clears paid_at', async () => {
  // ...
  await revertPaid('order-1');
  expect(update).toHaveBeenCalledWith({ payment_status: 'unpaid', paid_at: null });
});
```

- [ ] **Step 2: Run → fail** (`npm run test -- orders/api`).

- [ ] **Step 3: Implement** in `src/features/orders/api.ts` (next to `markFulfilled`/`markPaid`):
```ts
export async function revertFulfilled(id: string): Promise<void> {
  const { error } = await supabase.from('orders').update({ fulfilled_at: null }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function revertPaid(id: string): Promise<void> {
  const { error } = await supabase
    .from('orders')
    .update({ payment_status: 'unpaid', paid_at: null })
    .eq('id', id);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 4: Run → pass.**

- [ ] **Step 5: Commit** (`feat(orders): revert fulfilled/paid API`).

### Task C2: API — deleteComplaint (TDD)

- [ ] **Step 1: Failing test** in `complaintsApi.test.ts`: `deleteComplaint('c1')` calls `.from('complaints').delete().eq('id','c1')`.
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** in `complaintsApi.ts`:
```ts
export async function deleteComplaint(id: string): Promise<void> {
  const { error } = await supabase.from('complaints').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
```
- [ ] **Step 4: Run → pass.** **Step 5: Commit.**

### Task C3: OrderDetailPage revert buttons

- [ ] **Step 1:** Import `revertFulfilled`, `revertPaid`. Add `onRevertFulfilled` / `onRevertPaid` handlers mirroring `onMarkFulfilled` (each wrapped in `if (!confirm("Mark this order as not fulfilled?")) return;` / `"Mark this order as unpaid?"`, then call API, then `await load()`).
- [ ] **Step 2:** In the actions `<section>` (lines ~166-186): change the `{!fulfilled && <Mark fulfilled>}` so that when `fulfilled` is true it renders a **secondary** button (`rounded-btn-sm border border-ink-900/10 bg-paper-elevated text-body text-ink-900`) labelled "Mark as not fulfilled" calling `onRevertFulfilled`. Same for paid → "Mark as unpaid" → `onRevertPaid`. Both still `disabled={working}`.
- [ ] **Step 3:** `npm run typecheck` (clean).
- [ ] **Step 4: Commit** (`feat(orders): persistent revert for fulfilled/paid`).

### Task C4: ComplaintSheet delete action

- [ ] **Step 1:** Read `ComplaintSheet.tsx`. When `existing` is non-null, add a quiet danger-styled "Delete complaint" button: `if (!confirm("Delete this complaint?")) return;` → `await deleteComplaint(existing.id)` → call `onSaved()` (parent reloads) → `onClose()`.
- [ ] **Step 2:** `npm run typecheck`. **Step 3: Commit** (`feat(orders): delete a complaint logged by mistake`).

### Task C5: Behaviour smoke + full suite

- [ ] **Step 1:** Add smoke steps: mark fulfilled → revert → assert order returns to pending; mark paid → revert → assert unpaid; log complaint → delete → assert gone. (Idempotent + self-cleaning.)
- [ ] **Step 2:** Run that smoke (prod build) → PASS.
- [ ] **Step 3:** Re-run the FULL `verify-*.py` suite → all green.
- [ ] **Step 4: Commit** the smoke.

**Part C ship gate:** unit tests green + full smoke suite green → eligible to push.

---

## Part D — Discounts (Improvement #4)

Spec: `docs/superpowers/specs/2026-05-26-discounts-design.md`. Snapshot per order; channel default (Reseller=20) + nullable per-customer override → resolved into a per-order `discount_percent` at creation. One pure `orderTotal()` helper feeds every total site.

**Files:**
- Create: `supabase/migrations/0008_discounts.sql`
- Create: `src/features/orders/discount.ts` + `discount.test.ts` (pure `orderTotal` + `resolveDiscount`)
- Modify: `src/lib/database.types.ts` (regenerate)
- Modify: `src/features/orders/api.ts` (persist + read `discount_percent`; route totals through `orderTotal`)
- Modify: `src/features/customers/api.ts` (persist/read `discount_percent`; expose channel default)
- Modify: `src/features/orders/AddOrderPage.tsx`, `EditOrderPage.tsx` (discount step + prefill)
- Modify: `src/features/customers/AddCustomerPage.tsx` (discount field)
- Modify: `src/features/orders/billPdf.ts` + `BillPreviewModal.tsx` (discount line; `BillInput.discountPercent`)
- Modify: customer detail outstanding + reports total sites
- Test + Smoke as below.

### Task D1: Migration (additive)

- [ ] **Step 1: Write `supabase/migrations/0008_discounts.sql`:**
```sql
-- 0008_discounts.sql — additive discount columns + reseller default.
alter table channels  add column default_discount_percent numeric(5,2) not null default 0
  check (default_discount_percent between 0 and 100);
alter table customers add column discount_percent numeric(5,2)
  check (discount_percent is null or discount_percent between 0 and 100);
alter table orders    add column discount_percent numeric(5,2) not null default 0
  check (discount_percent between 0 and 100);

update channels set default_discount_percent = 20 where lower(name) = 'reseller';
```

- [ ] **Step 2: Apply it** (prompts — `apply_migration`). Confirm via `execute_sql`: the three columns exist; Reseller channel shows 20; all existing orders show 0.

- [ ] **Step 3: Regenerate types:** `mcp__supabase__generate_typescript_types` → update `src/lib/database.types.ts`. Run `npx tsc -b --force`.

- [ ] **Step 4: Commit** (`feat(db): additive discount columns + reseller default (0008)`).

### Task D2: Pure discount logic (TDD)

- [ ] **Step 1: Failing tests** `src/features/orders/discount.test.ts`:
```ts
import { orderTotal, resolveDiscount } from './discount';
test('orderTotal rounds discount to nearest rupee', () => {
  expect(orderTotal(1000, 20)).toEqual({ subtotal: 1000, discountPercent: 20, discount: 200, total: 800 });
  expect(orderTotal(999, 20)).toEqual({ subtotal: 999, discountPercent: 20, discount: 200, total: 799 }); // 199.8 → 200
});
test('orderTotal 0% is a no-op', () => {
  expect(orderTotal(500, 0)).toEqual({ subtotal: 500, discountPercent: 0, discount: 0, total: 500 });
});
test('resolveDiscount: order > customer > channel > 0', () => {
  expect(resolveDiscount({ customerDiscount: null, channelDefault: 20 })).toBe(20); // reseller inherit
  expect(resolveDiscount({ customerDiscount: 0, channelDefault: 20 })).toBe(0);     // explicit opt-out
  expect(resolveDiscount({ customerDiscount: 10, channelDefault: 0 })).toBe(10);    // personal custom
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement `src/features/orders/discount.ts`:**
```ts
export type OrderTotals = { subtotal: number; discountPercent: number; discount: number; total: number };

export function orderTotal(subtotal: number, discountPercent: number): OrderTotals {
  const discount = Math.round((subtotal * discountPercent) / 100);
  return { subtotal, discountPercent, discount, total: subtotal - discount };
}

/** null customer discount = inherit channel default; explicit value (incl 0) wins. */
export function resolveDiscount(input: { customerDiscount: number | null; channelDefault: number }): number {
  return input.customerDiscount ?? input.channelDefault;
}
```

- [ ] **Step 4: Run → pass. Step 5: Commit.**

### Task D3: Persist + read discount across the data layer

- [ ] **Step 1:** `orders/api.ts`: add `discount_percent` to `OrderRow`, all order selects, `createOrderWithItems` (accept + insert), `updateOrder` (accept + patch), `getOrderDetail`/`toListItem`/`listTodayPendingOrders` (compute `total` via `orderTotal(subtotal, discount_percent).total`). Add `discountPercent` + derived `discount`/`total` to `OrderDetailRow`.
- [ ] **Step 2:** `customers/api.ts`: add `discount_percent` to customer reads/writes (`createCustomerFull`, `updateCustomer`, `getCustomerDetail`, `CustomerRow`); add a helper to fetch a channel's `default_discount_percent` (extend `listChannels` to also select it, or add `getChannelDefaultDiscount`). Update `getCustomerDetail.outstanding_total` to sum **discounted** order totals (apply each order's `discount_percent` via `orderTotal`).
- [ ] **Step 3:** Update any reports/revenue total computations to route through `orderTotal`. Grep for `unit_price` reduces: `Grep "reduce\(" src/features` and `Grep "qty.*unit_price"`; convert each order-total site.
- [ ] **Step 4:** `npm run typecheck` + `npm run test` (fix fixtures that now need `discount_percent`; remember `npx tsc -b --force` after the shared `OrderRow` change). 
- [ ] **Step 5: Commit** (`feat: thread discount_percent through orders/customers data layer`).

### Task D4: Order form — discount step + prefill

- [ ] **Step 1:** `AddOrderPage.tsx`: add `discountPercent` state. When a customer is selected (`handleCustomer` / prefill effect), resolve `resolveDiscount({ customerDiscount: customer.discount_percent, channelDefault })` and set it (unless the user has manually edited the field). Add a "Discount" accordion step showing the % input + live `orderTotal(subtotal, discountPercent)` amount/total. Pass `discount_percent` to `createOrderWithItems`. (Requires fetching the selected customer's `discount_percent` + their channel default — extend the customer lite fetch / picker payload.)
- [ ] **Step 2:** `EditOrderPage.tsx` / edit-mode hydration in `AddOrderPage`: load stored `discount_percent`, editable; changing customer does not auto-rewrite (snapshot).
- [ ] **Step 3:** `npm run typecheck`. **Step 4: Commit.**

### Task D5: Customer form — discount field

- [ ] **Step 1:** `AddCustomerPage.tsx`: optional "Discount %" input (blank = inherit), hint text ("Resellers get 20% by default"). Persist to `discount_percent` (blank → null). Hydrate in edit mode.
- [ ] **Step 2:** `npm run typecheck`. **Step 3: Commit.**

### Task D6: Bill PDF — discount line

- [ ] **Step 1:** Failing test in `billPdf.test.ts`: with `discountPercent: 20`, the totals block shows Subtotal, "Discount (20%)" = −amount, Total = discounted; with 0% the bill is unchanged (single Total).
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3:** Add `discountPercent: number` to `BillInput`; in `buildBillPdf` totals section, when `discountPercent > 0` render Subtotal / Discount (−) / Total via `orderTotal`; else keep the current single Total. Update `toBillInput` in `BillPreviewModal.tsx` to pass `order.discountPercent`.
- [ ] **Step 4: Run → pass.** `npm run typecheck`. **Step 5: Commit.**

### Task D7: Smoke + full suite

- [ ] **Step 1:** Smoke: create a Reseller customer → new order pre-fills 20% → bill shows discount line + correct total; per-order override; a Personal customer with a custom 10%. Self-cleaning.
- [ ] **Step 2:** Run it → PASS. **Step 3:** Re-run the FULL `verify-*.py` suite → all green.
- [ ] **Step 4: Commit** the smoke.

**Part D ship gate:** migration applied + unit tests green + full smoke suite green → eligible to push.

---

## Part E — Spec-doc drift cleanup

- [ ] **Step 1:** Update `docs/v1-spec.md` per ADR-45 drift list (AddOrder → `/orders`; AddCustomer → `/customers/:id`; ProductDetailSheet CTA "+ Log new batch"; BillPreview share button "Share"). Add discounts + reversibility to the relevant §sections, and note bill preview is now canvas-rendered.
- [ ] **Step 2:** Commit (`docs: reconcile v1-spec with implementation (ADR-45 drift + new features)`).

---

## Final verification before any push

- [ ] `npm run typecheck` clean
- [ ] `npm run test` — full suite green
- [ ] `npm run build` clean
- [ ] All `scripts/verify-*.py` green on the prod build (chromium/firefox/webkit for launch-readiness)
- [ ] advisor review of the diff
- [ ] Then push (authorized on green); re-run `verify-launch-readiness.py --url https://www.crunchies.app` post-deploy to close the loop.
