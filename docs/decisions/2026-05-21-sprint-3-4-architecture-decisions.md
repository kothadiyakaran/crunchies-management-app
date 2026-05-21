# Sprint 3 + 4 — Architecture Decisions

Locked-in calls made during Sprint 3 (Production lens part 2) and Sprint 4 (Order lens part 1) planning + execution. Captured here so Sprint 5+ doesn't relitigate them without good reason.

Builds on `2026-05-21-sprint-2-architecture-decisions.md` (ADR-1..7). Numbering continues.

---

## ADR-8: Plan composition is a thin layer over algorithm output, not baked into algorithm

**Context:** Sprint 3 needed to make production rows plan-aware (target = plan if set, else suggested) and add subtitle/gap/done flags. Option (a): extend the §11 algorithm to consume plans. Option (b): keep the algorithm pure (suggestion only) and add a composition layer on top.

**Decision:** Option (b). New file `src/features/production/planLayer.ts` exports `composeWithPlan(rows, plans): ProductionWeekRowFull[]`. The algorithm in `algorithm.ts` continues to output `suggested` without knowing about plans.

**Why:**
- The algorithm answers "what should mom make?" — a stable, testable question. Plans are a separate user input.
- Mixing plans into the algorithm would tangle two concerns and force the 11-test algorithm suite to mock plan inputs for every test case.
- Composition layer is pure (deterministic, no side effects) and earned its own 7-test suite covering target/gap/done/subtitle.

**Cross-references:** `src/features/production/planLayer.ts`, `planLayer.test.ts`, `ProductionPage.tsx` (consumer), `TodayPage.tsx` (consumer).

---

## ADR-9: `original_planned_qty` enforced in TS, not via Postgres trigger

**Context:** Spec §12 says `production_plans.original_planned_qty` is set on first INSERT and never updated thereafter — the calibration anchor. Two ways to enforce: (a) Postgres trigger blocking UPDATEs on the column, (b) two-step TS upsert (SELECT-then-INSERT-or-UPDATE).

**Decision:** Two-step TS upsert in `upsertProductionPlan(productId, weekStart, qty)`. The UPDATE path patches only `planned_qty`; the INSERT path sets both `planned_qty` and `original_planned_qty` to the input.

**Why:**
- Single-tenant app (mom is the sole writer); race conditions don't exist at v1 scale.
- A trigger adds DB-side complexity (migration, testing in prod) for a constraint that's already inviolable via the API layer.
- If multi-tenant ever becomes a concern, migrating to a Postgres function with the same semantics is straightforward.

**Cross-references:** `src/features/production/api.ts:upsertProductionPlan`.

---

## ADR-10: Production bottom-sheet uses portal'd Tailwind overlay, no animation library

**Context:** Sprint 3 §5 spec calls for a bottom-sheet drill-in on each Production row. Options: a Headless UI / Radix Dialog with sliding animation, OR a hand-rolled overlay with Tailwind utilities.

**Decision:** Hand-rolled. `ProductDetailSheet` is a two-element JSX fragment: a `fixed inset-0 z-40 bg-ink-900/40` backdrop + a `fixed inset-x-0 bottom-0 z-50 rounded-t-2xl ...` sheet. No portal library; React 18 renders both into the component's slot which still positions correctly because they're `fixed`. No transition animation.

**Why:**
- Mom's iteration-tolerance constraint: simpler is better; fewer moving parts.
- Adding Headless UI or Radix is a 30-50KB dep for one feature.
- Animation polish is a v2 nice-to-have, not v1 must.

**Cross-references:** `src/features/production/ProductDetailSheet.tsx`, `SeedEstimateModal.tsx`, `AddCustomerInlineModal.tsx` (same pattern).

---

## ADR-11: Production row uses `<div role="button">`, not `<button>`

**Context:** Sprint 3 Task 9 first-pass used `<button>` for the Production row, with a nested `<span role="button">` for the "Add a seed estimate →" affordance when `needs_seed`. Implementer flagged this as invalid HTML (button-in-button) even though `stopPropagation()` made it functionally correct.

**Decision:** Row outer element is `<div role="button" tabIndex={0} onClick onKeyDown>`. The seed affordance becomes a proper `<button>` with `stopPropagation()`. Same UX, valid HTML.

