# Purchases ("Buy") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Purchases feature per `docs/superpowers/specs/2026-07-07-purchases-design.md` — receipt-model purchase log, 6-tab nav (Make/Buy), from-other-makers shortcut, Month-report Spending section.

**Architecture:** New `src/features/purchases/` lens (Page + api.ts + pure helpers + tests) over four new tables (migration `0010`), authed-only RLS, zero anon surface. Nav goes 6-tab. Reports Month tab gains one additive section. All money values from PostgREST are strings → `Number()` at read sites. All date columns are Postgres `date`, written via `todayInTz()`.

**Tech Stack:** Vite + React 18 + TS strict (`noUncheckedIndexedAccess`), Tailwind tokens (no token changes), supabase-js, react-router v6, Vitest, Playwright smokes (Python).

**Branch:** `feature/purchases` (already created; spec committed). **Never push.**

**Reference exemplars (read before coding a task):**
- Multi-row form: `src/features/orders/AddOrderPage.tsx` (DraftItem string-state `:11,:26`, mutators `:108-116`, validation `:118-127`, row grid `:297-345`)
- Autosuggest: `src/features/orders/CustomerSearchPicker.tsx` (debounce + `searchCustomersByName` + select/change card)
- Chip picker with inline add: `src/features/customers/ChannelChipPicker.tsx` + `createChannel` (`customers/api.ts:390-406`, 23505 handling)
- RLS pattern: `supabase/migrations/0002_rls.sql:44-75`; DDL pattern: `0001_init.sql:23-30`
- Reports section: `src/features/reports/MonthTab.tsx` (`ReportSection`, Order summary `:503-545`, `StackedBar` usage `:548-566`, `pctChange`/`fmtPct` `:158-169`, parallel fetch `:315-316`)
- Month math: `src/features/reports/dateRange.ts` (`monthRange`, `previousMonth`, `nextMonth`, `formatMonthLabel`, `isCurrentMonth`) — import these, do not reimplement
- Detail + delete idiom: `src/features/orders/OrderDetailPage.tsx` (native `confirm()` guard)

---

### Task 1: Migration `0010_purchases.sql`

**Files:**
- Create: `supabase/migrations/0010_purchases.sql`

- [ ] **Step 1: Write the migration** (exact content):

```sql
-- 0010: purchases feature — vendors, categories, purchases (trips), purchase_items.
-- Authed-only. No anon access, no RPCs (feature has zero public surface).
set search_path = public, extensions;

create table vendors (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(trim(name)) between 1 and 60),
  created_at  timestamptz not null default now()
);
create unique index vendors_name_lower_uq on vendors (lower(name));

create table purchase_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(trim(name)) between 1 and 20),
  is_system   boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index purchase_categories_name_lower_uq on purchase_categories (lower(name));

create table purchases (
  id            uuid primary key default gen_random_uuid(),
  vendor_id     uuid not null references vendors(id),
  purchased_on  date not null,
  note          text,
  created_at    timestamptz not null default now()
);
create index purchases_purchased_on_idx on purchases (purchased_on desc);
create index purchases_vendor_idx on purchases (vendor_id);

create table purchase_items (
  id           uuid primary key default gen_random_uuid(),
  purchase_id  uuid not null references purchases(id) on delete cascade,
  item_name    text not null check (char_length(trim(item_name)) between 1 and 60),
  category_id  uuid not null references purchase_categories(id),
  qty          numeric(12,3) check (qty > 0),
  unit         text,
  amount       numeric(10,2) not null check (amount >= 0),
  created_at   timestamptz not null default now()
);
create index purchase_items_purchase_idx on purchase_items (purchase_id);
create index purchase_items_name_lower_idx on purchase_items (lower(item_name));

insert into purchase_categories (name, is_system) values
  ('Ingredients', true),
  ('Packaging', true),
  ('Made products', true),
  ('Fuel', true),
  ('Other', true);

alter table vendors enable row level security;
alter table purchase_categories enable row level security;
alter table purchases enable row level security;
alter table purchase_items enable row level security;

create policy authed_all on vendors
  for all to authenticated using (true) with check (true);
create policy authed_all on purchase_categories
  for all to authenticated using (true) with check (true);
create policy authed_all on purchases
  for all to authenticated using (true) with check (true);
create policy authed_all on purchase_items
  for all to authenticated using (true) with check (true);
```

