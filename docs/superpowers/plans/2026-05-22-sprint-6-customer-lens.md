# Sprint 6 — Customer lens (directory / detail / add + quiet-customer nudge)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Karan (the orchestrator) reviews after each task.

**Goal:** Stand up the full §8 Customers surface — directory with search + dynamic filter chips + sort, detail screen with stats/actions/notes/order-history/complaints, standalone add flow with chip-based channel picker (incl. inline `+ Add channel…`), edit flow, and the soft quiet-customer re-engagement nudge on both Customers list and Today block 2.5. Replaces the `CustomersPage` stub (`Sprint 6.` placeholder).

**Architecture:** Pure-TS `isQuiet()` function in `src/features/customers/quiet.ts` so the quiet predicate is testable in isolation and reusable across Customers directory, the Today block, and Customer detail. API surface extends `src/features/customers/api.ts` (no separate `detail.ts` — one module is the established pattern). Reusable `ChannelChipPicker` component handles the inline `+ Add channel…` affordance and is consumed by both `AddCustomerPage` and the existing Sprint 4 `AddCustomerInlineModal`. Edit Customer reuses AddCustomerPage with an `editingCustomerId` prop, mirroring Sprint 5 ADR-20 (no field-level locking; full editability per spec). No new Supabase migration — the `channels` table, seed rows, `customers.last_contacted_at`/`last_ordered_at` columns, and the `last_ordered_at` denorm trigger all already exist from Sprint 0 (`0001_init.sql`).

**Tech Stack:** Vite + React 18 + TS strict + Tailwind + Supabase JS + Vitest/RTL + react-router-dom. No new dependencies.

---

## File map (created or modified)

**Created:**
- `src/features/customers/quiet.ts` — pure `isQuiet()` + `quietDurationDays()` helpers.
- `src/features/customers/quiet.test.ts` — 8 invariants on the predicate.
- `src/features/customers/ChannelChipPicker.tsx` — reusable chip row with `+ Add channel…`.
- `src/features/customers/AddCustomerPage.tsx` — standalone add flow at `/customers/new`.
- `src/features/customers/EditCustomerPage.tsx` — thin wrapper at `/customers/:id/edit`.
- `src/features/customers/CustomerDetailPage.tsx` — `/customers/:id`.
- `src/features/customers/QuietCustomerNudge.tsx` — Today block 2.5.
- `docs/decisions/2026-05-22-sprint-6-architecture-decisions.md` — ADRs 22-26 (created at sprint close).

**Modified:**
- `src/features/customers/api.ts` — add `getCustomerDetail`, `listOrdersForCustomer`, `listOpenComplaintsForCustomer`, `listCustomersFiltered`, `updateCustomer`, `archiveCustomer`, `deleteCustomer`, `bumpLastContacted`, `createChannel`, `listQuietCustomers`, full `CustomerDetailRow` type, `CustomerFilter` type.
- `src/features/customers/CustomersPage.tsx` — replace stub with directory.
- `src/features/orders/AddCustomerInlineModal.tsx` — swap channel `<select>` for `ChannelChipPicker` with inline-add.
- `src/features/today/TodayPage.tsx` — add Block 2.5 between current Block 2 and footer.
- `src/App.tsx` — add `/customers/new`, `/customers/:id`, `/customers/:id/edit` routes.
- `CLAUDE.md` — Sprint 6 status line at end.

---

## Task 1: Pure `isQuiet()` predicate (TDD)

**Files:**
- Create: `src/features/customers/quiet.ts`
- Test: `src/features/customers/quiet.test.ts`

Spec §8 "Quiet customers (soft re-engagement nudge)" defines:
- Quiet if `MAX(last_ordered_at, last_contacted_at, created_at) + threshold < today`.
- Thresholds: Reseller 21d, Personal 60d, Exhibition (no orders) 30d after created_at, Exhibition (with orders) 90d.

The predicate is pure: takes the customer's stamps + channel-name + today, returns `{ isQuiet: boolean; daysSince: number; thresholdDays: number }`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/features/customers/quiet.test.ts
import { describe, it, expect } from 'vitest';
import { isQuiet, quietDurationDays, type QuietInput } from './quiet';

const base: QuietInput = {
  channel_name: 'Personal',
  last_ordered_at: null,
  last_contacted_at: null,
  created_at: '2026-01-01T00:00:00+05:30',
};

describe('quietDurationDays', () => {
  it('Reseller → 21', () => expect(quietDurationDays('Reseller', false)).toBe(21));
  it('Personal → 60', () => expect(quietDurationDays('Personal', false)).toBe(60));
  it('Personal → 60 regardless of has_orders flag', () =>
    expect(quietDurationDays('Personal', true)).toBe(60));
  it('Exhibition with no orders → 30', () =>
    expect(quietDurationDays('Exhibition', false)).toBe(30));
  it('Exhibition with orders → 90', () =>
    expect(quietDurationDays('Exhibition', true)).toBe(90));
  it('Unknown / custom channel → 60 (default like Personal)', () =>
    expect(quietDurationDays('Friends', false)).toBe(60));
});

describe('isQuiet', () => {
  const today = '2026-05-22';

  it('Personal customer never ordered, created 90 days ago → quiet', () => {
    const r = isQuiet({ ...base, channel_name: 'Personal', created_at: '2026-02-21T00:00:00+05:30' }, today);
    expect(r.isQuiet).toBe(true);
    expect(r.daysSince).toBeGreaterThanOrEqual(90);
    expect(r.thresholdDays).toBe(60);
  });

  it('Personal customer ordered 30 days ago → NOT quiet (under 60 threshold)', () => {
    const r = isQuiet(
      { ...base, channel_name: 'Personal', last_ordered_at: '2026-04-22T10:00:00+05:30' },
      today,
    );
    expect(r.isQuiet).toBe(false);
  });

  it('Reseller contacted 22 days ago → quiet (over 21 threshold)', () => {
    const r = isQuiet(
      { ...base, channel_name: 'Reseller', last_contacted_at: '2026-04-30T10:00:00+05:30' },
      today,
    );
    expect(r.isQuiet).toBe(true);
  });

  it('Exhibition customer never ordered, created 20 days ago → NOT quiet (under 30)', () => {
    const r = isQuiet(
      { ...base, channel_name: 'Exhibition', created_at: '2026-05-02T00:00:00+05:30' },
      today,
    );
    expect(r.isQuiet).toBe(false);
    expect(r.thresholdDays).toBe(30);
  });

  it('Exhibition customer with orders, last ordered 100 days ago → quiet (over 90)', () => {
    const r = isQuiet(
      {
        ...base,
        channel_name: 'Exhibition',
        last_ordered_at: '2026-02-11T10:00:00+05:30',
      },
      today,
    );
    expect(r.isQuiet).toBe(true);
    expect(r.thresholdDays).toBe(90);
  });

  it('uses the MOST RECENT of last_ordered_at / last_contacted_at / created_at', () => {
    // Personal, created 200d ago, no orders, contacted 10d ago → not quiet
    const r = isQuiet(
      {
        channel_name: 'Personal',
        last_ordered_at: null,
        last_contacted_at: '2026-05-12T10:00:00+05:30',
        created_at: '2025-11-01T00:00:00+05:30',
      },
      today,
    );
    expect(r.isQuiet).toBe(false);
    expect(r.daysSince).toBeLessThan(15);
  });
});
```

- [ ] **Step 2: Run failing tests**

```powershell
npm test -- src/features/customers/quiet.test.ts
```

Expected: FAIL with "Cannot find module './quiet'".

- [ ] **Step 3: Implement `quiet.ts`**

```ts
// src/features/customers/quiet.ts

