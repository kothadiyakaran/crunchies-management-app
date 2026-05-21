# Sprint 4 — Order Lens Part 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mom can capture, browse, and act on every WhatsApp order. Add Order is the most-used form in the app and becomes the §7 accordion with **mandatory `target_fulfilment_date`** (the calibration loop's anchor). Orders browse mode adds customer search + filter chips + day-grouped list. Order detail is the action surface (mark fulfilled / paid, edit, delete). Today Block 2 displays the proper "Pending today" list per spec §4.

**Architecture:**
- Reusable `CustomerSearchPicker` component (debounced, ~200ms) used by both Add Order (step 1) and Orders top bar; includes a "+ New customer" inline-add path.
- Add Order becomes a **progressive accordion** with 7 steps; step-completion drives an internal state machine. Multi-item entry inside Step 5.
- Multi-item insertion uses sequential inserts with cleanup-on-failure (delete orphan order if item insert fails). RPC migration noted as v2 hardening.
- Order detail and the browse list share `OrderWithDetails` (order + customer name + items + payment status) via a single fetcher with PostgREST embed.

**Spec source:** `docs/v1-spec.md` §7 (full body — browse mode, accordion, order detail), §4 (Block 2), §12 (target_fulfilment_date mandatory rule).

**Tech Stack:** React 18 + TypeScript + React Router 6 + Tailwind + Supabase JS + Vitest/RTL.

**Sprint 4 scope decisions (orchestrator, since Karan reviews at end of Sprint 4):**
- Multi-item insert: sequential inserts in TS with cleanup, NOT a Postgres function. Single-tenant, low-volume; an RPC is over-engineering. Noted in ADR.
- Customer search debounce: 200ms per spec.
- Filter chips: keep state in URL search params (`?filter=pending`) for shareability + back-button friendliness.
- Day-group labels: `TODAY`, `YESTERDAY`, then `MON 20 MAY` style. English locale; date-fns or `Intl.DateTimeFormat` — implementer chooses, prefer the no-dependency `Intl` path.
- Order detail "Generate bill" and "Log complaint" buttons render but are **disabled** with a small `(Sprint 5)` hint. Spec compliance for the surface; functionality lands next sprint.
- Add Order accordion: one step expanded at a time; completed steps collapse to a single-line summary with edit-affordance. Save button always visible, disabled until valid.
- Inline "+ New customer": modal (not full screen). Required: name + phone + channel. Optional: size_tier, notes (deferred to Customers screen, Sprint 6).

---

## File Structure

**New files:**
- `src/features/orders/CustomerSearchPicker.tsx` — debounced search-as-you-type + selected-customer chip + "+ New customer" inline trigger
- `src/features/orders/AddCustomerInlineModal.tsx` — name + phone + channel mini-form modal
- `src/features/orders/OrderDetailPage.tsx` — full read view + action buttons at `/orders/:id`
- `src/features/orders/orderFormatters.ts` — pure helpers: `groupOrdersByDay`, `formatOrderTimestamp`, `formatDayHeader` (`TODAY`/`YESTERDAY`/`MON 20 MAY`), `formatINR`
- `src/features/orders/orderFormatters.test.ts` — unit tests for the helpers (deterministic, no DOM)

**Modified files:**
- `src/features/orders/api.ts` — replace single-item `createOrder` with `createOrderWithItems(input)` (multi-item, with target_fulfilment_date / notes / source / payment_status); add `listOrdersFiltered`, `getOrderDetail`, `updateOrder`, `markFulfilled`, `markPaid`, `deleteOrder`
- `src/features/customers/api.ts` — add `searchCustomersByName(q, limit)`, `createCustomerQuick(input)`
- `src/features/orders/AddOrderPage.tsx` — full rewrite as 7-step accordion
- `src/features/orders/AddOrderPage.test.tsx` — replace walking-skeleton test with multi-item + target_fulfilment_date assertion
- `src/features/orders/OrdersPage.tsx` — full rewrite (search + filter chips + day groups + infinite scroll deferred)
- `src/features/today/TodayPage.tsx` — replace lightweight Block 2 with spec-compliant Block 2 (up to 5 rows + "see all →" link + overdue-first sort)
- `src/App.tsx` — add `/orders/:id` route inside the Protected layout

**Out of scope (Sprint 5+):**
- Batch entry mode — Sprint 5
- Bill generation (jsPDF + share sheet) — Sprint 5
- Complaint logging UI — Sprint 5
- Quiet customers (Block 2.5) — Sprint 6
- Customer detail link from order — Sprint 6 (renders name; tap is no-op for now)
- Infinite-scroll pagination on Orders — current fetcher returns first 50; future enhancement
- Mark-fulfilled/paid undo — current "Mark" buttons set the timestamp; "unmark" deferred to Sprint 5

---

## Cross-cutting types and rules

**Customer-search debounce:**
- `useDebouncedValue<T>(value: T, ms: number): T` — small custom hook in `src/lib/useDebouncedValue.ts` (NEW, also tested)
- 200ms per spec §7

**Filter chip vocabulary** (driven by `?filter=`):
- `all` (default — empty/missing param) | `pending` | `unpaid` | `this_week` | `this_month`

**Order detail action button states:**
- `Mark fulfilled` — visible iff `fulfilled_at IS NULL`; calls `markFulfilled(id)`; refreshes the page on success
- `Mark paid` — visible iff `payment_status !== 'paid'`; calls `markPaid(id)` which sets `payment_status='paid'` + `paid_at=now()`
- `Generate bill` — visible but **disabled**, with caption "(Sprint 5)" — spec presence without function
- `Log complaint` — visible but **disabled**, with caption "(Sprint 5)"
- `Edit order` — navigates to `/orders/:id/edit` ... ⚠️ NOT IN THIS SPRINT — render the button but make it navigate to a placeholder route that just says "Edit coming in Sprint 5". Implementer: render the button **disabled** with caption "(Sprint 5)" for simplicity.
- `Delete order` — confirms then deletes. Active in Sprint 4.

**Add Order accordion state machine:**
- Steps 1-7 each with state `'pending' | 'editing' | 'complete'`
- Exactly one step is `editing` at a time (default: first non-complete step, defaulting to step 1 on mount)
- Steps 2 (Source), 3 (Date), 4 (Target date), 6 (Payment status) auto-complete on mount with their defaults; the user can re-open by tapping
- Save button enabled iff Customer (step 1) is selected AND at least one Item (step 5) has qty > 0 AND target_fulfilment_date is set (defaults to today, but UI must reflect a valid date)

**`createOrderWithItems` failure path:**
- If items insert fails after order insert succeeds, attempt cleanup `supabase.from('orders').delete().eq('id', order.id)`. If cleanup also fails (network), throw — mom sees an error toast and can retry; the orphan is acceptable at v1 scale (rare, single-tenant) and can be cleaned up via the admin SQL skill.

---

## Task 1: Customers api + useDebouncedValue hook

**Files:**
- Modify: `src/features/customers/api.ts` (add searchCustomersByName + createCustomerQuick)
- Create: `src/lib/useDebouncedValue.ts`
- Create: `src/lib/useDebouncedValue.test.ts`

- [ ] **Step 1: Implement useDebouncedValue hook**

Create `src/lib/useDebouncedValue.ts`:

```ts
import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}
```

- [ ] **Step 2: Write test for the hook**