- [ ] **Step 2: Determine how migrations are applied in this project.** Check `supabase/config.toml`, `.env.local`, and `git log` notes for 0008/0009 application method (`npx supabase migration list` if a linked CLI exists). Apply 0010 the same way. **If you cannot apply it (no linked CLI / needs dashboard), STOP after committing the SQL and report back — later tasks' smokes depend on the live tables.** The migration is purely additive, so applying before the app ships is safe.

- [ ] **Step 3: Verify tables exist** — authed REST probe (mirror any `verify-*.py` REST helper): `GET /rest/v1/purchase_categories?select=name` with a logged-in token returns the 5 seeded names. `anon` key without login must get an RLS-empty/denied result, not rows.

- [ ] **Step 4: Commit** — `git add supabase/migrations/0010_purchases.sql && git commit -m "feat(purchases): migration 0010 — vendors, categories, purchases, purchase_items + authed RLS"`

---

### Task 2: Pure helpers `purchaseMath.ts` (TDD)

**Files:**
- Create: `src/features/purchases/purchaseMath.ts`
- Test: `src/features/purchases/purchaseMath.test.ts`

- [ ] **Step 1: Write failing tests first** (`purchaseMath.test.ts`):

```ts
import { describe, expect, it } from 'vitest';
import {
  aggregateItems,
  categoryTotals,
  groupByDay,
  receiptTotal,
  unitPrice,
  type ItemEntry,
} from './purchaseMath';

const entry = (over: Partial<ItemEntry>): ItemEntry => ({
  item_name: 'Besan',
  qty: 5,
  unit: 'kg',
  amount: 450,
  category_id: 'c1',
  purchased_on: '2026-07-01',
  vendor_name: 'Ram Kirana',
  ...over,
});

describe('receiptTotal', () => {
  it('sums item amounts', () => {
    expect(receiptTotal([{ amount: 450 }, { amount: 30.5 }])).toBe(480.5);
  });
  it('is 0 for no items', () => {
    expect(receiptTotal([])).toBe(0);
  });
});

describe('unitPrice', () => {
  it('divides amount by qty, 2dp', () => {
    expect(unitPrice(450, 5)).toBe(90);
    expect(unitPrice(100, 3)).toBe(33.33);
  });
  it('is null without a positive qty', () => {
    expect(unitPrice(450, null)).toBeNull();
    expect(unitPrice(450, 0)).toBeNull();
  });
});

describe('groupByDay', () => {
  it('groups by purchased_on, newest day first', () => {
    const rows = [
      { purchased_on: '2026-07-01' },
      { purchased_on: '2026-07-03' },
      { purchased_on: '2026-07-01' },
    ];
    const grouped = groupByDay(rows);
    expect(grouped.map((g) => g.date)).toEqual(['2026-07-03', '2026-07-01']);
    expect(grouped[1]?.rows).toHaveLength(2);
  });
});

describe('aggregateItems', () => {
  it('groups case-insensitively, keeps most recent casing, history newest first', () => {
    const entries = [
      entry({ item_name: 'besan', purchased_on: '2026-06-01', amount: 400 }),
      entry({ item_name: 'Besan', purchased_on: '2026-07-01', amount: 450 }),
      entry({ item_name: 'Oil', purchased_on: '2026-06-15' }),
    ];
    const out = aggregateItems(entries);
    expect(out).toHaveLength(2);
    expect(out[0]?.name).toBe('Besan'); // most recently bought first
    expect(out[0]?.timesBought).toBe(2);
    expect(out[0]?.last.amount).toBe(450);
    expect(out[0]?.history.map((h) => h.purchased_on)).toEqual(['2026-07-01', '2026-06-01']);
  });
});

describe('categoryTotals', () => {
  it('sums per category name, sorted desc by total', () => {
    const out = categoryTotals([
      { amount: 100, category_name: 'Packaging' },
      { amount: 450, category_name: 'Ingredients' },
      { amount: 50, category_name: 'Ingredients' },
    ]);
    expect(out).toEqual([
      { name: 'Ingredients', total: 500 },
      { name: 'Packaging', total: 100 },
    ]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm run test:run -- purchaseMath` → FAIL (module not found).