export type QuietInput = {
  channel_name: string;
  last_ordered_at: string | null;
  last_contacted_at: string | null;
  created_at: string;
};

export function quietDurationDays(channelName: string, hasOrders: boolean): number {
  const name = channelName.trim().toLowerCase();
  if (name === 'reseller') return 21;
  if (name === 'exhibition') return hasOrders ? 90 : 30;
  // Personal AND any custom channel default to 60d (per spec §8 — custom
  // channels behave like Personal for v1; tuning per-channel is a v2 setting)
  return 60;
}

export function isQuiet(
  input: QuietInput,
  todayDate: string, // YYYY-MM-DD in Asia/Kolkata (todayInTz())
): { isQuiet: boolean; daysSince: number; thresholdDays: number } {
  const hasOrders = input.last_ordered_at !== null;
  const thresholdDays = quietDurationDays(input.channel_name, hasOrders);

  const anchorIso = [input.last_ordered_at, input.last_contacted_at, input.created_at]
    .filter((x): x is string => x !== null)
    .reduce<string>((max, cur) => (cur > max ? cur : max), input.created_at);

  const anchorMs = new Date(anchorIso).getTime();
  // Treat todayDate as midnight Asia/Kolkata
  const todayMs = new Date(`${todayDate}T00:00:00+05:30`).getTime();
  const daysSince = Math.floor((todayMs - anchorMs) / (24 * 60 * 60 * 1000));

  return {
    isQuiet: daysSince > thresholdDays,
    daysSince: Math.max(0, daysSince),
    thresholdDays,
  };
}
```

- [ ] **Step 4: Run tests + typecheck**

```powershell
npm test -- src/features/customers/quiet.test.ts
npm run typecheck
```

Expected: all tests pass; typecheck clean.

- [ ] **Step 5: Commit**

```powershell
git add src/features/customers/quiet.ts src/features/customers/quiet.test.ts
git commit -m "Sprint 6 Task 1: pure isQuiet() predicate + 11 tests"
```

---

## Task 2: Extend customers API

**Files:**
- Modify: `src/features/customers/api.ts`
- Test: `src/features/customers/api.test.ts` (new — for the more interesting methods)

Goal: provide the data layer for tasks 3-8. Many methods are thin Supabase wrappers; only the more interesting ones get tests.

- [ ] **Step 1: Read the current file**

Read `src/features/customers/api.ts` to confirm existing exports — already has `CustomerRow`, `listActiveCustomers`, `listCustomersByIds`, `searchCustomersByName`, `createCustomerQuick`, `listChannels`.

- [ ] **Step 2: Extend the API**

Add to `src/features/customers/api.ts`:

```ts
// ... existing imports stay ...

// EXTEND CustomerRow — search needs to also key on phone (spec §8.1 directory top bar)
// Actually: keep the existing CustomerRow as-is; add a fuller type for detail.

export type CustomerFullRow = CustomerRow & {
  size_tier: 'small' | 'large' | null;
  source_event_id: string | null;
  notes: string | null;
  active: boolean;
  last_contacted_at: string | null;
  last_ordered_at: string | null;
  created_at: string;
  channel_name: string;
};

export type CustomerDetailRow = CustomerFullRow & {
  source_event_name: string | null;
  order_count: number;
  outstanding_total: number;
};

export type CustomerListItem = CustomerFullRow & {
  order_count: number;
};

export type CustomerFilter =
  | { kind: 'all' }
  | { kind: 'size'; value: 'large' | 'small' | 'unsorted' }
  | { kind: 'channel'; channelId: string }
  | { kind: 'quiet' };

export type CustomerSort = 'recent_order' | 'a_z' | 'most_ordered';

export async function getCustomerDetail(id: string): Promise<CustomerDetailRow | null> {
  const { data, error } = await supabase
    .from('customers')
    .select(
      'id, name, phone, channel_id, size_tier, source_event_id, notes, active, last_contacted_at, last_ordered_at, created_at, channels(name), events:source_event_id(name), orders(payment_status, order_items(qty, unit_price))',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  type Raw = CustomerFullRow & {
    channels: { name: string } | null;
    events: { name: string } | null;
    orders: { payment_status: string; order_items: { qty: number; unit_price: number }[] | null }[] | null;
  };
  const r = data as unknown as Raw;
  const orders = r.orders ?? [];
  const outstanding_total = orders
    .filter((o) => o.payment_status === 'unpaid' || o.payment_status === 'partial')
    .reduce((sum, o) => sum + (o.order_items ?? []).reduce((s, i) => s + Number(i.qty) * Number(i.unit_price), 0), 0);
  return {
    id: r.id,
    name: r.name,
    phone: r.phone,
    channel_id: r.channel_id,
    size_tier: r.size_tier,
    source_event_id: r.source_event_id,
    notes: r.notes,
    active: r.active,
    last_contacted_at: r.last_contacted_at,
    last_ordered_at: r.last_ordered_at,
    created_at: r.created_at,
    channel_name: r.channels?.name ?? '(unknown)',
    source_event_name: r.events?.name ?? null,
    order_count: orders.length,
    outstanding_total,
  };
}

export async function listOrdersForCustomer(customerId: string): Promise<
  {
    id: string;
    ordered_at: string;
    target_fulfilment_date: string | null;
    fulfilled_at: string | null;
    payment_status: 'unpaid' | 'paid' | 'partial';
    item_summary: string;
    total: number;
  }[]
> {
  const { data, error } = await supabase
    .from('orders')
    .select(
      'id, ordered_at, target_fulfilment_date, fulfilled_at, payment_status, order_items(qty, unit_price, products(name))',
    )
    .eq('customer_id', customerId)
    .order('ordered_at', { ascending: false });
  if (error) throw new Error(error.message);

  type Raw = {
    id: string;
    ordered_at: string;
    target_fulfilment_date: string | null;
    fulfilled_at: string | null;
    payment_status: 'unpaid' | 'paid' | 'partial';
    order_items: { qty: number; unit_price: number; products: { name: string } | null }[] | null;
  };
  return (data as unknown as Raw[]).map((r) => {
    const items = r.order_items ?? [];
    const total = items.reduce((s, i) => s + Number(i.qty) * Number(i.unit_price), 0);
    const names = items.map((i) => `${i.qty} ${i.products?.name ?? '?'}`);
    const item_summary = names.slice(0, 2).join(', ') + (names.length > 2 ? `, +${names.length - 2} more` : '');
    return {
      id: r.id,
      ordered_at: r.ordered_at,
      target_fulfilment_date: r.target_fulfilment_date,
      fulfilled_at: r.fulfilled_at,
      payment_status: r.payment_status,
      item_summary,
      total,
    };
  });
}

export async function listOpenComplaintsForCustomer(customerId: string): Promise<
  { id: string; order_id: string; kind: string; description: string; reported_at: string }[]
> {
  const { data, error } = await supabase
    .from('complaints')
    .select('id, order_id, kind, description, reported_at, orders!inner(customer_id)')
    .eq('orders.customer_id', customerId)
    .is('resolved_at', null)
    .order('reported_at', { ascending: false });
  if (error) throw new Error(error.message);
  type Raw = { id: string; order_id: string; kind: string; description: string; reported_at: string };
  return (data ?? []) as Raw[];
}

export async function listCustomersFiltered(
  search: string,
  filter: CustomerFilter,
  sort: CustomerSort,
): Promise<CustomerListItem[]> {
  let q = supabase
    .from('customers')
    .select(
      'id, name, phone, channel_id, size_tier, source_event_id, notes, active, last_contacted_at, last_ordered_at, created_at, channels(name), orders(id)',
    )
    .eq('active', true);

  const trimmed = search.trim();
  if (trimmed.length > 0) {
    // Search across name OR phone (spec §8 directory top bar)
    q = q.or(`name.ilike.%${trimmed}%,phone.ilike.%${trimmed}%`);
  }

  if (filter.kind === 'size') {
    if (filter.value === 'unsorted') q = q.is('size_tier', null);
    else q = q.eq('size_tier', filter.value);
  } else if (filter.kind === 'channel') {
    q = q.eq('channel_id', filter.channelId);
  }
  // 'quiet' filter is post-query (predicate uses derived fields) — see below.

  if (sort === 'a_z') q = q.order('name', { ascending: true });
  else if (sort === 'recent_order') q = q.order('last_ordered_at', { ascending: false, nullsFirst: false });
  // 'most_ordered' is post-query (count derived) — sort after the JS reduce.

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  type Raw = CustomerFullRow & {
    channels: { name: string } | null;
    orders: { id: string }[] | null;
  };
  let rows: CustomerListItem[] = (data as unknown as Raw[]).map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    channel_id: r.channel_id,
    size_tier: r.size_tier,
    source_event_id: r.source_event_id,
    notes: r.notes,
    active: r.active,
    last_contacted_at: r.last_contacted_at,
    last_ordered_at: r.last_ordered_at,
    created_at: r.created_at,
    channel_name: r.channels?.name ?? '(unknown)',
    order_count: (r.orders ?? []).length,
  }));

  if (filter.kind === 'quiet') {
    const { isQuiet } = await import('./quiet');
    const { todayInTz } = await import('@/lib/utils');
    const today = todayInTz();
    rows = rows.filter((r) => isQuiet({
      channel_name: r.channel_name,
      last_ordered_at: r.last_ordered_at,
      last_contacted_at: r.last_contacted_at,
      created_at: r.created_at,
    }, today).isQuiet);
  }

  if (sort === 'most_ordered') {
    rows.sort((a, b) => b.order_count - a.order_count || a.name.localeCompare(b.name));
  }

  return rows;
}

