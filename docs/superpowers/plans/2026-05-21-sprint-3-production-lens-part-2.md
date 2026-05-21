# Sprint 3 — Production Lens Part 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the calibration loop. Mom can plan her week, the plan replaces the algorithm's suggestion as the operative target everywhere, and she can drill into any product to see/edit/delete logs from a bottom sheet. Plus the small completeness items left over from Sprint 2.

**Architecture:** Add a thin **plan layer** on top of the existing algorithm output — a pure composition function `composeWithPlan(rows, plans)` that produces a richer `ProductionWeekRowFull` carrying `planned_qty`, `original_planned_qty`, `target` (plan if set else suggested), `gap`, `done`, and a `subtitle`. The Production screen and Today screen both consume this richer type. Plan immutability (`original_planned_qty` frozen on first save) is enforced in the api layer with a two-step select-then-insert-or-update pattern (single-tenant, no race concern). Bottom sheet is a portal'd overlay component; log edit/delete reuse the existing `/production/new` form shape with a different route.

**Spec source:** `docs/v1-spec.md` §5 full body (Section C with Plan column + subtitle + Done collapse, planning view, product-detail bottom sheet, Section D aggregated, empty-states `Add a seed estimate →`), §11 subtitle rules + seed-read-only-after-4w rule, §12 plan immutability rules.

**Tech Stack:** React 18 + TypeScript + React Router 6 + Tailwind + Supabase JS + Vitest/RTL.

**Karan's Sprint 3 scope decisions (2026-05-21):**

Sprint 3 folds in **everything that was deferred from Sprint 2**, so we don't carry baggage into Sprint 4:

1. **Planning view** (`/production/plan-this-week`) — spec'd Sprint 3 deliverable
2. **Product-detail bottom sheet** with log list + edit/delete — spec'd Sprint 3 deliverable
3. **Production-screen subtitle** ("includes pending orders" only — event-uplift subtitle deferred to Sprint 7 when event_uplift lands in the algorithm)
4. **`needs_seed` UI consumption** (ADR-2 carryover) — "Add a seed estimate →" affordance via a one-field modal (per spec §1324)
5. **Plan column affordance** (ADR-3 carryover) — "Plan this week →" link at top of Section C when no plans exist; numbers + edit affordance per row when plans exist
6. **Seed read-only after 4 weeks** on EditProductPage (Sprint 2 Task 6 carryover) — implement via a new `getWeeksOfHistoryForProduct(id)` helper
7. **"Done this week (N)" collapse** on Production — spec'd in §5 "Sorting"
8. **Section D aggregated products** read-only sub-section — spec'd in §5

Other in-flight scope decisions:
- **Bottom sheet "+ Log new batch"** → navigates to `/production/new?product_id=` (reuses existing form; no inline form duplication).
- **Bottom sheet tap-log-to-edit** → navigates to `/production/log/:id` (new route, edit/delete form).
- **`original_planned_qty` enforcement** → done in TS via select-then-insert-or-update (single-tenant; no race). RPC option deferred — easy migration if it bites.
- **Subtitle for events** explicitly **NOT** in Sprint 3. Algorithm `base` doesn't include event_uplift yet (Sprint 7 work). Only `committed_qty > base` → "includes pending orders" subtitle.
- **`Done this week (N)`** collapses by default; tap header to expand.

---

## File Structure

**New files:**
- `src/features/production/planLayer.ts` — pure function `composeWithPlan(rows, plans): ProductionWeekRowFull[]` + types
- `src/features/production/planLayer.test.ts` — unit tests for composition + subtitle + done logic
- `src/features/production/PlanWeekPage.tsx` — planning view at `/production/plan-this-week`
- `src/features/production/PlanWeekPage.test.tsx` — submit-creates-plans-and-returns-to-/production
- `src/features/production/ProductDetailSheet.tsx` — bottom sheet overlay component
- `src/features/production/EditLogProductionPage.tsx` — edit/delete a single `production_logs` row at `/production/log/:id`
- `src/features/production/SeedEstimateModal.tsx` — one-field modal for "Add a seed estimate →" affordance
- `src/features/production/AggregatedSection.tsx` — Section D ("From other makers") read-only renderer

**Modified files:**
- `src/features/production/api.ts` — add `getProductionPlansForWeek`, `upsertProductionPlan`, `listProductionLogsForProductInWeek`, `getProductionLog`, `updateProductionLog`, `deleteProductionLog`, `getAggregatedThisWeek`, `getWeeksOfHistoryForProduct`
- `src/features/production/ProductionPage.tsx` — full rewrite: planning entry point, Plan/Suggested/Made row with subtitle, "Add a seed estimate →" replacement when needs_seed, "Done this week (N)" collapse, tap → bottom sheet, Section D
- `src/features/production/LogProductionPage.tsx` — no functional change (route still `/production/new`); existing prefill behaviour preserved
- `src/features/products/EditProductPage.tsx` — wire `getWeeksOfHistoryForProduct` so `seedReadOnly = weeks >= 4`; show subtitle text
- `src/features/today/TodayPage.tsx` — Block 1 uses plan-aware target + same subtitle rule; sort by gap
- `src/App.tsx` — add routes `/production/plan-this-week`, `/production/log/:id`

**No schema changes.** `production_plans` already exists with the right shape per `src/lib/database.types.ts:347-381`.

**Test files added:**
- `src/features/production/planLayer.test.ts`
- `src/features/production/PlanWeekPage.test.tsx`

**Out of scope (Sprint 4+):**
- Event-uplift subtitle ("includes ramp-up for X") — Sprint 7 (event_uplift not in algorithm yet)
- Mom-entered orders with `target_fulfilment_date` mandatory — Sprint 4 (the form change is in §7)
- Block 0 Monday retrospective banner — Sprint 8

---

## Cross-cutting types and rules

**Plan layer output type** (defined in `planLayer.ts`):

```ts
import type { ProductionWeekRow } from './algorithm';

export type WeekPlanRow = {
  planned_qty: number;
  original_planned_qty: number;
  entered_at: string;
};

export type ProductionWeekRowFull = ProductionWeekRow & {
  planned_qty: number | null;
  original_planned_qty: number | null;
  target: number;          // plan if set, else suggested
  gap: number;             // max(0, target - produced_qty)
  done: boolean;           // produced_qty >= target AND target > 0
  subtitle: string | null; // "includes pending orders" when committed_qty > base; null otherwise
};
```

**Subtitle rule (Sprint 3 only — event-uplift variant ships Sprint 7):**
- If `committed_qty > base` → `"includes pending orders"`
- Else → `null`

**Target / gap rule:**
- `target = planned_qty ?? suggested`
- `gap = Math.max(0, target - produced_qty)`
- `done = (target > 0 && produced_qty >= target)` — note the `target > 0` guard so a "skip this week" plan (planned_qty=0) with 0 produced doesn't show as done; it's already at target

**Sort order** (Production Section C + Today Block 1):
- Not-done first, sorted by `gap` descending
- Alphabetical tie-break by `name`
- Done rows collapse separately on Production (Section C `Done this week (N)` collapsible); Today filters them out entirely (per existing `suggested === 0 && produced === 0` rule extended to plan-aware)