- [ ] **Step 3: Implement** (`purchaseMath.ts`, exact content):

```ts
export type ItemEntry = {
  item_name: string;
  qty: number | null;
  unit: string | null;
  amount: number;
  category_id: string;
  purchased_on: string;
  vendor_name: string;
};

export function receiptTotal(items: { amount: number }[]): number {
  return items.reduce((sum, i) => sum + i.amount, 0);
}

export function unitPrice(amount: number, qty: number | null): number | null {
  if (qty === null || qty <= 0) return null;
  return Math.round((amount / qty) * 100) / 100;
}

export function groupByDay<T extends { purchased_on: string }>(
  rows: T[],
): { date: string; rows: T[] }[] {
  const byDate = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = byDate.get(row.purchased_on) ?? [];
    bucket.push(row);
    byDate.set(row.purchased_on, bucket);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([date, dayRows]) => ({ date, rows: dayRows }));
}

export type ItemSummary = {
  name: string;
  timesBought: number;
  last: ItemEntry;
  history: ItemEntry[];
};

export function aggregateItems(entries: ItemEntry[]): ItemSummary[] {
  const byName = new Map<string, ItemEntry[]>();
  for (const e of entries) {
    const key = e.item_name.trim().toLowerCase();
    const bucket = byName.get(key) ?? [];
    bucket.push(e);
    byName.set(key, bucket);
  }
  const summaries: ItemSummary[] = [];
  for (const bucket of byName.values()) {
    const history = [...bucket].sort((a, b) => (a.purchased_on < b.purchased_on ? 1 : -1));
    const last = history[0];
    if (!last) continue;
    summaries.push({ name: last.item_name, timesBought: history.length, last, history });
  }
  return summaries.sort((a, b) => (a.last.purchased_on < b.last.purchased_on ? 1 : -1));
}

export function categoryTotals(
  entries: { amount: number; category_name: string }[],
): { name: string; total: number }[] {
  const totals = new Map<string, number>();
  for (const e of entries) {
    totals.set(e.category_name, (totals.get(e.category_name) ?? 0) + e.amount);
  }
  return [...totals.entries()]
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);
}
```

- [ ] **Step 4: Run to verify pass** — `npm run test:run -- purchaseMath` → all green. Then `npm run typecheck`.

- [ ] **Step 5: Commit** — `feat(purchases): pure helpers (totals, day grouping, item memory, category totals)`

---

### Task 3: Data layer `src/features/purchases/api.ts`

**Files:**
- Create: `src/features/purchases/api.ts`

Verify the supabase client import first (`src/lib/` — same import every other `api.ts` uses; copy it verbatim). All numeric fields (`qty`, `amount`) arrive as **strings** → coerce with `Number()` in the row mappers. Follow the error-handling style of `src/features/customers/api.ts` (throw `error` / mapped messages).

- [ ] **Step 1: Types + reads** (exact signatures; bodies follow existing api.ts idioms):

```ts
export type VendorRow = { id: string; name: string };
export type PurchaseCategoryRow = { id: string; name: string };
export type PurchaseItemRow = {
  id: string;
  item_name: string;
  qty: number | null;
  unit: string | null;
  amount: number;
  category_id: string;
};
export type PurchaseRow = {
  id: string;
  purchased_on: string;
  note: string | null;
  vendor: VendorRow;
  items: PurchaseItemRow[];
  total: number; // receiptTotal(items) — computed in the mapper, never stored
};

export async function listPurchases(startInclusive: string, endExclusive: string): Promise<PurchaseRow[]>
// .from('purchases')
// .select('id, purchased_on, note, vendor:vendors(id, name), items:purchase_items(id, item_name, qty, unit, amount, category_id)')
// .gte('purchased_on', startInclusive).lt('purchased_on', endExclusive)
// .order('purchased_on', { ascending: false }).order('created_at', { ascending: false })

export async function getPurchase(id: string): Promise<PurchaseRow | null> // same select, .eq('id', id).maybeSingle()

export async function searchVendors(q: string): Promise<VendorRow[]>
// .from('vendors').select('id, name').ilike('name', `%${q}%`).order('name').limit(8)

export async function listPurchaseCategories(): Promise<PurchaseCategoryRow[]>
// active = true, order by created_at asc (system rows first, insertion order = seed order)

export async function listAllItemEntries(): Promise<ItemEntry[]>
// .from('purchase_items')
// .select('item_name, qty, unit, amount, category_id, purchase:purchases(purchased_on, vendor:vendors(name))')
// map nested → flat ItemEntry (purchased_on, vendor_name); client sorts via aggregateItems

export async function getItemSuggestions(q: string): Promise<ItemEntry[]>
// same select + .ilike('item_name', `%${q}%`).order('created_at', { ascending: false }).limit(20)
// then dedupe client-side by lower(item_name) keeping first (most recent)

export async function getLastItemEntry(name: string): Promise<ItemEntry | null>
// same select + .ilike('item_name', name)  // no wildcards = case-insensitive equality
// .order('created_at', { ascending: false }).limit(1)
```

