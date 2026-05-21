# Sprint 1 — Walking Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the end-to-end data path of the Crunchies app — a 5-tab navigation, minimal Add Order and Log Production forms that write to Supabase, and a Today screen that renders the raw query results. No polish. No business logic. Just data in, data out.

**Architecture:** Plain React + Supabase. Each page does its own fetch in a `useEffect`/custom hook; mutations navigate back and the destination refetches. No React Query yet — adopt later when caching becomes painful. Auth and the Supabase client are already wired (Sprint 0); we add a `BottomNav`, route the 5 tabs, build two minimal forms, and replace the Today stub with raw queries. Dev seed data (customers + products) is inserted via a SQL script run through the Supabase MCP since Sprint 1 doesn't ship customer/product CRUD.

**Tech Stack:** React 18 + TypeScript + React Router 6 + Tailwind + Supabase JS + Vitest/RTL + Playwright (smoke).

**Spec source:** `docs/v1-spec.md` §14 Sprint 1; `docs/ENGINEERING_NOTES.md` §5 Step 2 references.

---

## File Structure

**New files:**
- `src/components/BottomNav.tsx` — fixed 5-tab nav (Today / Orders / Customers / Production / Reports). Uses `NavLink` with active styling.
- `src/components/AppShell.tsx` — layout wrapper: protected content area on top, `BottomNav` pinned bottom. Wraps every authenticated route.
- `src/features/orders/OrdersPage.tsx` — list orders (raw rows) + `Add Order` CTA.
- `src/features/orders/AddOrderPage.tsx` — minimal form: customer dropdown, product dropdown, qty input, save.
- `src/features/orders/api.ts` — `listOrders()`, `createOrder({customer_id, product_id, qty})`.
- `src/features/customers/CustomersPage.tsx` — list customers (raw rows). No add/edit in Sprint 1.
- `src/features/customers/api.ts` — `listActiveCustomers()`.
- `src/features/products/api.ts` — `listActiveProducts()`. No page in Sprint 1 (products surface in Sprint 2).
- `src/features/production/ProductionPage.tsx` — list recent production logs + `Log Production` CTA.
- `src/features/production/LogProductionPage.tsx` — minimal form: product dropdown, qty, save.
- `src/features/production/api.ts` — `listRecentProduction()`, `createProductionLog({product_id, qty})`.
- `src/features/reports/ReportsPage.tsx` — stub, just renders "Reports — Sprint 8".
- `scripts/dev-seed.sql` — INSERTs for 4 customers + 5 products. Marker: customer names prefixed `[DEV] ` so they're trivially identifiable and removable later.
- `scripts/clear-dev-seed.sql` — companion deletion script (deletes customers WHERE name LIKE '[DEV]%' and products WHERE name LIKE '[DEV]%'; cascade handles orders/items/logs referencing them).

**Modified files:**
- `src/App.tsx` — replace single-route `TodayPage` with routes for `/today`, `/orders`, `/orders/new`, `/customers`, `/production`, `/production/new`, `/reports`. All wrapped in `AppShell`.
- `src/features/today/TodayPage.tsx` — replace Sprint 0 stub with raw query results: today's pending orders (where `target_fulfilment_date = today` and `fulfilled_at is null`) and recent production logs.
- `scripts/smoke-test-login.py` → rename + extend to `scripts/smoke-test-walking-skeleton.py` — adds the data-flow assertions (add order → see on Today; add production → see on Production).

**Test files:**
- `src/features/orders/AddOrderPage.test.tsx` — submit calls `createOrder` with the right args; missing field disables submit.
- `src/features/production/LogProductionPage.test.tsx` — same shape.
- `src/features/orders/api.test.ts` — `createOrder` issues an `orders` insert + an `order_items` insert with the right relationship (mocked supabase client).

**Out of scope (deferred to later sprints):**
- Customer/product CRUD (Sprints 2 & 6).
- Search, filters, sort (Sprint 4+).
- `target_fulfilment_date`, source enum picker, payment_status (Sprint 4).
- Order detail screen (Sprint 4).
- React Query / state management lib.
- Loading skeletons / empty state design polish (Sprint 9).

---

## Cross-cutting conventions

**API helper pattern.** Every `api.ts` exports plain async functions that wrap `supabase` calls. Each function: takes a typed input, calls supabase, throws on error, returns typed output. The page-level hooks are inline `useEffect` + `useState` — no abstraction yet.