export async function listQuietCustomers(limit = 3): Promise<CustomerListItem[]> {
  // Cheap implementation: fetch all active customers + apply isQuiet predicate.
  // v1 scale (~100s of customers) makes this fine. Sort by daysSince DESC, cap by limit.
  const all = await listCustomersFiltered('', { kind: 'all' }, 'a_z');
  const { isQuiet } = await import('./quiet');
  const { todayInTz } = await import('@/lib/utils');
  const today = todayInTz();
  return all
    .map((c) => ({
      c,
      q: isQuiet(
        {
          channel_name: c.channel_name,
          last_ordered_at: c.last_ordered_at,
          last_contacted_at: c.last_contacted_at,
          created_at: c.created_at,
        },
        today,
      ),
    }))
    .filter((x) => x.q.isQuiet)
    .sort((a, b) => b.q.daysSince - a.q.daysSince)
    .slice(0, limit)
    .map((x) => x.c);
}

export async function createCustomerFull(input: {
  name: string;
  phone: string | null;
  channel_id: string;
  size_tier: 'small' | 'large' | null;
  source_event_id: string | null;
  notes: string | null;
}): Promise<string> {
  const { data, error } = await supabase.from('customers').insert(input).select('id').single();
  if (error || !data) throw new Error(error?.message ?? 'customer insert failed');
  return data.id;
}

export async function updateCustomer(
  id: string,
  patch: Partial<{
    name: string;
    phone: string | null;
    channel_id: string;
    size_tier: 'small' | 'large' | null;
    source_event_id: string | null;
    notes: string | null;
  }>,
): Promise<void> {
  const { error } = await supabase.from('customers').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function archiveCustomer(id: string): Promise<void> {
  const { error } = await supabase.from('customers').update({ active: false }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteCustomer(id: string): Promise<void> {
  // Caller must verify zero orders; spec §8.2 footer actions enforce that in UI.
  const { error } = await supabase.from('customers').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function bumpLastContacted(id: string): Promise<void> {
  const { error } = await supabase
    .from('customers')
    .update({ last_contacted_at: new Date().toISOString() }) // timestamptz column — ISO string is correct
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function findCustomerByPhone(phone: string): Promise<{ id: string; name: string } | null> {
  const trimmed = phone.trim();
  if (!trimmed) return null;
  const { data, error } = await supabase
    .from('customers')
    .select('id, name')
    .eq('phone', trimmed)
    .eq('active', true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

export async function createChannel(name: string): Promise<{ id: string; name: string }> {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 20) {
    throw new Error('Channel name must be 1-20 characters.');
  }
  const { data, error } = await supabase
    .from('channels')
    .insert({ name: trimmed, is_system: false, active: true })
    .select('id, name')
    .single();
  if (error || !data) {
    // Postgres unique-violation on lower(name) → 23505. Friendlier message.
    if (error?.code === '23505') throw new Error(`Channel "${trimmed}" already exists.`);
    throw new Error(error?.message ?? 'channel insert failed');
  }
  return data;
}
```

- [ ] **Step 3: Write tests for the more interesting bits**

Create `src/features/customers/api.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fromMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
}));

import { createChannel, findCustomerByPhone, bumpLastContacted } from './api';

beforeEach(() => fromMock.mockReset());

describe('createChannel', () => {
  it('trims and rejects empty', async () => {
    await expect(createChannel('   ')).rejects.toThrow('1-20 characters');
  });

  it('rejects names over 20 chars', async () => {
    await expect(createChannel('a'.repeat(21))).rejects.toThrow('1-20 characters');
  });

  it('translates 23505 unique-violation to a friendly message', async () => {
    const single = vi.fn().mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'unique' } });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    fromMock.mockReturnValueOnce({ insert });
    await expect(createChannel('Personal')).rejects.toThrow(/already exists/);
  });

  it('returns the new channel on success', async () => {
    const single = vi.fn().mockResolvedValueOnce({ data: { id: 'ch1', name: 'Friends' }, error: null });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    fromMock.mockReturnValueOnce({ insert });
    const ch = await createChannel(' Friends ');
    expect(ch).toEqual({ id: 'ch1', name: 'Friends' });
    expect(insert).toHaveBeenCalledWith({ name: 'Friends', is_system: false, active: true });
  });
});

describe('findCustomerByPhone', () => {
  it('returns null on empty input without hitting the DB', async () => {
    const out = await findCustomerByPhone('   ');
    expect(out).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('passes trimmed phone to .eq() and returns match', async () => {
    const maybeSingle = vi.fn().mockResolvedValueOnce({ data: { id: 'c1', name: 'Sunita' }, error: null });
    const eqActive = vi.fn(() => ({ maybeSingle }));
    const eqPhone = vi.fn(() => ({ eq: eqActive }));
    const select = vi.fn(() => ({ eq: eqPhone }));
    fromMock.mockReturnValueOnce({ select });
    const out = await findCustomerByPhone(' 9876543210 ');
    expect(out).toEqual({ id: 'c1', name: 'Sunita' });
    expect(eqPhone).toHaveBeenCalledWith('phone', '9876543210');
  });
});

describe('bumpLastContacted', () => {
  it('writes an ISO timestamp via .update().eq()', async () => {
    const eq = vi.fn().mockResolvedValueOnce({ error: null });
    const update = vi.fn(() => ({ eq }));
    fromMock.mockReturnValueOnce({ update });
    await bumpLastContacted('c1');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ last_contacted_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) }),
    );
    expect(eq).toHaveBeenCalledWith('id', 'c1');
  });
});
```

- [ ] **Step 4: Tests + typecheck**

```powershell
npm test -- src/features/customers/api.test.ts
npm run typecheck
```

Expected: 8 tests pass; typecheck clean.

- [ ] **Step 5: Commit**

```powershell
git add src/features/customers/api.ts src/features/customers/api.test.ts
git commit -m "Sprint 6 Task 2: customers API extensions + 8 tests"
```

---

## Task 3: ChannelChipPicker + upgrade AddCustomerInlineModal

**Files:**
- Create: `src/features/customers/ChannelChipPicker.tsx`
- Modify: `src/features/orders/AddCustomerInlineModal.tsx`

- [ ] **Step 1: Create the ChannelChipPicker**

```tsx
// src/features/customers/ChannelChipPicker.tsx
import { useEffect, useState } from 'react';
import { createChannel, listChannels } from './api';