- [ ] **Step 2: Mutations:**

```ts
export type PurchaseItemInput = {
  item_name: string;
  category_id: string;
  qty: number | null;
  unit: string | null;
  amount: number;
};
export type PurchaseInput = {
  vendorId: string | null;  // null → create/find by vendorName
  vendorName: string;
  purchased_on: string;     // YYYY-MM-DD from todayInTz() or the date input
  note: string | null;
  items: PurchaseItemInput[];
};

async function ensureVendor(input: PurchaseInput): Promise<string>
// if vendorId → return it. Else insert { name: trimmed }; on error.code === '23505'
// re-select .ilike('name', trimmed).single() and return that id (mirrors createChannel).

export async function createPurchase(input: PurchaseInput): Promise<string>
// ensureVendor → insert purchases row (select('id').single()) → insert items with purchase_id.
// Sequential inserts, same as orders. If the items insert fails, delete the purchase row
// before rethrowing (cascade makes this one call) so no empty receipt is left behind.

export async function updatePurchase(id: string, input: PurchaseInput): Promise<void>
// ensureVendor → update purchases row (vendor_id, purchased_on, note)
// → delete purchase_items where purchase_id = id → insert the new items.

export async function deletePurchase(id: string): Promise<void> // delete purchases row; cascade removes items

export async function createPurchaseCategory(name: string): Promise<PurchaseCategoryRow>
// exact clone of customers/api.ts createChannel (1–20 char validation, 23505 → "already exists")
```

- [ ] **Step 3:** `npm run typecheck` → clean. (No unit tests for api.ts — consistent with every other feature; smokes exercise it.)

- [ ] **Step 4: Commit** — `feat(purchases): data layer (queries, sequential writes, vendor ensure-or-create)`

---

### Task 4: Routes + `PurchasesPage` (Receipts | Items)

**Files:**
- Create: `src/features/purchases/PurchasesPage.tsx`
- Modify: `src/App.tsx` (lazy imports after line 29-ish; routes after `/products/:id`, before `/settings`)

- [ ] **Step 1: Routes** — add to `src/App.tsx` (mirror existing style exactly):

```tsx
const PurchasesPage = lazy(() => import('@/features/purchases/PurchasesPage').then((m) => ({ default: m.PurchasesPage })));
const PurchaseDetailPage = lazy(() => import('@/features/purchases/PurchaseDetailPage').then((m) => ({ default: m.PurchaseDetailPage })));
const LogPurchasePage = lazy(() => import('@/features/purchases/LogPurchasePage').then((m) => ({ default: m.LogPurchasePage })));
const EditPurchasePage = lazy(() => import('@/features/purchases/EditPurchasePage').then((m) => ({ default: m.EditPurchasePage })));
```
```tsx
<Route path="/purchases" element={<PurchasesPage />} />
<Route path="/purchases/new" element={<LogPurchasePage />} />
<Route path="/purchases/:id" element={<PurchaseDetailPage />} />
<Route path="/purchases/:id/edit" element={<EditPurchasePage />} />
```
(Task 4 creates only `PurchasesPage`; add the other three lazy routes in Tasks 5–6 when their files exist — App.tsx must compile at every commit.)