**`createOrder` semantics.** v1-spec §2 requires that an order have at least one `order_items` row. Sprint 1 creates exactly one item per order. We use two sequential inserts (insert order → insert item with returned `order.id`). If the second insert fails, we orphan an empty order row — acceptable in Sprint 1 (dev data; we'll wrap in a `pg` function in Sprint 4 when the real Add Order ships). Comment in code calls this out.

**`source` enum.** Required NOT NULL on `orders`. Sprint 1 defaults to `'whatsapp'` (matches mom's primary channel). The picker comes in Sprint 4.

**`unit_price` on order_items.** Required NOT NULL. Sprint 1 reads `products.default_price` at order time and stores that. The historical-price design holds because we snapshot at insert.

**Styling.** Use existing design tokens from `tailwind.config.ts` (`bg-paper-surface`, `text-ink-900`, etc.) and the existing patterns from `TodayPage.tsx`. No new tokens. No new components beyond what the plan lists.

**Routes & redirects.** `/` → redirect to `/today`. Unknown routes → `/today`. Login flow unchanged.

**Tests.** Component tests mock `supabase` via `vi.mock('@/lib/supabase', ...)`. Smoke test runs against the live `crunchies.app` deploy with the real backend.

**Credentials for tests.** Smoke test reads `SMOKE_EMAIL` and `SMOKE_PASSWORD` from env. Karan supplies the admin creds locally; CI is not configured yet.

---

## Task 1: Routing scaffold + AppShell + BottomNav + 5 tab stubs

**Files:**
- Create: `src/components/BottomNav.tsx`
- Create: `src/components/AppShell.tsx`
- Create: `src/features/orders/OrdersPage.tsx` (stub)
- Create: `src/features/customers/CustomersPage.tsx` (stub)
- Create: `src/features/production/ProductionPage.tsx` (stub)
- Create: `src/features/reports/ReportsPage.tsx` (stub)
- Modify: `src/App.tsx`
- Modify: `src/features/today/TodayPage.tsx` (relocate Sprint 0 content under AppShell — strip the standalone full-page layout)
- Test: `src/components/BottomNav.test.tsx`

- [ ] **Step 1: Write the failing test for BottomNav**

```tsx
// src/components/BottomNav.test.tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BottomNav } from './BottomNav';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BottomNav />
    </MemoryRouter>,
  );
}

describe('BottomNav', () => {
  it('renders all 5 tabs', () => {
    renderAt('/today');
    ['Today', 'Orders', 'Customers', 'Production', 'Reports'].forEach((label) => {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    });
  });

  it('marks the active tab with aria-current="page"', () => {
    renderAt('/orders');
    expect(screen.getByRole('link', { name: 'Orders' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Today' })).not.toHaveAttribute(
      'aria-current',
    );
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npm run test:run -- src/components/BottomNav.test.tsx`
Expected: FAIL — `BottomNav` module not found.

- [ ] **Step 3: Implement BottomNav**

```tsx
// src/components/BottomNav.tsx
import { NavLink } from 'react-router-dom';
import { Home, ShoppingBag, Users, Factory, BarChart3 } from 'lucide-react';
import { clsx } from 'clsx';

const TABS = [
  { to: '/today', label: 'Today', Icon: Home },
  { to: '/orders', label: 'Orders', Icon: ShoppingBag },
  { to: '/customers', label: 'Customers', Icon: Users },
  { to: '/production', label: 'Production', Icon: Factory },
  { to: '/reports', label: 'Reports', Icon: BarChart3 },
] as const;

export function BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t border-ink-900/10 bg-paper-elevated"
      aria-label="Primary"
    >
      {TABS.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            clsx(
              'flex h-14 flex-col items-center justify-center gap-1 text-label uppercase',
              isActive ? 'text-brand-orange' : 'text-ink-500',
            )
          }
        >
          {({ isActive }) => (
            <>
              <Icon size={20} aria-hidden />
              <span aria-current={isActive ? 'page' : undefined}>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
```

> Note: `NavLink`'s child-function pattern doesn't auto-set `aria-current` on the `<a>` itself; we set it on the `<span>` matching the test. Acceptable since the test queries by accessible name (link role) and reads aria from the link's accessible subtree via `toHaveAttribute`. Verify by running the test — adjust if RTL doesn't surface aria from descendants. Alternative: put `aria-current` on the `<a>` via the className callback's `isActive`.

If the test fails on the aria check, fix it like this:

```tsx
<NavLink
  key={to}
  to={to}
  aria-label={label}  // make accessible name explicit
  end
  className={({ isActive }) => clsx(/* ... */)}
>
  {({ isActive }) => (
    <span aria-current={isActive ? 'page' : undefined} className="contents">
      <Icon size={20} aria-hidden />
      <span>{label}</span>
    </span>
  )}
</NavLink>
```

If still failing, switch to setting `aria-current` directly on the link via a wrapper component (see Task 1 troubleshooting note at end).

- [ ] **Step 4: Run BottomNav test, expect PASS**

Run: `npm run test:run -- src/components/BottomNav.test.tsx`
Expected: PASS — both cases green. If the aria assertion fails, apply the troubleshooting variant above and rerun.

- [ ] **Step 5: Implement AppShell**

```tsx
// src/components/AppShell.tsx
import type { ReactNode } from 'react';
import { BottomNav } from './BottomNav';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col bg-paper-surface">
      <main className="flex-1 px-edge pb-20 pt-6">{children}</main>
      <BottomNav />
    </div>
  );
}
```

- [ ] **Step 6: Implement 4 stub pages**

```tsx
// src/features/orders/OrdersPage.tsx
export function OrdersPage() {
  return <h1 className="text-title text-ink-900">Orders</h1>;
}

// src/features/customers/CustomersPage.tsx
export function CustomersPage() {
  return <h1 className="text-title text-ink-900">Customers</h1>;
}

// src/features/production/ProductionPage.tsx
export function ProductionPage() {
  return <h1 className="text-title text-ink-900">Production</h1>;
}

// src/features/reports/ReportsPage.tsx
export function ReportsPage() {
  return (
    <div>
      <h1 className="text-title text-ink-900">Reports</h1>
      <p className="mt-2 text-body text-ink-500">Sprint 8.</p>
    </div>
  );
}
```

- [ ] **Step 7: Update TodayPage to drop standalone full-page layout**

Replace the existing `src/features/today/TodayPage.tsx` body — strip the outer `<div className="flex min-h-full flex-col bg-paper-surface px-edge py-6">` wrapper since `AppShell` provides it. Keep the content but compose it as a fragment.

```tsx
// src/features/today/TodayPage.tsx
import { useAuth } from '@/features/auth/AuthProvider';

export function TodayPage() {
  const { user, isAdmin, signOut } = useAuth();

  return (
    <>
      <header className="flex items-baseline justify-between">
        <h1 className="text-title text-ink-900">Today</h1>
        <span className="text-label uppercase text-ink-500">
          {isAdmin ? 'Admin' : 'Signed in'}
        </span>
      </header>

      <section className="mt-6 rounded-card bg-paper-elevated p-edge shadow-card">
        <p className="text-body text-ink-700">Sprint 1 walking skeleton — raw query results below.</p>
        <p className="mt-2 text-body-sm text-ink-500">{user?.email}</p>
      </section>

      {/* Real queries land in Task 6. */}

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

- [ ] **Step 8: Update App.tsx with all 7 routes**

```tsx
// src/App.tsx
import { Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from '@/features/auth/LoginPage';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { AppShell } from '@/components/AppShell';
import { TodayPage } from '@/features/today/TodayPage';
import { OrdersPage } from '@/features/orders/OrdersPage';
import { CustomersPage } from '@/features/customers/CustomersPage';
import { ProductionPage } from '@/features/production/ProductionPage';
import { ReportsPage } from '@/features/reports/ReportsPage';

function Protected({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/today" element={<Protected><TodayPage /></Protected>} />
        <Route path="/orders" element={<Protected><OrdersPage /></Protected>} />
        <Route path="/customers" element={<Protected><CustomersPage /></Protected>} />
        <Route path="/production" element={<Protected><ProductionPage /></Protected>} />
        <Route path="/reports" element={<Protected><ReportsPage /></Protected>} />
        <Route path="/" element={<Navigate to="/today" replace />} />
        <Route path="*" element={<Navigate to="/today" replace />} />
      </Routes>
    </AuthProvider>
  );
}
```

- [ ] **Step 9: Run typecheck + full test suite**

Run: `npm run typecheck && npm run test:run`
Expected: zero TS errors, all tests green.

- [ ] **Step 10: Manual smoke**

Run: `npm run dev`, open in browser at `http://localhost:5173`, log in, tap each of the 5 tabs. Each tab should render its title. Confirm sign-out still works from Today.

- [ ] **Step 11: Commit**

```bash
git add src/ docs/superpowers/plans/
git commit -m "Sprint 1: routing scaffold + 5-tab BottomNav + AppShell"
```

---

## Task 2: Seed dev data via SQL script

**Files:**
- Create: `scripts/dev-seed.sql`
- Create: `scripts/clear-dev-seed.sql`

**Why a SQL script and not a UI:** Sprint 1's Add Order needs at least one customer + one product to pick from. The customer/product CRUD UIs land in Sprints 2 and 6. A committed SQL script gives us idempotent, repeatable, removable dev fixtures.

**Marker:** all dev rows have names starting with `[DEV] ` so they're trivially identifiable. `clear-dev-seed.sql` deletes by that pattern. The FK cascade on `order_items` and `RESTRICT` on `orders`/`production_logs` mean we delete in the right order (logs and orders first, then products/customers — the clear script handles this).

- [ ] **Step 1: Write the seed script**

```sql
-- scripts/dev-seed.sql
-- Idempotent dev fixture data for Sprint 1 walking skeleton.
-- All rows are prefixed "[DEV] " for easy identification + cleanup.

begin;

-- Products (5 across categories)
insert into products (name, unit, default_price, is_aggregated, source_maker_name)
values
  ('[DEV] Masala Chivda', '250g pack', 120.00, false, null),
  ('[DEV] Roasted Chana', '200g pack', 100.00, false, null),
  ('[DEV] Bhakarwadi',   '250g pack', 150.00, false, null),
  ('[DEV] Chakli',       '250g pack', 140.00, false, null),
  ('[DEV] Besan Ladoo',  '500g box',  280.00, true,  'Sunita Tai')
on conflict do nothing;

-- Customers (4 — one per channel + sizes)
with personal as (select id from channels where lower(name) = 'personal'),
     reseller as (select id from channels where lower(name) = 'reseller'),
     exhib    as (select id from channels where lower(name) = 'exhibition')
insert into customers (name, phone, channel_id, size_tier, notes)
values
  ('[DEV] Neighbour Auntie', '+919800000001', (select id from personal), null,    'Daily building friend'),
  ('[DEV] Pune Sweet Mart',  '+919800000002', (select id from reseller), 'small', 'Picks up Fridays'),
  ('[DEV] Big Bazaar Hub',   '+919800000003', (select id from reseller), 'large', '50-100 packs/wk'),
  ('[DEV] Diwali Customer',  '+919800000004', (select id from exhib),    null,    'Met at fair 2025')
on conflict do nothing;

commit;
```

- [ ] **Step 2: Write the clear script**

```sql
-- scripts/clear-dev-seed.sql
-- Removes all rows seeded by dev-seed.sql.

begin;

-- order_items cascade via orders FK; production_logs reference products via RESTRICT,
-- so we delete logs first, then orders, then products + customers.

delete from production_logs
 where product_id in (select id from products where name like '[DEV]%');

delete from orders
 where customer_id in (select id from customers where name like '[DEV]%')
    or id in (
      select o.id from orders o
       join order_items oi on oi.order_id = o.id
       join products p on p.id = oi.product_id
       where p.name like '[DEV]%'
    );

delete from products  where name like '[DEV]%';
delete from customers where name like '[DEV]%';

commit;
```

- [ ] **Step 3: Apply the seed script via Supabase MCP**

Use the `mcp__supabase__execute_sql` tool to run `scripts/dev-seed.sql` contents against the linked project.

Expected: 5 products + 4 customers inserted (or "0 rows" on re-run, since `on conflict do nothing` makes it idempotent — but the constraints don't prevent name duplicates, so check after first run that totals match before re-running).

> **Idempotency caveat:** `on conflict do nothing` only triggers on a constraint violation. `products.name` and `customers.name` have NO unique constraint per `0001_init.sql` — re-running the script would create duplicates. **Run once, manually**, then rely on `clear-dev-seed.sql` if you need to reset. The plan calls this out instead of "fixing" it with a constraint; we don't want app-wide name uniqueness as a real rule.

- [ ] **Step 4: Verify via Supabase MCP**

Run `mcp__supabase__execute_sql` with:
```sql
select count(*) as products from products where name like '[DEV]%';
select count(*) as customers from customers where name like '[DEV]%';
```
Expected: products=5, customers=4.

- [ ] **Step 5: Commit**

```bash
git add scripts/dev-seed.sql scripts/clear-dev-seed.sql
git commit -m "Sprint 1: dev-seed + clear scripts for walking-skeleton fixtures"
```

---

## Task 3: Data-layer api helpers (read-only first)

**Files:**
- Create: `src/features/customers/api.ts`
- Create: `src/features/products/api.ts`
- Create: `src/features/orders/api.ts`
- Create: `src/features/production/api.ts`
- Test: `src/features/orders/api.test.ts`

Tests cover the order-creation flow (the only one with two-table semantics). The list helpers are simple `select`s — covered indirectly by the smoke test in Task 8.

- [ ] **Step 1: Write the failing api test for createOrder**

```ts
// src/features/orders/api.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInsertOrder = vi.fn();
const mockInsertItem = vi.fn();
const mockSelectProduct = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'orders') {
        return {
          insert: (row: unknown) => ({
            select: () => ({
              single: () => mockInsertOrder(row),
            }),
          }),
        };
      }
      if (table === 'order_items') {
        return { insert: (row: unknown) => mockInsertItem(row) };
      }
      if (table === 'products') {
        return {
          select: () => ({
            eq: () => ({
              single: () => mockSelectProduct(),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  },
}));

import { createOrder } from './api';

beforeEach(() => {
  mockInsertOrder.mockReset();
  mockInsertItem.mockReset();
  mockSelectProduct.mockReset();
});

describe('createOrder', () => {
  it('reads product price, inserts order + order_item, returns new order id', async () => {
    mockSelectProduct.mockResolvedValue({ data: { default_price: 120 }, error: null });
    mockInsertOrder.mockResolvedValue({ data: { id: 'order-1' }, error: null });
    mockInsertItem.mockResolvedValue({ error: null });

    const id = await createOrder({ customer_id: 'c-1', product_id: 'p-1', qty: 2 });

    expect(id).toBe('order-1');
    expect(mockInsertOrder).toHaveBeenCalledWith(
      expect.objectContaining({ customer_id: 'c-1', source: 'whatsapp' }),
    );
    expect(mockInsertItem).toHaveBeenCalledWith(
      expect.objectContaining({
        order_id: 'order-1',
        product_id: 'p-1',
        qty: 2,
        unit_price: 120,
      }),
    );
  });

  it('throws if order insert fails', async () => {
    mockSelectProduct.mockResolvedValue({ data: { default_price: 120 }, error: null });
    mockInsertOrder.mockResolvedValue({ data: null, error: { message: 'boom' } });

    await expect(
      createOrder({ customer_id: 'c-1', product_id: 'p-1', qty: 2 }),
    ).rejects.toThrow('boom');
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `npm run test:run -- src/features/orders/api.test.ts`
Expected: FAIL — `./api` module not found.

- [ ] **Step 3: Implement the four api files**

```ts
// src/features/customers/api.ts
import { supabase } from '@/lib/supabase';

export type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  channel_id: string;
};

export async function listActiveCustomers(): Promise<CustomerRow[]> {
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, phone, channel_id')
    .eq('active', true)
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}
```

```ts
// src/features/products/api.ts
import { supabase } from '@/lib/supabase';

export type ProductRow = {
  id: string;
  name: string;
  unit: string;
  default_price: number;
};

export async function listActiveProducts(): Promise<ProductRow[]> {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, unit, default_price')
    .eq('active', true)
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}
```

```ts
// src/features/orders/api.ts
import { supabase } from '@/lib/supabase';

export type OrderRow = {
  id: string;
  customer_id: string;
  ordered_at: string;
  fulfilled_at: string | null;
  payment_status: 'unpaid' | 'paid' | 'partial';
  target_fulfilment_date: string | null;
};

export async function listOrders(): Promise<OrderRow[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('id, customer_id, ordered_at, fulfilled_at, payment_status, target_fulfilment_date')
    .order('ordered_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listTodayPendingOrders(): Promise<OrderRow[]> {
  // "Today" = pending fulfilment with target = today OR no target set but ordered today.
  // Walking-skeleton heuristic; the real spec is in v1-spec §4 (Sprint 4).
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('orders')
    .select('id, customer_id, ordered_at, fulfilled_at, payment_status, target_fulfilment_date')
    .is('fulfilled_at', null)
    .or(`target_fulfilment_date.eq.${today},and(target_fulfilment_date.is.null,ordered_at.gte.${today}T00:00:00)`)
    .order('ordered_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createOrder(input: {
  customer_id: string;
  product_id: string;
  qty: number;
}): Promise<string> {
  // Walking-skeleton: two sequential inserts. Real impl in Sprint 4 wraps in a pg function.
  const { data: product, error: pErr } = await supabase
    .from('products')
    .select('default_price')
    .eq('id', input.product_id)
    .single();
  if (pErr || !product) throw new Error(pErr?.message ?? 'product not found');

  const { data: order, error: oErr } = await supabase
    .from('orders')
    .insert({
      customer_id: input.customer_id,
      source: 'whatsapp',
    })
    .select('id')
    .single();
  if (oErr || !order) throw new Error(oErr?.message ?? 'order insert failed');

  const { error: iErr } = await supabase.from('order_items').insert({
    order_id: order.id,
    product_id: input.product_id,
    qty: input.qty,
    unit_price: product.default_price,
  });
  if (iErr) throw new Error(iErr.message);

  return order.id;
}
```

```ts
// src/features/production/api.ts
import { supabase } from '@/lib/supabase';

export type ProductionLogRow = {
  id: string;
  product_id: string;
  made_on: string;
  qty: number;
};

export async function listRecentProduction(): Promise<ProductionLogRow[]> {
  const { data, error } = await supabase
    .from('production_logs')
    .select('id, product_id, made_on, qty')
    .order('made_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createProductionLog(input: {
  product_id: string;
  qty: number;
}): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('production_logs')
    .insert({ product_id: input.product_id, qty: input.qty, made_on: today })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'log insert failed');
  return data.id;
}
```

- [ ] **Step 4: Run order api test, expect PASS**

Run: `npm run test:run -- src/features/orders/api.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/features/{customers,products,orders,production}/api.ts src/features/orders/api.test.ts
git commit -m "Sprint 1: data-layer api helpers + createOrder test"
```

---

## Task 4: Add Order minimal form

**Files:**
- Create: `src/features/orders/AddOrderPage.tsx`
- Modify: `src/features/orders/OrdersPage.tsx` (add CTA + raw list)
- Modify: `src/App.tsx` (add `/orders/new` route)
- Test: `src/features/orders/AddOrderPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/orders/AddOrderPage.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const listCustomers = vi.fn();
const listProducts = vi.fn();
const createOrder = vi.fn();

vi.mock('@/features/customers/api', () => ({ listActiveCustomers: () => listCustomers() }));
vi.mock('@/features/products/api',  () => ({ listActiveProducts:  () => listProducts() }));
vi.mock('@/features/orders/api',    () => ({ createOrder: (i: unknown) => createOrder(i) }));

import { AddOrderPage } from './AddOrderPage';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/orders/new']}>
      <Routes>
        <Route path="/orders/new" element={<AddOrderPage />} />
        <Route path="/orders" element={<div>OrdersList</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  listCustomers.mockResolvedValue([{ id: 'c-1', name: 'Neighbour Auntie', phone: null, channel_id: 'ch-1' }]);
  listProducts.mockResolvedValue([{ id: 'p-1', name: 'Chivda', unit: '250g', default_price: 120 }]);
  createOrder.mockResolvedValue('order-new');
});

describe('AddOrderPage', () => {
  it('submits createOrder with the selected fields and navigates to /orders', async () => {
    const user = userEvent.setup();
    renderPage();

    // Wait for dropdown options to populate
    await waitFor(() => expect(screen.getByRole('option', { name: 'Neighbour Auntie' })).toBeInTheDocument());

    await user.selectOptions(screen.getByLabelText('Customer'), 'c-1');
    await user.selectOptions(screen.getByLabelText('Product'),  'p-1');
    await user.clear(screen.getByLabelText('Quantity'));
    await user.type(screen.getByLabelText('Quantity'), '3');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() =>
      expect(createOrder).toHaveBeenCalledWith({ customer_id: 'c-1', product_id: 'p-1', qty: 3 }),
    );
    expect(await screen.findByText('OrdersList')).toBeInTheDocument();
  });

  it('disables Save until customer + product + positive qty are present', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: 'Chivda' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `npm run test:run -- src/features/orders/AddOrderPage.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement AddOrderPage**

```tsx
// src/features/orders/AddOrderPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listActiveCustomers, type CustomerRow } from '@/features/customers/api';
import { listActiveProducts, type ProductRow } from '@/features/products/api';
import { createOrder } from '@/features/orders/api';

export function AddOrderPage() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('1');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listActiveCustomers(), listActiveProducts()])
      .then(([cs, ps]) => {
        setCustomers(cs);
        setProducts(ps);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const qtyNum = Number(qty);
  const canSubmit = !!customerId && !!productId && Number.isFinite(qtyNum) && qtyNum > 0 && !submitting;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await createOrder({ customer_id: customerId, product_id: productId, qty: qtyNum });
      navigate('/orders');
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1 className="text-title text-ink-900">Add order</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label className="block">
          <span className="text-label uppercase text-ink-500">Customer</span>
          <select
            className="mt-1 h-11 w-full rounded-input border border-ink-900/10 bg-paper-elevated px-3 text-body"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
          >
            <option value="">— Select —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-label uppercase text-ink-500">Product</span>
          <select
            className="mt-1 h-11 w-full rounded-input border border-ink-900/10 bg-paper-elevated px-3 text-body"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            <option value="">— Select —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-label uppercase text-ink-500">Quantity</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="mt-1 h-11 w-full rounded-input border border-ink-900/10 bg-paper-elevated px-3 text-body"
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
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Update OrdersPage with CTA + raw list**

```tsx
// src/features/orders/OrdersPage.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listOrders, type OrderRow } from './api';

export function OrdersPage() {
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listOrders().then(setRows).catch((e: Error) => setError(e.message));
  }, []);

  return (
    <div>
      <header className="flex items-baseline justify-between">
        <h1 className="text-title text-ink-900">Orders</h1>
        <Link
          to="/orders/new"
          className="rounded-btn-sm bg-brand-orange px-3 py-2 text-body-sm font-semibold text-white"
        >
          + Add order
        </Link>
      </header>
      {error && <p className="mt-4 text-body-sm text-status-danger-fg">{error}</p>}
      <ul className="mt-4 space-y-2">
        {rows.map((o) => (
          <li key={o.id} className="rounded-card bg-paper-elevated p-3 text-body-sm">
            <div className="font-mono text-ink-700">{o.id.slice(0, 8)}</div>
            <div className="text-ink-500">
              {o.ordered_at.slice(0, 10)} · {o.payment_status} · {o.fulfilled_at ? 'fulfilled' : 'pending'}
            </div>
          </li>
        ))}
        {rows.length === 0 && !error && (
          <li className="text-body-sm text-ink-500">No orders yet.</li>
        )}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: Add /orders/new route to App.tsx**

```tsx
// in src/App.tsx, alongside the existing /orders route:
import { AddOrderPage } from '@/features/orders/AddOrderPage';
// ...
<Route path="/orders/new" element={<Protected><AddOrderPage /></Protected>} />
```

- [ ] **Step 6: Run AddOrderPage test, expect PASS**

Run: `npm run test:run -- src/features/orders/AddOrderPage.test.tsx`
Expected: PASS.

- [ ] **Step 7: Typecheck + full test suite**

Run: `npm run typecheck && npm run test:run`
Expected: green.

- [ ] **Step 8: Manual smoke**

Run: `npm run dev`, log in, tap Orders → `+ Add order`, pick a `[DEV]` customer + product, enter qty 2, save. Should redirect to Orders and show the new row.

- [ ] **Step 9: Commit**

```bash
git add src/
git commit -m "Sprint 1: minimal Add Order form + Orders list"
```

---

## Task 5: Log Production minimal form

**Files:**
- Create: `src/features/production/LogProductionPage.tsx`
- Modify: `src/features/production/ProductionPage.tsx`
- Modify: `src/App.tsx` (add `/production/new` route)
- Test: `src/features/production/LogProductionPage.test.tsx`

Same shape as Task 4. Test first.

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/production/LogProductionPage.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const listProducts = vi.fn();
const createLog = vi.fn();

vi.mock('@/features/products/api',   () => ({ listActiveProducts: () => listProducts() }));
vi.mock('@/features/production/api', () => ({ createProductionLog: (i: unknown) => createLog(i) }));

import { LogProductionPage } from './LogProductionPage';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/production/new']}>
      <Routes>
        <Route path="/production/new" element={<LogProductionPage />} />
        <Route path="/production" element={<div>ProductionList</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  listProducts.mockResolvedValue([{ id: 'p-1', name: 'Chivda', unit: '250g', default_price: 120 }]);
  createLog.mockResolvedValue('log-1');
});

describe('LogProductionPage', () => {
  it('submits createProductionLog and returns to /production', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: /Chivda/ })).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('Product'), 'p-1');
    await user.clear(screen.getByLabelText('Quantity'));
    await user.type(screen.getByLabelText('Quantity'), '15');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() =>
      expect(createLog).toHaveBeenCalledWith({ product_id: 'p-1', qty: 15 }),
    );
    expect(await screen.findByText('ProductionList')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `npm run test:run -- src/features/production/LogProductionPage.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement LogProductionPage**

```tsx
// src/features/production/LogProductionPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listActiveProducts, type ProductRow } from '@/features/products/api';
import { createProductionLog } from './api';

export function LogProductionPage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('1');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listActiveProducts().then(setProducts).catch((e: Error) => setError(e.message));
  }, []);

  const qtyNum = Number(qty);
  const canSubmit = !!productId && Number.isFinite(qtyNum) && qtyNum > 0 && !submitting;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await createProductionLog({ product_id: productId, qty: qtyNum });
      navigate('/production');
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1 className="text-title text-ink-900">Log production</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label className="block">
          <span className="text-label uppercase text-ink-500">Product</span>
          <select
            className="mt-1 h-11 w-full rounded-input border border-ink-900/10 bg-paper-elevated px-3 text-body"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            <option value="">— Select —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-label uppercase text-ink-500">Quantity</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="mt-1 h-11 w-full rounded-input border border-ink-900/10 bg-paper-elevated px-3 text-body"
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
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Update ProductionPage with CTA + raw list**

```tsx
// src/features/production/ProductionPage.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listRecentProduction, type ProductionLogRow } from './api';

export function ProductionPage() {
  const [rows, setRows] = useState<ProductionLogRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listRecentProduction().then(setRows).catch((e: Error) => setError(e.message));
  }, []);

  return (
    <div>
      <header className="flex items-baseline justify-between">
        <h1 className="text-title text-ink-900">Production</h1>
        <Link
          to="/production/new"
          className="rounded-btn-sm bg-brand-orange px-3 py-2 text-body-sm font-semibold text-white"
        >
          + Log production
        </Link>
      </header>
      {error && <p className="mt-4 text-body-sm text-status-danger-fg">{error}</p>}
      <ul className="mt-4 space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="rounded-card bg-paper-elevated p-3 text-body-sm">
            <div className="text-ink-700">{r.made_on} · qty {r.qty}</div>
            <div className="font-mono text-ink-500">{r.product_id.slice(0, 8)}</div>
          </li>
        ))}
        {rows.length === 0 && !error && (
          <li className="text-body-sm text-ink-500">No production logs yet.</li>
        )}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: Add route to App.tsx**