type Channel = { id: string; name: string };

type Props = {
  value: string | null;
  onChange: (channelId: string) => void;
  allowInlineAdd?: boolean; // default true
};

export function ChannelChipPicker({ value, onChange, allowInlineAdd = true }: Props) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [addingNew, setAddingNew] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const cs = await listChannels();
      setChannels(cs);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function saveNew() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      const ch = await createChannel(trimmed);
      setChannels((arr) => [...arr, ch]);
      onChange(ch.id);
      setDraft('');
      setAddingNew(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {channels.map((c) => {
          const selected = c.id === value;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onChange(c.id)}
              className={`h-9 rounded-pill border px-3 text-body-sm ${
                selected
                  ? 'border-brand-orange bg-brand-orange text-white'
                  : 'border-ink-900/20 bg-paper text-ink-900'
              }`}
            >
              {c.name}
            </button>
          );
        })}
        {allowInlineAdd && !addingNew && (
          <button
            type="button"
            onClick={() => setAddingNew(true)}
            className="h-9 rounded-pill border border-dashed border-ink-900/30 bg-paper px-3 text-body-sm text-ink-500"
          >
            + Add channel…
          </button>
        )}
        {addingNew && (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={20}
              placeholder="Channel name"
              className="h-9 w-36 rounded-pill border border-ink-900/20 bg-paper px-3 text-body-sm text-ink-900"
            />
            <button
              type="button"
              onClick={saveNew}
              disabled={saving || draft.trim().length === 0}
              className="h-9 rounded-pill bg-brand-orange px-3 text-body-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? '…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => { setAddingNew(false); setDraft(''); setError(null); }}
              className="text-body-sm text-ink-500"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
      {error && <p className="mt-2 text-body-sm text-status-danger-fg">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Upgrade AddCustomerInlineModal to use the chip picker**

In `src/features/orders/AddCustomerInlineModal.tsx`:

**2a.** Remove the `listChannels` import, the local `Channel` type, the `channels` state, and the `useEffect` that loads channels. Keep `channelId` state.

**2b.** Add import:
```ts
import { ChannelChipPicker } from '@/features/customers/ChannelChipPicker';
```

**2c.** Replace the existing channel `<select>` block (the entire `<label className="block"><span className={labelSpan}>Channel</span><select ...>...</select></label>`) with:

```tsx
<div>
  <span className={labelSpan}>Channel</span>
  <div className="mt-1">
    <ChannelChipPicker value={channelId || null} onChange={setChannelId} />
  </div>
</div>
```

(Note: the `canSubmit` check already requires `channelId.length > 0`; chip picker's `onChange` sets the id when the first chip is tapped. If mom opens the modal and doesn't tap any chip, save remains disabled — same UX as before.)

- [ ] **Step 3: Typecheck + tests**

```powershell
npm run typecheck
npm test
```

Expected: full suite passes. No new tests for ChannelChipPicker — interaction is verified at sprint close in the browser smoke.

- [ ] **Step 4: Commit**

```powershell
git add src/features/customers/ChannelChipPicker.tsx src/features/orders/AddCustomerInlineModal.tsx
git commit -m "Sprint 6 Task 3: ChannelChipPicker + upgrade inline modal"
```

---

## Task 4: AddCustomerPage standalone

**Files:**
- Create: `src/features/customers/AddCustomerPage.tsx`
- Modify: `src/App.tsx` — add `/customers/new` route

The full 6-field form per spec §8.3 "Add customer flow":
1. Name (required)
2. Phone (required for personal/reseller; optional for exhibition)
3. Channel (required) — via ChannelChipPicker
4. Size tier (optional)
5. Source event (optional dropdown; auto-set when channel is Exhibition and an active event exists — Sprint 7 builds events, so for Sprint 6 the dropdown is a placeholder "(events ship in Sprint 7)" if no events exist)
6. Notes (optional)

Plus dup-on-phone detection per §8.3 "Duplicate detection on save".

- [ ] **Step 1: Create the page**

```tsx
// src/features/customers/AddCustomerPage.tsx
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChannelChipPicker } from './ChannelChipPicker';
import {
  createCustomerFull,
  findCustomerByPhone,
  getCustomerDetail,
  listChannels,
  updateCustomer,
} from './api';

const SIZES: { value: 'small' | 'large' | null; label: string }[] = [
  { value: null, label: '—' },
  { value: 'small', label: 'Small' },
  { value: 'large', label: 'Large' },
];

export function AddCustomerPage({ editingCustomerId }: { editingCustomerId?: string } = {}) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [channelId, setChannelId] = useState<string | null>(null);
  const [channelName, setChannelName] = useState<string>('');
  const [sizeTier, setSizeTier] = useState<'small' | 'large' | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dupExisting, setDupExisting] = useState<{ id: string; name: string } | null>(null);

  // Track channel name for phone-required-by-channel logic
  useEffect(() => {
    if (!channelId) { setChannelName(''); return; }
    listChannels().then((cs) => setChannelName(cs.find((c) => c.id === channelId)?.name ?? ''));
  }, [channelId]);

  // Hydrate in edit mode
  useEffect(() => {
    if (!editingCustomerId) return;
    (async () => {
      try {
        const c = await getCustomerDetail(editingCustomerId);
        if (!c) { setError('Customer not found.'); return; }
        setName(c.name);
        setPhone(c.phone ?? '');
        setChannelId(c.channel_id);
        setSizeTier(c.size_tier);
        setNotes(c.notes ?? '');
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [editingCustomerId]);

  const channelLower = channelName.trim().toLowerCase();
  const phoneRequired = channelLower !== 'exhibition'; // spec §8 "phone optional for exhibition only"
  const phoneOk = !phoneRequired || phone.trim().length > 0;
  const canSubmit = name.trim().length > 0 && channelId !== null && phoneOk && !submitting;

  async function onSubmit(e: React.FormEvent, useExistingId?: string) {
    e.preventDefault();
    if (!canSubmit && !useExistingId) return;
    setSubmitting(true);
    setError(null);
    try {
      const trimmedPhone = phone.trim() || null;

      if (useExistingId) {
        // Mom chose "use existing" from the dup modal → just navigate there.
        setDupExisting(null);
        navigate(`/customers/${useExistingId}`);
        return;
      }

      // Dup check on phone (skip for edit mode if the phone is unchanged from the original)
      if (trimmedPhone && !editingCustomerId) {
        const existing = await findCustomerByPhone(trimmedPhone);
        if (existing) {
          setDupExisting(existing);
          setSubmitting(false);
          return;
        }
      }

      if (editingCustomerId) {
        await updateCustomer(editingCustomerId, {
          name: name.trim(),
          phone: trimmedPhone,
          channel_id: channelId!,
          size_tier: sizeTier,
          notes: notes.trim() || null,
        });
        navigate(`/customers/${editingCustomerId}`);
      } else {
        const id = await createCustomerFull({
          name: name.trim(),
          phone: trimmedPhone,
          channel_id: channelId!,
          size_tier: sizeTier,
          source_event_id: null, // Sprint 7 wires the events dropdown
          notes: notes.trim() || null,
        });
        navigate(`/customers/${id}`);
      }
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  const inputClass = 'mt-1 h-11 w-full rounded-input border border-ink-900/10 bg-paper-elevated px-3 text-body';
  const labelSpan = 'text-label uppercase text-ink-500';

  return (
    <div>
      <h1 className="text-title text-ink-900">{editingCustomerId ? 'Edit customer' : 'Add customer'}</h1>
      <form onSubmit={(e) => onSubmit(e)} className="mt-6 space-y-4">
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
          <span className={labelSpan}>Phone {phoneRequired ? '' : '(optional)'}</span>
          <input
            className={inputClass}
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>

        <div>
          <span className={labelSpan}>Channel</span>
          <div className="mt-1">
            <ChannelChipPicker value={channelId} onChange={setChannelId} />
          </div>
        </div>

        <div>
          <span className={labelSpan}>Size tier (optional)</span>
          <div className="mt-1 flex gap-2">
            {SIZES.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => setSizeTier(s.value)}
                className={`h-9 rounded-pill border px-3 text-body-sm ${
                  sizeTier === s.value
                    ? 'border-brand-orange bg-brand-orange text-white'
                    : 'border-ink-900/20 bg-paper text-ink-900'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className={labelSpan}>Notes (optional)</span>
          <textarea
            className="mt-1 w-full rounded-input border border-ink-900/10 bg-paper-elevated px-3 py-2 text-body"
            rows={3}
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
          {submitting ? 'Saving…' : editingCustomerId ? 'Save changes' : 'Save customer'}
        </button>

        <p className="text-body-sm text-ink-500">
          <Link to="/customers" className="underline">← Back to customers</Link>
        </p>
      </form>

      {dupExisting && (
        <>
          <div className="fixed inset-0 z-40 bg-ink-900/40" onClick={() => setDupExisting(null)} />
          <div
            role="dialog"
            className="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-paper-elevated p-5 shadow-2xl"
          >
            <h2 className="text-subtitle text-ink-900">{dupExisting.name} already exists</h2>
            <p className="mt-2 text-body text-ink-700">
              A customer with this phone number is already in the directory.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={(e) => onSubmit(e as unknown as React.FormEvent, dupExisting.id)}
                className="h-11 flex-1 rounded-btn bg-brand-orange text-body font-semibold text-white"
              >
                Use existing
              </button>
              <button
                type="button"
                onClick={async (e) => {
                  // Save as new — bypass the dup check by re-submitting via a flag
                  setDupExisting(null);
                  setSubmitting(true);
                  try {
                    const id = await createCustomerFull({
                      name: name.trim(),
                      phone: phone.trim() || null,
                      channel_id: channelId!,
                      size_tier: sizeTier,
                      source_event_id: null,
                      notes: notes.trim() || null,
                    });
                    navigate(`/customers/${id}`);
                  } catch (err) {
                    setError((err as Error).message);
                    setSubmitting(false);
                  }
                }}
                className="h-11 flex-1 rounded-btn-sm border border-ink-900/10 bg-paper-elevated text-body text-ink-900"
              >
                Save as new
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire route in `src/App.tsx`**

Add to the imports:
```tsx
import { AddCustomerPage } from '@/features/customers/AddCustomerPage';
```

Add the route inside the Protected block, near `/customers`:
```tsx
<Route path="/customers/new" element={<AddCustomerPage />} />
```

(**Route ordering note:** `/customers/new` must come BEFORE `/customers/:id` — same lesson as Sprint 5 Task 8.)

- [ ] **Step 3: Typecheck + tests**

```powershell
npm run typecheck
npm test
```

Expected: full suite still passes.

- [ ] **Step 4: Commit**

```powershell
git add src/features/customers/AddCustomerPage.tsx src/App.tsx
git commit -m "Sprint 6 Task 4: AddCustomerPage standalone + dup-on-phone modal"
```

---

## Task 5: CustomersPage directory

**Files:**
- Modify: `src/features/customers/CustomersPage.tsx`

Replace the stub with the full directory per spec §8.1.

- [ ] **Step 1: Implement**

```tsx
// src/features/customers/CustomersPage.tsx
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  listChannels,
  listCustomersFiltered,
  type CustomerFilter,
  type CustomerListItem,
  type CustomerSort,
} from './api';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { isQuiet } from './quiet';
import { todayInTz } from '@/lib/utils';

type Channel = { id: string; name: string };

const FIXED_CHIPS: { label: string; filter: CustomerFilter }[] = [
  { label: 'All', filter: { kind: 'all' } },
  { label: 'Large', filter: { kind: 'size', value: 'large' } },
  { label: 'Small', filter: { kind: 'size', value: 'small' } },
  { label: 'Unsorted', filter: { kind: 'size', value: 'unsorted' } },
  { label: 'Quiet', filter: { kind: 'quiet' } },
];

const SORT_LABELS: Record<CustomerSort, string> = {
  recent_order: 'Recent order',
  a_z: 'A–Z',
  most_ordered: 'Most ordered',
};

export function CustomersPage() {
  const [params, setParams] = useSearchParams();
  const filterParam = params.get('filter') ?? 'all';
  const channelParam = params.get('channel');
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 200);
  const [sort, setSort] = useState<CustomerSort>('recent_order');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [rows, setRows] = useState<CustomerListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const filter: CustomerFilter = useMemo(() => {
    if (channelParam) return { kind: 'channel', channelId: channelParam };
    const fx = FIXED_CHIPS.find((c) => c.label.toLowerCase() === filterParam);
    return fx ? fx.filter : { kind: 'all' };
  }, [filterParam, channelParam]);

  useEffect(() => {
    listChannels().then(setChannels).catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    setLoading(true);
    listCustomersFiltered(debounced, filter, sort)
      .then((rs) => { setRows(rs); setError(null); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [debounced, filter, sort]);

  function setFixedFilter(label: string) {
    const next = new URLSearchParams(params);
    if (label.toLowerCase() === 'all') next.delete('filter');
    else next.set('filter', label.toLowerCase());
    next.delete('channel');
    setParams(next, { replace: true });
  }
  function setChannelFilter(channelId: string) {
    const next = new URLSearchParams(params);
    next.set('channel', channelId);
    next.delete('filter');
    setParams(next, { replace: true });
  }

  const today = todayInTz();
  const sysChannels = channels.filter((c) => ['reseller', 'personal', 'exhibition'].includes(c.name.toLowerCase()));
  const customChannels = channels.filter((c) => !sysChannels.includes(c));

  return (
    <div>
      <header className="flex items-baseline justify-between">
        <h1 className="text-title text-ink-900">Customers</h1>
        <Link
          to="/customers/new"
          className="text-body-sm font-semibold text-brand-orange"
        >
          + Add customer
        </Link>
      </header>

      <input
        type="search"
        placeholder="Search name or phone…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mt-4 h-11 w-full rounded-input border border-ink-900/10 bg-paper-elevated px-3 text-body"
      />

      <div className="mt-3 flex flex-wrap gap-2 overflow-x-auto text-body-sm">
        {FIXED_CHIPS.map((c) => {
          const active = (c.filter.kind === 'all' && filter.kind === 'all') ||
            (c.filter.kind === 'size' && filter.kind === 'size' && filter.value === c.filter.value) ||
            (c.filter.kind === 'quiet' && filter.kind === 'quiet');
          return (
            <button
              key={c.label}
              type="button"
              onClick={() => setFixedFilter(c.label)}
              className={`h-8 rounded-pill border px-3 ${
                active ? 'border-brand-orange bg-brand-orange text-white' : 'border-ink-900/20 bg-paper text-ink-900'
              }`}
            >
              {c.label}
            </button>
          );
        })}
        {[...sysChannels, ...customChannels].map((ch) => {
          const active = filter.kind === 'channel' && filter.channelId === ch.id;
          return (
            <button
              key={ch.id}
              type="button"
              onClick={() => setChannelFilter(ch.id)}
              className={`h-8 rounded-pill border px-3 ${
                active ? 'border-brand-orange bg-brand-orange text-white' : 'border-ink-900/20 bg-paper text-ink-900'
              }`}
            >
              {ch.name}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex justify-end">
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as CustomerSort)}
          className="h-8 rounded-pill border border-ink-900/20 bg-paper px-3 text-body-sm text-ink-900"
        >
          {Object.entries(SORT_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {error && <p className="mt-4 text-body-sm text-status-danger-fg">{error}</p>}
      {loading && rows.length === 0 && <p className="mt-4 text-body-sm text-ink-500">Loading…</p>}

      <ul className="mt-4 space-y-2">
        {rows.map((r) => {
          const q = isQuiet({
            channel_name: r.channel_name,
            last_ordered_at: r.last_ordered_at,
            last_contacted_at: r.last_contacted_at,
            created_at: r.created_at,
          }, today);
          return (
            <li key={r.id}>
              <Link to={`/customers/${r.id}`} className="block rounded-card bg-paper-elevated p-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-body font-semibold text-ink-900">{r.name}</span>
                  <span className="text-body-sm text-ink-500">
                    {r.last_ordered_at ? `ordered ${humanDate(r.last_ordered_at, today)}` : 'never ordered'}
                  </span>
                </div>
                <div className="mt-1 text-body-sm text-ink-500">
                  {r.channel_name} · {r.size_tier ?? '—'} · {r.order_count} orders
                  {q.isQuiet && ` · quiet ${Math.floor(q.daysSince / 7)}w`}
                </div>
              </Link>
            </li>
          );
        })}
        {!loading && rows.length === 0 && (
          <li className="text-body-sm text-ink-500">
            {filter.kind === 'quiet'
              ? "No quiet customers — you're in touch with everyone."
              : 'No customers match this filter.'}
          </li>
        )}
      </ul>
    </div>
  );
}

function humanDate(iso: string, todayDate: string): string {
  const then = new Date(iso).getTime();
  const today = new Date(`${todayDate}T00:00:00+05:30`).getTime();
  const days = Math.floor((today - then) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)}y ago`;
}
```

- [ ] **Step 2: Typecheck + tests**

```powershell
npm run typecheck
npm test
```

Expected: full suite passes.

- [ ] **Step 3: Commit**

```powershell
git add src/features/customers/CustomersPage.tsx
git commit -m "Sprint 6 Task 5: Customers directory with search/filter/sort"
```

---

## Task 6: CustomerDetailPage

**Files:**
- Create: `src/features/customers/CustomerDetailPage.tsx`
- Modify: `src/App.tsx` — add `/customers/:id` route (AFTER `/customers/new`)

- [ ] **Step 1: Implement**

```tsx
// src/features/customers/CustomerDetailPage.tsx
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  archiveCustomer,
  bumpLastContacted,
  deleteCustomer,
  getCustomerDetail,
  listOpenComplaintsForCustomer,
  listOrdersForCustomer,
  updateCustomer,
  type CustomerDetailRow,
} from './api';
import { formatINR, formatDayHeader } from '@/features/orders/orderFormatters';

export function CustomerDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<CustomerDetailRow | null>(null);
  const [orders, setOrders] = useState<Awaited<ReturnType<typeof listOrdersForCustomer>>>([]);
  const [complaints, setComplaints] = useState<Awaited<ReturnType<typeof listOpenComplaintsForCustomer>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  async function load() {
    try {
      const [c, os, cs] = await Promise.all([
        getCustomerDetail(id),
        listOrdersForCustomer(id),
        listOpenComplaintsForCustomer(id),
      ]);
      if (!c) { setError('Customer not found.'); return; }
      setCustomer(c);
      setNotesDraft(c.notes ?? '');
      setOrders(os);
      setComplaints(cs);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  async function onWhatsApp() {
    if (!customer?.phone) return;
    await bumpLastContacted(id);
    window.location.href = `https://wa.me/${customer.phone.replace(/\D/g, '')}`;
  }

  async function saveNotes() {
    setSavingNotes(true);
    try {
      await updateCustomer(id, { notes: notesDraft.trim() || null });
      setEditingNotes(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingNotes(false);
    }
  }

  async function onArchive() {
    if (!customer) return;
    if (!confirm(`Archive ${customer.name}? They'll be hidden from pickers but their order history stays.`)) return;
    await archiveCustomer(id);
    navigate('/customers');
  }

  async function onDelete() {
    if (!customer) return;
    if (!confirm(`Delete ${customer.name}? This can't be undone.`)) return;
    try {
      await deleteCustomer(id);
      navigate('/customers');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (error && !customer) return <p className="text-body-sm text-status-danger-fg">{error}</p>;
  if (!customer) return <p className="text-body-sm text-ink-500">Loading…</p>;

  const monthYear = new Date(customer.created_at).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  return (
    <div>
      <header>
        <h1 className="text-title text-ink-900">{customer.name}</h1>
        {customer.phone && (
          <p
            className="mt-1 text-body-sm text-ink-500 cursor-pointer underline"
            onClick={() => navigator.clipboard?.writeText(customer.phone!)}
            title="Tap to copy"
          >
            {customer.phone}
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-2 text-body-sm">
          <span className="rounded-pill bg-paper-muted px-2 py-0.5 text-ink-700">{customer.channel_name}</span>
          {customer.size_tier && (
            <span className="rounded-pill bg-paper-muted px-2 py-0.5 text-ink-700">{customer.size_tier}</span>
          )}
          <span className="text-ink-500">Customer since {monthYear}</span>
        </div>
        {customer.source_event_name && (
          <p className="mt-1 text-body-sm text-ink-500">Met at: {customer.source_event_name}</p>
        )}
      </header>

      <section className="mt-4 rounded-card bg-paper-elevated p-3 text-body-sm text-ink-700">
        {customer.order_count} orders · {formatINR(customer.outstanding_total)} outstanding · last{' '}
        {customer.last_ordered_at ? formatDayHeader(customer.last_ordered_at.slice(0, 10)) : 'never'}
      </section>

      <section className="mt-6 space-y-2">
        <Link
          to={`/orders/new?customer_id=${id}`}
          className="block h-11 w-full rounded-btn bg-brand-orange text-center leading-[44px] text-body font-semibold text-white"
        >
          + Log new order
        </Link>
        {customer.phone && (
          <button
            type="button"
            onClick={onWhatsApp}
            className="h-11 w-full rounded-btn-sm border border-ink-900/10 bg-paper-elevated text-body text-ink-900"
          >
            Send WhatsApp
          </button>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-subtitle text-ink-900">Notes</h2>
        {!editingNotes ? (
          <button
            type="button"
            onClick={() => setEditingNotes(true)}
            className="mt-2 block w-full rounded-card bg-paper-elevated p-3 text-left text-body-sm text-ink-700"
          >
            {customer.notes || <span className="text-ink-500">Tap to add notes…</span>}
          </button>
        ) : (
          <div className="mt-2 space-y-2">
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              rows={4}
              className="w-full rounded-btn-sm border border-ink-900/10 bg-paper px-3 py-2 text-body text-ink-900"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setEditingNotes(false); setNotesDraft(customer.notes ?? ''); }}
                className="h-9 flex-1 rounded-btn-sm border border-ink-900/10 text-body-sm text-ink-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveNotes}
                disabled={savingNotes}
                className="h-9 flex-1 rounded-btn-sm bg-brand-orange text-body-sm font-semibold text-white disabled:opacity-50"
              >
                {savingNotes ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-subtitle text-ink-900">Order history</h2>
        <ul className="mt-2 space-y-2">
          {orders.map((o) => (
            <li key={o.id}>
              <Link to={`/orders/${o.id}`} className="block rounded-card bg-paper-elevated p-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-body-sm text-ink-700">{o.ordered_at.slice(0, 10)}</span>
                  <span className="text-body-sm text-ink-700">{formatINR(o.total)}</span>
                </div>
                <div className="mt-1 text-body-sm text-ink-500">
                  {o.item_summary || '(no items)'} · {o.fulfilled_at ? 'fulfilled' : 'pending'} · {o.payment_status}
                </div>
              </Link>
            </li>
          ))}
          {orders.length === 0 && <li className="text-body-sm text-ink-500">No orders yet.</li>}
        </ul>
      </section>

      {complaints.length > 0 && (
        <section className="mt-6">
          <h2 className="text-subtitle text-ink-900">Open complaints</h2>
          <ul className="mt-2 space-y-2">
            {complaints.map((c) => (
              <li key={c.id}>
                <Link to={`/orders/${c.order_id}`} className="block rounded-card bg-paper-elevated p-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-body-sm font-semibold text-ink-900">{c.kind.replace('_', ' ')}</span>
                    <span className="text-body-sm text-ink-500">{c.reported_at}</span>
                  </div>
                  <p className="mt-1 text-body-sm text-ink-700">{c.description}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8 space-y-2">
        <Link
          to={`/customers/${id}/edit`}
          className="block h-11 w-full rounded-btn-sm border border-ink-900/10 bg-paper-elevated text-body text-ink-900 text-center leading-[44px]"
        >
          Edit profile
        </Link>
        <button
          type="button"
          onClick={onArchive}
          className="h-11 w-full rounded-btn-sm border border-ink-900/10 bg-paper-elevated text-body text-ink-900"
        >
          Archive customer
        </button>
        {customer.order_count === 0 && (
          <button
            type="button"
            onClick={onDelete}
            className="h-11 w-full rounded-btn-sm border border-ink-900/10 bg-paper-elevated text-body text-status-danger-fg"
          >
            Delete customer
          </button>
        )}
      </section>

      <p className="mt-6 text-body-sm text-ink-500">
        <Link to="/customers" className="underline">← Back to customers</Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Add the route**

In `src/App.tsx`, add:
```tsx
import { CustomerDetailPage } from '@/features/customers/CustomerDetailPage';
```

After `/customers/new`:
```tsx
<Route path="/customers/:id" element={<CustomerDetailPage />} />
```

- [ ] **Step 3: Typecheck + tests**

```powershell
npm run typecheck
npm test
```

Expected: full suite passes.

- [ ] **Step 4: Commit**

```powershell
git add src/features/customers/CustomerDetailPage.tsx src/App.tsx
git commit -m "Sprint 6 Task 6: CustomerDetailPage with stats/notes/history/complaints"
```

---

## Task 7: EditCustomerPage wrapper

**Files:**
- Create: `src/features/customers/EditCustomerPage.tsx`
- Modify: `src/App.tsx` — add `/customers/:id/edit` route

The `AddCustomerPage` already accepts `editingCustomerId` (Task 4 included the hydration branch). This task is the route wrapper.

- [ ] **Step 1: Create the wrapper**

```tsx
// src/features/customers/EditCustomerPage.tsx
import { useParams } from 'react-router-dom';
import { AddCustomerPage } from './AddCustomerPage';

export function EditCustomerPage() {
  const { id = '' } = useParams<{ id: string }>();
  return <AddCustomerPage editingCustomerId={id} />;
}
```

- [ ] **Step 2: Add the route**

In `src/App.tsx`:
```tsx
import { EditCustomerPage } from '@/features/customers/EditCustomerPage';
```

After `/customers/:id`:
```tsx
<Route path="/customers/:id/edit" element={<EditCustomerPage />} />
```

- [ ] **Step 3: Typecheck + tests**

```powershell
npm run typecheck
npm test
```

- [ ] **Step 4: Commit**

```powershell
git add src/features/customers/EditCustomerPage.tsx src/App.tsx
git commit -m "Sprint 6 Task 7: EditCustomerPage wrapper"
```

---

## Task 8: Today Block 2.5 (quiet customer nudge)

**Files:**
- Create: `src/features/customers/QuietCustomerNudge.tsx`
- Modify: `src/features/today/TodayPage.tsx`

- [ ] **Step 1: Create the nudge component**

```tsx
// src/features/customers/QuietCustomerNudge.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  bumpLastContacted,
  listQuietCustomers,
  type CustomerListItem,
} from './api';

export function QuietCustomerNudge() {
  const [rows, setRows] = useState<CustomerListItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setRows(await listQuietCustomers(3));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => { load(); }, []);

  async function dismiss(id: string) {
    await bumpLastContacted(id);
    // Optimistic: drop the row locally; reload would re-fetch
    setRows((arr) => arr.filter((r) => r.id !== id));
  }

  if (error) return <p className="mt-6 text-body-sm text-status-danger-fg">{error}</p>;
  if (rows.length === 0) return null;

  return (
    <section className="mt-6">
      <h2 className="text-subtitle text-ink-900">Quiet customers</h2>
      <ul className="mt-2 space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-2 rounded-card bg-paper-elevated p-3">
            <Link to={`/customers/${r.id}`} className="flex-1">
              <div className="text-body font-semibold text-ink-900">{r.name}</div>
              <div className="text-body-sm text-ink-500">{r.channel_name}</div>
            </Link>
            <button
              type="button"
              onClick={() => dismiss(r.id)}
              aria-label={`Dismiss ${r.name}`}
              className="text-body-sm text-ink-500"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 2: Mount on Today between Block 2 and footer**

In `src/features/today/TodayPage.tsx`, add import:
```ts
import { QuietCustomerNudge } from '@/features/customers/QuietCustomerNudge';
```

Insert `<QuietCustomerNudge />` after the closing `</section>` of the Pending today block (Block 2) and before `<p className="mt-6 text-body-sm text-ink-500">{user?.email}</p>`.

- [ ] **Step 3: Typecheck + tests**

```powershell
npm run typecheck
npm test
```

- [ ] **Step 4: Commit**

```powershell
git add src/features/customers/QuietCustomerNudge.tsx src/features/today/TodayPage.tsx
git commit -m "Sprint 6 Task 8: Today Block 2.5 quiet customer nudge"
```

---

## Task 9: Sprint close — smoke, browser verify, ADRs, CLAUDE.md

**Files:**
- Create: `docs/decisions/2026-05-22-sprint-6-architecture-decisions.md`
- Modify: `CLAUDE.md`
- Run: `scripts/smoke-test-walking-skeleton.py`
- Run: a new `scripts/verify-customer-flow.py` (created in this task)

- [ ] **Step 1: Run smoke**

```powershell
python scripts/smoke-test-walking-skeleton.py
```

Expected: pass.

- [ ] **Step 2: Create `scripts/verify-customer-flow.py`**

Browser smoke that covers:
- Login → /customers → search-as-you-type narrows the list
- Tap a customer → /customers/:id renders stats + notes + history
- Tap `Edit profile` → /customers/:id/edit hydrates the form (name/channel chip visible)
- Back → tap `+ Add customer` → /customers/new shows the chip picker
- Verify the `+ Add channel…` dashed chip is present
- Today page shows the Quiet customers section (or nothing if no quiet customers exist)

Use the same env-loading pattern as `verify-bill-flow.py`. Screenshots to `scripts/screenshots/sprint6-*.png`.

(The implementer can copy the structure of `verify-bill-flow.py` as a template — same pattern of login + selector waits + screenshots + `font_requests`-style observation hook removed.)

- [ ] **Step 3: Run the customer flow verify**

```powershell
python C:/Users/Karan/.claude/skills/webapp-testing/scripts/with_server.py --server "npm run dev" --port 5173 --timeout 60 -- python scripts/verify-customer-flow.py
```

Expected: pass; screenshots written.

- [ ] **Step 4: Write Sprint 6 ADR file**

Create `docs/decisions/2026-05-22-sprint-6-architecture-decisions.md` with ADRs 22-26:

- **ADR-22: `isQuiet` is a pure TS predicate, not a Postgres view.** Pure, testable, callable from both Today (Block 2.5) and Customers directory (filter chip + per-row marker) without round-tripping. v1 scale (<1000 customers per fetch) makes the in-JS filter cheap. v2 may materialize a `quiet_customers` view if scale demands.
- **ADR-23: Quiet thresholds hardcoded for v1 in `quietDurationDays()`.** Spec §8 — promote to Settings if mom finds them off after ~2 months. Custom channels default to Personal's 60d, an opinionated call (the spec doesn't pin this; user feedback may change it).
- **ADR-24: Channels are extensible via `createChannel`; system rows can be soft-hidden but not deleted.** UI does not show delete for `is_system=true` rows; soft-hide via `active=false` is the v1 mechanism. (No UI for this yet — admin via raw SQL until v2 Settings includes it.)
- **ADR-25: Edit Customer reuses AddCustomerPage via `editingCustomerId` prop.** Mirrors Sprint 5 ADR-20 (Edit Order). No field-level locking; `updateCustomer` patches whatever the form sends. Phone-dup check is skipped in edit mode (mom intentionally renames; no helpful match-modal).
- **ADR-26: Quiet customer "dismiss" advances `last_contacted_at = now()`.** Same semantics as `Send WhatsApp` button — spec §8 calls all three (button tap, long-press phone link, × dismiss) "mom acknowledged this customer." The dismiss is reversible by design: doing nothing means the customer goes quiet again after the threshold elapses from the dismiss timestamp.

Plus an "Open items" section listing what carries into Sprint 7+ (events dropdown in AddCustomerPage source_event_id, customer phone-call detection, channel hide/delete UI, customer merge UI).

- [ ] **Step 5: Update CLAUDE.md**

Find the Phase 1 status block. Bump from "Sprints 0–5" to "Sprints 0–6". Add a Sprint 6 status line:

```
- **Sprint 6** (Customer lens) — full §8 Customers surface. Directory at `/customers` with search (name OR phone, 200ms debounced via `useDebouncedValue`), filter chips (`All` / `Large` / `Small` / `Unsorted` / `Quiet` + dynamic channel chips from `channels` table), sort selector (Recent order / A–Z / Most ordered), two-line rows with `quiet Nw` marker via pure `isQuiet()` predicate. Detail at `/customers/:id` with header (name + tap-to-copy phone + channel/size/since chips + source-event line), stats card (order count, outstanding ₹, last ordered), action buttons (Log new order pre-filling customer, Send WhatsApp via `wa.me` + `bumpLastContacted`), inline-edit notes, full order history list, open complaints sub-section, footer Edit/Archive/Delete (delete only when zero orders). Add at `/customers/new` with the chip-based `ChannelChipPicker` (incl. inline `+ Add channel…` affordance per `DESIGN_HANDOFF.md` §6.1), dup-on-phone detection modal, phone-required-for-personal/reseller validation. Edit at `/customers/:id/edit` reuses AddCustomerPage in edit mode (no field-level locking per §8). Today Block 2.5 — `QuietCustomerNudge` (up to 3 most-overdue, dismissable via `×` which advances `last_contacted_at`). Sprint 4's `AddCustomerInlineModal` upgraded to the same chip picker. Bumps test count.
```

Update the test-count line at the end (the implementer will discover the exact count from `npm test`).

Bump the "next coding move" line to point at Sprint 7 (Events + exhibition form + confirmation route).

- [ ] **Step 6: Commit + push**

```powershell
git add CLAUDE.md docs/decisions/2026-05-22-sprint-6-architecture-decisions.md scripts/verify-customer-flow.py scripts/screenshots/sprint6-*.png
git commit -m "docs: Sprint 6 close — ADRs 22-26 + CLAUDE.md status + verify script"
git push
```

- [ ] **Step 7: Final advisor checkpoint**

Call `advisor()` to review Sprint 6 before declaring complete. Particular concerns to flag:
- Quiet predicate boundary conditions (timezone edges).
- ChannelChipPicker's inline-add error path (case-insensitive unique-name behavior).
- Whether `listCustomersFiltered` performance is acceptable at expected volumes (fetching all then filtering for `quiet`).
- Edit-mode hydration completeness on AddCustomerPage.

---

## Spec coverage check

| §8 spec item | Task | Notes |
|---|---|---|
| Directory: search name OR phone (200ms debounced) | 5 | uses Sprint 4's `useDebouncedValue` |
| Directory: filter chips (fixed + dynamic channels) | 5 | URL-param-backed |
| Directory: sort (Recent / A–Z / Most ordered) | 5 | `most_ordered` is client-side |
| Directory: two-line rows + quiet marker | 5 | `isQuiet` per row |
| Customer detail: header + stats + actions | 6 | Stats card + WhatsApp button |
| Customer detail: inline-edit notes | 6 | Toggle textarea |
| Customer detail: order history | 6 | `listOrdersForCustomer` |
| Customer detail: open complaints | 6 | `listOpenComplaintsForCustomer` |
| Customer detail: Edit / Archive / Delete | 6 | Delete only when zero orders |
| Quiet customers: definition + thresholds | 1 | Pure `isQuiet` + `quietDurationDays` |
| Quiet on Today (Block 2.5, cap 3) | 8 | `QuietCustomerNudge` |
| Quiet on Customers directory (chip + marker) | 5 | filter chip + per-row `quiet Nw` |
| `last_contacted_at` advance: button / × / long-press | 6, 8 | `bumpLastContacted` |
| Add customer: 6 fields | 4 | Source-event dropdown is null in Sprint 6 (Sprint 7 wires events) |
| Add customer: channel chip with inline `+ Add channel…` | 3, 4 | `ChannelChipPicker` |
| Add customer: dup-on-phone modal | 4 | `findCustomerByPhone` |
| Add customer: phone required-by-channel | 4 | Exhibition optional, others required |
| Channels: system rows + custom + soft-hide | 2 | `createChannel`; soft-hide UI deferred |
| Customer merge | — | Out of v1 per spec |
| Inline `+ New customer` from order flows | 3 | Modal upgraded to chip picker |