Create `src/lib/useDebouncedValue.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebouncedValue } from './useDebouncedValue';

describe('useDebouncedValue', () => {
  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('hi', 100));
    expect(result.current).toBe('hi');
  });

  it('delays update by the debounce period', async () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 200), {
      initialProps: { v: 'a' },
    });
    rerender({ v: 'b' });
    expect(result.current).toBe('a');
    act(() => { vi.advanceTimersByTime(199); });
    expect(result.current).toBe('a');
    act(() => { vi.advanceTimersByTime(2); });
    expect(result.current).toBe('b');
    vi.useRealTimers();
  });
});
```

- [ ] **Step 3: Add customer api helpers**

Read `src/features/customers/api.ts` first. Then append:

```ts
export async function searchCustomersByName(q: string, limit = 8): Promise<{ id: string; name: string; phone: string | null; channel_id: string }[]> {
  const trimmed = q.trim();
  if (trimmed.length === 0) return [];
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, phone, channel_id')
    .eq('active', true)
    .ilike('name', `%${trimmed}%`)
    .order('name', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createCustomerQuick(input: {
  name: string;
  phone: string | null;
  channel_id: string;
}): Promise<string> {
  const { data, error } = await supabase
    .from('customers')
    .insert(input)
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'customer insert failed');
  return data.id;
}
```

Also need a `listChannels()` helper if not already present — verify by reading the file. If absent, add:

```ts
export async function listChannels(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase
    .from('channels')
    .select('id, name')
    .eq('active', true)
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}
```

- [ ] **Step 4: Verify**

```bash
npm run typecheck
npm run test:run -- src/lib/useDebouncedValue.test.ts
npm run test:run
```
Expected: typecheck clean, hook test 2/2, full suite green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/useDebouncedValue.ts src/lib/useDebouncedValue.test.ts src/features/customers/api.ts
git commit -m "Sprint 4: useDebouncedValue hook + customer search/create helpers"
```

---

## Task 2: Orders api — multi-item createOrder + filters + detail

**Files:**
- Modify: `src/features/orders/api.ts`
- Modify: `src/features/orders/api.test.ts` (update if existing tests broken)

- [ ] **Step 1: Replace api.ts**

Read existing `src/features/orders/api.ts` first to confirm the imports + walking-skeleton `createOrder`. Then REPLACE the file with this expanded version:

```ts
import { supabase } from '@/lib/supabase';
import { todayInTz } from '@/lib/utils';
import { weekStartFor } from '@/lib/week';

export type OrderRow = {
  id: string;
  customer_id: string;
  ordered_at: string;
  fulfilled_at: string | null;
  payment_status: 'unpaid' | 'paid' | 'partial';
  target_fulfilment_date: string | null;
  notes: string | null;
  source: 'whatsapp' | 'exhibition_form' | 'in_person' | 'phone';
};

export type OrderFilter = 'all' | 'pending' | 'unpaid' | 'this_week' | 'this_month';

export type OrderListItem = OrderRow & {
  customer_name: string;
  total: number;
  item_summary: string;
};

export type OrderDetailRow = OrderRow & {
  customer_name: string;
  customer_phone: string | null;
  items: {
    id: string;
    product_id: string;
    product_name: string;
    qty: number;
    unit_price: number;
    line_total: number;
  }[];
  subtotal: number;
};