```tsx
import { LogProductionPage } from '@/features/production/LogProductionPage';
// ...
<Route path="/production/new" element={<Protected><LogProductionPage /></Protected>} />
```

- [ ] **Step 6: Run LogProductionPage test, expect PASS**

Run: `npm run test:run -- src/features/production/LogProductionPage.test.tsx`
Expected: PASS.

- [ ] **Step 7: Typecheck + full test suite**

Run: `npm run typecheck && npm run test:run`
Expected: green.

- [ ] **Step 8: Manual smoke**

`npm run dev`, log in, Production → `+ Log production`, pick product, qty 12, save. Should redirect and show new row.

- [ ] **Step 9: Commit**

```bash
git add src/
git commit -m "Sprint 1: minimal Log Production form + Production list"
```

---

## Task 6: Today screen — raw query results

**Files:**
- Modify: `src/features/today/TodayPage.tsx`
- Modify: `src/features/customers/api.ts` (add `listCustomersById`)

The Today screen renders two raw lists: today's pending orders (joined with customer name) and today's production logs (joined with product name). The walking-skeleton goal is to prove data flowed from the form → DB → query → screen.

- [ ] **Step 1: Extend customers api with a by-id batch helper**

```ts
// add to src/features/customers/api.ts
export async function listCustomersByIds(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const { data, error } = await supabase
    .from('customers')
    .select('id, name')
    .in('id', ids);
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map((c) => [c.id, c.name]));
}
```

