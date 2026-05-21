# Sprint 2 — Architecture Decisions

Locked-in calls made during Sprint 2 planning + execution. Captured here so Sprint 3+ work doesn't relitigate them without good reason.

---

## ADR-1: Production-suggestion algorithm lives in client TypeScript, not a Postgres function

**Context:** §11 of `v1-spec.md` describes the rolling-average + seed-fallback + committed-demand + event-uplift production-suggestion algorithm. Decision needed: implement as a pure TypeScript function or as a Postgres `RETURNS TABLE` RPC.

**Decision:** Client-side pure TypeScript function in `src/features/production/algorithm.ts`, with raw-data fetcher in `src/features/production/api.ts:getProductionThisWeek()`. The fetcher pulls raw `order_items`, `production_logs`, and `seed_demand` rows from Supabase and aggregates client-side; the algorithm function takes a typed `AlgorithmInput` and returns `ProductionWeekRow[]`.

**Why:**
- TDD friction is much lower for a pure function. Sprint 2 Task 2 shipped 11 unit tests covering rolling-avg threshold, seasonal exclusion, committed-vs-base ceiling, over-production clamping, sort+tie-break, `needs_seed` flag — all without touching Supabase.
- The algorithm body will evolve in Sprint 3 (subtitles), Sprint 7 (event uplift), and possibly Sprint 8 (calibration UI). TypeScript is the lower-friction surface for that evolution.
- At v1 scale (≤15 products, ~50 orders/week), client-side aggregation fetches a few hundred rows per page load — well under any latency budget.
- Keeps the database surface minimal — no migration needed for an RPC.

**Trade-off:** Network: one extra-large fetch instead of one server-aggregated query. Negligible at v1 scale. If perf bites at launch or v2, the migration path is: move `getProductionThisWeek` body to a Postgres function returning the same input shape; algorithm signature unchanged.

**Cross-references:** `docs/superpowers/plans/2026-05-21-sprint-2-production-lens-part-1.md` § "Architecture", Task 2, Task 7.

---

## ADR-2: `needs_seed` flag on `ProductionWeekRow`

**Context:** Spec §1340 says: *"Skipping seed entry is allowed; the product simply shows no algorithm suggestion until either a seed is added or 4 weeks of order history accumulate."* The first algorithm draft returned `suggested = 0` for both "explicitly seeded with 0" and "no seed yet" — UI couldn't distinguish them.

**Decision:** Algorithm output includes a `needs_seed: boolean` field. Computed as `seed_qty === null && (is_seasonal || weeks_of_history < 4)`. Seasonal products without a seed are flagged because spec §1341 expects seasonal items to be seeded explicitly (even to 0) during their off-season.

**Why:** Keeps `suggested: number` typed simply (downstream sort/display logic doesn't have to handle null), surfaces the "needs attention" state explicitly, lets the UI decide whether to render a number or an "Add a seed estimate →" affordance per spec §443.

**Status:** Algorithm publishes the flag (verified by `algorithm.test.ts`). UI consumption deferred to Sprint 3 — Production Section C still renders the number; the affordance lands when the planning view ships.

**Cross-references:** `src/features/production/algorithm.ts`, `algorithm.test.ts` tests 9-11.

---

## ADR-3: Plan column shows `—` with no affordance in Sprint 2

**Context:** Spec §5 Section C says each row is `Plan: N / Suggested: N / Made: N`, with `Plan this week →` affordance leading to the planning view when no plan exists. Planning view is Sprint 3 work. Decision needed for the Sprint 2 placeholder.

**Decision:** Render the Plan slot as `—` with no clickable affordance. The "Plan this week →" link + planning view all ship together in Sprint 3.

**Why:** Karan's plan-checkpoint call (2026-05-21). Cleaner visual; nothing to click that won't work; preserves spec intent that planning is mom's deliberate weekly act, not a half-built nudge.

**Cross-references:** `src/features/production/ProductionPage.tsx`, plan §"Karan's plan-checkpoint decisions".

---

## ADR-4: Production fetcher does client-side group-by, not PostgREST cross-table filtered embeds

**Context:** Computing `rolling_avg` and `committed_demand` requires filtering `order_items` by `orders.ordered_at` (rolling window) and `orders.target_fulfilment_date` (committed-this-week). PostgREST supports `orders!inner(...)` cross-table embed filters, but typing under TypeScript strict mode + Supabase generated types is fiddly — the embedded `orders` field can be typed as `object | array` depending on FK relationship inference.

**Decision:** Fetch `order_items` with their `orders(ordered_at, target_fulfilment_date)` embed (UN-filtered), then bucket in TypeScript by date string comparison. The Supabase JS response is cast to a known shape (`as unknown as ItemWithOrder[]`) with a documenting comment.

**Why:**
- At v1 scale (~50 orders/week, ≤15 products, total `order_items` rows < 1000 across the lifetime of mom's business in v1) fetching all items per page load is acceptable.
- Avoids type gymnastics around PostgREST embed filter inference; ships faster.
- Date-string comparison on YYYY-MM-DD and ISO timestamp strings is lexically correct.

**Trade-off:** Fetches more rows than strictly needed. Migrate alongside ADR-1 if/when we move the algorithm to a Postgres function.

**Cross-references:** `src/features/production/api.ts:getProductionThisWeek` (the `ItemWithOrder` cast).

---

## ADR-5: Seed-footnote on Today ships in Sprint 2

**Context:** Spec §1330 prescribes a footnote "Based on your initial estimates. Will refine as real orders accumulate." that appears under Today Block 1 *only when every displayed product is still seed-based*. Decision needed: ship in Sprint 2 with the algorithm, or pair with the planning view in Sprint 3?

**Decision:** Ship in Sprint 2.

**Why:** Karan's plan-checkpoint call. Sprint 2 is the first sprint mom would see an algorithm number. The footnote is the spec's transparency commitment for the seed-only state; deferring it would either ship a misleading initial impression or require a post-launch tweak. Implementation is one `allSeeded` derivation + one `<p>` — trivial.

**Status:** `src/features/today/TodayPage.tsx` renders the footnote when `visibleProduction.length > 0 && visibleProduction.every((r) => r.uses_seed)`.

**Cross-references:** Plan §"Karan's plan-checkpoint decisions" item 2.

---

## ADR-6: Product archive (soft-delete via `active = false`) in Sprint 2

**Context:** Spec §2 has `products.active` for soft-delete. Decision needed: build the archive button in Sprint 2 or defer to Sprint 9?

**Decision:** Include in Sprint 2 — `EditProductPage` has an "Archive product" button below Save (only visible when `product.active === true`), with a confirm prompt.

**Why:** Karan's plan-checkpoint call. Small addition (one button + confirm dialog), and Sprint 2's dev-seed fixtures will eventually need cleanup without falling back to raw SQL.

**Cross-references:** `src/features/products/EditProductPage.tsx:onArchive`, `src/features/products/api.ts:archiveProduct`.

---

## ADR-7: Products screen reached via Production header link, not bottom nav

**Context:** Products CRUD doesn't fit the 5-tab bottom nav (Today/Orders/Customers/Production/Reports — locked). Where else does it live?

**Decision:** Header link "Manage products →" on the Production screen, plus deep-link `/products` URL. No bottom-nav tab; no Settings entry yet (Settings ships in Sprint 9).

**Why:** Karan's plan-checkpoint call. Products is an admin/setup surface mom won't visit often once set up. One tap from Production keeps it discoverable when she's already in the production headspace.

**Cross-references:** `src/features/production/ProductionPage.tsx` header.
