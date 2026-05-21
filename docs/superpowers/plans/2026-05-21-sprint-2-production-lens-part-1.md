# Sprint 2 — Production Lens Part 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mom opens the app and sees the first real product-judgment number — "Make 4 of Chivda this week." Wire the §11 algorithm (rolling avg + seed fallback + committed demand), Products CRUD, Production screen Section C (Plan/Suggested/Made list), and Today Block 1.

**Architecture:** Algorithm is a pure TypeScript function in `src/features/production/algorithm.ts`, fed by a raw-data fetcher in `api.ts`. Chosen over a Postgres RPC because (a) TDD is cleaner on a pure function with mocked inputs, (b) at 5–15 products + ~50 orders/week we don't yet need server-side aggregation, (c) the algorithm body will evolve in Sprints 3, 7 (subtitles, event uplift) and TypeScript is the lower-friction surface to evolve. If perf bites later, migrate to RPC.

**Spec source:** `docs/v1-spec.md` §4 Block 1, §5 sections C+E, §11, §2 `products` + `seed_demand`. `docs/ENGINEERING_NOTES.md` §3 (products soft-blocker decision). `docs/superpowers/plans/2026-05-21-sprint-1-walking-skeleton.md` for prior context.

**Tech Stack:** React 18 + TypeScript + React Router 6 + Tailwind + Supabase JS + Vitest/RTL.

**Karan's plan-checkpoint decisions (2026-05-21):**
- Products reachable via Empty-state links + **a "Manage products →" header link on the Production screen** (one tap from Production).
- Today's "Based on your initial estimates…" seed footnote ships in Sprint 2.
- Plan column shows just `—` with no affordance (planning view ships Sprint 3).
- Product archive button included in Sprint 2 (soft-delete via `active = false`).

---

## File Structure