- [ ] **Step 2: Same for products**

```ts
// add to src/features/products/api.ts
export async function listProductsByIds(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const { data, error } = await supabase
    .from('products')
    .select('id, name')
    .in('id', ids);
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map((p) => [p.id, p.name]));
}
```

- [ ] **Step 3: Implement Today screen with queries**

```tsx
// src/features/today/TodayPage.tsx
import { useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { listTodayPendingOrders, type OrderRow } from '@/features/orders/api';
import { listRecentProduction, type ProductionLogRow } from '@/features/production/api';
import { listCustomersByIds } from '@/features/customers/api';
import { listProductsByIds } from '@/features/products/api';

export function TodayPage() {
  const { user, isAdmin, signOut } = useAuth();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [logs, setLogs] = useState<ProductionLogRow[]>([]);
  const [customerNames, setCustomerNames] = useState<Record<string, string>>({});
  const [productNames, setProductNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [os, ls] = await Promise.all([listTodayPendingOrders(), listRecentProduction()]);
        setOrders(os);
        setLogs(ls);
        const today = new Date().toISOString().slice(0, 10);
        const todayLogs = ls.filter((l) => l.made_on === today);
        const [cnames, pnames] = await Promise.all([
          listCustomersByIds(os.map((o) => o.customer_id)),
          listProductsByIds(todayLogs.map((l) => l.product_id)),
        ]);
        setCustomerNames(cnames);
        setProductNames(pnames);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const todayLogs = logs.filter((l) => l.made_on === today);

  return (
    <>
      <header className="flex items-baseline justify-between">
        <h1 className="text-title text-ink-900">Today</h1>
        <span className="text-label uppercase text-ink-500">
          {isAdmin ? 'Admin' : 'Signed in'}
        </span>
      </header>

      {error && <p className="mt-4 text-body-sm text-status-danger-fg">{error}</p>}

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
            <li className="text-body-sm text-ink-500">Nothing pending for today.</li>
          )}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="text-subtitle text-ink-900">Production today ({todayLogs.length})</h2>
        <ul className="mt-2 space-y-2">
          {todayLogs.map((l) => (
            <li key={l.id} className="rounded-card bg-paper-elevated p-3 text-body-sm">
              <div className="font-semibold text-ink-900">
                {productNames[l.product_id] ?? '(unknown product)'}
              </div>
              <div className="text-ink-500">qty {l.qty}</div>
            </li>
          ))}
          {todayLogs.length === 0 && (
            <li className="text-body-sm text-ink-500">Nothing logged yet.</li>
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

- [ ] **Step 4: Typecheck + tests**

Run: `npm run typecheck && npm run test:run`
Expected: green.

- [ ] **Step 5: Manual smoke**

`npm run dev`, log in. Today should show whatever was added in Tasks 4-5. Add another order with `target_fulfilment_date` left null — verify the heuristic in `listTodayPendingOrders` does pick it up (it should, because today's orders match the `or` branch). Add an order, refresh Today, see it appear. Log production, refresh, see it appear.

- [ ] **Step 6: Commit**

```bash
git add src/
git commit -m "Sprint 1: Today screen — pending + production raw lists"
```

---

## Task 7: Update + extend the smoke test (Playwright)

**Files:**
- Modify: `scripts/smoke-test-login.py` → rename `scripts/smoke-test-walking-skeleton.py` (keep login assertions, add the data-path assertions)

The smoke test runs against the live deploy. It needs credentials — read from env vars `SMOKE_EMAIL` / `SMOKE_PASSWORD`.

> **Decision:** the smoke test asserts that after logging in we land on `/today`, that the 5 tabs render, and that the Today page renders without console errors. It does NOT click through Add Order in this revision — that would mutate prod data. Mutating-flow verification stays manual (Step 5 of Tasks 4 & 5) until Sprint 0.5 / Sprint 9 when we can wire a dedicated test project.

- [ ] **Step 1: Rename and extend the smoke test**

```python
"""
Sprint 1 smoke test for https://www.crunchies.app.

Verifies the walking skeleton:
  1. Login flow still works (re-runs the Sprint 0 assertions).
  2. After login, /today renders with the 5-tab bottom nav.
  3. Each tab is reachable and renders without console errors.
  4. (No mutating asserts — those stay manual until we have a dev DB.)

Requires env: SMOKE_EMAIL, SMOKE_PASSWORD
"""