**Plan upsert pattern** (api.ts):

```ts
// Two-step: SELECT current, then INSERT (with original_planned_qty=qty) or UPDATE planned_qty only.
// Single-tenant (mom is the only writer); no race.
export async function upsertProductionPlan(
  productId: string,
  weekStart: string,
  qty: number,
): Promise<void> {
  const { data: existing, error: selErr } = await supabase
    .from('production_plans')
    .select('product_id')
    .eq('product_id', productId)
    .eq('week_start', weekStart)
    .maybeSingle();
  if (selErr) throw new Error(selErr.message);
  if (existing) {
    const { error } = await supabase
      .from('production_plans')
      .update({ planned_qty: qty })
      .eq('product_id', productId)
      .eq('week_start', weekStart);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('production_plans').insert({
      product_id: productId,
      week_start: weekStart,
      planned_qty: qty,
      original_planned_qty: qty,
    });
    if (error) throw new Error(error.message);
  }
}
```

**Bottom sheet pattern:**
- Fixed-position overlay; backdrop with `bg-ink-900/40`; sheet `bg-paper-elevated rounded-t-2xl` slides up from bottom.
- Tap backdrop OR a close `✕` → onClose.
- Body: header (product name + week), Plan/Suggested/Made stats, `+ Log new batch` button, log list.
- No animation library — Tailwind transition utilities only.

---

## Task 1: production_plans api helpers

**Files:**
- Modify: `src/features/production/api.ts`