**Why:** Browser HTML parsers reject nested interactive elements inside `<button>`. While our usage works (React doesn't error, behavior is correct), assistive tech announces button-in-button awkwardly. Cost of fix: 7 lines.

**Cross-references:** `src/features/production/ProductionPage.tsx`, the row-rendering JSX inside `notDone.map(...)`.

---

## ADR-12: `target_fulfilment_date` mandatory on mom-entered orders, default to today

**Context:** Spec §12 makes `target_fulfilment_date` the calibration anchor (the week against which demand counts). The DB column allows NULL because exhibition-form submissions don't supply it (mom completes them on review). For mom-entered orders, however, it must be set.

**Decision:** Sprint 4 AddOrderPage step 4 is required-with-default. The date input defaults to `todayInTz()`, and the step's "complete" check is `targetDate.length === 10`. The api.ts `createOrderWithItems` throws if the field is empty as a defense-in-depth check.

**Why:** Per §12, demand belongs to the week mom must deliver, not the week the order was received. Without this anchor the rolling-average calibration breaks. The UI default of "today" + the always-visible Save button means mom never has to think about this field unless backdating; the calibration anchor is captured silently.

**Cross-references:** `src/features/orders/AddOrderPage.tsx` (step 4 + canSubmit), `src/features/orders/api.ts:createOrderWithItems` (defense check).

---

## ADR-13: Multi-item order insert = sequential + cleanup, not Postgres function

**Context:** `createOrderWithItems` inserts one row into `orders` and N rows into `order_items`. Atomicity options: (a) Postgres function with BEGIN/COMMIT, (b) Sequential TS inserts with cleanup on item-insert failure.

**Decision:** Option (b). After a successful `orders` insert, attempt the `order_items` insert. On failure, attempt `supabase.from('orders').delete().eq('id', order.id)` to clean up the orphan. If the cleanup itself fails (rare — network), throw so mom sees the error and can retry; the orphan is acceptable at v1 scale (single-tenant, low volume) and can be cleaned via the admin SQL skill.

**Why:**
- Avoids a DB migration for v1 scale.
- Failure mode is bounded: at worst one orphaned order row, which the admin tool can remove.
- Migration path to RPC is straightforward when needed.

**Cross-references:** `src/features/orders/api.ts:createOrderWithItems`.

---

## ADR-14: Orders filter chip state lives in URL search params

**Context:** Sprint 4 OrdersPage has 5 filter chips (`All` / `Pending fulfilment` / `Unpaid` / `This week` / `This month`). Storage options: component state, URL params, or context.

**Decision:** URL params (`?filter=pending`) via React Router's `useSearchParams`. Default state (`?filter` absent) means `all`.

**Why:**
- Shareable: Karan / mom can paste a link and land on the filtered view (relevant for the Today Block 2 "see all →" link which deep-links to `/orders?filter=pending`).
- Back-button friendly: changing filters adds history entries.
- Survives reloads: a refresh of `/orders?filter=unpaid` keeps the filter.
- Cost: zero — `useSearchParams` is already in React Router and used elsewhere (Production via `?product_id=`).

**Cross-references:** `src/features/orders/OrdersPage.tsx` (filter chips), `src/features/today/TodayPage.tsx` (the "see all →" link).

---

## ADR-15: `paid_at` and `fulfilled_at` are Postgres `date` columns — write via `todayInTz()`

**Context:** `markFulfilled(id)` and `markPaid(id)` set the corresponding timestamp. Initial implementation used `new Date().toISOString()` which produces something like `"2026-05-21T16:35:00.000Z"`.

**Decision:** Use `todayInTz()` (returns `YYYY-MM-DD` in Asia/Kolkata).

**Why:** Both columns are declared `date` in `supabase/migrations/0001_init.sql` lines 97 and 99 — NOT `timestamptz`. Postgres `date` columns may silently truncate or reject full ISO timestamps; even when accepted, the truncation happens in UTC which causes off-by-one between 00:00 and 05:30 IST (mom would mark an order paid at 4am IST and the DB would record "yesterday"). `todayInTz()` is the existing Asia/Kolkata helper from `src/lib/utils.ts`.

**This is a foot-gun worth remembering** across future sessions — any new write to a date column in this schema should go through `todayInTz()` (or another explicit Asia/Kolkata date helper), never `new Date().toISOString()`.

**Cross-references:** `src/features/orders/api.ts:markFulfilled`, `markPaid`. Memory: `memory/project_date_columns.md`.

---

## ADR-16: Bill / complaint / edit-order buttons render as disabled placeholders in Sprint 4

**Context:** Spec §7 OrderDetail screen lists action buttons including `Generate bill`, `Log complaint`, `Edit order`. Sprint 4 scope per spec §14 only covers browse + detail + add + Today Block 2; bills (jsPDF + share sheet), complaints (logging UI), and edit-order all land in Sprint 5.

**Decision:** Render those three buttons in the OrderDetail screen as visible-but-disabled, with the caption text `"(Sprint 5)"` appended. The visible-presence ensures spec compliance for the action surface; the disabled state communicates "feature exists in plan but not yet built."

**Why:** Karan reviews mom-facing surfaces; he expects the action surface to look complete. Hiding the buttons entirely would create surprise when they appear next sprint. Disabled-with-hint is the lowest-friction compromise.

**Cross-references:** `src/features/orders/OrderDetailPage.tsx` action-buttons section.

---

## Open items carrying into Sprint 5

- **Edit order** route exists in the design (`/orders/:id/edit`) but no implementation. Sprint 5 should build it, possibly reusing the AddOrderPage accordion in an edit-mode variant.
- **Bill generation** (jsPDF + OS share sheet) is the highest-risk Sprint 5 item — second-highest technical-unknown per spec §14 risks table. Plan to verify on Karan's Android with a real WhatsApp install during Sprint 5.
- **Complaint logging** is small (one form + bottom sheet trigger from OrderDetail).
- **Batch entry mode** (§7 batch section) — flat always-visible form with "save & next" + running list — Sprint 5.
- **`bill_number` sequence** starting at 1001 needs a Postgres counter or app-side serial. Spec §7 details the lifecycle (set on first Generate bill, persisted, reused on regeneration).