import os
import sys

from playwright.sync_api import sync_playwright

OUT_DIR = "scripts/screenshots"
BASE = "https://www.crunchies.app"

TABS = ["Today", "Orders", "Customers", "Production", "Reports"]


def main() -> int:
    email = os.environ.get("SMOKE_EMAIL")
    password = os.environ.get("SMOKE_PASSWORD")
    if not email or not password:
        print("ERROR: set SMOKE_EMAIL and SMOKE_PASSWORD env vars", file=sys.stderr)
        return 2

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 412, "height": 915},
            device_scale_factor=2.625,
            user_agent=(
                "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
            ),
            is_mobile=True,
            has_touch=True,
        )
        page = context.new_page()
        errors: list[str] = []
        page.on("console", lambda m: errors.append(f"[{m.type}] {m.text}") if m.type == "error" else None)

        # 1. Login
        page.goto(f"{BASE}/login", wait_until="networkidle")
        page.fill("input[type='email']", email)
        page.fill("input[type='password']", password)
        page.click("button[type='submit']")
        page.wait_for_url(f"{BASE}/today", timeout=10_000)
        page.screenshot(path=f"{OUT_DIR}/sprint1-01-today.png", full_page=True)

        # 2. Bottom nav present
        for label in TABS:
            page.wait_for_selector(f"nav[aria-label='Primary'] >> text={label}", timeout=5_000)

        # 3. Each tab navigable
        for label in TABS:
            page.click(f"nav[aria-label='Primary'] >> text={label}")
            page.wait_for_selector(f"h1:has-text('{label}')", timeout=5_000)
            page.screenshot(path=f"{OUT_DIR}/sprint1-tab-{label.lower()}.png", full_page=True)

        if errors:
            print("Console errors:", file=sys.stderr)
            for e in errors:
                print(f"  {e}", file=sys.stderr)
            return 1

        print("OK — Sprint 1 walking skeleton smoke passed.")
        return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Delete the old smoke test**