export async function listOrders(): Promise<OrderRow[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('id, customer_id, ordered_at, fulfilled_at, payment_status, target_fulfilment_date, notes, source')
    .order('ordered_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as OrderRow[];
}

/**
 * Browse-mode list. Returns up to 100 rows with embedded customer name + first
 * 2 item names for the summary line.
 * Filter semantics:
 * - all: no extra filter
 * - pending: fulfilled_at IS NULL
 * - unpaid: payment_status IN ('unpaid','partial')
 * - this_week: ordered_at >= Monday-of-this-week
 * - this_month: ordered_at >= first-of-this-month
 */
export async function listOrdersFiltered(filter: OrderFilter): Promise<OrderListItem[]> {
  let q = supabase
    .from('orders')
    .select(
      'id, customer_id, ordered_at, fulfilled_at, payment_status, target_fulfilment_date, notes, source, customers(name), order_items(qty, unit_price, products(name))',
    )
    .order('ordered_at', { ascending: false })
    .limit(100);

  if (filter === 'pending') {
    q = q.is('fulfilled_at', null);
  } else if (filter === 'unpaid') {
    q = q.in('payment_status', ['unpaid', 'partial']);
  } else if (filter === 'this_week') {
    const weekStart = weekStartFor(todayInTz());
    q = q.gte('ordered_at', `${weekStart}T00:00:00+05:30`);
  } else if (filter === 'this_month') {
    const today = todayInTz();
    const monthStart = `${today.slice(0, 7)}-01`;
    q = q.gte('ordered_at', `${monthStart}T00:00:00+05:30`);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  type Raw = OrderRow & {
    customers: { name: string } | null;
    order_items: { qty: number; unit_price: number; products: { name: string } | null }[] | null;
  };
  const rows = (data ?? []) as unknown as Raw[];
  return rows.map((r) => {
    const items = r.order_items ?? [];
    const total = items.reduce((sum, i) => sum + Number(i.qty) * Number(i.unit_price), 0);
    const itemNames = items.map((i) => `${i.qty} ${i.products?.name ?? '?'}`);
    const item_summary = itemNames.slice(0, 2).join(', ') + (itemNames.length > 2 ? `, +${itemNames.length - 2} more` : '');
    return {
      id: r.id,
      customer_id: r.customer_id,
      ordered_at: r.ordered_at,
      fulfilled_at: r.fulfilled_at,
      payment_status: r.payment_status,
      target_fulfilment_date: r.target_fulfilment_date,
      notes: r.notes,
      source: r.source,
      customer_name: r.customers?.name ?? '(unknown customer)',
      total,
      item_summary,
    };
  });
}

export async function listTodayPendingOrders(): Promise<OrderListItem[]> {
  // Spec §4 Block 2: orders where (target_fulfilment_date <= today OR target_fulfilment_date IS NULL) AND fulfilled_at IS NULL
  // Sort: overdue first (target_fulfilment_date asc, NULL last).
  const today = todayInTz();
  const { data, error } = await supabase
    .from('orders')
    .select(
      'id, customer_id, ordered_at, fulfilled_at, payment_status, target_fulfilment_date, notes, source, customers(name), order_items(qty, unit_price, products(name))',
    )
    .is('fulfilled_at', null)
    .or(`target_fulfilment_date.lte.${today},target_fulfilment_date.is.null`)
    .order('target_fulfilment_date', { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);

  type Raw = OrderRow & {
    customers: { name: string } | null;
    order_items: { qty: number; unit_price: number; products: { name: string } | null }[] | null;
  };
  const rows = (data ?? []) as unknown as Raw[];
  return rows.map((r) => {
    const items = r.order_items ?? [];
    const total = items.reduce((sum, i) => sum + Number(i.qty) * Number(i.unit_price), 0);
    const itemNames = items.map((i) => `${i.qty} ${i.products?.name ?? '?'}`);
    const item_summary = itemNames.slice(0, 2).join(', ') + (itemNames.length > 2 ? `, +${itemNames.length - 2} more` : '');
    return {
      id: r.id,
      customer_id: r.customer_id,
      ordered_at: r.ordered_at,
      fulfilled_at: r.fulfilled_at,
      payment_status: r.payment_status,
      target_fulfilment_date: r.target_fulfilment_date,
      notes: r.notes,
      source: r.source,
      customer_name: r.customers?.name ?? '(unknown customer)',
      total,
      item_summary,
    };
  });
}

export async function getOrderDetail(id: string): Promise<OrderDetailRow | null> {
  const { data, error } = await supabase
    .from('orders')
    .select(
      'id, customer_id, ordered_at, fulfilled_at, payment_status, target_fulfilment_date, notes, source, customers(name, phone), order_items(id, product_id, qty, unit_price, products(name))',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  type Raw = OrderRow & {
    customers: { name: string; phone: string | null } | null;
    order_items: { id: string; product_id: string; qty: number; unit_price: number; products: { name: string } | null }[] | null;
  };
  const r = data as unknown as Raw;
  const items = (r.order_items ?? []).map((i) => ({
    id: i.id,
    product_id: i.product_id,
    product_name: i.products?.name ?? '(unknown product)',
    qty: Number(i.qty),
    unit_price: Number(i.unit_price),
    line_total: Number(i.qty) * Number(i.unit_price),
  }));
  const subtotal = items.reduce((sum, i) => sum + i.line_total, 0);
  return {
    id: r.id,
    customer_id: r.customer_id,
    ordered_at: r.ordered_at,
    fulfilled_at: r.fulfilled_at,
    payment_status: r.payment_status,
    target_fulfilment_date: r.target_fulfilment_date,
    notes: r.notes,
    source: r.source,
    customer_name: r.customers?.name ?? '(unknown customer)',
    customer_phone: r.customers?.phone ?? null,
    items,
    subtotal,
  };
}

export type OrderItemInput = { product_id: string; qty: number; unit_price: number };

/**
 * Multi-item order creation. Sequential inserts with cleanup-on-item-failure.
 * Single-tenant; race-free at v1 scale. Migrate to Postgres function if multi-tenant.
 */
export async function createOrderWithItems(input: {
  customer_id: string;
  source: OrderRow['source'];
  ordered_at?: string; // ISO; default supabase default (now())
  target_fulfilment_date: string; // mandatory per §12
  payment_status: OrderRow['payment_status'];
  notes: string | null;
  items: OrderItemInput[];
}): Promise<string> {
  if (input.items.length === 0) throw new Error('At least one item is required.');
  if (!input.target_fulfilment_date) throw new Error('target_fulfilment_date is required.');

  const orderInsert: Record<string, unknown> = {
    customer_id: input.customer_id,
    source: input.source,
    target_fulfilment_date: input.target_fulfilment_date,
    payment_status: input.payment_status,
    notes: input.notes,
  };
  if (input.ordered_at) orderInsert.ordered_at = input.ordered_at;
  const { data: order, error: oErr } = await supabase
    .from('orders')
    .insert(orderInsert)
    .select('id')
    .single();
  if (oErr || !order) throw new Error(oErr?.message ?? 'order insert failed');

  const itemRows = input.items.map((it) => ({
    order_id: order.id,
    product_id: it.product_id,
    qty: it.qty,
    unit_price: it.unit_price,
  }));
  const { error: iErr } = await supabase.from('order_items').insert(itemRows);
  if (iErr) {
    // Cleanup the orphan order.
    await supabase.from('orders').delete().eq('id', order.id);
    throw new Error(iErr.message);
  }
  return order.id;
}

export async function updateOrder(
  id: string,
  patch: {
    target_fulfilment_date?: string;
    notes?: string | null;
    payment_status?: OrderRow['payment_status'];
  },
): Promise<void> {
  const { error } = await supabase.from('orders').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function markFulfilled(id: string): Promise<void> {
  const { error } = await supabase
    .from('orders')
    .update({ fulfilled_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function markPaid(id: string): Promise<void> {
  const { error } = await supabase
    .from('orders')
    .update({ payment_status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteOrder(id: string): Promise<void> {
  // RLS+FK will cascade order_items.
  const { error } = await supabase.from('orders').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 2: Update the existing api.test.ts**

Read `src/features/orders/api.test.ts` first. If its `createOrder` tests reference the OLD single-item signature, update them to use `createOrderWithItems` with the new contract. The existing tests almost certainly need adjustment.

Replace `createOrder(input)` mock-based tests with `createOrderWithItems(input)` and assert:
- Items array passed
- target_fulfilment_date passed
- Returns order id

Keep the test file lean — 1-2 tests is enough for the api layer.

- [ ] **Step 3: Update the Sprint 1 AddOrderPage.test.tsx**

Since the underlying api function signature changed, the existing Sprint 1 AddOrderPage test will break (it mocks `createOrder`). It will be fully rewritten in Task 5 below. For now, edit `src/features/orders/AddOrderPage.test.tsx` to mock `createOrderWithItems` returning a fake id, OR mark the existing test as `describe.skip` with a TODO comment — implementer's call. The test will be replaced wholesale in Task 5.

- [ ] **Step 4: Verify**

```bash
npm run typecheck
npm run test:run
```
Expected: typecheck clean. Tests may not all pass yet because AddOrderPage hasn't been rewritten (Task 5). Acceptable to have AddOrderPage tests in a `describe.skip` state or refactored to match the new API in this task — implementer's choice. Just don't leave a test failing on a stale signature.

- [ ] **Step 5: Commit**

```bash
git add src/features/orders/api.ts src/features/orders/api.test.ts src/features/orders/AddOrderPage.test.tsx
git commit -m "Sprint 4: orders api — multi-item createOrderWithItems, filters, detail, mark fulfilled/paid"
```

---

## Task 3: Order formatters + tests

**Files:**
- Create: `src/features/orders/orderFormatters.ts`
- Create: `src/features/orders/orderFormatters.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/features/orders/orderFormatters.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatDayHeader, formatINR, formatOrderTimestamp, groupOrdersByDay } from './orderFormatters';
import type { OrderListItem } from './api';

function makeOrder(over: Partial<OrderListItem> = {}): OrderListItem {
  return {
    id: 'o1',
    customer_id: 'c1',
    ordered_at: '2026-05-20T08:42:00+05:30',
    fulfilled_at: null,
    payment_status: 'unpaid',
    target_fulfilment_date: null,
    notes: null,
    source: 'whatsapp',
    customer_name: 'Sunita Patil',
    total: 420,
    item_summary: '2 boxes laddu, 1 kg chivda',
    ...over,
  };
}

describe('formatDayHeader', () => {
  it('returns TODAY for the same date as today', () => {
    expect(formatDayHeader('2026-05-20', '2026-05-20')).toBe('TODAY');
  });
  it('returns YESTERDAY for the day before today', () => {
    expect(formatDayHeader('2026-05-19', '2026-05-20')).toBe('YESTERDAY');
  });
  it('returns DAY DATE MON format for older dates', () => {
    // 2026-05-13 was a Wednesday
    expect(formatDayHeader('2026-05-13', '2026-05-20')).toBe('WED 13 MAY');
  });
});

describe('formatINR', () => {
  it('renders ₹ with Indian grouping and 2 decimals', () => {
    expect(formatINR(120500)).toBe('₹1,20,500.00');
    expect(formatINR(420)).toBe('₹420.00');
    expect(formatINR(0)).toBe('₹0.00');
  });
});

describe('formatOrderTimestamp', () => {
  it('returns HH:MM for same-day orders', () => {
    expect(formatOrderTimestamp('2026-05-20T08:42:00+05:30', '2026-05-20')).toBe('08:42');
  });
  it('returns empty string for older days', () => {
    expect(formatOrderTimestamp('2026-05-19T08:42:00+05:30', '2026-05-20')).toBe('');
  });
});

describe('groupOrdersByDay', () => {
  it('buckets orders by ordered_at date (Asia/Kolkata)', () => {
    const orders = [
      makeOrder({ id: 'a', ordered_at: '2026-05-20T08:00:00+05:30' }),
      makeOrder({ id: 'b', ordered_at: '2026-05-20T15:00:00+05:30' }),
      makeOrder({ id: 'c', ordered_at: '2026-05-19T10:00:00+05:30' }),
    ];
    const groups = groupOrdersByDay(orders);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.date).toBe('2026-05-20');
    expect(groups[0]!.orders.map((o) => o.id)).toEqual(['a', 'b']);
    expect(groups[1]!.date).toBe('2026-05-19');
    expect(groups[1]!.orders.map((o) => o.id)).toEqual(['c']);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

`npm run test:run -- src/features/orders/orderFormatters.test.ts`

- [ ] **Step 3: Implement**

Create `src/features/orders/orderFormatters.ts`:

```ts
import type { OrderListItem } from './api';

export function formatINR(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/**
 * Returns the Asia/Kolkata YYYY-MM-DD date string for an ISO timestamp.
 */
function ymdInKolkata(iso: string): string {
  // Date.parse handles ISO with offset. Format via en-CA which is YYYY-MM-DD.
  const d = new Date(iso);
  // sv-SE locale formats as YYYY-MM-DD; force Asia/Kolkata zone explicitly.
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Kolkata' }).format(d);
}

function diffDaysYmd(a: string, b: string): number {
  const ta = new Date(`${a}T00:00:00Z`).getTime();
  const tb = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round((tb - ta) / (24 * 60 * 60 * 1000));
}

export function formatDayHeader(date: string, today: string): string {
  const diff = diffDaysYmd(date, today);
  if (diff === 0) return 'TODAY';
  if (diff === 1) return 'YESTERDAY';
  const d = new Date(`${date}T12:00:00Z`);
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }).toUpperCase();
  const day = d.getUTCDate();
  const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();
  return `${weekday} ${day} ${month}`;
}

export function formatOrderTimestamp(iso: string, today: string): string {
  const orderDate = ymdInKolkata(iso);
  if (orderDate !== today) return '';
  const d = new Date(iso);
  const t = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  }).format(d);
  return t;
}

export type OrderDayGroup = {
  date: string; // YYYY-MM-DD in Asia/Kolkata
  orders: OrderListItem[];
};

export function groupOrdersByDay(orders: OrderListItem[]): OrderDayGroup[] {
  const byDate = new Map<string, OrderListItem[]>();
  for (const o of orders) {
    const date = ymdInKolkata(o.ordered_at);
    const bucket = byDate.get(date);
    if (bucket) bucket.push(o);
    else byDate.set(date, [o]);
  }
  // Sort by date descending (newest first).
  return Array.from(byDate.entries())
    .map(([date, ords]) => ({ date, orders: ords }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}
```

- [ ] **Step 4: Tests pass (9/9 new)**

`npm run test:run -- src/features/orders/orderFormatters.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/features/orders/orderFormatters.ts src/features/orders/orderFormatters.test.ts
git commit -m "Sprint 4: order formatters — INR, day headers, timestamp, day-group bucketing"
```

---

## Task 4: CustomerSearchPicker + AddCustomerInlineModal

**Files:**
- Create: `src/features/orders/AddCustomerInlineModal.tsx`
- Create: `src/features/orders/CustomerSearchPicker.tsx`

- [ ] **Step 1: Implement AddCustomerInlineModal**

Create `src/features/orders/AddCustomerInlineModal.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { createCustomerQuick, listChannels } from '@/features/customers/api';

type Channel = { id: string; name: string };

type Props = {
  onClose: () => void;
  onCreated: (customer: { id: string; name: string }) => void;
};

export function AddCustomerInlineModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelId, setChannelId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listChannels()
      .then((cs) => {
        setChannels(cs);
        const first = cs[0];
        if (first) setChannelId(first.id);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const canSubmit = name.trim().length > 0 && channelId.length > 0 && !submitting;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const id = await createCustomerQuick({
        name: name.trim(),
        phone: phone.trim() || null,
        channel_id: channelId,
      });
      onCreated({ id, name: name.trim() });
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  const inputClass = 'mt-1 h-11 w-full rounded-input border border-ink-900/10 bg-paper-elevated px-3 text-body';
  const labelSpan = 'text-label uppercase text-ink-500';

  return (
    <>
      <div className="fixed inset-0 z-40 bg-ink-900/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-label="Add new customer"
        className="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-paper-elevated p-5 shadow-2xl"
      >
        <h2 className="text-subtitle text-ink-900">New customer</h2>
        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <label className="block">
            <span className={labelSpan}>Name</span>
            <input
              className={inputClass}
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block">
            <span className={labelSpan}>Phone (optional)</span>
            <input
              className={inputClass}
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
          <label className="block">
            <span className={labelSpan}>Channel</span>
            <select
              className={inputClass}
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
            >
              {channels.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
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
              {submitting ? 'Saving…' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Implement CustomerSearchPicker**

Create `src/features/orders/CustomerSearchPicker.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { searchCustomersByName } from '@/features/customers/api';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { AddCustomerInlineModal } from './AddCustomerInlineModal';

type Customer = { id: string; name: string; phone: string | null };

type Props = {
  selected: Customer | null;
  onSelect: (c: Customer) => void;
};

export function CustomerSearchPicker({ selected, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, 200);
  const [results, setResults] = useState<Customer[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selected) {
      setResults([]);
      return;
    }
    if (debounced.trim().length === 0) {
      setResults([]);
      return;
    }
    searchCustomersByName(debounced)
      .then((rs) => setResults(rs.map((r) => ({ id: r.id, name: r.name, phone: r.phone }))))
      .catch((e: Error) => setError(e.message));
  }, [debounced, selected]);

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-card border border-ink-900/10 bg-paper-elevated p-3">
        <div>
          <p className="text-body font-semibold text-ink-900">{selected.name}</p>
          {selected.phone && <p className="text-body-sm text-ink-500">{selected.phone}</p>}
        </div>
        <button
          type="button"
          onClick={() => onSelect({ id: '', name: '', phone: null })}
          className="text-body-sm text-ink-500 underline"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div>
      <input
        className="h-11 w-full rounded-input border border-ink-900/10 bg-paper-elevated px-3 text-body"
        placeholder="Search customer name"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {error && <p className="mt-1 text-body-sm text-status-danger-fg">{error}</p>}

      {results.length > 0 && (
        <ul className="mt-2 max-h-64 overflow-y-auto rounded-card border border-ink-900/10 bg-paper-elevated">
          {results.map((r) => (
            <li key={r.id} className="border-b border-ink-900/10 last:border-b-0">
              <button
                type="button"
                onClick={() => onSelect(r)}
                className="block w-full p-3 text-left"
              >
                <span className="text-body text-ink-900">{r.name}</span>
                {r.phone && <span className="ml-2 text-body-sm text-ink-500">{r.phone}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {debounced.trim().length > 0 && results.length === 0 && (
        <p className="mt-2 text-body-sm text-ink-500">
          No match.{' '}
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="text-brand-orange underline"
          >
            + Add as new customer?
          </button>
        </p>
      )}

      {debounced.trim().length === 0 && (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="mt-2 text-body-sm text-brand-orange underline"
        >
          + New customer
        </button>
      )}

      {showAdd && (
        <AddCustomerInlineModal
          onClose={() => setShowAdd(false)}
          onCreated={(c) => {
            setShowAdd(false);
            onSelect({ id: c.id, name: c.name, phone: null });
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify**

```bash
npm run typecheck
npm run test:run
```

- [ ] **Step 4: Commit**

```bash
git add src/features/orders/CustomerSearchPicker.tsx src/features/orders/AddCustomerInlineModal.tsx
git commit -m "Sprint 4: CustomerSearchPicker + AddCustomerInlineModal"
```

---

## Task 5: AddOrderPage accordion rewrite + test

**Files:**
- Modify: `src/features/orders/AddOrderPage.tsx` (full rewrite)
- Modify: `src/features/orders/AddOrderPage.test.tsx` (full rewrite)

- [ ] **Step 1: Implement AddOrderPage as the 7-step accordion**

Replace `src/features/orders/AddOrderPage.tsx` entirely:

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CustomerSearchPicker } from './CustomerSearchPicker';
import { createOrderWithItems, type OrderItemInput, type OrderRow } from './api';
import { listActiveProducts, type ProductRow } from '@/features/products/api';
import { todayInTz } from '@/lib/utils';

type Customer = { id: string; name: string; phone: string | null };
type DraftItem = { product_id: string; qty: string; unit_price: string };

type StepKey = 'customer' | 'source' | 'date' | 'target' | 'items' | 'payment' | 'notes';

const SOURCES: OrderRow['source'][] = ['whatsapp', 'in_person', 'phone'];
const PAYMENT_STATUSES: OrderRow['payment_status'][] = ['unpaid', 'paid', 'partial'];

export function AddOrderPage() {
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [source, setSource] = useState<OrderRow['source']>('whatsapp');
  const [orderedAt, setOrderedAt] = useState<string>(todayInTz());
  const [targetDate, setTargetDate] = useState<string>(todayInTz());
  const [items, setItems] = useState<DraftItem[]>([{ product_id: '', qty: '', unit_price: '' }]);
  const [paymentStatus, setPaymentStatus] = useState<OrderRow['payment_status']>('unpaid');
  const [notes, setNotes] = useState('');
  const [expandedStep, setExpandedStep] = useState<StepKey>('customer');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listActiveProducts().then(setProducts).catch((e: Error) => setError(e.message));
  }, []);

  // Auto-advance on customer pick
  function handleCustomer(c: Customer) {
    if (c.id === '') {
      setCustomer(null);
      setExpandedStep('customer');
      return;
    }
    setCustomer(c);
    setExpandedStep('items'); // Skip auto-defaulted steps (source/date/target/payment)
  }

  function setItemField(i: number, patch: Partial<DraftItem>) {
    setItems((curr) => curr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function addItem() {
    setItems((curr) => [...curr, { product_id: '', qty: '', unit_price: '' }]);
  }
  function removeItem(i: number) {
    setItems((curr) => curr.filter((_, idx) => idx !== i));
  }

  const itemsValid: OrderItemInput[] = items
    .map((it) => {
      const qty = Number(it.qty);
      const unit_price = Number(it.unit_price);
      if (!it.product_id || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unit_price) || unit_price < 0) {
        return null;
      }
      return { product_id: it.product_id, qty, unit_price };
    })
    .filter((x): x is OrderItemInput => x !== null);

  const canSubmit = customer !== null && itemsValid.length > 0 && targetDate.length === 10 && !submitting;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !customer) return;
    setSubmitting(true);
    setError(null);
    try {
      await createOrderWithItems({
        customer_id: customer.id,
        source,
        ordered_at: `${orderedAt}T12:00:00+05:30`,
        target_fulfilment_date: targetDate,
        payment_status: paymentStatus,
        notes: notes.trim() || null,
        items: itemsValid,
      });
      navigate('/orders');
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  // Step display helpers
  const StepHeader = ({ stepKey, n, label, summary, complete }: {
    stepKey: StepKey; n: number; label: string; summary: string; complete: boolean;
  }) => (
    <button
      type="button"
      onClick={() => setExpandedStep(stepKey)}
      className="flex w-full items-center justify-between p-3 text-left"
    >
      <span className="flex items-center gap-3">
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full text-label ${
            complete ? 'bg-brand-orange text-white' : 'border border-ink-900/20 text-ink-500'
          }`}
        >
          {complete ? '✓' : n}
        </span>
        <span className="text-body font-semibold text-ink-900">{label}</span>
      </span>
      {expandedStep !== stepKey && (
        <span className="text-body-sm text-ink-500 truncate ml-2">{summary}</span>
      )}
    </button>
  );

  const inputClass = 'mt-1 h-11 w-full rounded-input border border-ink-900/10 bg-paper-elevated px-3 text-body';

  return (
    <div>
      <h1 className="text-title text-ink-900">Log new order</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-2">
        {/* Step 1: Customer */}
        <div className="rounded-card bg-paper-elevated">
          <StepHeader
            stepKey="customer"
            n={1}
            label="Customer"
            summary={customer ? customer.name : 'Select a customer'}
            complete={customer !== null}
          />
          {expandedStep === 'customer' && (
            <div className="px-3 pb-3">
              <CustomerSearchPicker selected={customer} onSelect={handleCustomer} />
            </div>
          )}
        </div>

        {/* Step 2: Source */}
        <div className="rounded-card bg-paper-elevated">
          <StepHeader stepKey="source" n={2} label="Source" summary={source} complete={true} />
          {expandedStep === 'source' && (
            <div className="px-3 pb-3 flex gap-2 flex-wrap">
              {SOURCES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setSource(s); setExpandedStep('items'); }}
                  className={`h-9 rounded-pill px-3 text-body-sm ${
                    source === s ? 'bg-brand-orange text-white' : 'border border-ink-900/10 text-ink-900'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Step 3: Date */}
        <div className="rounded-card bg-paper-elevated">
          <StepHeader stepKey="date" n={3} label="Date" summary={orderedAt} complete={true} />
          {expandedStep === 'date' && (
            <div className="px-3 pb-3">
              <input
                type="date"
                className={inputClass}
                value={orderedAt}
                onChange={(e) => setOrderedAt(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Step 4: Target fulfilment date — REQUIRED */}
        <div className="rounded-card bg-paper-elevated">
          <StepHeader
            stepKey="target"
            n={4}
            label="Target fulfilment date"
            summary={targetDate}
            complete={targetDate.length === 10}
          />
          {expandedStep === 'target' && (
            <div className="px-3 pb-3">
              <input
                type="date"
                className={inputClass}
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
              <p className="mt-1 text-body-sm text-ink-500">The week this falls in is the demand week.</p>
            </div>
          )}
        </div>

        {/* Step 5: Items */}
        <div className="rounded-card bg-paper-elevated">
          <StepHeader
            stepKey="items"
            n={5}
            label="Items"
            summary={itemsValid.length > 0 ? `${itemsValid.length} item${itemsValid.length === 1 ? '' : 's'}` : 'Add at least one'}
            complete={itemsValid.length > 0}
          />
          {expandedStep === 'items' && (
            <div className="px-3 pb-3 space-y-3">
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-[1fr_60px_70px_24px] items-center gap-2">
                  <select
                    className={inputClass.replace('mt-1 ', '')}
                    value={it.product_id}
                    onChange={(e) => {
                      const pid = e.target.value;
                      const product = products.find((p) => p.id === pid);
                      setItemField(i, { product_id: pid, unit_price: product ? String(product.default_price) : it.unit_price });
                    }}
                  >
                    <option value="">— pick —</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    aria-label={`qty-${i}`}
                    placeholder="qty"
                    className={inputClass.replace('mt-1 ', '')}
                    value={it.qty}
                    onChange={(e) => setItemField(i, { qty: e.target.value })}
                  />
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    aria-label={`price-${i}`}
                    placeholder="₹"
                    className={inputClass.replace('mt-1 ', '')}
                    value={it.unit_price}
                    onChange={(e) => setItemField(i, { unit_price: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    disabled={items.length === 1}
                    aria-label={`Remove item ${i + 1}`}
                    className="text-body text-ink-500 disabled:opacity-30"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addItem}
                className="text-body-sm text-brand-orange underline"
              >
                + Add another item
              </button>
            </div>
          )}
        </div>

        {/* Step 6: Payment */}
        <div className="rounded-card bg-paper-elevated">
          <StepHeader stepKey="payment" n={6} label="Payment" summary={paymentStatus} complete={true} />
          {expandedStep === 'payment' && (
            <div className="px-3 pb-3 flex gap-2">
              {PAYMENT_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setPaymentStatus(s); setExpandedStep('notes'); }}
                  className={`h-9 rounded-pill px-3 text-body-sm ${
                    paymentStatus === s ? 'bg-brand-orange text-white' : 'border border-ink-900/10 text-ink-900'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Step 7: Notes */}
        <div className="rounded-card bg-paper-elevated">
          <StepHeader stepKey="notes" n={7} label="Notes (optional)" summary={notes || '—'} complete={true} />
          {expandedStep === 'notes' && (
            <div className="px-3 pb-3">
              <textarea
                rows={3}
                className="mt-1 w-full rounded-input border border-ink-900/10 bg-paper-elevated px-3 py-2 text-body"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          )}
        </div>

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

- [ ] **Step 2: Write new test**

Replace `src/features/orders/AddOrderPage.test.tsx` entirely:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const createOrderWithItems = vi.fn();
const listActiveProducts = vi.fn();
const searchCustomersByName = vi.fn();
const listChannels = vi.fn();

vi.mock('@/features/orders/api', () => ({
  createOrderWithItems: (i: unknown) => createOrderWithItems(i),
}));
vi.mock('@/features/products/api', () => ({
  listActiveProducts: () => listActiveProducts(),
}));
vi.mock('@/features/customers/api', () => ({
  searchCustomersByName: (q: string) => searchCustomersByName(q),
  listChannels: () => listChannels(),
  createCustomerQuick: vi.fn(),
}));
vi.mock('@/lib/utils', () => ({ todayInTz: () => '2026-05-20' }));

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
  createOrderWithItems.mockReset();
  listActiveProducts.mockReset();
  searchCustomersByName.mockReset();
  listChannels.mockReset();
  createOrderWithItems.mockResolvedValue('new-order-id');
  listActiveProducts.mockResolvedValue([
    { id: 'p1', name: 'Chivda', unit: '250g', default_price: 100 },
    { id: 'p2', name: 'Laddu', unit: 'box', default_price: 200 },
  ]);
  searchCustomersByName.mockResolvedValue([
    { id: 'c1', name: 'Sunita Patil', phone: '+91...', channel_id: 'ch1' },
  ]);
  listChannels.mockResolvedValue([{ id: 'ch1', name: 'Personal' }]);
});

describe('AddOrderPage', () => {
  it('full flow: pick customer, add item, save, navigate', async () => {
    const user = userEvent.setup();
    renderPage();

    // Step 1: Customer search
    const search = await screen.findByPlaceholderText('Search customer name');
    await user.type(search, 'Sunita');
    const customerRow = await screen.findByRole('button', { name: /Sunita Patil/ });
    await user.click(customerRow);

    // Step 5 (Items) should now be expanded
    const productSelect = await screen.findByRole('combobox');
    await user.selectOptions(productSelect, 'p1');

    const qty = screen.getByLabelText('qty-0');
    await user.type(qty, '2');

    // unit_price was prefilled to 100 from default_price; verify
    expect(screen.getByLabelText('price-0')).toHaveValue(100);

    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => expect(createOrderWithItems).toHaveBeenCalledTimes(1));
    expect(createOrderWithItems).toHaveBeenCalledWith(
      expect.objectContaining({
        customer_id: 'c1',
        source: 'whatsapp',
        target_fulfilment_date: '2026-05-20',
        payment_status: 'unpaid',
        items: [{ product_id: 'p1', qty: 2, unit_price: 100 }],
      }),
    );
    expect(await screen.findByText('OrdersList')).toBeInTheDocument();
  });

  it('save button is disabled until customer + valid item', async () => {
    renderPage();
    const save = await screen.findByRole('button', { name: /^Save$/ });
    expect(save).toBeDisabled();
  });
});
```

- [ ] **Step 3: Verify**

```bash
npm run test:run -- src/features/orders/AddOrderPage.test.tsx
npm run typecheck
npm run test:run
```
Expected: AddOrderPage tests 2/2, typecheck clean, full suite green.

- [ ] **Step 4: Commit**

```bash
git add src/features/orders/AddOrderPage.tsx src/features/orders/AddOrderPage.test.tsx
git commit -m "Sprint 4: AddOrderPage — 7-step accordion with multi-item + mandatory target_fulfilment_date"
```

---

## Task 6: OrderDetailPage + route

**Files:**
- Create: `src/features/orders/OrderDetailPage.tsx`
- Modify: `src/App.tsx` (add `/orders/:id` route)

- [ ] **Step 1: Implement OrderDetailPage**

Create `src/features/orders/OrderDetailPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  deleteOrder,
  getOrderDetail,
  markFulfilled,
  markPaid,
  type OrderDetailRow,
} from './api';
import { formatINR } from './orderFormatters';

export function OrderDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<OrderDetailRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function load() {
    try {
      const o = await getOrderDetail(id);
      if (!o) {
        setError('Order not found.');
        return;
      }
      setOrder(o);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  async function onMarkFulfilled() {
    setWorking(true);
    try { await markFulfilled(id); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setWorking(false); }
  }
  async function onMarkPaid() {
    setWorking(true);
    try { await markPaid(id); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setWorking(false); }
  }
  async function onDelete() {
    if (!confirm("Delete this order? This can't be undone.")) return;
    setWorking(true);
    try { await deleteOrder(id); navigate('/orders'); }
    catch (e) { setError((e as Error).message); setWorking(false); }
  }

  if (error && !order) return <p className="text-body-sm text-status-danger-fg">{error}</p>;
  if (!order) return <p className="text-body-sm text-ink-500">Loading…</p>;

  const fulfilled = order.fulfilled_at !== null;
  const paid = order.payment_status === 'paid';

  return (
    <div>
      <header>
        <h1 className="text-title text-ink-900">{order.customer_name}</h1>
        {order.customer_phone && (
          <p className="mt-1 text-body-sm text-ink-500">{order.customer_phone}</p>
        )}
        <div className="mt-2 flex flex-wrap gap-2 text-body-sm">
          <span className="rounded-pill bg-paper-muted px-2 py-0.5 text-ink-700">
            {order.source}
          </span>
          <span className={`rounded-pill px-2 py-0.5 ${fulfilled ? 'bg-status-ok-bg text-ink-700' : 'bg-status-warn-bg text-ink-700'}`}>
            {fulfilled ? 'Fulfilled' : 'Pending'}
          </span>
          <span className={`rounded-pill px-2 py-0.5 ${paid ? 'bg-status-ok-bg text-ink-700' : 'bg-status-warn-bg text-ink-700'}`}>
            {order.payment_status}
          </span>
        </div>
      </header>

      <section className="mt-6 space-y-1 text-body-sm text-ink-700">
        <p>Ordered {order.ordered_at.slice(0, 10)}</p>
        {order.target_fulfilment_date && <p>Due by {order.target_fulfilment_date}</p>}
        {order.fulfilled_at && <p>Fulfilled on {order.fulfilled_at.slice(0, 10)}</p>}
      </section>

      <section className="mt-6">
        <h2 className="text-subtitle text-ink-900">Items</h2>
        <ul className="mt-2 space-y-1 text-body-sm">
          {order.items.map((it) => (
            <li key={it.id} className="flex justify-between">
              <span className="text-ink-900">{it.product_name} × {it.qty}</span>
              <span className="text-ink-700">{formatINR(it.line_total)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between border-t border-ink-900/10 pt-2">
          <span className="text-body font-semibold text-ink-900">Subtotal</span>
          <span className="text-body font-semibold text-ink-900">{formatINR(order.subtotal)}</span>
        </div>
      </section>

      {order.notes && (
        <section className="mt-6">
          <h2 className="text-subtitle text-ink-900">Notes</h2>
          <p className="mt-2 text-body-sm text-ink-700 whitespace-pre-wrap">{order.notes}</p>
        </section>
      )}

      {error && <p className="mt-4 text-body-sm text-status-danger-fg">{error}</p>}

      <section className="mt-8 space-y-2">
        {!fulfilled && (
          <button
            type="button"
            onClick={onMarkFulfilled}
            disabled={working}
            className="h-11 w-full rounded-btn bg-brand-orange text-body font-semibold text-white disabled:opacity-50"
          >
            Mark fulfilled
          </button>
        )}
        {!paid && (
          <button
            type="button"
            onClick={onMarkPaid}
            disabled={working}
            className="h-11 w-full rounded-btn bg-brand-orange text-body font-semibold text-white disabled:opacity-50"
          >
            Mark paid
          </button>
        )}
        <button
          type="button"
          disabled
          className="h-11 w-full rounded-btn-sm border border-ink-900/10 bg-paper-elevated text-body text-ink-500"
        >
          Generate bill (Sprint 5)
        </button>
        <button
          type="button"
          disabled
          className="h-11 w-full rounded-btn-sm border border-ink-900/10 bg-paper-elevated text-body text-ink-500"
        >
          Log complaint (Sprint 5)
        </button>
        <button
          type="button"
          disabled
          className="h-11 w-full rounded-btn-sm border border-ink-900/10 bg-paper-elevated text-body text-ink-500"
        >
          Edit order (Sprint 5)
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={working}
          className="h-11 w-full rounded-btn-sm border border-ink-900/10 bg-paper-elevated text-body text-status-danger-fg"
        >
          Delete order
        </button>
      </section>

      <p className="mt-6 text-body-sm text-ink-500">
        <Link to="/orders" className="underline">← Back to orders</Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Add route to App.tsx**

```tsx
import { OrderDetailPage } from '@/features/orders/OrderDetailPage';
// inside the layout-route block, after /orders/new:
<Route path="/orders/:id" element={<OrderDetailPage />} />
```

- [ ] **Step 3: Verify**

```bash
npm run typecheck
npm run test:run
```

- [ ] **Step 4: Commit**

```bash
git add src/features/orders/OrderDetailPage.tsx src/App.tsx
git commit -m "Sprint 4: OrderDetailPage with mark fulfilled/paid + delete (bill/complaint/edit deferred to Sprint 5)"
```

---

## Task 7: OrdersPage browse-mode rewrite

**Files:**
- Modify: `src/features/orders/OrdersPage.tsx` (full rewrite)

- [ ] **Step 1: Replace**

```tsx
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listOrdersFiltered, type OrderFilter, type OrderListItem } from './api';
import { formatDayHeader, formatINR, formatOrderTimestamp, groupOrdersByDay } from './orderFormatters';
import { todayInTz } from '@/lib/utils';

const FILTERS: { key: OrderFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending fulfilment' },
  { key: 'unpaid', label: 'Unpaid' },
  { key: 'this_week', label: 'This week' },
  { key: 'this_month', label: 'This month' },
];

export function OrdersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = (searchParams.get('filter') ?? 'all') as OrderFilter;
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    listOrdersFiltered(filter)
      .then((rs) => { setOrders(rs); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, [filter]);

  const today = todayInTz();

  const filtered = search.trim().length === 0
    ? orders
    : orders.filter((o) => o.customer_name.toLowerCase().includes(search.trim().toLowerCase()));

  const groups = groupOrdersByDay(filtered);

  return (
    <div>
      <header className="flex items-baseline justify-between">
        <h1 className="text-title text-ink-900">Orders</h1>
        <Link
          to="/orders/new"
          className="rounded-btn-sm bg-brand-orange px-3 py-2 text-body-sm font-semibold text-white"
        >
          + Log new order
        </Link>
      </header>

      <input
        type="search"
        placeholder="Search customer name"
        className="mt-3 h-11 w-full rounded-input border border-ink-900/10 bg-paper-elevated px-3 text-body"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setSearchParams(f.key === 'all' ? {} : { filter: f.key })}
            className={`h-8 shrink-0 rounded-pill px-3 text-body-sm ${
              filter === f.key
                ? 'bg-brand-orange text-white'
                : 'border border-ink-900/10 text-ink-900'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 text-body-sm text-status-danger-fg">{error}</p>}

      {loading ? (
        <p className="mt-6 text-body-sm text-ink-500">Loading…</p>
      ) : groups.length === 0 ? (
        <p className="mt-6 text-body-sm text-ink-500">
          {search.trim().length > 0
            ? 'No orders match this search.'
            : filter === 'all'
              ? 'No orders logged yet. Tap + to start.'
              : (
                <>
                  No orders match this filter.{' '}
                  <button type="button" onClick={() => setSearchParams({})} className="underline">
                    Clear filter
                  </button>
                </>
              )}
        </p>
      ) : (
        <div className="mt-6 space-y-6">
          {groups.map((g) => (
            <section key={g.date}>
              <h2 className="text-label uppercase text-ink-500">{formatDayHeader(g.date, today)}</h2>
              <ul className="mt-2 space-y-2">
                {g.orders.map((o) => (
                  <li key={o.id}>
                    <Link
                      to={`/orders/${o.id}`}
                      className="block rounded-card bg-paper-elevated p-3"
                    >
                      <div className="flex items-baseline justify-between">
                        <span className="text-body font-semibold text-ink-900">{o.customer_name}</span>
                        <span className="text-body-sm text-ink-500">
                          {formatOrderTimestamp(o.ordered_at, today)} {formatOrderTimestamp(o.ordered_at, today) && '·'} {formatINR(o.total)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-body-sm text-ink-700">{o.item_summary || '(no items)'}</span>
                        <span className="flex gap-1 text-body-sm">
                          <span className={`rounded-pill px-2 py-0.5 ${o.fulfilled_at ? 'bg-status-ok-bg' : 'bg-status-warn-bg'} text-ink-700`}>
                            {o.fulfilled_at ? 'fulfilled' : 'pending'}
                          </span>
                          <span className={`rounded-pill px-2 py-0.5 ${o.payment_status === 'paid' ? 'bg-status-ok-bg' : 'bg-status-warn-bg'} text-ink-700`}>
                            {o.payment_status}
                          </span>
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

```bash
npm run typecheck && npm run test:run
```

- [ ] **Step 3: Commit**

```bash
git add src/features/orders/OrdersPage.tsx
git commit -m "Sprint 4: Orders browse mode — search + filter chips + day-grouped list"
```

---

## Task 8: TodayPage Block 2 rewrite

**Files:**
- Modify: `src/features/today/TodayPage.tsx`

- [ ] **Step 1: Patch Block 2**

Read the existing TodayPage. The Block 2 section currently renders a simple `Pending today (N)` list using `listTodayPendingOrders()` which returns `OrderRow[]`. After Sprint 4 Task 2, that function now returns `OrderListItem[]` (with customer_name, total, item_summary embedded), so the Today page can rely on the embed instead of separately fetching `listCustomersByIds`.

Replace the Block 2 rendering logic with:
- Use the new `OrderListItem` shape (customer_name, item_summary, total are embedded)
- Show up to 5 rows
- "see all →" link to `/orders?filter=pending`
- "Pending today" definition per spec §4 Block 2 (already handled in the api function)

Also REMOVE the separate `listCustomersByIds` call since customer name is now embedded.

Specific edits to make in `src/features/today/TodayPage.tsx`:

1. **Imports** — remove `listCustomersByIds` import (and the OrderRow type if no longer needed); change `OrderRow` to `OrderListItem` in the `OrderRow` slot:

```tsx
import { listTodayPendingOrders, type OrderListItem } from '@/features/orders/api';
```

Remove:
```tsx
import { listCustomersByIds } from '@/features/customers/api';
```

2. **State** — replace `useState<OrderRow[]>` with `useState<OrderListItem[]>`. Remove `customerNames` state entirely.

3. **Effect** — replace the body to fetch only production + plans + orders (no separate customer fetch needed):

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
    } catch (e) {
      setError((e as Error).message);
    }
  })();
}, []);
```

4. **Block 2 render** — replace with:

```tsx
<section className="mt-6">
  <header className="flex items-baseline justify-between">
    <h2 className="text-subtitle text-ink-900">Pending today ({orders.length})</h2>
    {orders.length > 5 && (
      <Link to="/orders?filter=pending" className="text-body-sm text-ink-500 underline">
        see all →
      </Link>
    )}
  </header>
  <ul className="mt-2 space-y-2">
    {orders.slice(0, 5).map((o) => (
      <li key={o.id}>
        <Link
          to={`/orders/${o.id}`}
          className="block rounded-card bg-paper-elevated p-3"
        >
          <div className="text-body font-semibold text-ink-900">{o.customer_name}</div>
          <div className="mt-1 text-body-sm text-ink-500">{o.item_summary || '(no items)'}</div>
        </Link>
      </li>
    ))}
    {orders.length === 0 && (
      <li className="text-body-sm text-ink-500">All caught up. ✓</li>
    )}
  </ul>
</section>
```

- [ ] **Step 2: Verify**

```bash
npm run typecheck && npm run test:run
```

- [ ] **Step 3: Commit**

```bash
git add src/features/today/TodayPage.tsx
git commit -m "Sprint 4: Today Block 2 — pending today proper (up to 5 + see all link)"
```

---

## Task 9: Smoke test + push

**Files:**
- None

- [ ] **Step 1: Run final preflight**

```bash
npm run typecheck && npm run test:run
```
Expected: clean + ~50/50 tests (Sprint 3 had 38; Sprint 4 adds: 2 hook + 9 formatters + 2 AddOrderPage rewrite ≈ +13).

- [ ] **Step 2: Manual smoke locally**

```bash
npm run dev
```

Critical paths to exercise (Karan will repeat post-push):
1. **Orders tab** → shows day-grouped list of existing `[DEV]` orders with `TODAY` / `YESTERDAY` / `MON 20 MAY` headers
2. Tap filter chip `Pending fulfilment` → URL becomes `/orders?filter=pending`, list refreshes
3. Type a name in search → list narrows
4. `+ Log new order` → accordion opens, step 1 expanded
5. Search "Sunita" (assuming a `[DEV]` customer matches) → tap result → step 5 expands
6. Pick a product → qty 2 → unit price prefilled → tap Save → returns to /orders, new row visible under TODAY
7. Tap the new order → OrderDetailPage shows full breakdown, items, badges, action buttons
8. Tap `Mark paid` → status badge flips to paid
9. Tap `Mark fulfilled` → status badge flips to fulfilled
10. Tap `Delete order` → confirm → returns to /orders, row gone
11. Today tab → Block 2 "Pending today" list reflects pending orders (up to 5)

- [ ] **Step 3: Push**

```bash
git push origin main
```

- [ ] **Step 4: Deployed smoke**

```bash
python scripts/smoke-test-walking-skeleton.py
```
Expected: passes (5-tab nav contract unchanged).

- [ ] **Step 5: Hand off to Karan** — review checkpoint for Sprints 3 + 4 together.

---

## Self-Review

**Spec coverage** (`v1-spec.md` §14 Sprint 4):
- Orders screen §7 browse mode + filters + customer search — Task 7 ✓
- Order detail screen — Task 6 ✓
- Add Order flow with mandatory target_fulfilment_date — Task 5 ✓ (accordion per §7 spec)
- Today Block 2 (pending today) — Task 8 ✓

**§7 sub-items:**
- Search by customer name (~200ms debounce) — Tasks 1 + 7 ✓
- Filter chips: All/Pending/Unpaid/This week/This month — Task 7 ✓
- Day groups: TODAY/YESTERDAY/MON DD MMM — Task 3 ✓
- Order detail action buttons — Task 6 ✓ (bill/complaint/edit deferred to Sprint 5 with disabled placeholder)
- Multi-item entry — Task 5 ✓
- "+ New customer" inline modal — Task 4 ✓
- Backdating orders allowed — Task 5 ✓ (step 3 date picker)

**§12 mandatory target_fulfilment_date:** Task 2 throws if missing in createOrderWithItems; Task 5 makes step 4 required in UI.

**Placeholder scan:** no TBDs without code, no "add validation later". Every step is actionable.

**Type consistency:**
- `OrderListItem` shape carries customer_name + total + item_summary — consumed by OrdersPage and TodayPage Block 2
- `OrderDetailRow` consumed only by OrderDetailPage
- `OrderItemInput` defined once; passed from AddOrderPage to api.createOrderWithItems

**Known design call-outs:**
1. **Edit order is disabled in Sprint 4** — spec presence with "(Sprint 5)" hint. Karan accepted on the Sprint 3+4 sequencing.
2. **Bill generation + complaint logging buttons** also disabled placeholders — Sprint 5.
3. **Multi-item insert atomicity** — sequential inserts + cleanup-on-failure. Single-tenant; race-free at v1 scale. Note for v2: wrap in RPC.
4. **OrdersPage limits to 100 rows** — no infinite scroll yet. Likely sufficient until launch backfill.
5. **Customer search is client-side ilike** on `customers.name`. Phone-search deferred to Sprint 6 (Customers screen).
6. **TodayPage no longer separately fetches customer names** — the embed in `listTodayPendingOrders` carries `customer_name`. Removed `listCustomersByIds` call.
7. **`OrderRow` shape widened** — added `notes`, `source`. Existing OrderRow consumers may need adjustment; the implementer should grep usages.

Plan complete.