- [ ] **Step 1: Implement (no separate unit test — Task 3's PlanWeekPage test covers the upsert path; the SELECT-then-INSERT/UPDATE logic is mechanical)**

Append to `src/features/production/api.ts`:

```ts
export type WeekPlanRow = {
  planned_qty: number;
  original_planned_qty: number;
  entered_at: string;
};

export async function getProductionPlansForWeek(weekStart: string): Promise<Record<string, WeekPlanRow>> {
  const { data, error } = await supabase
    .from('production_plans')
    .select('product_id, planned_qty, original_planned_qty, entered_at')
    .eq('week_start', weekStart);
  if (error) throw new Error(error.message);
  const out: Record<string, WeekPlanRow> = {};
  for (const r of data ?? []) {
    out[r.product_id] = {
      planned_qty: Number(r.planned_qty),
      original_planned_qty: Number(r.original_planned_qty),
      entered_at: r.entered_at,
    };
  }
  return out;
}

/**
 * Upserts a production_plans row.
 * - On first insert: original_planned_qty is set to qty (the calibration anchor — see §12).
 * - On update: only planned_qty changes. original_planned_qty stays frozen.
 *
 * Implementation: SELECT first, then INSERT or UPDATE. Single-tenant (mom is sole writer),
 * so a race here is impossible at v1 scale. If concurrency ever becomes a concern, migrate
 * to a Postgres function with the same semantics.
 */
export async function upsertProductionPlan(
  productId: string,
  weekStart: string,
  qty: number,
): Promise<void> {
  const { data: existing, error: selErr } = await supabase
    .from('production_plans')
    .select('product_id')
    .eq('product_id', productId)
    .eq('week_start', weekStart)
    .maybeSingle();
  if (selErr) throw new Error(selErr.message);
  if (existing) {
    const { error } = await supabase
      .from('production_plans')
      .update({ planned_qty: qty })
      .eq('product_id', productId)
      .eq('week_start', weekStart);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('production_plans').insert({
      product_id: productId,
      week_start: weekStart,
      planned_qty: qty,
      original_planned_qty: qty,
    });
    if (error) throw new Error(error.message);
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck` (NOT `npx tsc --noEmit` — project references need the npm script).
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/features/production/api.ts
git commit -m "Sprint 3: production_plans get/upsert with original_planned_qty immutability"
```

---

## Task 2: Plan composition layer + tests

**Files:**
- Create: `src/features/production/planLayer.ts`
- Create: `src/features/production/planLayer.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/features/production/planLayer.test.ts
import { describe, it, expect } from 'vitest';
import { composeWithPlan, type ProductionWeekRowFull } from './planLayer';
import type { ProductionWeekRow } from './algorithm';

function baseRow(over: Partial<ProductionWeekRow> = {}): ProductionWeekRow {
  return {
    product_id: 'p1',
    name: 'Chivda',
    unit: '250g',
    is_seasonal: false,
    rolling_avg: 0,
    seed_qty: null,
    weeks_of_history: 0,
    committed_qty: 0,
    produced_qty: 0,
    base: 0,
    suggested: 0,
    uses_seed: false,
    needs_seed: false,
    ...over,
  };
}

describe('composeWithPlan', () => {
  it('uses suggested as target when no plan exists', () => {
    const out = composeWithPlan([baseRow({ suggested: 5 })], {});
    expect(out[0].planned_qty).toBeNull();
    expect(out[0].target).toBe(5);
    expect(out[0].gap).toBe(5);
    expect(out[0].done).toBe(false);
  });

  it('uses plan as target when plan exists, regardless of suggested', () => {
    const out = composeWithPlan(
      [baseRow({ suggested: 5 })],
      { p1: { planned_qty: 3, original_planned_qty: 3, entered_at: '2026-05-18T03:00:00Z' } },
    );
    expect(out[0].planned_qty).toBe(3);
    expect(out[0].target).toBe(3);
    expect(out[0].gap).toBe(3);
  });

  it('done=true when produced ≥ target AND target > 0', () => {
    const out = composeWithPlan(
      [baseRow({ suggested: 5, produced_qty: 5 })],
      {},
    );
    expect(out[0].done).toBe(true);
    expect(out[0].gap).toBe(0);
  });

  it('done=false when target=0 and produced=0 (skip-week case)', () => {
    const out = composeWithPlan(
      [baseRow({ suggested: 5, produced_qty: 0 })],
      { p1: { planned_qty: 0, original_planned_qty: 0, entered_at: '2026-05-18T03:00:00Z' } },
    );
    expect(out[0].target).toBe(0);
    expect(out[0].done).toBe(false);
    expect(out[0].gap).toBe(0);
  });

  it('subtitle "includes pending orders" when committed > base', () => {
    const out = composeWithPlan(
      [baseRow({ base: 2, committed_qty: 5, suggested: 5 })],
      {},
    );
    expect(out[0].subtitle).toBe('includes pending orders');
  });

  it('subtitle null when committed equals base', () => {
    const out = composeWithPlan(
      [baseRow({ base: 5, committed_qty: 5, suggested: 5 })],
      {},
    );
    expect(out[0].subtitle).toBeNull();
  });

  it('subtitle null when committed < base', () => {
    const out = composeWithPlan(
      [baseRow({ base: 5, committed_qty: 2, suggested: 5 })],
      {},
    );
    expect(out[0].subtitle).toBeNull();
  });

  it('plan_qty is preserved alongside original_planned_qty', () => {
    const out = composeWithPlan(
      [baseRow()],
      { p1: { planned_qty: 4, original_planned_qty: 3, entered_at: '2026-05-18T03:00:00Z' } },
    );
    expect(out[0].planned_qty).toBe(4);
    expect(out[0].original_planned_qty).toBe(3);
    expect(out[0].target).toBe(4); // operative is mutable
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npm run test:run -- src/features/production/planLayer.test.ts`
Expected: FAIL with "Cannot find module './planLayer'".

- [ ] **Step 3: Implement**

```ts
// src/features/production/planLayer.ts
import type { ProductionWeekRow } from './algorithm';
import type { WeekPlanRow } from './api';

export type ProductionWeekRowFull = ProductionWeekRow & {
  planned_qty: number | null;
  original_planned_qty: number | null;
  target: number;
  gap: number;
  done: boolean;
  subtitle: string | null;
};

export function composeWithPlan(
  rows: ProductionWeekRow[],
  plans: Record<string, WeekPlanRow>,
): ProductionWeekRowFull[] {
  return rows.map((r) => {
    const plan = plans[r.product_id];
    const planned_qty = plan ? plan.planned_qty : null;
    const target = planned_qty ?? r.suggested;
    const gap = Math.max(0, target - r.produced_qty);
    const done = target > 0 && r.produced_qty >= target;
    const subtitle = r.committed_qty > r.base ? 'includes pending orders' : null;
    return {
      ...r,
      planned_qty,
      original_planned_qty: plan ? plan.original_planned_qty : null,
      target,
      gap,
      done,
      subtitle,
    };
  });
}
```

- [ ] **Step 4: Tests pass (8/8)**

Run: `npm run test:run -- src/features/production/planLayer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/production/planLayer.ts src/features/production/planLayer.test.ts
git commit -m "Sprint 3: plan composition layer + subtitle + done logic + tests"
```

---

## Task 3: Production logs api — list/get/update/delete

**Files:**
- Modify: `src/features/production/api.ts`

- [ ] **Step 1: Implement**

Append:

```ts
export type ProductionLogRow = {
  id: string;
  product_id: string;
  qty: number;
  made_on: string;
  notes: string | null;
  created_at: string;
};

export async function listProductionLogsForProductInWeek(
  productId: string,
  weekStart: string,
): Promise<ProductionLogRow[]> {
  const weekEndMs = new Date(`${weekStart}T00:00:00Z`).getTime() + 7 * 24 * 60 * 60 * 1000;
  const weekEnd = new Date(weekEndMs).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('production_logs')
    .select('id, product_id, qty, made_on, notes, created_at')
    .eq('product_id', productId)
    .gte('made_on', weekStart)
    .lt('made_on', weekEnd)
    .order('made_on', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProductionLogRow[];
}

export async function getProductionLog(id: string): Promise<ProductionLogRow | null> {
  const { data, error } = await supabase
    .from('production_logs')
    .select('id, product_id, qty, made_on, notes, created_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as ProductionLogRow | null;
}

export async function updateProductionLog(
  id: string,
  patch: { qty?: number; made_on?: string; notes?: string | null },
): Promise<void> {
  const { error } = await supabase.from('production_logs').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteProductionLog(id: string): Promise<void> {
  const { error } = await supabase.from('production_logs').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 2: Aggregated section helper** — also append:

```ts
/**
 * Returns aggregated (from-other-makers) products with committed demand THIS WEEK.
 * Used by §5 Section D. Empty when no aggregated products have demand this week.
 */
export type AggregatedRow = {
  product_id: string;
  name: string;
  source_maker_name: string | null;
  unit: string;
  committed_qty: number;
};

export async function getAggregatedThisWeek(): Promise<AggregatedRow[]> {
  const today = todayInTz();
  const weekStart = weekStartFor(today);
  const weekEndMs = new Date(`${weekStart}T00:00:00Z`).getTime() + 7 * 24 * 60 * 60 * 1000;
  const weekEnd = new Date(weekEndMs).toISOString().slice(0, 10);

  // Active aggregated products
  const { data: products, error: pErr } = await supabase
    .from('products')
    .select('id, name, unit, source_maker_name')
    .eq('active', true)
    .eq('is_aggregated', true);
  if (pErr) throw new Error(pErr.message);
  if (!products || products.length === 0) return [];

  // Committed demand: orders with target_fulfilment_date in this week, OR (target NULL AND ordered_at in this week)
  // Same logic as in getProductionThisWeek. We fetch items + their order embed, filter client-side.
  type ItemWithOrder = {
    product_id: string;
    qty: number;
    orders: { target_fulfilment_date: string | null; ordered_at: string } | null;
  };
  const { data: itemsData, error: iErr } = await supabase
    .from('order_items')
    .select('product_id, qty, orders(target_fulfilment_date, ordered_at)')
    .in('product_id', products.map((p) => p.id));
  if (iErr) throw new Error(iErr.message);
  const items = (itemsData ?? []) as unknown as ItemWithOrder[];

  const weekStartIso = `${weekStart}T00:00:00+05:30`;
  const weekEndIso = `${weekEnd}T00:00:00+05:30`;
  const committed: Record<string, number> = {};
  for (const it of items) {
    const o = it.orders;
    if (!o) continue;
    const matchesDated = o.target_fulfilment_date && o.target_fulfilment_date >= weekStart && o.target_fulfilment_date < weekEnd;
    const matchesUndated = o.target_fulfilment_date === null && o.ordered_at >= weekStartIso && o.ordered_at < weekEndIso;
    if (matchesDated || matchesUndated) {
      committed[it.product_id] = (committed[it.product_id] ?? 0) + Number(it.qty);
    }
  }

  return products
    .map((p) => ({
      product_id: p.id,
      name: p.name,
      source_maker_name: p.source_maker_name,
      unit: p.unit,
      committed_qty: committed[p.id] ?? 0,
    }))
    .filter((r) => r.committed_qty > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Weeks elapsed since this product's first order, in Asia/Kolkata.
 * Returns 0 if the product has no orders yet. Used by EditProductPage to
 * decide whether to make the seed field read-only (≥4 weeks → read-only per §11).
 */
export async function getWeeksOfHistoryForProduct(productId: string): Promise<number> {
  const { data, error } = await supabase
    .from('order_items')
    .select('orders!inner(ordered_at)')
    .eq('product_id', productId)
    .order('orders(ordered_at)', { ascending: true })
    .limit(1);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as { orders: { ordered_at: string } }[];
  if (rows.length === 0) return 0;
  const firstRow = rows[0];
  if (!firstRow) return 0;
  const first = new Date(firstRow.orders.ordered_at).getTime();
  const weekStart = weekStartFor(todayInTz());
  const now = new Date(`${weekStart}T00:00:00Z`).getTime();
  const days = Math.floor((now - first) / (24 * 60 * 60 * 1000));
  return Math.max(0, Math.floor(days / 7));
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/features/production/api.ts
git commit -m "Sprint 3: production_logs CRUD + aggregated-section fetcher + weeks-of-history helper"
```

---

## Task 4: Planning view page + route

**Files:**
- Create: `src/features/production/PlanWeekPage.tsx`
- Create: `src/features/production/PlanWeekPage.test.tsx`
- Modify: `src/App.tsx` (add `/production/plan-this-week` route)

- [ ] **Step 1: Write failing test**

```tsx
// src/features/production/PlanWeekPage.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getProductionThisWeek = vi.fn();
const getProductionPlansForWeek = vi.fn();
const upsertProductionPlan = vi.fn();

vi.mock('@/features/production/api', () => ({
  getProductionThisWeek: () => getProductionThisWeek(),
  getProductionPlansForWeek: (w: string) => getProductionPlansForWeek(w),
  upsertProductionPlan: (pid: string, w: string, q: number) => upsertProductionPlan(pid, w, q),
}));

vi.mock('@/lib/utils', () => ({ todayInTz: () => '2026-05-21' }));
vi.mock('@/lib/week', () => ({ weekStartFor: () => '2026-05-18' }));

import { PlanWeekPage } from './PlanWeekPage';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/production/plan-this-week']}>
      <Routes>
        <Route path="/production/plan-this-week" element={<PlanWeekPage />} />
        <Route path="/production" element={<div>ProductionScreen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  getProductionThisWeek.mockReset();
  getProductionPlansForWeek.mockReset();
  upsertProductionPlan.mockReset();
  getProductionThisWeek.mockResolvedValue([
    {
      product_id: 'p1', name: 'Chivda', unit: '250g', is_seasonal: false,
      rolling_avg: 0, seed_qty: 5, weeks_of_history: 0, committed_qty: 0,
      produced_qty: 0, base: 5, suggested: 5, uses_seed: true, needs_seed: false,
    },
    {
      product_id: 'p2', name: 'Laddu', unit: 'box', is_seasonal: false,
      rolling_avg: 0, seed_qty: 3, weeks_of_history: 0, committed_qty: 0,
      produced_qty: 0, base: 3, suggested: 3, uses_seed: true, needs_seed: false,
    },
  ]);
  getProductionPlansForWeek.mockResolvedValue({});
  upsertProductionPlan.mockResolvedValue(undefined);
});

describe('PlanWeekPage', () => {
  it('pre-fills from suggestion, edits per-product, saves all, navigates back', async () => {
    const user = userEvent.setup();
    renderPage();

    // wait for products to load
    const chivdaInput = await screen.findByLabelText(/Chivda/);
    const laddoInput = screen.getByLabelText(/Laddu/);

    expect(chivdaInput).toHaveValue(5);
    expect(laddoInput).toHaveValue(3);

    // edit Chivda to 4
    await user.clear(chivdaInput);
    await user.type(chivdaInput, '4');

    await user.click(screen.getByRole('button', { name: /save plan/i }));

    await waitFor(() => expect(upsertProductionPlan).toHaveBeenCalledTimes(2));
    expect(upsertProductionPlan).toHaveBeenCalledWith('p1', '2026-05-18', 4);
    expect(upsertProductionPlan).toHaveBeenCalledWith('p2', '2026-05-18', 3);

    expect(await screen.findByText('ProductionScreen')).toBeInTheDocument();
  });

  it('pre-fills from existing plan when present', async () => {
    getProductionPlansForWeek.mockResolvedValue({
      p1: { planned_qty: 7, original_planned_qty: 5, entered_at: '2026-05-18T03:00:00Z' },
    });
    renderPage();
    const chivdaInput = await screen.findByLabelText(/Chivda/);
    expect(chivdaInput).toHaveValue(7); // operative, not original
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npm run test:run -- src/features/production/PlanWeekPage.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// src/features/production/PlanWeekPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getProductionThisWeek,
  getProductionPlansForWeek,
  upsertProductionPlan,
  type WeekPlanRow,
} from './api';
import type { ProductionWeekRow } from './algorithm';
import { todayInTz } from '@/lib/utils';
import { weekStartFor } from '@/lib/week';

export function PlanWeekPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ProductionWeekRow[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const weekStart = weekStartFor(todayInTz());

  useEffect(() => {
    (async () => {
      try {
        const [r, p] = await Promise.all([
          getProductionThisWeek(),
          getProductionPlansForWeek(weekStart),
        ]);
        setRows(r);
        const v: Record<string, string> = {};
        for (const row of r) {
          const plan: WeekPlanRow | undefined = p[row.product_id];
          v[row.product_id] = String(plan ? plan.planned_qty : row.suggested);
        }
        setValues(v);
        setLoading(false);
      } catch (e) {
        setError((e as Error).message);
        setLoading(false);
      }
    })();
  }, [weekStart]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      for (const row of rows) {
        const raw = values[row.product_id] ?? '';
        const num = Number(raw);
        if (!Number.isFinite(num) || num < 0) continue;
        await upsertProductionPlan(row.product_id, weekStart, num);
      }
      navigate('/production');
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  const inputClass = 'mt-1 h-11 w-24 rounded-input border border-ink-900/10 bg-paper-elevated px-3 text-body text-right';
  const labelSpan = 'block text-body font-semibold text-ink-900';

  return (
    <div>
      <h1 className="text-title text-ink-900">Plan this week</h1>
      <p className="mt-2 text-body-sm text-ink-500">Week of {weekStart}</p>

      {error && <p className="mt-4 text-body-sm text-status-danger-fg">{error}</p>}

      {loading ? (
        <p className="mt-6 text-body-sm text-ink-500">Loading…</p>
      ) : (
        <form onSubmit={onSave} className="mt-6 space-y-4">
          {rows.map((row) => (
            <label key={row.product_id} className="flex items-baseline justify-between gap-3">
              <div className="flex-1">
                <span className={labelSpan}>{row.name}</span>
                <span className="text-body-sm text-ink-500">
                  suggested {row.suggested} {row.unit}
                </span>
              </div>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                aria-label={row.name}
                className={inputClass}
                value={values[row.product_id] ?? ''}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [row.product_id]: e.target.value }))
                }
              />
            </label>
          ))}
          {rows.length === 0 && (
            <p className="text-body-sm text-ink-500">No in-house products yet.</p>
          )}

          <button
            type="submit"
            disabled={submitting || rows.length === 0}
            className="h-11 w-full rounded-btn bg-brand-orange text-body font-semibold text-white disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Save plan'}
          </button>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add route to App.tsx**

In the layout-route block, after `/production/new`:

```tsx
import { PlanWeekPage } from '@/features/production/PlanWeekPage';
// ...
<Route path="/production/plan-this-week" element={<PlanWeekPage />} />
```

- [ ] **Step 5: Tests pass (2/2)**

Run: `npm run test:run -- src/features/production/PlanWeekPage.test.tsx`
Expected: PASS.

- [ ] **Step 6: Typecheck + full suite**

Run: `npm run typecheck && npm run test:run`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/features/production/PlanWeekPage.tsx src/features/production/PlanWeekPage.test.tsx src/App.tsx
git commit -m "Sprint 3: planning view (/production/plan-this-week) + route"
```

---

## Task 5: Edit-log production page + route

**Files:**
- Create: `src/features/production/EditLogProductionPage.tsx`
- Modify: `src/App.tsx` (add `/production/log/:id` route)

No new test file — the form is structurally identical to LogProductionPage (existing tests cover the create path); manual smoke covers edit/delete.

- [ ] **Step 1: Implement**

```tsx
// src/features/production/EditLogProductionPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { listActiveProducts, type ProductRow } from '@/features/products/api';
import {
  getProductionLog,
  updateProductionLog,
  deleteProductionLog,
} from './api';
import { todayInTz } from '@/lib/utils';

export function EditLogProductionPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('0');
  const [madeOn, setMadeOn] = useState(todayInTz());
  const [notes, setNotes] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [log, ps] = await Promise.all([getProductionLog(id), listActiveProducts()]);
        if (!log) {
          setError('Log not found.');
          setLoaded(true);
          return;
        }
        setProducts(ps);
        setProductId(log.product_id);
        setQty(String(log.qty));
        setMadeOn(log.made_on);
        setNotes(log.notes ?? '');
        setLoaded(true);
      } catch (e) {
        setError((e as Error).message);
        setLoaded(true);
      }
    })();
  }, [id]);

  const qtyNum = Number(qty);
  const canSubmit = loaded && Number.isFinite(qtyNum) && qtyNum > 0 && madeOn.length === 10 && !submitting;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await updateProductionLog(id, { qty: qtyNum, made_on: madeOn, notes: notes.trim() || null });
      navigate(-1);
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  async function onDelete() {
    if (!confirm('Delete this log entry? This cannot be undone.')) return;
    setSubmitting(true);
    setError(null);
    try {
      await deleteProductionLog(id);
      navigate(-1);
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  if (!loaded) return <p className="text-body-sm text-ink-500">Loading…</p>;
  if (error && !productId) return <p className="text-body-sm text-status-danger-fg">{error}</p>;

  const inputClass = 'mt-1 h-11 w-full rounded-input border border-ink-900/10 bg-paper-elevated px-3 text-body';
  const labelSpan = 'text-label uppercase text-ink-500';
  const product = products.find((p) => p.id === productId);

  return (
    <div>
      <h1 className="text-title text-ink-900">Edit production log</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div className="block">
          <span className={labelSpan}>Product</span>
          <p className="mt-1 text-body text-ink-900">{product?.name ?? '(unknown)'}</p>
        </div>

        <label className="block">
          <span className={labelSpan}>Quantity</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            className={inputClass}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </label>

        <label className="block">
          <span className={labelSpan}>Date</span>
          <input
            type="date"
            className={inputClass}
            value={madeOn}
            onChange={(e) => setMadeOn(e.target.value)}
          />
        </label>

        <label className="block">
          <span className={labelSpan}>Notes (optional)</span>
          <input
            className={inputClass}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        {error && <p className="text-body-sm text-status-danger-fg">{error}</p>}

        <button
          type="submit"
          disabled={!canSubmit}
          className="h-11 w-full rounded-btn bg-brand-orange text-body font-semibold text-white disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save'}
        </button>

        <button
          type="button"
          onClick={onDelete}
          disabled={submitting}
          className="h-11 w-full rounded-btn-sm border border-ink-900/10 bg-paper-elevated text-body text-status-danger-fg"
        >
          Delete log entry
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Add route**

```tsx
import { EditLogProductionPage } from '@/features/production/EditLogProductionPage';
// ...
<Route path="/production/log/:id" element={<EditLogProductionPage />} />
```

- [ ] **Step 3: Typecheck + tests pass**

Run: `npm run typecheck && npm run test:run`

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "Sprint 3: edit/delete production_logs at /production/log/:id"
```

---

## Task 6: Product-detail bottom sheet component

**Files:**
- Create: `src/features/production/ProductDetailSheet.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/features/production/ProductDetailSheet.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  listProductionLogsForProductInWeek,
  type ProductionLogRow,
} from './api';
import type { ProductionWeekRowFull } from './planLayer';
import { weekStartFor } from '@/lib/week';
import { todayInTz } from '@/lib/utils';

type Props = {
  row: ProductionWeekRowFull;
  onClose: () => void;
};

export function ProductDetailSheet({ row, onClose }: Props) {
  const [logs, setLogs] = useState<ProductionLogRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const weekStart = weekStartFor(todayInTz());

  useEffect(() => {
    listProductionLogsForProductInWeek(row.product_id, weekStart)
      .then((rs) => { setLogs(rs); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, [row.product_id, weekStart]);

  return (
    <>
      {/* backdrop */}
      <div
        className="fixed inset-0 z-40 bg-ink-900/40"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* sheet */}
      <div
        role="dialog"
        aria-label={`${row.name} — this week`}
        className="fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-paper-elevated p-5 shadow-2xl"
      >
        <header className="flex items-start justify-between">
          <div>
            <h2 className="text-subtitle text-ink-900">{row.name}</h2>
            <p className="text-body-sm text-ink-500">this week</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="h-8 w-8 rounded-full text-body text-ink-500"
          >
            ✕
          </button>
        </header>

        <dl className="mt-4 grid grid-cols-3 gap-2 text-body-sm">
          <div>
            <dt className="text-ink-500">Plan</dt>
            <dd className="text-ink-900">{row.planned_qty ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-ink-500">Suggested</dt>
            <dd className="text-ink-900">{row.suggested}</dd>
          </div>
          <div>
            <dt className="text-ink-500">Made</dt>
            <dd className="text-ink-900">{row.produced_qty}</dd>
          </div>
        </dl>

        <div className="mt-5">
          <Link
            to={`/production/new?product_id=${row.product_id}`}
            className="block h-11 w-full rounded-btn bg-brand-orange text-center text-body font-semibold leading-[2.75rem] text-white"
          >
            + Log new batch
          </Link>
        </div>

        <section className="mt-6">
          <h3 className="text-label uppercase text-ink-500">This week's logs</h3>
          {error && <p className="mt-2 text-body-sm text-status-danger-fg">{error}</p>}
          {loading ? (
            <p className="mt-2 text-body-sm text-ink-500">Loading…</p>
          ) : logs.length === 0 ? (
            <p className="mt-2 text-body-sm text-ink-500">No logs yet this week.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {logs.map((log) => (
                <li key={log.id}>
                  <Link
                    to={`/production/log/${log.id}`}
                    className="block rounded-card border border-ink-900/10 p-3"
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="text-body text-ink-900">
                        {log.made_on} · {log.qty} {row.unit}
                      </span>
                      <span className="text-body-sm text-ink-500">edit ⋯</span>
                    </div>
                    {log.notes && (
                      <p className="mt-1 text-body-sm text-ink-500">{log.notes}</p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`

- [ ] **Step 3: Commit**

```bash
git add src/features/production/ProductDetailSheet.tsx
git commit -m "Sprint 3: product-detail bottom sheet component"
```

---

## Task 7: Seed estimate modal

**Files:**
- Create: `src/features/production/SeedEstimateModal.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/features/production/SeedEstimateModal.tsx
import { useState } from 'react';
import { setSeedDemand } from '@/features/products/api';

type Props = {
  productId: string;
  productName: string;
  unit: string;
  onClose: () => void;
  onSaved: () => void;
};

export function SeedEstimateModal({ productId, productName, unit, onClose, onSaved }: Props) {
  const [qty, setQty] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const num = Number(qty);
  const canSubmit = qty.length > 0 && Number.isFinite(num) && num >= 0 && !submitting;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await setSeedDemand(productId, num);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-ink-900/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-label={`Add a seed estimate for ${productName}`}
        className="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-paper-elevated p-5 shadow-2xl"
      >
        <h2 className="text-subtitle text-ink-900">Seed estimate</h2>
        <p className="mt-1 text-body-sm text-ink-500">
          {productName} — roughly how much per week?
        </p>

        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <label className="block">
            <span className="text-label uppercase text-ink-500">Weekly average ({unit})</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              autoFocus
              className="mt-1 h-11 w-full rounded-input border border-ink-900/10 bg-paper-elevated px-3 text-body"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </label>

          {error && <p className="text-body-sm text-status-danger-fg">{error}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="h-11 flex-1 rounded-btn-sm border border-ink-900/10 bg-paper-elevated text-body text-ink-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="h-11 flex-1 rounded-btn bg-brand-orange text-body font-semibold text-white disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`

- [ ] **Step 3: Commit**

```bash
git add src/features/production/SeedEstimateModal.tsx
git commit -m "Sprint 3: seed-estimate modal (Add a seed estimate → affordance)"
```

---

## Task 8: Aggregated Section D component

**Files:**
- Create: `src/features/production/AggregatedSection.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/features/production/AggregatedSection.tsx
import { useEffect, useState } from 'react';
import { getAggregatedThisWeek, type AggregatedRow } from './api';

export function AggregatedSection() {
  const [rows, setRows] = useState<AggregatedRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAggregatedThisWeek()
      .then((rs) => { setRows(rs); setLoaded(true); })
      .catch((e: Error) => { setError(e.message); setLoaded(true); });
  }, []);

  if (!loaded) return null;
  if (error) return <p className="mt-6 text-body-sm text-status-danger-fg">{error}</p>;
  if (rows.length === 0) return null; // spec: hidden when no aggregated products have demand this week

  return (
    <section className="mt-8">
      <h2 className="text-subtitle text-ink-900">From other makers</h2>
      <table className="mt-2 w-full text-body-sm">
        <thead className="text-ink-500">
          <tr>
            <th className="text-left font-normal">Product</th>
            <th className="text-left font-normal">Source</th>
            <th className="text-right font-normal">This week</th>
          </tr>
        </thead>
        <tbody className="text-ink-900">
          {rows.map((r) => (
            <tr key={r.product_id} className="border-t border-ink-900/10">
              <td className="py-2">{r.name}</td>
              <td className="py-2 text-ink-500">{r.source_maker_name ?? '—'}</td>
              <td className="py-2 text-right">{r.committed_qty} {r.unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`

- [ ] **Step 3: Commit**

```bash
git add src/features/production/AggregatedSection.tsx
git commit -m "Sprint 3: Section D — read-only aggregated-products this-week demand"
```

---

## Task 9: Production screen rewrite

**Files:**
- Modify: `src/features/production/ProductionPage.tsx`

The full Section C rewrite: planning entry point at top, Plan column with edit-affordance per row, subtitle, "Add a seed estimate →" replacement when needs_seed, "Done this week (N)" collapse, tap → bottom sheet, plus mounting Section D.

- [ ] **Step 1: Replace ProductionPage**

```tsx
// src/features/production/ProductionPage.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getProductionThisWeek,
  getProductionPlansForWeek,
} from './api';
import { composeWithPlan, type ProductionWeekRowFull } from './planLayer';
import { ProductDetailSheet } from './ProductDetailSheet';
import { SeedEstimateModal } from './SeedEstimateModal';
import { AggregatedSection } from './AggregatedSection';
import { weekStartFor } from '@/lib/week';
import { todayInTz } from '@/lib/utils';

export function ProductionPage() {
  const [rows, setRows] = useState<ProductionWeekRowFull[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openProductId, setOpenProductId] = useState<string | null>(null);
  const [seedTarget, setSeedTarget] = useState<ProductionWeekRowFull | null>(null);
  const [doneOpen, setDoneOpen] = useState(false);

  const weekStart = weekStartFor(todayInTz());

  async function reload() {
    setLoading(true);
    try {
      const [r, plans] = await Promise.all([
        getProductionThisWeek(),
        getProductionPlansForWeek(weekStart),
      ]);
      setRows(composeWithPlan(r, plans));
      setLoading(false);
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // reload not in deps — single load on mount; modals/sheets trigger explicit reloads
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sort: not-done first by gap desc + alpha tie-break, done last (collapsed separately)
  const notDone = rows.filter((r) => !r.done).sort((a, b) => {
    if (b.gap !== a.gap) return b.gap - a.gap;
    return a.name.localeCompare(b.name);
  });
  const done = rows.filter((r) => r.done).sort((a, b) => a.name.localeCompare(b.name));

  const anyPlan = rows.some((r) => r.planned_qty !== null);
  const openRow = rows.find((r) => r.product_id === openProductId) ?? null;

  return (
    <div>
      <header className="flex items-baseline justify-between">
        <h1 className="text-title text-ink-900">Production</h1>
        <Link to="/products" className="text-body-sm text-ink-500 underline">
          Manage products →
        </Link>
      </header>

      {error && <p className="mt-4 text-body-sm text-status-danger-fg">{error}</p>}

      <section className="mt-6">
        {/* Planning entry point — prominent when no plans, subtle "Edit plan →" once plans exist (per §5 spec) */}
        {!loading && rows.length > 0 && (
          anyPlan ? (
            <div className="text-right">
              <Link to="/production/plan-this-week" className="text-body-sm text-ink-500 underline">
                Edit plan →
              </Link>
            </div>
          ) : (
            <Link
              to="/production/plan-this-week"
              className="block rounded-card border border-brand-orange/40 bg-brand-orange/10 p-3 text-body text-ink-900"
            >
              Plan this week →
            </Link>
          )
        )}

        <ul className={`${!loading && rows.length > 0 ? 'mt-4' : ''} space-y-2`}>
          {notDone.map((r) => (
            <li key={r.product_id}>
              <button
                type="button"
                onClick={() => setOpenProductId(r.product_id)}
                className="block w-full rounded-card bg-paper-elevated p-3 text-left"
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-body font-semibold text-ink-900">{r.name}</span>
                  <span className="text-body-sm text-ink-500">{r.unit}</span>
                </div>

                {r.needs_seed ? (
                  <div className="mt-2">
                    <span
                      role="button"
                      onClick={(e) => { e.stopPropagation(); setSeedTarget(r); }}
                      className="text-body-sm text-brand-orange underline"
                    >
                      Add a seed estimate →
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="mt-1 grid grid-cols-3 gap-2 text-body-sm">
                      <span className="text-ink-500">
                        Plan: <span className="text-ink-900">{r.planned_qty ?? '—'}</span>
                      </span>
                      <span className="text-ink-500">
                        Suggested: <span className="text-ink-900">{r.suggested}</span>
                      </span>
                      <span className="text-ink-500">
                        Made: <span className="text-ink-900">{r.produced_qty}</span>
                      </span>
                    </div>
                    {r.subtitle && (
                      <p className="mt-1 text-body-sm text-ink-500">{r.subtitle}</p>
                    )}
                  </>
                )}
              </button>
            </li>
          ))}
          {!loading && rows.length === 0 && !error && (
            <li className="text-body-sm text-ink-500">
              No products yet. <Link to="/products/new" className="underline">Add your first product →</Link>
            </li>
          )}
        </ul>

        {done.length > 0 && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setDoneOpen((v) => !v)}
              className="w-full rounded-card border border-ink-900/10 bg-paper-elevated p-3 text-left text-body-sm text-ink-700"
            >
              Done this week ({done.length}) {doneOpen ? '▾' : '▸'}
            </button>
            {doneOpen && (
              <ul className="mt-2 space-y-2">
                {done.map((r) => (
                  <li key={r.product_id}>
                    <button
                      type="button"
                      onClick={() => setOpenProductId(r.product_id)}
                      className="block w-full rounded-card bg-paper-elevated p-3 text-left opacity-80"
                    >
                      <div className="flex items-baseline justify-between">
                        <span className="text-body text-ink-900">{r.name}</span>
                        <span className="text-body-sm text-ink-500">
                          {r.produced_qty} ≥ {r.target} {r.unit} ✓
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <AggregatedSection />

      <div className="mt-8">
        <Link
          to="/production/new"
          className="block h-11 w-full rounded-btn bg-brand-orange text-center text-body font-semibold leading-[2.75rem] text-white"
        >
          + Log production
        </Link>
      </div>

      {openRow && (
        <ProductDetailSheet row={openRow} onClose={() => { setOpenProductId(null); reload(); }} />
      )}

      {seedTarget && (
        <SeedEstimateModal
          productId={seedTarget.product_id}
          productName={seedTarget.name}
          unit={seedTarget.unit}
          onClose={() => setSeedTarget(null)}
          onSaved={() => { setSeedTarget(null); reload(); }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`

- [ ] **Step 3: Full test suite**

Run: `npm run test:run`
Expected: all green. (Existing Production tests don't exist; PlanWeekPage tests still pass.)

- [ ] **Step 4: Commit**

```bash
git add src/features/production/ProductionPage.tsx
git commit -m "Sprint 3: Production Section C — plan column, subtitle, Done collapse, bottom-sheet trigger, seed-affordance, Section D"
```

---

## Task 10: EditProductPage — seed read-only after ≥4 weeks

**Files:**
- Modify: `src/features/products/EditProductPage.tsx`

- [ ] **Step 1: Edit the useEffect to call getWeeksOfHistoryForProduct**

Replace the existing `useEffect` block in `EditProductPage.tsx` with:

```tsx
useEffect(() => {
  (async () => {
    try {
      const p = await getProductById(id);
      if (!p) {
        setError('Product not found.');
        return;
      }
      setProduct(p);
      setName(p.name);
      setUnit(p.unit);
      setDefaultPrice(String(p.default_price));
      setIsSeasonal(p.is_seasonal);
      setIsAggregated(p.is_aggregated);
      setSourceMaker(p.source_maker_name ?? '');
      const [s, weeks] = await Promise.all([
        getSeedDemand(id),
        getWeeksOfHistoryForProduct(id),
      ]);
      setSeed(s === null ? '' : String(s));
      // Per spec §11: once a product has ≥4 weeks of order history, its seed is
      // read-only ("No longer used — suggestions now use your actual order history.").
      setSeedReadOnly(weeks >= 4);
    } catch (err) {
      setError((err as Error).message);
    }
  })();
}, [id]);
```

And update the import:

```tsx
import {
  archiveProduct,
  getProductById,
  getSeedDemand,
  getWeeksOfHistoryForProduct,
  setSeedDemand,
  updateProduct,
  type ProductFullRow,
} from './api';
```

Wait — `getWeeksOfHistoryForProduct` lives in `src/features/production/api.ts`, not `products/api.ts`. Import it directly:

```tsx
import { getWeeksOfHistoryForProduct } from '@/features/production/api';
```

(Leave the existing `import { archiveProduct, getProductById, getSeedDemand, setSeedDemand, updateProduct, type ProductFullRow } from './api';` alone — just add the new import line above it.)

- [ ] **Step 2: Add subtitle text below the seed field**

In the JSX, where the seed `<label>` block lives, add a subtitle that appears only when `seedReadOnly`:

```tsx
<label className="block">
  <span className={labelSpan}>Weekly average (your guess)</span>
  <input
    type="number"
    inputMode="decimal"
    min="0"
    step="any"
    disabled={seedReadOnly}
    className={inputClass + (seedReadOnly ? ' opacity-50' : '')}
    value={seed}
    onChange={(e) => setSeed(e.target.value)}
  />
  {seedReadOnly && (
    <span className="mt-1 block text-body-sm text-ink-500">
      No longer used — suggestions now use your actual order history.
    </span>
  )}
</label>
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`

- [ ] **Step 4: Commit**

```bash
git add src/features/products/EditProductPage.tsx
git commit -m "Sprint 3: EditProductPage — seed read-only after ≥4 weeks of order history"
```

---

## Task 11: Today screen — plan-aware Block 1

**Files:**
- Modify: `src/features/today/TodayPage.tsx`

The current TodayPage uses `getProductionThisWeek()` directly. Replace with the composed `ProductionWeekRowFull` that includes plan-awareness, subtitle, and gap.

- [ ] **Step 1: Patch the imports + visibleProduction derivation**

Replace the imports section and the data-fetch effect:

```tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  getProductionThisWeek,
  getProductionPlansForWeek,
} from '@/features/production/api';
import { composeWithPlan, type ProductionWeekRowFull } from '@/features/production/planLayer';
import { listTodayPendingOrders, type OrderRow } from '@/features/orders/api';
import { listCustomersByIds } from '@/features/customers/api';
import { weekStartFor } from '@/lib/week';
import { todayInTz } from '@/lib/utils';
```

Replace `const [productionRows, setProductionRows] = useState<ProductionWeekRow[]>([]);` with:

```tsx
const [productionRows, setProductionRows] = useState<ProductionWeekRowFull[]>([]);
```

Replace the useEffect with:

```tsx
useEffect(() => {
  (async () => {
    try {
      const weekStart = weekStartFor(todayInTz());
      const [pr, plans, os] = await Promise.all([
        getProductionThisWeek(),
        getProductionPlansForWeek(weekStart),
        listTodayPendingOrders(),
      ]);
      setProductionRows(composeWithPlan(pr, plans));
      setOrders(os);
      const cnames = await listCustomersByIds(os.map((o) => o.customer_id));
      setCustomerNames(cnames);
    } catch (e) {
      setError((e as Error).message);
    }
  })();
}, []);
```

Replace the `visibleProduction` derivation:

```tsx
// Hide products where target===0 AND produced===0 (per spec §4) — extended to plan-aware target
const visibleProduction = productionRows
  .filter((r) => !(r.target === 0 && r.produced_qty === 0))
  .sort((a, b) => {
    if (b.gap !== a.gap) return b.gap - a.gap;
    return a.name.localeCompare(b.name);
  });
const allSeeded = visibleProduction.length > 0 && visibleProduction.every((r) => r.uses_seed);
```

And update the row rendering inside the Block 1 `<ul>` to show plan-aware target + subtitle:

```tsx
{visibleProduction.map((r) => (
  <li key={r.product_id}>
    <Link
      to={`/production/new?product_id=${r.product_id}`}
      className="block rounded-card bg-paper-elevated p-3"
    >
      <div className="flex items-baseline justify-between">
        <span className="text-body font-semibold text-ink-900">{r.name}</span>
        <span className="text-body-sm text-ink-500">
          target {r.target} · made {r.produced_qty}
        </span>
      </div>
      {r.subtitle && (
        <p className="mt-1 text-body-sm text-ink-500">{r.subtitle}</p>
      )}
    </Link>
  </li>
))}
```

- [ ] **Step 2: Typecheck + tests pass**

Run: `npm run typecheck && npm run test:run`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add src/features/today/TodayPage.tsx
git commit -m "Sprint 3: Today Block 1 — plan-aware target, subtitle, gap-based sort"
```

---

## Task 12: Smoke test + push

**Files:**
- None (re-uses existing `scripts/smoke-test-walking-skeleton.py`)

- [ ] **Step 1: Run full test suite**

```bash
npm run typecheck && npm run test:run
```
Expected: all green. (Sprint 2 had 28 tests; Sprint 3 adds 8 planLayer + 2 PlanWeekPage = 38 tests across 10 files.)

- [ ] **Step 2: Manual smoke locally**

```bash
npm run dev
```

Then in browser, log in (admin) and exercise:

**Planning flow:**
1. Production tab → above the list, see "Plan this week →" affordance (since no plans yet).
2. Tap it → /production/plan-this-week loads with each `[DEV]` product + a pre-filled input matching its suggestion.
3. Edit one value (e.g., set [DEV] Chivda from 5 to 3) → tap Save plan → returns to /production.
4. Production now shows "Plan: 3" for [DEV] Chivda (no longer "—"). The "Plan this week →" affordance is GONE because plans now exist.

**Bottom sheet flow:**
5. Tap a Production row → bottom sheet slides up, shows Plan/Suggested/Made + "+ Log new batch" + empty "This week's logs".
6. Tap "+ Log new batch" → /production/new with that product pre-selected. Log 2 units. Return.
7. Production row now shows "Made: 2". Tap the row again → bottom sheet shows the log in the list.
8. Tap the log row → /production/log/:id loads, edit qty 2 → 4, save → bottom sheet (after navigate-back) shows updated qty.
9. Tap the log row again → tap "Delete log entry" → confirm → list now empty.

**Done collapse:**
10. Log enough to exceed plan for at least one product. Production row should disappear from the top list and appear under "Done this week (N)" → ▸. Tap to expand → see the product with `made ≥ target ✓`.

**Seed affordance:**
11. Add a new product WITHOUT a seed estimate (Add product, leave Weekly average blank).
12. Production tab shows that product with "Add a seed estimate →" link (no Plan/Suggested/Made numbers).
13. Tap the link → modal appears → enter qty 2 → Save → modal closes, Production row now shows Suggested: 2.

**Aggregated section:**
14. (Requires manual DB seeding) Mark a product as `is_aggregated=true` in Edit Product, save. Then create an order containing that product for this week. Reload Production → "From other makers" section appears showing the product + source + qty. Reset before pushing if dev-seed must stay clean.

**Seed read-only after 4 weeks:** can't realistically verify locally without time-travel data; covered by the `getWeeksOfHistoryForProduct` unit-test path (it returns 0 for products without orders, which is the only state our dev data has).

**Today plan-awareness:**
15. Today tab Block 1 now shows "target 3 · made 4" for [DEV] Chivda (target = plan = 3).

- [ ] **Step 3: Push**

```bash
git push origin main
```

- [ ] **Step 4: Run deployed smoke**

```bash
python scripts/smoke-test-walking-skeleton.py
```
Expected: passes. (Sprint 3 doesn't change the 5-tab nav contract.)

- [ ] **Step 5: Hand off to Karan after Sprint 4** — per Karan's instruction, no checkpoint between Sprint 3 and Sprint 4; he reviews everything together after Sprint 4 deploys.

---

## Self-Review

**Spec coverage** (`v1-spec.md` §14 Sprint 3 + carryovers from Sprint 2):
- §5 planning view — Task 4 ✓
- Product-detail bottom sheet with log list — Task 6 ✓
- Production-screen subtitles ("includes pending orders") — Task 2 (algorithm) + Task 9 (render) ✓
- "Done this week (N)" collapse — Task 9 ✓
- Section D aggregated products — Task 8 + Task 9 (mount) ✓
- `needs_seed` UI affordance — Task 7 (modal) + Task 9 (render) ✓
- Plan column affordance — Task 9 ✓ (header `Plan this week →` when no plans; per-row `Plan: N` once plans exist)
- Seed read-only after 4 weeks — Task 10 ✓
- §12 plan immutability (`original_planned_qty` frozen on first save) — Task 1 ✓
- Today plan-awareness — Task 11 ✓
- Log edit/delete (implied by bottom sheet spec) — Task 5 ✓
- §12 retroactive plan flag (`entered_at > week_start + 7d`) — NOT in Sprint 3 because it only surfaces in Reports retrospective (§9 / Sprint 8). Data is already captured (`entered_at` is set on insert per the api).

**Placeholder scan:** every step has actual content. No "add validation" or "TBD".

**Type consistency:**
- `ProductionWeekRow` (algorithm.ts, Sprint 2) → consumed by `composeWithPlan` (planLayer.ts) → produces `ProductionWeekRowFull` → consumed by ProductionPage + TodayPage + ProductDetailSheet.
- `WeekPlanRow` defined in api.ts, consumed by PlanWeekPage + composeWithPlan.
- `ProductionLogRow` defined in api.ts, consumed by ProductDetailSheet + EditLogProductionPage.
- `AggregatedRow` defined in api.ts, consumed by AggregatedSection.

**Known design call-outs:**
1. **Event-uplift subtitle is NOT implemented in Sprint 3.** Algorithm `base` doesn't include event_uplift (Sprint 7). Only `committed_qty > base` triggers the subtitle. When event_uplift lands in Sprint 7, the subtitle logic in planLayer.ts will need extending: add a new field on `ProductionWeekRow` (e.g., `event_uplift_contribution: number | null` carrying event name + qty) and update the subtitle rule. Documented for Sprint 7.
2. **Plan upsert is two-step in TS, not atomic.** Single-tenant; no race at v1 scale. If Karan ever multi-user-enables (unlikely), move to a Postgres function.
3. **Bottom-sheet tap-log uses navigate, not in-sheet form.** Simpler; reuses route guard from App.tsx. Trade-off: brief loss of sheet context when editing; on return the sheet re-mounts and re-fetches. Acceptable at v1.
4. **`Add a seed estimate →` modal uses `e.stopPropagation()`** on the inner `<span>` to prevent the parent row button from also firing (which would open the bottom sheet). Subagent: verify on manual smoke that tapping the link opens the modal and NOT the sheet.
5. **`getWeeksOfHistoryForProduct` uses the same dotted-filter style as Sprint 2's fetcher.** If the type system complains, fall back to filtering client-side (same pattern as `getAggregatedThisWeek`).
6. **Done state and zero-skip-plan distinction.** Production rows with `planned_qty=0` and `produced_qty=0` are NOT in "Done this week" (gap is 0 but target was 0; she meant to skip). They're rendered in the regular list with `target 0 · made 0`. Today's `visibleProduction` filter additionally hides them so the Today list isn't cluttered — matches Sprint 2 hiding rule but extended to plan-aware target.

Plan complete.