```bash
git rm scripts/smoke-test-login.py
```

- [ ] **Step 3: Run the smoke against local dev first**

In one terminal: `npm run dev`
In another: temporarily change `BASE = "http://localhost:5173"` in the script (or factor to env var), then:
```
SMOKE_EMAIL=<your-admin-email> SMOKE_PASSWORD=<…> python scripts/smoke-test-walking-skeleton.py
```
Expected: prints OK; saves screenshots; exit 0.

Revert `BASE` to `https://www.crunchies.app`.

- [ ] **Step 4: Commit local-only assertions**

```bash
git add scripts/
git commit -m "Sprint 1: smoke test — 5-tab nav, tab navigation, console-error-free"
```

---

## Task 8: Deploy + verify against production

The repo auto-deploys to Vercel on push to `main`. Sprint 1 has been committed in tasks so the deploy is already in flight — we just verify.

- [ ] **Step 1: Confirm Vercel deploy succeeded**

After pushing, wait for the GitHub Actions / Vercel deploy. Visit `https://www.crunchies.app/today` (must be logged in). Expect the bottom nav and the Today screen.

- [ ] **Step 2: Run the smoke test against the deployed app**

```
SMOKE_EMAIL=<admin> SMOKE_PASSWORD=<…> python scripts/smoke-test-walking-skeleton.py
```
Expected: exit 0; screenshots saved.