**New files:**
- `src/features/production/algorithm.ts` — pure function `computeProductionWeek(input): ProductionWeekRow[]`
- `src/features/production/algorithm.test.ts` — unit tests for the algorithm
- `src/features/products/api.ts` — `listActiveProducts` already exists; add `listAllProducts`, `getProductById`, `createProduct`, `updateProduct`, `archiveProduct`, `getSeedDemand`, `setSeedDemand`. (Note: `listActiveProducts` and the existing `ProductRow` type stay — they're consumed by Add Order and Log Production.)
- `src/features/products/ProductsPage.tsx` — list of all products (active + archived), `+ Add product` CTA, tap row → /products/:id
- `src/features/products/AddProductPage.tsx` — form: name, unit, default_price, is_seasonal toggle, optional `weekly_avg_qty` (seed), is_aggregated + source_maker_name (if aggregated)
- `src/features/products/EditProductPage.tsx` — same fields editable; archive button; seed becomes read-only when weeks_of_history ≥ 4
- `src/features/products/AddProductPage.test.tsx` — submit creates product + (if seed entered) seed_demand row
- `src/lib/week.ts` — utility: `weekStartFor(date: string): string` returning the Monday in YYYY-MM-DD format, in Asia/Kolkata
- `src/lib/week.test.ts` — unit tests for the week helper

**Modified files:**
- `src/features/production/api.ts` — add `getProductionThisWeekData()` (returns the raw AlgorithmInput shape) and `getProductionThisWeek()` (delegates to algorithm)
- `src/features/production/ProductionPage.tsx` — rewrite for Section C (in-house list with Plan/Suggested/Made) + header link "Manage products →"
- `src/features/production/LogProductionPage.tsx` — accept `?product_id=…` query string for pre-fill
- `src/features/today/TodayPage.tsx` — rewrite for Block 1; preserve Block 2 (pending today) roughly as-is
- `src/App.tsx` — add routes `/products`, `/products/new`, `/products/:id` inside the layout-route block
- `src/lib/database.types.ts` — regenerate via Supabase MCP so any schema additions (none expected in this sprint) flow through. Defensive only.

**Test files added:**
- `src/features/production/algorithm.test.ts`
- `src/features/products/AddProductPage.test.tsx`
- `src/lib/week.test.ts`

**Out of scope (deferred):**
- Planning view (`/production/plan-this-week`) — Sprint 3
- Product-detail bottom sheet on Production tap-row — Sprint 3
- "Done this week (N)" collapse on Production — Sprint 3
- Subtitle text ("includes pending orders", "includes ramp-up for …") — Sprint 3
- Aggregated products Section D — Sprint 3 or later (until then, aggregated products are excluded from the in-house list and don't appear in the algorithm output)
- Section B (upcoming events) + `event_uplift` in algorithm — Sprint 7
- Today Block 0 (retrospective banner) — Sprint 8
- Today Block 2.5 (quiet customers) — Sprint 6
- Onboarding wizard — Sprint 9 (empty-state copy carries us until then)

---

## Cross-cutting conventions

**Algorithm input/output types** (defined in `algorithm.ts`, re-exported from `api.ts`):

```ts
export type AlgorithmInput = {
  weekStart: string; // YYYY-MM-DD, Monday in Asia/Kolkata
  products: {
    id: string;
    name: string;
    unit: string;
    is_seasonal: boolean;
    is_aggregated: boolean;
  }[];
  // per-product aggregates
  rollingDemand: Record<string, number>;     // sum of order_items.qty in [weekStart - 4w, weekStart)
  committedDemand: Record<string, number>;   // sum where target falls in this week
  producedQty: Record<string, number>;       // sum of production_logs.qty in this week
  seedQty: Record<string, number>;           // seed_demand.weekly_avg_qty if set
  firstOrderedAt: Record<string, string>;    // ISO timestamp of MIN(orders.ordered_at) per product (only present if any orders)
};

export type ProductionWeekRow = {
  product_id: string;
  name: string;
  unit: string;
  is_seasonal: boolean;
  rolling_avg: number;
  seed_qty: number | null;
  weeks_of_history: number;
  committed_qty: number;
  produced_qty: number;
  base: number;          // rolling_avg or seed depending on history & seasonality
  suggested: number;     // MAX(0, MAX(base, committed_qty) − produced_qty)
  uses_seed: boolean;    // for the global footnote on Today
};
```

**Algorithm rules** (precise — these are the test contract):

For each `product` where `is_aggregated === false`:
- `rolling_avg` = `rollingDemand[p.id] ?? 0` divided by 4
- `seed_qty` = `seedQty[p.id]` if present, else `null`
- `weeks_of_history`:
  - If `firstOrderedAt[p.id]` is missing → `0`
  - Else compute calendar weeks elapsed between `firstOrderedAt` and `weekStart`. Use `floor(diff_days / 7)`, where `diff_days` is integer days between `firstOrderedAt.toDateString()` and `weekStart`. Clamp to `0` minimum.
- `base`:
  - If `is_seasonal === true` → `seed_qty ?? 0` (seasonal products skip rolling avg entirely)
  - Else if `weeks_of_history >= 4` → `rolling_avg`
  - Else → `seed_qty ?? 0`
- `suggested` = `Math.max(0, Math.max(base, committedDemand[p.id] ?? 0) - (producedQty[p.id] ?? 0))`. Rounded to one decimal place (we're dealing with kg/packs that can be fractional; spec doesn't say round-to-int).
- `uses_seed` = `weeks_of_history < 4` OR `is_seasonal` (i.e., this product's base is seed-derived)

Sort output by remaining gap (`suggested` descending — but compute `gap = suggested` since plan is always 0 here). Alphabetical tie-break by `name`.

**Footnote rule on Today Block 1:**
- Show "Based on your initial estimates. Will refine as real orders accumulate." when ALL displayed rows have `uses_seed === true`.
- Hidden as soon as any row has `uses_seed === false`.

**Production Section C row rendering:**
```
Chivda          Plan: —    Suggested: 4    Made: 1
```
- Sort by remaining gap descending. No "Done this week" collapse this sprint.
- Tap row → `/production/new?product_id=<id>` with that product pre-selected.
- Aggregated products excluded (algorithm filters them out).

**Today Block 1 row rendering:**
```
Chivda    target 4    made 1     →
```
- target = suggestion (since no plans exist this sprint)
- Tap row → `/production/new?product_id=<id>`
- Hide products where `suggested === 0 AND produced_qty === 0` (per spec §4)
- Footnote below the block if applicable

**Algorithm fetcher (`getProductionThisWeekData`)** — fetches in parallel:
1. `listAllInHouseProducts()` — active, non-aggregated
2. Rolling demand: order_items joined to orders where `ordered_at` is in `[weekStart - 4w, weekStart)`, summed per product
3. Committed: order_items joined to orders where `target_fulfilment_date` falls in `[weekStart, weekStart + 7d)`, OR `target_fulfilment_date IS NULL AND ordered_at` falls in the same week
4. Produced: production_logs where `made_on` in `[weekStart, weekStart + 7d)`
5. First-ordered-at: MIN(orders.ordered_at) per product across all time
6. All seed_demand rows

Where PostgREST doesn't natively GROUP BY, the fetcher fetches the raw rows and aggregates in TypeScript. Acceptable at our scale (~weekly volume of orders is tens, total rows fetched per page load < 500).

**Form patterns:**
- All forms follow the AddOrderPage / LogProductionPage pattern: `<label className="block"><span>{LABEL}</span><input/select/></label>`, `Number(field)` for numeric, Save button disabled until valid + not submitting, error inline below form, navigate back on success.
- Tailwind tokens only.

---

## Task 1: Week helper + tests

**Files:**
- Create: `src/lib/week.ts`
- Create: `src/lib/week.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/week.test.ts
import { describe, it, expect } from 'vitest';
import { weekStartFor } from './week';

describe('weekStartFor', () => {
  it('returns Monday for a mid-week date (Wed)', () => {
    expect(weekStartFor('2026-05-20')).toBe('2026-05-18'); // Wed → Mon
  });
  it('returns the same date if it is already Monday', () => {
    expect(weekStartFor('2026-05-18')).toBe('2026-05-18');
  });
  it('returns the previous Monday for a Sunday', () => {
    expect(weekStartFor('2026-05-24')).toBe('2026-05-18'); // Sun → previous Mon
  });
  it('returns Monday for a Saturday', () => {
    expect(weekStartFor('2026-05-23')).toBe('2026-05-18');
  });
});
```

- [ ] **Step 2: Run test, expect FAIL** (`npm run test:run -- src/lib/week.test.ts`)

- [ ] **Step 3: Implement**

```ts
// src/lib/week.ts

/**
 * Returns the Monday of the week containing the given YYYY-MM-DD date,
 * as a YYYY-MM-DD string. ISO week (Mon=1..Sun=7).
 */
export function weekStartFor(ymd: string): string {
  // Parse as UTC noon to avoid TZ flipping when we use getUTCDay below.
  const d = new Date(`${ymd}T12:00:00Z`);
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const isoDay = day === 0 ? 7 : day; // 1..7 (Mon..Sun)
  const mondayMs = d.getTime() - (isoDay - 1) * 24 * 60 * 60 * 1000;
  return new Date(mondayMs).toISOString().slice(0, 10);
}
```

- [ ] **Step 4: Tests pass**

- [ ] **Step 5: Commit**

```bash
git add src/lib/week.ts src/lib/week.test.ts
git commit -m "Sprint 2: weekStartFor helper for Monday-of-week computations"
```

---

## Task 2: Algorithm module + tests

**Files:**
- Create: `src/features/production/algorithm.ts`
- Create: `src/features/production/algorithm.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/features/production/algorithm.test.ts
import { describe, it, expect } from 'vitest';
import { computeProductionWeek, type AlgorithmInput } from './algorithm';

const baseProduct = { id: 'p1', name: 'Chivda', unit: '250g', is_seasonal: false, is_aggregated: false };

function input(over: Partial<AlgorithmInput> = {}): AlgorithmInput {
  return {
    weekStart: '2026-05-18',
    products: [baseProduct],
    rollingDemand: {},
    committedDemand: {},
    producedQty: {},
    seedQty: {},
    firstOrderedAt: {},
    ...over,
  };
}

describe('computeProductionWeek', () => {
  it('uses seed when no order history', () => {
    const [row] = computeProductionWeek(input({ seedQty: { p1: 5 } }));
    expect(row.uses_seed).toBe(true);
    expect(row.weeks_of_history).toBe(0);
    expect(row.base).toBe(5);
    expect(row.suggested).toBe(5);
  });

  it('uses rolling average once weeks_of_history >= 4', () => {
    // first order 5 weeks before weekStart
    const fiveWeeksAgo = '2026-04-13T00:00:00Z';
    const [row] = computeProductionWeek(
      input({
        rollingDemand: { p1: 16 }, // 16/4 = 4
        seedQty: { p1: 100 },       // should be ignored
        firstOrderedAt: { p1: fiveWeeksAgo },
      }),
    );
    expect(row.weeks_of_history).toBe(5);
    expect(row.uses_seed).toBe(false);
    expect(row.base).toBe(4);
    expect(row.suggested).toBe(4);
  });

  it('returns 0 (not negative) when produced exceeds base', () => {
    const [row] = computeProductionWeek(input({ seedQty: { p1: 5 }, producedQty: { p1: 7 } }));
    expect(row.suggested).toBe(0);
  });

  it('clamps suggested to committed when committed > base', () => {
    const [row] = computeProductionWeek(input({ seedQty: { p1: 2 }, committedDemand: { p1: 10 } }));
    expect(row.suggested).toBe(10);
  });

  it('excludes aggregated products entirely', () => {
    const rows = computeProductionWeek(
      input({
        products: [baseProduct, { ...baseProduct, id: 'p2', name: 'Ladoo', is_aggregated: true }],
        seedQty: { p1: 3, p2: 5 },
      }),
    );
    expect(rows.map((r) => r.product_id)).toEqual(['p1']);
  });

  it('uses seed for seasonal products even with order history', () => {
    const [row] = computeProductionWeek(
      input({
        products: [{ ...baseProduct, is_seasonal: true }],
        rollingDemand: { p1: 40 }, // 10/wk if used
        seedQty: { p1: 0 },
        firstOrderedAt: { p1: '2026-04-13T00:00:00Z' }, // 5w ago
      }),
    );
    expect(row.uses_seed).toBe(true);
    expect(row.base).toBe(0);
    expect(row.suggested).toBe(0);
  });

  it('uses_seed flag is true when ANY row uses seed (per-row), not aggregated', () => {
    // Just sanity check shape — uses_seed is per row not global
    const rows = computeProductionWeek(input({ seedQty: { p1: 3 } }));
    expect(rows[0].uses_seed).toBe(true);
  });

  it('sorts by suggested descending, alphabetical tie-break', () => {
    const rows = computeProductionWeek(
      input({
        products: [
          { ...baseProduct, id: 'a', name: 'Anaarse' },
          { ...baseProduct, id: 'b', name: 'Bhakarwadi' },
          { ...baseProduct, id: 'c', name: 'Chakli' },
        ],
        seedQty: { a: 2, b: 5, c: 5 },
      }),
    );
    expect(rows.map((r) => r.product_id)).toEqual(['b', 'c', 'a']);
    //                                            ^^^^^^^ tie at 5: B before C alphabetically
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```ts
// src/features/production/algorithm.ts

export type AlgorithmInput = {
  weekStart: string;
  products: { id: string; name: string; unit: string; is_seasonal: boolean; is_aggregated: boolean }[];
  rollingDemand: Record<string, number>;
  committedDemand: Record<string, number>;
  producedQty: Record<string, number>;
  seedQty: Record<string, number>;
  firstOrderedAt: Record<string, string>;
};

export type ProductionWeekRow = {
  product_id: string;
  name: string;
  unit: string;
  is_seasonal: boolean;
  rolling_avg: number;
  seed_qty: number | null;
  weeks_of_history: number;
  committed_qty: number;
  produced_qty: number;
  base: number;
  suggested: number;
  uses_seed: boolean;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function weeksBetween(fromIso: string, toYmd: string): number {
  const from = new Date(fromIso).getTime();
  const to = new Date(`${toYmd}T00:00:00Z`).getTime();
  const days = Math.floor((to - from) / MS_PER_DAY);
  return Math.max(0, Math.floor(days / 7));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function computeProductionWeek(input: AlgorithmInput): ProductionWeekRow[] {
  const rows: ProductionWeekRow[] = [];
  for (const p of input.products) {
    if (p.is_aggregated) continue;
    const rolling_avg = round1((input.rollingDemand[p.id] ?? 0) / 4);
    const seed_qty = p.id in input.seedQty ? input.seedQty[p.id] : null;
    const first = input.firstOrderedAt[p.id];
    const weeks_of_history = first ? weeksBetween(first, input.weekStart) : 0;
    const committed_qty = input.committedDemand[p.id] ?? 0;
    const produced_qty = input.producedQty[p.id] ?? 0;

    const base = p.is_seasonal
      ? seed_qty ?? 0
      : weeks_of_history >= 4
      ? rolling_avg
      : seed_qty ?? 0;

    const suggested = round1(Math.max(0, Math.max(base, committed_qty) - produced_qty));
    const uses_seed = p.is_seasonal || weeks_of_history < 4;

    rows.push({
      product_id: p.id,
      name: p.name,
      unit: p.unit,
      is_seasonal: p.is_seasonal,
      rolling_avg,
      seed_qty,
      weeks_of_history,
      committed_qty,
      produced_qty,
      base,
      suggested,
      uses_seed,
    });
  }
  rows.sort((a, b) => {
    if (b.suggested !== a.suggested) return b.suggested - a.suggested;
    return a.name.localeCompare(b.name);
  });
  return rows;
}
```

- [ ] **Step 4: Tests pass (8/8)**

- [ ] **Step 5: Commit**

```bash
git add src/features/production/algorithm.ts src/features/production/algorithm.test.ts
git commit -m "Sprint 2: §11 production-suggestion algorithm + tests (pure function)"
```

---

## Task 3: Products api module

**Files:**
- Modify: `src/features/products/api.ts` (extend the existing module)

Add the following exports alongside `listActiveProducts` + `listProductsByIds` (already present):

- [ ] **Step 1: Implement (no test for the SQL queries — they're trivial; integration coverage comes in Task 4+)**

Add to `src/features/products/api.ts`:

```ts
// Append below existing exports.

export type ProductFullRow = {
  id: string;
  name: string;
  unit: string;
  default_price: number;
  is_seasonal: boolean;
  is_aggregated: boolean;
  source_maker_name: string | null;
  active: boolean;
};

export async function listAllProducts(includeArchived = false): Promise<ProductFullRow[]> {
  const q = supabase
    .from('products')
    .select('id, name, unit, default_price, is_seasonal, is_aggregated, source_maker_name, active')
    .order('name', { ascending: true });
  const { data, error } = includeArchived ? await q : await q.eq('active', true);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getProductById(id: string): Promise<ProductFullRow | null> {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, unit, default_price, is_seasonal, is_aggregated, source_maker_name, active')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

export type ProductInput = {
  name: string;
  unit: string;
  default_price: number;
  is_seasonal: boolean;
  is_aggregated: boolean;
  source_maker_name: string | null;
};

export async function createProduct(input: ProductInput): Promise<string> {
  const { data, error } = await supabase
    .from('products')
    .insert(input)
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'product insert failed');
  return data.id;
}

export async function updateProduct(id: string, patch: Partial<ProductInput>): Promise<void> {
  const { error } = await supabase.from('products').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function archiveProduct(id: string): Promise<void> {
  const { error } = await supabase.from('products').update({ active: false }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function getSeedDemand(productId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('seed_demand')
    .select('weekly_avg_qty')
    .eq('product_id', productId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.weekly_avg_qty ?? null;
}

export async function setSeedDemand(productId: string, weeklyAvgQty: number): Promise<void> {
  const { error } = await supabase
    .from('seed_demand')
    .upsert({ product_id: productId, weekly_avg_qty: weeklyAvgQty })
    .eq('product_id', productId);
  if (error) throw new Error(error.message);
}

export async function listAllSeedDemand(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from('seed_demand').select('product_id, weekly_avg_qty');
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map((r) => [r.product_id, r.weekly_avg_qty]));
}
```

- [ ] **Step 2: Typecheck**

- [ ] **Step 3: Commit**

```bash
git add src/features/products/api.ts
git commit -m "Sprint 2: products CRUD + seed_demand api helpers"
```

---

## Task 4: Products list page + route

**Files:**
- Create: `src/features/products/ProductsPage.tsx`
- Modify: `src/App.tsx` (add `/products` route inside layout block)

- [ ] **Step 1: Implement ProductsPage**

```tsx
// src/features/products/ProductsPage.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listAllProducts, type ProductFullRow } from './api';

export function ProductsPage() {
  const [showArchived, setShowArchived] = useState(false);
  const [rows, setRows] = useState<ProductFullRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAllProducts(showArchived).then(setRows).catch((e: Error) => setError(e.message));
  }, [showArchived]);

  return (
    <div>
      <header className="flex items-baseline justify-between">
        <h1 className="text-title text-ink-900">Products</h1>
        <Link
          to="/products/new"
          className="rounded-btn-sm bg-brand-orange px-3 py-2 text-body-sm font-semibold text-white"
        >
          + Add product
        </Link>
      </header>

      <label className="mt-3 flex items-center gap-2 text-body-sm text-ink-700">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(e) => setShowArchived(e.target.checked)}
        />
        Show archived
      </label>

      {error && <p className="mt-4 text-body-sm text-status-danger-fg">{error}</p>}

      <ul className="mt-4 space-y-2">
        {rows.map((p) => (
          <li key={p.id}>
            <Link
              to={`/products/${p.id}`}
              className="block rounded-card bg-paper-elevated p-3"
            >
              <div className="flex items-baseline justify-between">
                <span className="text-body font-semibold text-ink-900">
                  {p.name} <span className="text-body-sm text-ink-500">({p.unit})</span>
                </span>
                <span className="text-body-sm text-ink-500">₹{p.default_price}</span>
              </div>
              <div className="mt-1 text-body-sm text-ink-500">
                {!p.active && <span className="mr-2 rounded-pill bg-quiet-bg px-2 py-0.5">archived</span>}
                {p.is_seasonal && <span className="mr-2 rounded-pill bg-paper-muted px-2 py-0.5">seasonal</span>}
                {p.is_aggregated && (
                  <span className="rounded-pill bg-paper-muted px-2 py-0.5">aggregated · {p.source_maker_name}</span>
                )}
              </div>
            </Link>
          </li>
        ))}
        {rows.length === 0 && !error && (
          <li className="text-body-sm text-ink-500">No products yet.</li>
        )}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Add route in App.tsx**

```tsx
import { ProductsPage } from '@/features/products/ProductsPage';
// ...
<Route path="/products" element={<ProductsPage />} />
```

Place inside the layout-route block, immediately after `/reports`.

- [ ] **Step 3: Typecheck + tests still pass**

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "Sprint 2: Products list page + route"
```

---

## Task 5: Add Product form

**Files:**
- Create: `src/features/products/AddProductPage.tsx`
- Create: `src/features/products/AddProductPage.test.tsx`
- Modify: `src/App.tsx` (route)

- [ ] **Step 1: Write failing test**

```tsx
// src/features/products/AddProductPage.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const createProduct = vi.fn();
const setSeedDemand = vi.fn();

vi.mock('@/features/products/api', () => ({
  createProduct: (i: unknown) => createProduct(i),
  setSeedDemand: (id: string, qty: number) => setSeedDemand(id, qty),
}));

import { AddProductPage } from './AddProductPage';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/products/new']}>
      <Routes>
        <Route path="/products/new" element={<AddProductPage />} />
        <Route path="/products" element={<div>ProductsList</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  createProduct.mockReset();
  setSeedDemand.mockReset();
  createProduct.mockResolvedValue('p-new');
  setSeedDemand.mockResolvedValue(undefined);
});

describe('AddProductPage', () => {
  it('submits product + seed_demand and returns to /products', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Name'), 'Chivda');
    await user.type(screen.getByLabelText('Unit'), '250g pack');
    await user.clear(screen.getByLabelText('Default price'));
    await user.type(screen.getByLabelText('Default price'), '120');
    await user.clear(screen.getByLabelText(/weekly average/i));
    await user.type(screen.getByLabelText(/weekly average/i), '5');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(createProduct).toHaveBeenCalledTimes(1));
    expect(createProduct).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Chivda', unit: '250g pack', default_price: 120, is_aggregated: false }),
    );
    expect(setSeedDemand).toHaveBeenCalledWith('p-new', 5);
    expect(await screen.findByText('ProductsList')).toBeInTheDocument();
  });

  it('does not call setSeedDemand when seed field is empty', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Name'), 'Test');
    await user.type(screen.getByLabelText('Unit'), 'unit');
    await user.clear(screen.getByLabelText('Default price'));
    await user.type(screen.getByLabelText('Default price'), '10');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(createProduct).toHaveBeenCalledTimes(1));
    expect(setSeedDemand).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```tsx
// src/features/products/AddProductPage.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createProduct, setSeedDemand } from './api';

export function AddProductPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [defaultPrice, setDefaultPrice] = useState('0');
  const [seed, setSeed] = useState('');
  const [isSeasonal, setIsSeasonal] = useState(false);
  const [isAggregated, setIsAggregated] = useState(false);
  const [sourceMaker, setSourceMaker] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const priceNum = Number(defaultPrice);
  const seedNum = seed === '' ? null : Number(seed);
  const seedValid = seedNum === null || (Number.isFinite(seedNum) && seedNum >= 0);
  const canSubmit =
    name.trim().length > 0 &&
    unit.trim().length > 0 &&
    Number.isFinite(priceNum) &&
    priceNum >= 0 &&
    seedValid &&
    (!isAggregated || sourceMaker.trim().length > 0) &&
    !submitting;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const id = await createProduct({
        name: name.trim(),
        unit: unit.trim(),
        default_price: priceNum,
        is_seasonal: isSeasonal,
        is_aggregated: isAggregated,
        source_maker_name: isAggregated ? sourceMaker.trim() : null,
      });
      if (seedNum !== null && seedNum > 0 && !isAggregated) {
        await setSeedDemand(id, seedNum);
      }
      navigate('/products');
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  const inputClass = 'mt-1 h-11 w-full rounded-input border border-ink-900/10 bg-paper-elevated px-3 text-body';
  const labelSpan = 'text-label uppercase text-ink-500';

  return (
    <div>
      <h1 className="text-title text-ink-900">Add product</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label className="block">
          <span className={labelSpan}>Name</span>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <label className="block">
          <span className={labelSpan}>Unit</span>
          <input
            className={inputClass}
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="e.g., 250g pack"
          />
        </label>

        <label className="block">
          <span className={labelSpan}>Default price (₹)</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            className={inputClass}
            value={defaultPrice}
            onChange={(e) => setDefaultPrice(e.target.value)}
          />
        </label>

        <label className="block">
          <span className={labelSpan}>Weekly average (your guess)</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            className={inputClass}
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="Roughly how much per week?"
          />
          <span className="mt-1 block text-body-sm text-ink-500">
            Optional. Used until 4 weeks of real orders accumulate.
          </span>
        </label>

        <label className="flex items-center gap-2 text-body text-ink-900">
          <input type="checkbox" checked={isSeasonal} onChange={(e) => setIsSeasonal(e.target.checked)} />
          Seasonal (excluded from rolling average)
        </label>

        <label className="flex items-center gap-2 text-body text-ink-900">
          <input
            type="checkbox"
            checked={isAggregated}
            onChange={(e) => {
              setIsAggregated(e.target.checked);
              if (!e.target.checked) setSourceMaker('');
            }}
          />
          From another maker (aggregated)
        </label>

        {isAggregated && (
          <label className="block">
            <span className={labelSpan}>Source maker name</span>
            <input className={inputClass} value={sourceMaker} onChange={(e) => setSourceMaker(e.target.value)} />
          </label>
        )}

        {error && <p className="text-body-sm text-status-danger-fg">{error}</p>}

        <button
          type="submit"
          disabled={!canSubmit}
          className="h-11 w-full rounded-btn bg-brand-orange text-body font-semibold text-white disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Add route**

```tsx
import { AddProductPage } from '@/features/products/AddProductPage';
// ...
<Route path="/products/new" element={<AddProductPage />} />
```

- [ ] **Step 5: Tests pass, typecheck clean**

- [ ] **Step 6: Commit**

```bash
git add src/
git commit -m "Sprint 2: Add Product form with inline seed_demand entry"
```

---

## Task 6: Edit Product form (with archive)

**Files:**
- Create: `src/features/products/EditProductPage.tsx`
- Modify: `src/App.tsx` (route `/products/:id`)

No new test file — the form is structurally identical to AddProduct; integration coverage comes from the smoke pass.

- [ ] **Step 1: Implement**

```tsx
// src/features/products/EditProductPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  archiveProduct,
  getProductById,
  getSeedDemand,
  setSeedDemand,
  updateProduct,
  type ProductFullRow,
} from './api';

export function EditProductPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<ProductFullRow | null>(null);
  const [seed, setSeed] = useState('');
  const [seedReadOnly, setSeedReadOnly] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editable fields
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [defaultPrice, setDefaultPrice] = useState('0');
  const [isSeasonal, setIsSeasonal] = useState(false);
  const [isAggregated, setIsAggregated] = useState(false);
  const [sourceMaker, setSourceMaker] = useState('');

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
        const s = await getSeedDemand(id);
        setSeed(s === null ? '' : String(s));
        // For Sprint 2, seed is always editable. Read-only-after-4-weeks rule
        // formally applies once the algorithm is wired; deferred to Sprint 3
        // when the Production planning view exposes weeks_of_history per row.
        setSeedReadOnly(false);
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }, [id]);

  const priceNum = Number(defaultPrice);
  const seedNum = seed === '' ? null : Number(seed);
  const seedValid = seedNum === null || (Number.isFinite(seedNum) && seedNum >= 0);
  const canSubmit =
    !!product &&
    name.trim().length > 0 &&
    unit.trim().length > 0 &&
    Number.isFinite(priceNum) &&
    priceNum >= 0 &&
    seedValid &&
    (!isAggregated || sourceMaker.trim().length > 0) &&
    !submitting;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await updateProduct(id, {
        name: name.trim(),
        unit: unit.trim(),
        default_price: priceNum,
        is_seasonal: isSeasonal,
        is_aggregated: isAggregated,
        source_maker_name: isAggregated ? sourceMaker.trim() : null,
      });
      if (!seedReadOnly && seedNum !== null && seedNum >= 0 && !isAggregated) {
        await setSeedDemand(id, seedNum);
      }
      navigate('/products');
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  async function onArchive() {
    if (!confirm('Archive this product? It will hide from all lists but history is preserved.')) return;
    setSubmitting(true);
    try {
      await archiveProduct(id);
      navigate('/products');
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  if (error && !product) {
    return <p className="text-body-sm text-status-danger-fg">{error}</p>;
  }
  if (!product) {
    return <p className="text-body-sm text-ink-500">Loading…</p>;
  }

  const inputClass = 'mt-1 h-11 w-full rounded-input border border-ink-900/10 bg-paper-elevated px-3 text-body';
  const labelSpan = 'text-label uppercase text-ink-500';

  return (
    <div>
      <h1 className="text-title text-ink-900">Edit product</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label className="block">
          <span className={labelSpan}>Name</span>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <label className="block">
          <span className={labelSpan}>Unit</span>
          <input className={inputClass} value={unit} onChange={(e) => setUnit(e.target.value)} />
        </label>

        <label className="block">
          <span className={labelSpan}>Default price (₹)</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            className={inputClass}
            value={defaultPrice}
            onChange={(e) => setDefaultPrice(e.target.value)}
          />
        </label>

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
        </label>

        <label className="flex items-center gap-2 text-body text-ink-900">
          <input type="checkbox" checked={isSeasonal} onChange={(e) => setIsSeasonal(e.target.checked)} />
          Seasonal
        </label>

        <label className="flex items-center gap-2 text-body text-ink-900">
          <input
            type="checkbox"
            checked={isAggregated}
            onChange={(e) => {
              setIsAggregated(e.target.checked);
              if (!e.target.checked) setSourceMaker('');
            }}
          />
          From another maker (aggregated)
        </label>

        {isAggregated && (
          <label className="block">
            <span className={labelSpan}>Source maker name</span>
            <input className={inputClass} value={sourceMaker} onChange={(e) => setSourceMaker(e.target.value)} />
          </label>
        )}

        {error && <p className="text-body-sm text-status-danger-fg">{error}</p>}

        <button
          type="submit"
          disabled={!canSubmit}
          className="h-11 w-full rounded-btn bg-brand-orange text-body font-semibold text-white disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save'}
        </button>

        {product.active && (
          <button
            type="button"
            onClick={onArchive}
            className="h-11 w-full rounded-btn-sm border border-ink-900/10 bg-paper-elevated text-body text-ink-900"
          >
            Archive product
          </button>
        )}
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Add route**

```tsx
import { EditProductPage } from '@/features/products/EditProductPage';
// ...
<Route path="/products/:id" element={<EditProductPage />} />
```

- [ ] **Step 3: Tests + typecheck pass**

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "Sprint 2: Edit Product form with archive"
```

---

## Task 7: Production raw-data fetcher

**Files:**
- Modify: `src/features/production/api.ts`

Add `getProductionThisWeek(): Promise<ProductionWeekRow[]>` which fetches the raw inputs and delegates to `computeProductionWeek`. Done in a single helper so consumers (Today + Production) don't repeat the fetch logic.

- [ ] **Step 1: Implement**

Append to `src/features/production/api.ts`:

```ts
import { computeProductionWeek, type AlgorithmInput, type ProductionWeekRow } from './algorithm';
import { todayInTz } from '@/lib/utils';
import { weekStartFor } from '@/lib/week';
import { listAllSeedDemand } from '@/features/products/api';

export type { ProductionWeekRow } from './algorithm';

/**
 * Fetches raw inputs and computes the production-suggestion rows for THIS week
 * (in Asia/Kolkata). Aggregates client-side because at v1 scale (≤15 products)
 * the row counts are small. Migrate to a Postgres function later if needed.
 */
export async function getProductionThisWeek(): Promise<ProductionWeekRow[]> {
  const today = todayInTz();
  const weekStart = weekStartFor(today);
  const weekStartIso = `${weekStart}T00:00:00+05:30`;
  // 4 weeks before weekStart
  const fourWeeksAgoMs = new Date(`${weekStart}T00:00:00Z`).getTime() - 28 * 24 * 60 * 60 * 1000;
  const fourWeeksAgo = new Date(fourWeeksAgoMs).toISOString().slice(0, 10);
  const fourWeeksAgoIso = `${fourWeeksAgo}T00:00:00+05:30`;
  const weekEndMs = new Date(`${weekStart}T00:00:00Z`).getTime() + 7 * 24 * 60 * 60 * 1000;
  const weekEnd = new Date(weekEndMs).toISOString().slice(0, 10);

  // In-house, active products
  const { data: productsData, error: pErr } = await supabase
    .from('products')
    .select('id, name, unit, is_seasonal, is_aggregated')
    .eq('active', true)
    .eq('is_aggregated', false);
  if (pErr) throw new Error(pErr.message);
  const products = (productsData ?? []).map((p) => ({
    id: p.id, name: p.name, unit: p.unit, is_seasonal: p.is_seasonal, is_aggregated: p.is_aggregated,
  }));

  // Rolling demand: order_items in [weekStart - 4w, weekStart) by ordered_at
  const { data: rollingRaw, error: rErr } = await supabase
    .from('order_items')
    .select('product_id, qty, orders!inner(ordered_at)')
    .gte('orders.ordered_at', fourWeeksAgoIso)
    .lt('orders.ordered_at', weekStartIso);
  if (rErr) throw new Error(rErr.message);
  const rollingDemand: Record<string, number> = {};
  for (const r of rollingRaw ?? []) {
    rollingDemand[r.product_id] = (rollingDemand[r.product_id] ?? 0) + Number(r.qty);
  }

  // Committed: target_fulfilment_date in this week, OR target null AND ordered_at in this week
  // PostgREST doesn't support complex OR with cross-table refs easily — do two queries + merge.
  const { data: committedDated, error: cErr1 } = await supabase
    .from('order_items')
    .select('product_id, qty, orders!inner(target_fulfilment_date)')
    .gte('orders.target_fulfilment_date', weekStart)
    .lt('orders.target_fulfilment_date', weekEnd);
  if (cErr1) throw new Error(cErr1.message);
  const { data: committedUndated, error: cErr2 } = await supabase
    .from('order_items')
    .select('product_id, qty, orders!inner(target_fulfilment_date, ordered_at)')
    .is('orders.target_fulfilment_date', null)
    .gte('orders.ordered_at', weekStartIso)
    .lt('orders.ordered_at', `${weekEnd}T00:00:00+05:30`);
  if (cErr2) throw new Error(cErr2.message);
  const committedDemand: Record<string, number> = {};
  for (const r of [...(committedDated ?? []), ...(committedUndated ?? [])]) {
    committedDemand[r.product_id] = (committedDemand[r.product_id] ?? 0) + Number(r.qty);
  }

  // Produced this week
  const { data: producedRaw, error: prErr } = await supabase
    .from('production_logs')
    .select('product_id, qty')
    .gte('made_on', weekStart)
    .lt('made_on', weekEnd);
  if (prErr) throw new Error(prErr.message);
  const producedQty: Record<string, number> = {};
  for (const r of producedRaw ?? []) {
    producedQty[r.product_id] = (producedQty[r.product_id] ?? 0) + Number(r.qty);
  }

  // First ordered_at per product (across all time)
  const { data: firstRaw, error: fErr } = await supabase
    .from('order_items')
    .select('product_id, orders!inner(ordered_at)')
    .order('orders(ordered_at)', { ascending: true });
  if (fErr) throw new Error(fErr.message);
  const firstOrderedAt: Record<string, string> = {};
  for (const r of firstRaw ?? []) {
    const at = (r as { orders: { ordered_at: string } }).orders.ordered_at;
    if (!firstOrderedAt[r.product_id] || at < firstOrderedAt[r.product_id]) {
      firstOrderedAt[r.product_id] = at;
    }
  }

  // Seed demand
  const seedQty = await listAllSeedDemand();

  const input: AlgorithmInput = {
    weekStart,
    products,
    rollingDemand,
    committedDemand,
    producedQty,
    seedQty,
    firstOrderedAt,
  };
  return computeProductionWeek(input);
}
```

> Note on PostgREST embed-filter syntax (`orders!inner(...)`): the inner-join + dotted filter pattern (`gte('orders.ordered_at', ...)`) is supported as of Supabase JS v2. If the type system complains, the cleanest fallback is to fetch `order_items` rows with their full `orders` embed and filter in TypeScript. The implementer can iterate if needed — but try the embed-filter form first since it pushes the filter to the server.

- [ ] **Step 2: Typecheck — there's a real chance the dotted-filter types complain. If so, switch to fetching with the embed un-filtered and filtering client-side. Document the choice in a comment.**

- [ ] **Step 3: Commit**

```bash
git add src/features/production/api.ts
git commit -m "Sprint 2: production raw-data fetcher + getProductionThisWeek"
```

---

## Task 8: Production screen rewrite (Section C + header link)

**Files:**
- Modify: `src/features/production/ProductionPage.tsx`

- [ ] **Step 1: Replace ProductionPage**

```tsx
// src/features/production/ProductionPage.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getProductionThisWeek, type ProductionWeekRow } from './api';

export function ProductionPage() {
  const [rows, setRows] = useState<ProductionWeekRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProductionThisWeek()
      .then((r) => { setRows(r); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, []);

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
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.product_id}>
              <Link
                to={`/production/new?product_id=${r.product_id}`}
                className="block rounded-card bg-paper-elevated p-3"
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-body font-semibold text-ink-900">{r.name}</span>
                  <span className="text-body-sm text-ink-500">{r.unit}</span>
                </div>
                <div className="mt-1 grid grid-cols-3 gap-2 text-body-sm">
                  <span className="text-ink-500">
                    Plan: <span className="text-ink-900">—</span>
                  </span>
                  <span className="text-ink-500">
                    Suggested: <span className="text-ink-900">{r.suggested}</span>
                  </span>
                  <span className="text-ink-500">
                    Made: <span className="text-ink-900">{r.produced_qty}</span>
                  </span>
                </div>
              </Link>
            </li>
          ))}
          {!loading && rows.length === 0 && !error && (
            <li className="text-body-sm text-ink-500">
              No products yet. <Link to="/products/new" className="underline">Add your first product →</Link>
            </li>
          )}
        </ul>
      </section>

      <div className="mt-6">
        <Link
          to="/production/new"
          className="block h-11 w-full rounded-btn bg-brand-orange text-center text-body font-semibold leading-[2.75rem] text-white"
        >
          + Log production
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + tests still pass**

- [ ] **Step 3: Commit**

```bash
git add src/features/production/ProductionPage.tsx
git commit -m "Sprint 2: Production Section C (in-house list) + header link to Products"
```

---

## Task 9: LogProduction `?product_id=` pre-fill

**Files:**
- Modify: `src/features/production/LogProductionPage.tsx`

- [ ] **Step 1: Patch**

Add `useSearchParams` import and an effect that consumes `product_id` once products are loaded:

```tsx
import { useNavigate, useSearchParams } from 'react-router-dom';
// ...
const [searchParams] = useSearchParams();
const prefilledId = searchParams.get('product_id');

useEffect(() => {
  listActiveProducts()
    .then((ps) => {
      setProducts(ps);
      if (prefilledId && ps.some((p) => p.id === prefilledId)) {
        setProductId(prefilledId);
      }
    })
    .catch((e: Error) => setError(e.message));
}, [prefilledId]);
```

Replace the existing effect with the above.

- [ ] **Step 2: Tests still pass** (the existing LogProductionPage test doesn't exercise the query string, so should be unaffected)

- [ ] **Step 3: Commit**

```bash
git add src/features/production/LogProductionPage.tsx
git commit -m "Sprint 2: LogProduction accepts ?product_id= for prefill"
```

---

## Task 10: Today screen Block 1 rewrite

**Files:**
- Modify: `src/features/today/TodayPage.tsx`

Block 1 (this week, make) replaces the raw "Pending today" + "Production today" lists from Sprint 1. We're not yet wiring real Block 2 logic (Sprint 4 handles order detail + the proper Pending list), but we'll preserve the simple pending list from Sprint 1 as a placeholder.

- [ ] **Step 1: Replace TodayPage**

```tsx
// src/features/today/TodayPage.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { getProductionThisWeek, type ProductionWeekRow } from '@/features/production/api';
import { listTodayPendingOrders, type OrderRow } from '@/features/orders/api';
import { listCustomersByIds } from '@/features/customers/api';

export function TodayPage() {
  const { user, isAdmin, signOut } = useAuth();
  const [productionRows, setProductionRows] = useState<ProductionWeekRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [customerNames, setCustomerNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [pr, os] = await Promise.all([getProductionThisWeek(), listTodayPendingOrders()]);
        setProductionRows(pr);
        setOrders(os);
        const cnames = await listCustomersByIds(os.map((o) => o.customer_id));
        setCustomerNames(cnames);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  // Hide products where suggested === 0 AND produced === 0 (per spec §4)
  const visibleProduction = productionRows.filter((r) => !(r.suggested === 0 && r.produced_qty === 0));
  const allSeeded = visibleProduction.length > 0 && visibleProduction.every((r) => r.uses_seed);

  return (
    <>
      <header className="flex items-baseline justify-between">
        <h1 className="text-title text-ink-900">Today</h1>
        <span className="text-label uppercase text-ink-500">
          {isAdmin ? 'Admin' : 'Signed in'}
        </span>
      </header>

      {error && <p className="mt-4 text-body-sm text-status-danger-fg">{error}</p>}

      {/* Block 1 — This week, make */}
      <section className="mt-6">
        <h2 className="text-subtitle text-ink-900">This week, make</h2>
        <ul className="mt-2 space-y-2">
          {visibleProduction.map((r) => (
            <li key={r.product_id}>
              <Link
                to={`/production/new?product_id=${r.product_id}`}
                className="block rounded-card bg-paper-elevated p-3"
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-body font-semibold text-ink-900">{r.name}</span>
                  <span className="text-body-sm text-ink-500">
                    target {r.suggested} · made {r.produced_qty}
                  </span>
                </div>
              </Link>
            </li>
          ))}
          {visibleProduction.length === 0 && (
            <li className="text-body-sm text-ink-500">
              Nothing to make this week. <Link to="/products/new" className="underline">Add a product →</Link>
            </li>
          )}
        </ul>
        {allSeeded && (
          <p className="mt-2 text-body-sm text-ink-500">
            Based on your initial estimates. Will refine as real orders accumulate.
          </p>
        )}
      </section>

      {/* Block 2 (lightweight — full pending logic lands in Sprint 4) */}
      <section className="mt-6">
        <h2 className="text-subtitle text-ink-900">Pending today ({orders.length})</h2>
        <ul className="mt-2 space-y-2">
          {orders.map((o) => (
            <li key={o.id} className="rounded-card bg-paper-elevated p-3 text-body-sm">
              <div className="font-semibold text-ink-900">
                {customerNames[o.customer_id] ?? '(unknown customer)'}
              </div>
              <div className="text-ink-500">
                ordered {o.ordered_at.slice(0, 10)} · {o.payment_status}
              </div>
            </li>
          ))}
          {orders.length === 0 && (
            <li className="text-body-sm text-ink-500">All caught up.</li>
          )}
        </ul>
      </section>

      <p className="mt-6 text-body-sm text-ink-500">{user?.email}</p>

      <div className="mt-8">
        <button
          type="button"
          onClick={signOut}
          className="h-11 w-full rounded-btn-sm border border-ink-900/10 bg-paper-elevated text-body text-ink-900"
        >
          Sign out
        </button>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Typecheck + tests pass**

- [ ] **Step 3: Commit**

```bash
git add src/features/today/TodayPage.tsx
git commit -m "Sprint 2: Today Block 1 — production suggestions + seed footnote"
```

---

## Task 11: Smoke test + push

**Files:**
- None (re-uses existing `scripts/smoke-test-walking-skeleton.py`)

- [ ] **Step 1: Run full test suite locally**

```bash
npm run typecheck && npm run test:run
```
Expected: all tests pass (existing 11 + algorithm 8 + week 4 + AddProduct 2 = 25).

- [ ] **Step 2: Manual smoke locally**

```bash
npm run dev
```
Then in a browser, log in and exercise:
- Tap Production → see "Manage products →" link; tap → Products page lists `[DEV]` items.
- Tap a product → Edit screen loads.
- Tap `+ Add product` → fill name "Sprint 2 Test", unit "kg", price 50, seed 3, save → returns to Products list with the new row.
- Tap Production tab → "Sprint 2 Test" appears in the list with `Suggested: 3 · Made: 0` (or similar).
- Tap the row → /production/new loads with the product pre-selected.
- Save a log of qty 1 → Production shows Made: 1.
- Tap Today → Block 1 lists "Sprint 2 Test" with `target 2 · made 1` (since 3-1=2). Seed footnote appears (only seeded products visible).

- [ ] **Step 3: Push**

```bash
git push origin main
```

- [ ] **Step 4: Run the deployed smoke test**

```bash
python scripts/smoke-test-walking-skeleton.py
```
Expected: passes. (The existing smoke just checks the 5 tabs render — none of the Sprint 2 work changes the BottomNav contract.)

- [ ] **Step 5: Hand off to Karan for product-judgment review** — this is the Sprint 2 checkpoint #3 from the original plan: "first time the §11 production-suggestion algorithm produces a number. Suggestion numbers either feel right or don't."

---

## Self-Review

**Spec coverage** (`v1-spec.md` §14 Sprint 2):
- §11 algorithm (rolling avg + seed fallback) — Task 2 ✓ (event uplift deferred to Sprint 7 explicitly per spec)
- Production screen §5 sections C + E — Task 8 ✓
- Product creation form with inline seed estimate field — Task 5 ✓
- Today screen Block 1 — Task 10 ✓
- Seed footnote on Today (Karan-decision) — Task 10 ✓
- Manage products header link on Production (Karan-decision) — Task 8 ✓
- Plan column = `—` no affordance (Karan-decision) — Task 8 ✓
- Archive button (Karan-decision) — Task 6 ✓

**Placeholder scan:** no TBDs without code, no "add validation later". Every step has actual content.

**Type consistency:** `AlgorithmInput` / `ProductionWeekRow` defined once in `algorithm.ts`, re-exported from `api.ts`. `ProductFullRow`, `ProductInput` defined in products/api.ts and consumed by ProductsPage / AddProductPage / EditProductPage.

**Known design call-outs:**
1. **Algorithm is client-side TypeScript.** Decision recorded at top. If perf bites at v1 launch, migrate to Postgres RPC.
2. **PostgREST embed-filter syntax** in Task 7 may need a fallback path (fetch + filter client-side). Implementer is instructed to iterate.
3. **Seed read-only after 4 weeks** is deferred to Sprint 3 (Task 6 sets `seedReadOnly = false` always with a code comment).
4. **First-ordered-at fetch is unscoped** — it queries the entire order_items table sorted by ordered_at to find MINs. At v1 scale that's fine; eventually move to a per-product MIN aggregation if it grows.
5. **Aggregated products section D excluded** from this sprint. They don't appear on Production main this sprint; reachable only via Products list and (Sprint 4) on individual orders.

Plan complete.