- [ ] **Step 2: PurchasesPage structure** (follow OrdersPage/ProductionPage layout conventions — AppShell handles chrome):

  - `h1` **Purchases** (a11y smoke will assert `h1:has-text("Purchases")`).
  - Month selector: local `useState` month (`YYYY-MM`), default current; reuse `monthRange`, `previousMonth`, `nextMonth`, `formatMonthLabel`, `isCurrentMonth` from `@/features/reports/dateRange`. ‹ › buttons + label, matching the Reports `PeriodSelector` look (copy its markup shape, keep state local — no search params).
  - Month total in the `text-amount` token: `₹{monthTotal}` where `monthTotal = rows.reduce((s, r) => s + r.total, 0)` — format with the same `toLocaleString('en-IN')` idiom used by order totals (check `OrdersPage` for the exact formatter and reuse).
  - Segmented control `Receipts | Items` — two-button group styled like the Reports tablist (`role="tablist"` + `aria-selected`), local state, Receipts default. **The month selector + total render only on Receipts** (Items is all-time).
  - Search `<input className="input-shell" placeholder="Search item or shop">`, filters client-side (case-insensitive substring): Receipts → vendor name or any `item_name` matches; Items → name matches.
  - **Receipts view:** `groupByDay(filtered)` → day heading (format like the orders list's day headings — reuse its date formatter) + a `rounded-card bg-paper-elevated p-3` card per receipt: vendor name (semibold), meta line `{n} item{s} · {first two item names}…`, total right-aligned `tabular-nums`. Whole card wraps in `<Link to={`/purchases/${r.id}`}>`.
  - **Items view:** `aggregateItems(await listAllItemEntries())` (fetch once on mount) → row per item: name, `Last: ₹{last.amount}{last.qty ? ` · ${last.qty} ${last.unit ?? ''}` : ''}` + derived `unitPrice` when qty present (`₹90/kg`), `{timesBought}×`, last vendor + date. Row is a `<button>` toggling inline expand: history list (date · vendor · qty unit · ₹amount · unit price), max ~10 entries, `text-small`.
  - Empty states: Receipts → "No purchases this month yet." + the same CTA as below; Items → "Log your first purchase to start price memory."
  - Bottom CTA: full-width `.btn-primary`-styled `<Link to="/purchases/new">+ Log purchase</Link>` (mirror Production's "+ Log production" placement).
  - Data fetch: `listPurchases(monthRange(month))` on mount + on month change; refetch-on-tab-focus if the app has that idiom on other pages (check `OrdersPage` — copy whatever it does).

- [ ] **Step 3:** `npm run typecheck` + `npm run test:run` → green. `npm run dev`, manually hit `/purchases` (empty DB state renders, month nav works).

- [ ] **Step 4: Commit** — `feat(purchases): Purchases page (receipts + items views, month selector, search)`

---

### Task 5: `PurchaseDetailPage` (+ delete)

**Files:**
- Create: `src/features/purchases/PurchaseDetailPage.tsx`
- Modify: `src/App.tsx` (add the PurchaseDetailPage lazy import + route)

- [ ] **Step 1:** Mirror `OrderDetailPage` structure: fetch `getPurchase(id)`; not-found branch; header = vendor name + `purchased_on` (formatted) + note if present; line items list (name, `qty unit` when present, category badge — resolve `category_id` → name via `listPurchaseCategories()`, badge style `rounded-badge bg-paper-2 px-1.5 py-0.5 text-[11px] text-brown` like AggregatedSection's "by X" pill), amount right-aligned; computed total row (semibold, `text-amount`).
- [ ] **Step 2:** Actions: **Edit** → `<Link to={`/purchases/${id}/edit`}>` (secondary button style — copy OrderDetailPage's secondary buttons); **Delete purchase** → `confirm('Delete this purchase? This can\'t be undone.')` → `deletePurchase(id)` → `navigate('/purchases')`. Match OrderDetailPage's confirm-guard idiom exactly.
- [ ] **Step 3:** `npm run typecheck` → clean; manual check in dev (needs a hand-inserted row or wait for Task 6 form).
- [ ] **Step 4: Commit** — `feat(purchases): receipt detail with edit link + confirm-guarded delete`

---

### Task 6: Log/Edit purchase form

**Files:**
- Create: `src/features/purchases/LogPurchasePage.tsx`
- Create: `src/features/purchases/EditPurchasePage.tsx`
- Create: `src/features/purchases/VendorPicker.tsx`
- Create: `src/features/purchases/CategoryChipPicker.tsx`
- Modify: `src/App.tsx` (remaining two lazy routes)

This is the biggest task. Follow `AddOrderPage` / `EditOrderPage` split (two files, shared pieces imported).

- [ ] **Step 1: `VendorPicker`** — pattern: `CustomerSearchPicker`, minus the modal. State: `{ id: string | null; name: string }`. Debounced `searchVendors(q)` (reuse `useDebouncedValue` — same import CustomerSearchPicker uses); result rows select a vendor; when `q.trim()` matches nothing, show a row `Use "{q}" as new vendor` which selects `{ id: null, name: q.trim() }`. Selected state shows name + "Change" (like CustomerSearchPicker's summary card).

- [ ] **Step 2: `CategoryChipPicker`** — exact clone of `ChannelChipPicker` against `listPurchaseCategories` / `createPurchaseCategory` (20-char inline add, auto-select on create, 23505 message surfaced). Render chips in a single `flex gap-2 overflow-x-auto` row (no wrap — keeps item rows compact).

- [ ] **Step 3: `LogPurchasePage`** — state:

```tsx
type DraftItem = {
  item_name: string;
  qty: string;
  unit: string;
  amount: string;
  category_id: string | null; // null until categories load; default = 'Other''s id
  hint: ItemEntry | null;     // last-purchase memory for the typed name
};
```

  - Sections top-to-bottom: **From** (VendorPicker) → **Date** (`<input type="date" className="input-shell">`, default `todayInTz()`) → **Items** (DraftItem rows) → **Note** (optional, input-shell) → live total (`receiptTotal` over valid rows) → `.btn-primary` **Save purchase** (disabled until vendor + ≥1 valid item).
  - Each item row is a small card (`rounded-card bg-paper-elevated p-3 space-y-2`):
    - Line 1: item name `<input className="input-shell">` + `✕` remove (disabled at one row — AddOrderPage `:335-343` idiom).
    - Line 2: `grid grid-cols-[64px_72px_1fr] gap-2` → qty (`type="number"`, `inputMode="decimal"`, placeholder "Qty"), unit (placeholder "kg / pkt"), amount (`inputMode="numeric"`, placeholder "₹", required).
    - Line 3: `CategoryChipPicker`.
    - Line 4 (conditional): the memory hint. On item-name change, debounce 300 ms → `getLastItemEntry(name)`; when found set `hint` and **auto-fill `unit` (if empty) and `category_id`** from it. Render: `<p className="text-small text-ink-2">Last: ₹450 · 5 kg · Ram Kirana · 12 Jun</p>` (format date with the app's short-date formatter; omit qty segment when null).
    - Item-name suggestions: on ≥2 chars show up to 5 `getItemSuggestions(q)` names as tappable rows under the input (same dropdown look as VendorPicker results); tapping fills name + unit + category and sets the hint.
  - `+ Add another item` button (AddOrderPage `:346-352` style).
  - Validation → `PurchaseItemInput[]`: trim name (required), `Number(amount)` finite ≥ 0 required, qty empty→null else `Number()` > 0, unit empty→null. Mirror AddOrderPage `:118-127` shape.
  - Save: `createPurchase(...)` → `navigate('/purchases')`. Surface errors like AddOrderPage does (inline `<p>` error, keep drafts).
  - **Prefill (Task 8 dependency):** read `useLocation().state?.prefill` typed as `{ vendorName?: string; itemName?: string; qty?: number; unit?: string; category?: string } | undefined`. If present: seed VendorPicker query/name, first DraftItem name/qty/unit, and after categories load resolve `category` (name) → id. Missing/undefined state must fall through to a plain blank form (deep-link refresh).

- [ ] **Step 4: `EditPurchasePage`** — load `getPurchase(id)`, seed the same draft state (amounts back to strings), same form; save via `updatePurchase(id, input)` → `navigate(`/purchases/${id}`)`. Title "Edit purchase".

- [ ] **Step 5:** `npm run typecheck` + `npm run test:run` → green. Dev-server pass: create a 2-item receipt end-to-end, re-open form and type the same item name → hint appears, edit it, delete it.

- [ ] **Step 6: Commit** — `feat(purchases): log/edit purchase form with vendor+item memory and category chips`

---

### Task 7: Six-tab nav (Make / Buy)

**Files:**
- Modify: `src/components/BottomNav.tsx`
- Modify: `scripts/smoke-test-walking-skeleton.py:26` (TABS list)
- Check/modify: any smoke that clicks nav by the label "Production"

- [ ] **Step 1: BottomNav** — imports: add `ReceiptIndianRupee` to the lucide import (verify it exists in `lucide-react@0.469.0` — if the import fails to typecheck, use `ReceiptText`). TABS:

```tsx
const TABS = [
  { to: '/today', label: 'Today', Icon: Home },
  { to: '/orders', label: 'Orders', Icon: ShoppingBag },
  { to: '/customers', label: 'Customers', Icon: Users },
  { to: '/production', label: 'Make', Icon: Factory },
  { to: '/purchases', label: 'Buy', Icon: ReceiptIndianRupee },
  { to: '/reports', label: 'Reports', Icon: BarChart3 },
];
```

  Nav container: `grid-cols-5` → `grid-cols-6`. Label sizing: on the NavLink className replace `text-label uppercase` with `text-[9px] font-medium uppercase leading-[12px] tracking-[0.06em]` (arbitrary values local to BottomNav; **no token changes**). Badge logic (`/orders`) untouched.

- [ ] **Step 2: Verify at 360 px** — `npm run dev` + browser at 360×640 (or Playwright): all six labels on one line each, no wrap/ellipsis, CUSTOMERS fits. If CUSTOMERS still wraps, drop tracking to `tracking-[0.04em]` before shrinking font further.

- [ ] **Step 3: Smoke fixtures** — `smoke-test-walking-skeleton.py:26` → `TABS = ["Today", "Orders", "Customers", "Make", "Buy", "Reports"]` (and its docstring "5-tab" → "6-tab"). Then `grep -n "Production" scripts/*.py`: update only **nav-label clicks** (e.g. `nav ... text=Production` → `text=Make`); leave every `h1:has-text("Production")` untouched (the h1 keeps the full noun).

- [ ] **Step 4:** `npm run typecheck` → clean. **Step 5: Commit** — `feat(nav): six tabs — Production→Make label, new Buy tab (/purchases)`

---

### Task 8: From-other-makers → Log purchase shortcut

**Files:**
- Modify: `src/features/production/AggregatedSection.tsx`

- [ ] **Step 1:** Inside the row `<li>` (after the grid `<div>`, `AggregatedSection.tsx:23-38`), add:

```tsx
<Link
  to="/purchases/new"
  state={{
    prefill: {
      vendorName: r.source_maker_name ?? '',
      itemName: r.name,
      qty: r.committed_qty,
      unit: r.unit,
      category: 'Made products',
    },
  }}
  className="mt-1 inline-block text-small text-brand underline"
>
  Log purchase →
</Link>
```

(`import { Link } from 'react-router-dom'` at top.) The form's prefill handling was built in Task 6 Step 3.

- [ ] **Step 2:** Dev check: with an aggregated product having weekly demand (seed via `scripts/dev-seed.sql` if needed), tap the link → form arrives prefilled (vendor name, item, qty, unit, category = Made products).
- [ ] **Step 3:** `npm run typecheck`; **Commit** — `feat(production): log-purchase shortcut on from-other-makers rows`

---

### Task 9: Reports — Month "Spending" section

**Files:**
- Modify: `src/features/reports/api.ts` (add `getSpendingSummary`)
- Modify: `src/features/reports/MonthTab.tsx` (fetch + one section)

- [ ] **Step 1: `getSpendingSummary`** in `reports/api.ts`, shaped like `getOrderSummary` (`:152-192`):

```ts
export type SpendingSummary = {
  total_spend: number;
  by_category: { name: string; total: number }[]; // sorted desc
};

export async function getSpendingSummary(
  startInclusive: string,
  endExclusive: string,
): Promise<SpendingSummary>
// .from('purchases')
// .select('purchased_on, items:purchase_items(amount, category:purchase_categories(name))')
// .gte('purchased_on', startInclusive).lt('purchased_on', endExclusive)
// Flatten items, Number(amount), reduce into total + per-category-name map (import
// categoryTotals from '@/features/purchases/purchaseMath' rather than reimplementing).
```

- [ ] **Step 2: MonthTab** — extend the existing parallel fetch (`:315-316`) with `getSpendingSummary(cur)` + `getSpendingSummary(prior)`. Insert a new section between **Order summary** (ends `:545`) and **Channel breakdown** (`:548`):

```tsx
<ReportSection title="Spending">
  {/* headline: total spend + vs prior month (fmtPct(pctChange(prior.total_spend, cur.total_spend)) idiom, exactly like the Order summary tiles' comparison strings) */}
  {/* category breakdown: reuse StackedBar precisely the way Channel breakdown does (:548-566) — segments from by_category; plus the <ul> of name · ₹total rows */}
  {/* left-over line, only when both summaries loaded: */}
  <p className="text-body text-ink">
    Left over: ₹{(orderSummaryTotal - spending.total_spend).toLocaleString('en-IN')}
  </p>
  <p className="text-small text-ink-2">Sales − purchases. Before gas, transport, and time.</p>
</ReportSection>
```

  (`orderSummaryTotal` = the month's existing `total_value` already in state for Order summary. Negative left-over renders as-is with a `-` sign — no special styling.) Empty month (no purchases): render the section with "No purchases logged this month." — do NOT hide it (mom should see the feature exists).

- [ ] **Step 3:** `npm run typecheck` + `npm run test:run` → green; dev check on `/reports?tab=month`.
- [ ] **Step 4: Commit** — `feat(reports): month Spending section (total, category split, left-over line)`

---

### Task 10: Smokes — a11y route + `verify-purchases-flow.py`

**Files:**
- Modify: `scripts/verify-a11y.py:42-50` — append `("/purchases", "purchases", 'h1:has-text("Purchases")'),`
- Create: `scripts/verify-purchases-flow.py`

- [ ] **Step 1: New smoke.** Copy the scaffolding (creds loader, login, console-error capture, screenshots dir, `--url` arg) from `scripts/verify-discounts-flow.py` — including its **REST cleanup helper** (authed PostgREST calls). Flow, all in `try/finally` with unique names (`f"SmokeVendor {int(time.time())}"`, `f"SmokeItem {ts}"`):
  1. Login → goto `/purchases` → assert `h1:has-text("Purchases")`.
  2. Tap `+ Log purchase` → fill vendor (new-vendor row), keep default date, item 1: name `SmokeItem {ts}`, qty `5`, unit `kg`, amount `450`, category **Packaging** (chip tap); `+ Add another item` → item 2: name only + amount `50` (no qty — exercises nullable path). Save.
  3. Assert list shows the receipt card (vendor name visible, total `500` rendered) and the month total includes it.
  4. Tap `+ Log purchase` again → type the same item name → assert the `Last: ₹450 · 5 kg` hint text appears → cancel/back.
  5. Open the receipt → assert detail total `500` → Edit → change item 2 amount to `75` → save → detail shows `525`.
  6. Items view: switch segment → assert `SmokeItem {ts}` row with `2×`.
  7. Delete: detail → Delete (accept `confirm` via `page.on("dialog", ...)`) → back on `/purchases`, receipt gone.
  8. `finally`: REST-delete any leftover `purchases` (by vendor), then the vendor row, then any `SmokeItem`-named `purchase_items` orphans (defensive), then any smoke-created categories (there are none — smoke only uses seeded categories).
  9. Fail on captured console errors (same pattern as other smokes).
- [ ] **Step 2:** Run against prod build: `npm run build`, then use `scripts/with_server.py` (webapp-testing skill) with `npm run preview` on :4173 → `python scripts/verify-purchases-flow.py --url http://localhost:4173` → PASS.
- [ ] **Step 3: Commit** — `test(purchases): behaviour smoke + a11y route`

---

### Final gate (orchestrator-level, after all tasks)

Architectural change (BottomNav + routes) ⇒ per CLAUDE.md: `npm run typecheck` + `npm run test:run` + `npm run build`, then the **full smoke set** against the preview build — `verify-launch-readiness.py` on **chromium + firefox + webkit**, plus `verify-purchases-flow.py`, `verify-reports-flow.py`, `verify-a11y.py`, `verify-bill-flow.py`, `verify-customer-flow.py`, `verify-events-flow.py`, `verify-settings-flow.py`, `verify-inline-add-customer.py`, `verify-revert-flow.py`, `verify-discounts-flow.py`, `verify-exhibition-repeat.py` (chromium). Then advisor review against the spec. No push.