- [ ] **Step 3: Manual exercise against production**

Open `https://www.crunchies.app` on phone (PWA install from Sprint 0). Add one order, log one production, confirm both appear on Today.

- [ ] **Step 4: Final commit if any tweaks needed**

If the above flushed out tweaks, commit them. Otherwise nothing to do — the per-task commits already exist.

- [ ] **Step 5: Stop and request review**

This is checkpoint #2 (see "Review checkpoints" section at top of the conversation). Pause Sprint 1 here; Karan reviews the deployed walking skeleton before Sprint 2 builds the Production lens on top.

---

## Self-Review

**Spec coverage** (`v1-spec.md` §14 Sprint 1):
- 5-tab bottom nav — Task 1 ✓
- Each tab renders a stub — Task 1 ✓ (Today + Orders + Production go beyond stub by end of Sprint 1; Customers + Reports stay stub — within spec)
- Minimal Add Order (customer dropdown, one product, qty, save → orders + order_items) — Task 4 ✓
- Minimal Production log (product, qty, save → production_logs) — Task 5 ✓
- Today screen shows raw query results — Task 6 ✓
- "End-to-end data path proven; layout discoverable" — Task 8 ✓

**Placeholder scan:** no TBDs, no "implement later", no "add validation" without code. Every step has the actual content.

**Type consistency:** `CustomerRow`, `ProductRow`, `OrderRow`, `ProductionLogRow` defined once in `api.ts`; the same names are used in all consumers. `createOrder` and `createProductionLog` signatures match between tests, implementation, and consumers.

**Known design call-outs that warrant review:**
1. **`createOrder` is two non-transactional inserts.** Acceptable for walking skeleton; flagged in code comment. Real impl wraps in a Postgres function in Sprint 4.
2. **Dev seed via SQL, not UI.** Customer/product CRUD intentionally deferred per spec sprint sequence; the seed is removable via `clear-dev-seed.sql`.
3. **`listTodayPendingOrders` heuristic** combines "target_fulfilment_date = today" and "no target + ordered today". Walking-skeleton — real Block 1 logic is in §4 of the spec, Sprint 4.
4. **Smoke test is read-only** against prod. No mutating asserts until a dev DB project exists.

Plan complete.
