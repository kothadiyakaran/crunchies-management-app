# Sprint 7 — Events + Customer-facing Exhibition Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Events screen (list + detail/edit + retrospective), the customer-facing exhibition form at `/order/<slug>` (3-step wizard + confirmation route), and wire events into Production (Upcoming events section) and AddCustomerPage (source_event_id selector).

**Architecture:**
- Public surfaces (`/order/<slug>`, `/order/<slug>/confirmed`) are anonymous routes outside the Protected shell. Anon has zero direct table access (per RLS §2.4); all reads/writes go through **three SECURITY DEFINER RPCs** in `0005_public_rpcs.sql`. The RPCs are the security boundary.
- Events CRUD for mom is authenticated and goes through `src/features/events/api.ts` with normal RLS.
- `committed_expected_qty` snapshot is **app-level** inside `createEvent` / `updateEvent` — runs in the same Supabase transaction. The existing `trg_event_demand_freeze_committed` trigger backstops immutability. The reverse "starts_on edited back to future" path also runs app-level.
- Event slugs auto-generate from name + year on first save; collisions are handled with a numeric counter retry (`-2`, `-3`).
- The NEW badge on the Orders tab is client-side state: localStorage key tracks "last seen exhibition order id"; the count is computed live in BottomNav.

**Tech Stack:** Vite + React 18 + TypeScript strict + Tailwind + Supabase JS + Vitest/RTL.

**Cross-references locked before write:**
- `docs/v1-spec.md` §2 (data model, events + event_demand + public_order_number), §6 (Events screen), §10 (Customer-facing form), §11 algorithm (events drive uplift — Sprint 7 only delivers the data; algorithm consumption stays as-is for v1).
- `docs/DESIGN_HANDOFF.md` §3 (chosen variants: 12-events-list, 13-event-detail, 16-public-form-b-wizard, 17-order-confirmation), §4 (tokens), §6.2 (confirmation route).
- `docs/ENGINEERING_NOTES.md` §2.2 (Upcoming events on Production), §2.3 (confirmation route + anti-leak validation).
- Existing files of relevance: `supabase/migrations/0001_init.sql` (schema, `next_public_order_number()` already exists), `supabase/migrations/0002_rls.sql` (RLS sketch + anon comment about deferred RPC), `src/features/customers/AddCustomerPage.tsx:86` (where `source_event_id: null` is hardcoded), `src/features/production/ProductionPage.tsx` (where the Upcoming events section lands), `src/App.tsx` (where the public routes go).

---

## File structure

### New files

```
supabase/migrations/0005_public_rpcs.sql           # three SECURITY DEFINER RPCs + grants
src/features/events/api.ts                         # authenticated CRUD + commit-snapshot helpers
src/features/events/eventLogic.ts                  # pure: slugify, bumpSlugForCollision, etc.
src/features/events/eventLogic.test.ts             # ~12 invariants
src/features/events/EventsPage.tsx                 # list with filter chips
src/features/events/EventDetailPage.tsx            # create + edit + retrospective
src/features/events/EventDuplicateButton.tsx       # small isolated component
src/features/events/api.test.ts                    # snapshot freeze/unfreeze behaviour
src/features/events/UpcomingEventsSection.tsx      # for Production screen
src/features/public/api.ts                         # anon RPC client wrappers
src/features/public/PublicOrderFormPage.tsx        # 3-step wizard
src/features/public/PickStep.tsx                   # step 1
src/features/public/ContactStep.tsx                # step 2
src/features/public/ConfirmStep.tsx                # step 3
src/features/public/OrderConfirmationPage.tsx      # /order/:slug/confirmed
src/features/public/phoneValidation.ts             # pure: strip+validate IN mobile
src/features/public/phoneValidation.test.ts        # ~6 invariants
src/features/orders/newOrderBadge.ts               # localStorage-backed unseen-count
src/features/orders/newOrderBadge.test.ts          # ~4 invariants
scripts/verify-events-flow.py                      # headless Playwright smoke
```

### Modified files

```
src/App.tsx                                        # public routes outside <Protected />
src/components/BottomNav.tsx                       # NEW badge on Orders tab
src/features/production/ProductionPage.tsx         # mount UpcomingEventsSection above the product list
src/features/customers/AddCustomerPage.tsx         # source_event_id dropdown when channel=Exhibition
src/lib/database.types.ts                          # regenerated post-migration
```

---

### Task 1: Public-form RPCs migration

**Files:**
- Create: `supabase/migrations/0005_public_rpcs.sql`
- Modify: `src/lib/database.types.ts` (regenerated)

**Spec references:** v1-spec §10 (server-side behaviour on submit, anti-leak on confirmation), §2.4 (RLS sketch for anon insert path).

The three RPCs:

| RPC | Args | Returns | Purpose |
|---|---|---|---|
| `public_get_event_by_slug(p_slug)` | text | json: event meta + product list | `/order/:slug` page-load read |
| `public_create_exhibition_order(p_slug, p_name, p_phone, p_notes, p_items, p_honeypot)` | text, text, text, text, jsonb (array of `{product_id, qty}`), text | json: `{order_id, public_order_number}` | Form submit |
| `public_get_order_by_ref(p_slug, p_order_id)` | text, uuid | json: order meta + items + event meta | Confirmation page read (with anti-leak: validates `order.id` was actually created via `p_slug`) |

All three:
- `language plpgsql security definer set search_path = public, extensions`
- `grant execute on function … to anon, authenticated`
- Honor active+in-window check (`active = true AND today between starts_on and ends_on inclusive`)
- Honeypot filter: if `p_honeypot <> ''`, silently `return null` (pretend success but no insert)

- [ ] **Step 1: Write migration**

```sql
-- 0005_public_rpcs.sql
-- Three SECURITY DEFINER functions backing the public exhibition form (v1-spec §10).
-- Anon role retains zero direct table access (per 0002_rls.sql); all surface area
-- lives in these RPCs, which enforce slug + active-window + anti-leak validation.

set search_path = public, extensions;

-- ----------------------------------------------------------------------------
-- public_get_event_by_slug(p_slug) -> json
-- Used by the public form's initial page load. Returns event meta + product list
-- if the event is active and today falls in [starts_on, ends_on].
-- Returns NULL if no match — caller distinguishes "not found" vs "out of window"
-- via the second RPC call below (window_state) if needed; for the form we treat
-- any NULL as a generic fail-state and render the appropriate landing.
-- ----------------------------------------------------------------------------

create or replace function public_get_event_by_slug(p_slug text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_event events%rowtype;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_window_state text;
  v_products json;
begin
  select * into v_event from events where slug = p_slug;
  if not found then
    return null;
  end if;

  if v_event.kind <> 'exhibition' then
    return null;
  end if;

  if not v_event.active then
    v_window_state := 'inactive';
  elsif v_today < v_event.starts_on then
    v_window_state := 'not_yet_open';
  elsif v_today > v_event.ends_on then
    v_window_state := 'ended';
  else
    v_window_state := 'open';
  end if;

  -- Product list (active only, both in-house and aggregated per §10 — public form
  -- shows aggregated with source_maker_name disclosure)
  select coalesce(json_agg(
    json_build_object(
      'id', p.id,
      'name', p.name,
      'unit', p.unit,
      'default_price', p.default_price,
      'is_aggregated', p.is_aggregated,
      'source_maker_name', p.source_maker_name
    ) order by p.is_aggregated asc, p.name asc
  ), '[]'::json) into v_products
  from products p
  where p.active = true;

  return json_build_object(
    'event', json_build_object(
      'id', v_event.id,
      'name', v_event.name,
      'starts_on', v_event.starts_on,
      'ends_on', v_event.ends_on,
      'pickup_window_start', v_event.pickup_window_start,
      'pickup_window_end', v_event.pickup_window_end,
      'venue_line', v_event.venue_line,
      'slug', v_event.slug
    ),
    'window_state', v_window_state,
    'products', v_products
  );
end
$$;

grant execute on function public_get_event_by_slug(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- public_create_exhibition_order(p_slug, p_name, p_phone, p_notes, p_items, p_honeypot)
-- p_items: jsonb array of { product_id: uuid, qty: number }, qty > 0.
-- p_honeypot: hidden CSS field; if filled, silently no-op (return null).
-- Dedup-on-phone: matching customer reactivated if archived (§10 + ADR-26 carry).
-- ----------------------------------------------------------------------------

create or replace function public_create_exhibition_order(
  p_slug text,
  p_name text,
  p_phone text,
  p_notes text,
  p_items jsonb,
  p_honeypot text default ''
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_event events%rowtype;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_customer_id uuid;
  v_existing_customer customers%rowtype;
  v_order_id uuid;
  v_public_number text;
  v_exhibition_channel_id uuid;
  v_year int := extract(year from now())::int;
  v_item jsonb;
  v_product_price numeric;
  v_clean_phone text;
begin
  -- Honeypot
  if p_honeypot is not null and length(p_honeypot) > 0 then
    return null;
  end if;

  -- Validate inputs
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'name required';
  end if;
  v_clean_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  if length(v_clean_phone) = 12 and left(v_clean_phone, 2) = '91' then
    v_clean_phone := right(v_clean_phone, 10);
  end if;
  if length(v_clean_phone) <> 10 or left(v_clean_phone, 1) not in ('6','7','8','9') then
    raise exception 'invalid phone';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'no items';
  end if;

  -- Event window check
  select * into v_event from events where slug = p_slug;
  if not found or v_event.kind <> 'exhibition' or not v_event.active
     or v_today < v_event.starts_on or v_today > v_event.ends_on then
    raise exception 'event not accepting orders';
  end if;

  -- Dedup-on-phone (active OR archived; reactivate if archived)
  select * into v_existing_customer from customers where phone = v_clean_phone;
  if found then
    v_customer_id := v_existing_customer.id;
    if not v_existing_customer.active then
      update customers set active = true where id = v_customer_id;
    end if;
    -- Do NOT update source_event_id (provenance preserved per §10)
  else
    select id into v_exhibition_channel_id
      from channels where lower(name) = 'exhibition' and is_system = true limit 1;
    insert into customers (name, phone, channel_id, source_event_id, active)
    values (trim(p_name), v_clean_phone, v_exhibition_channel_id, v_event.id, true)
    returning id into v_customer_id;
  end if;

  -- Allocate public order number atomically
  v_public_number := next_public_order_number(v_year);

  -- Create order
  insert into orders (customer_id, ordered_at, target_fulfilment_date, source,
                      payment_status, notes, public_order_number)
  values (v_customer_id, now(), null, 'exhibition_form',
          'unpaid', nullif(trim(coalesce(p_notes, '')), ''), v_public_number)
  returning id into v_order_id;

  -- Insert order_items with unit_price snapshot from products.default_price
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select default_price into v_product_price
      from products where id = (v_item->>'product_id')::uuid and active = true;
    if v_product_price is null then
      raise exception 'product not found or inactive';
    end if;
    insert into order_items (order_id, product_id, qty, unit_price)
    values (v_order_id, (v_item->>'product_id')::uuid,
            (v_item->>'qty')::numeric, v_product_price);
  end loop;

  return json_build_object(
    'order_id', v_order_id,
    'public_order_number', v_public_number
  );
end
$$;

grant execute on function public_create_exhibition_order(text, text, text, text, jsonb, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- public_get_order_by_ref(p_slug, p_order_id) -> json
-- Anti-leak: returns NULL unless the order's customer.source_event_id matches the
-- event identified by p_slug AND order.source = 'exhibition_form'. This prevents
-- enumerating other customers' orders by tampering with the ref query param.
-- ----------------------------------------------------------------------------

create or replace function public_get_order_by_ref(p_slug text, p_order_id uuid)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_event events%rowtype;
  v_order orders%rowtype;
  v_customer customers%rowtype;
  v_items json;
  v_total numeric;
begin
  select * into v_event from events where slug = p_slug;
  if not found then return null; end if;

  select * into v_order from orders where id = p_order_id;
  if not found then return null; end if;
  if v_order.source <> 'exhibition_form' then return null; end if;

  select * into v_customer from customers where id = v_order.customer_id;
  if not found then return null; end if;
  -- Anti-leak: order must belong to a customer whose source_event_id is this event.
  if v_customer.source_event_id <> v_event.id then return null; end if;

  select coalesce(json_agg(
    json_build_object(
      'product_id', oi.product_id,
      'name', p.name,
      'unit', p.unit,
      'qty', oi.qty,
      'unit_price', oi.unit_price
    ) order by p.name
  ), '[]'::json),
  coalesce(sum(oi.qty * oi.unit_price), 0)
  into v_items, v_total
  from order_items oi join products p on p.id = oi.product_id
  where oi.order_id = v_order.id;

  return json_build_object(
    'order', json_build_object(
      'id', v_order.id,
      'public_order_number', v_order.public_order_number,
      'ordered_at', v_order.ordered_at,
      'notes', v_order.notes,
      'total', v_total
    ),
    'customer', json_build_object(
      'name', v_customer.name,
      'phone', v_customer.phone
    ),
    'event', json_build_object(
      'name', v_event.name,
      'starts_on', v_event.starts_on,
      'ends_on', v_event.ends_on,
      'pickup_window_start', v_event.pickup_window_start,
      'pickup_window_end', v_event.pickup_window_end,
      'venue_line', v_event.venue_line,
      'slug', v_event.slug
    ),
    'items', v_items
  );
end
$$;

grant execute on function public_get_order_by_ref(text, uuid) to anon, authenticated;
```

- [ ] **Step 2: Apply migration via supabase MCP**

Run: `mcp__supabase__apply_migration` with name `0005_public_rpcs` and the SQL above.

- [ ] **Step 3: Regenerate TS types**

Run: `mcp__supabase__generate_typescript_types`. Save output to `src/lib/database.types.ts`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0005_public_rpcs.sql src/lib/database.types.ts
git commit -m "Sprint 7: 3 public-form RPCs (get_event_by_slug, create_exhibition_order, get_order_by_ref)"
```

---

### Task 2: Pure event logic

**Files:**
- Create: `src/features/events/eventLogic.ts`
- Create: `src/features/events/eventLogic.test.ts`

Pure helpers, no DB. Tested in isolation.

**API:**

```ts
export function slugify(name: string, year: number): string;
// "Diwali Fair Aundh" + 2026 -> "diwali-fair-aundh-2026"
// Strips non-[a-z0-9-]; collapses runs of hyphens; trims leading/trailing.

export function bumpSlug(base: string, attempt: number): string;
// bumpSlug("diwali-fair-aundh-2026", 2) -> "diwali-fair-aundh-2026-2"

export function nextYearName(name: string): string;
// "Diwali 2026" -> "Diwali 2027". "Aundh Fair" -> "Aundh Fair (next year)" if no year found.

export function defaultLeadWeeks(kind: 'festival' | 'exhibition' | 'other'): number;
// festival=3, exhibition=1, other=2

export type EventWindowState = 'upcoming' | 'in_progress' | 'past';
export function eventWindowState(starts_on: string, ends_on: string, today: string): EventWindowState;

export function weeksUntil(starts_on: string, today: string): number;
// Negative for past events; 0 for in-progress. Day-level math (floor of days/7).
```

- [ ] **Step 1: Write the failing test file**

```ts
// src/features/events/eventLogic.test.ts
import { describe, it, expect } from 'vitest';
import { slugify, bumpSlug, nextYearName, defaultLeadWeeks, eventWindowState, weeksUntil } from './eventLogic';

describe('slugify', () => {
  it('basic name + year', () => {
    expect(slugify('Diwali Fair Aundh', 2026)).toBe('diwali-fair-aundh-2026');
  });
  it('strips punctuation and collapses spaces', () => {
    expect(slugify("Archana's Diwali Mela!", 2026)).toBe('archanas-diwali-mela-2026');
  });
  it('trims and collapses hyphens', () => {
    expect(slugify('  --Diwali--Fair--  ', 2027)).toBe('diwali-fair-2027');
  });
});

describe('bumpSlug', () => {
  it('appends numeric suffix', () => {
    expect(bumpSlug('diwali-2026', 2)).toBe('diwali-2026-2');
    expect(bumpSlug('diwali-2026', 7)).toBe('diwali-2026-7');
  });
});

describe('nextYearName', () => {
  it('bumps detected 4-digit year', () => {
    expect(nextYearName('Diwali 2026')).toBe('Diwali 2027');
    expect(nextYearName('2026 Diwali Fair')).toBe('2027 Diwali Fair');
  });
  it('falls back to suffix when no year found', () => {
    expect(nextYearName('Aundh Fair')).toBe('Aundh Fair (next year)');
  });
});

describe('defaultLeadWeeks', () => {
  it('festival → 3', () => expect(defaultLeadWeeks('festival')).toBe(3));
  it('exhibition → 1', () => expect(defaultLeadWeeks('exhibition')).toBe(1));
  it('other → 2', () => expect(defaultLeadWeeks('other')).toBe(2));
});

describe('eventWindowState', () => {
  it('past', () => expect(eventWindowState('2026-05-01', '2026-05-03', '2026-05-22')).toBe('past'));
  it('in_progress', () => expect(eventWindowState('2026-05-20', '2026-05-25', '2026-05-22')).toBe('in_progress'));
  it('upcoming', () => expect(eventWindowState('2026-06-01', '2026-06-03', '2026-05-22')).toBe('upcoming'));
  it('boundary: starts_on == today is in_progress', () =>
    expect(eventWindowState('2026-05-22', '2026-05-25', '2026-05-22')).toBe('in_progress'));
});

describe('weeksUntil', () => {
  it('upcoming 14 days → 2', () => expect(weeksUntil('2026-06-05', '2026-05-22')).toBe(2));
  it('past', () => expect(weeksUntil('2026-05-01', '2026-05-22')).toBeLessThan(0));
});
```

- [ ] **Step 2: Implement `eventLogic.ts`**

```ts
// src/features/events/eventLogic.ts

export function slugify(name: string, year: number): string {
  const cleaned = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${cleaned}-${year}`;
}

export function bumpSlug(base: string, attempt: number): string {
  return `${base}-${attempt}`;
}

export function nextYearName(name: string): string {
  const m = name.match(/(?<!\d)(\d{4})(?!\d)/);
  if (!m) return `${name} (next year)`;
  const yr = parseInt(m[1]!, 10);
  return name.replace(m[1]!, String(yr + 1));
}

export function defaultLeadWeeks(kind: 'festival' | 'exhibition' | 'other'): number {
  if (kind === 'festival') return 3;
  if (kind === 'exhibition') return 1;
  return 2;
}

export type EventWindowState = 'upcoming' | 'in_progress' | 'past';

export function eventWindowState(starts_on: string, ends_on: string, today: string): EventWindowState {
  if (today < starts_on) return 'upcoming';
  if (today > ends_on) return 'past';
  return 'in_progress';
}

export function weeksUntil(starts_on: string, today: string): number {
  const a = new Date(`${starts_on}T00:00:00Z`).getTime();
  const b = new Date(`${today}T00:00:00Z`).getTime();
  return Math.floor((a - b) / (7 * 24 * 60 * 60 * 1000));
}
```

- [ ] **Step 3: Run tests**

Run: `npm test -- src/features/events/eventLogic.test.ts`
Expected: 13 tests passing.

- [ ] **Step 4: Commit**

```bash
git add src/features/events/eventLogic.ts src/features/events/eventLogic.test.ts
git commit -m "Sprint 7: pure event logic (slug, lead defaults, window state)"
```

---

### Task 3: Events API (authenticated)

**Files:**
- Create: `src/features/events/api.ts`
- Create: `src/features/events/api.test.ts`

Authenticated event CRUD plus the snapshot-management helpers.

**API:**

```ts
export type EventRow = {
  id: string;
  name: string;
  kind: 'festival' | 'exhibition' | 'other';
  starts_on: string;
  ends_on: string;
  lead_weeks: number;
  slug: string | null;
  active: boolean;
  pickup_window_start: string | null;
  pickup_window_end: string | null;
  venue_line: string | null;
  created_at: string;
};

export type EventDemandRow = {
  event_id: string;
  product_id: string;
  expected_qty: number;
  committed_expected_qty: number | null;
  notes: string | null;
};

export type EventListItem = EventRow & {
  product_demand_count: number; // count of event_demand rows with expected_qty > 0
};

export type EventFilter = 'upcoming' | 'past' | 'all';

export async function listEvents(filter: EventFilter): Promise<EventListItem[]>;
export async function getEventDetail(id: string): Promise<{ event: EventRow; demand: EventDemandRow[] } | null>;

export async function createEvent(input: {
  name: string;
  kind: 'festival' | 'exhibition' | 'other';
  starts_on: string;
  ends_on: string;
  lead_weeks: number;
  slug: string | null;
  active: boolean;
  pickup_window_start: string | null;
  pickup_window_end: string | null;
  venue_line: string | null;
}): Promise<string>;
// Auto-generates slug from name+year on first save IF kind=exhibition AND slug not provided.
// On unique-violation on slug (23505), retries up to 5 times bumping the numeric suffix.

export async function updateEvent(
  id: string,
  patch: Partial<Omit<EventRow, 'id' | 'created_at'>>,
): Promise<void>;
// After update: applies snapshot logic via maybeSnapshotEvent(id).

export async function deleteEvent(id: string): Promise<void>;

export async function upsertEventDemand(
  eventId: string,
  productId: string,
  expectedQty: number,
  notes?: string | null,
): Promise<void>;
// Insert or update.

export async function deleteEventDemand(eventId: string, productId: string): Promise<void>;

export async function maybeSnapshotEvent(eventId: string): Promise<void>;
// If starts_on <= today AND any event_demand rows still have committed_expected_qty IS NULL,
// copy expected_qty -> committed_expected_qty for each row. App-level write, single transaction.
// Trigger trg_event_demand_freeze_committed backstops immutability.

export async function maybeUnfreezeEvent(eventId: string): Promise<void>;
// If starts_on > today AND any event_demand rows have committed_expected_qty IS NOT NULL,
// reset to NULL. Called when mom edits starts_on from past back to future.
// Note: the trigger only blocks UPDATEs that CHANGE a non-null value to a different value.
// Setting NULL after non-null is currently blocked by the trigger; reading the spec carefully,
// the trigger should be modified to allow NULL writes. See Task 3.5.

export async function duplicateEvent(id: string): Promise<string>;
// Creates a new event with same kind/lead_weeks/expected_qty; dates blanked (NULL — actually
// the schema requires non-null, so we set starts_on=ends_on=tomorrow); name = nextYearName().

export async function listUpcomingEvents(limit?: number): Promise<EventListItem[]>;
// For Production screen's section. Returns events with starts_on >= today, ordered by starts_on ASC.

export async function listInProgressExhibitions(): Promise<EventRow[]>;
// For AddCustomerPage's source_event_id dropdown when channel=Exhibition.
// Returns events where kind=exhibition AND active AND today in [starts_on, ends_on].

export async function listActiveInHouseProducts(): Promise<{ id: string; name: string; unit: string }[]>;
// For the expected-demand grid on Event detail.
```

- [ ] **Step 1: Allow NULL write on committed_expected_qty (migration patch)**

The trigger `trg_event_demand_freeze_committed` raises on any `distinct from` update including non-null→null. To support the "starts_on edited back to future" case, the trigger must allow non-null→NULL but block other distinct-from-old transitions.

Add a migration `0006_event_demand_unfreeze.sql`:

```sql
-- 0006_event_demand_unfreeze.sql
-- Allow committed_expected_qty to be reset to NULL (used when an event's
-- starts_on is edited from past back to future — see v1-spec §6 behaviour calls).
-- Other UPDATEs to a different non-null value remain blocked.

create or replace function trg_event_demand_freeze_committed()
returns trigger
language plpgsql
as $$
begin
  if old.committed_expected_qty is not null
     and new.committed_expected_qty is not null
     and new.committed_expected_qty is distinct from old.committed_expected_qty then
    raise exception 'event_demand.committed_expected_qty is immutable once set (only NULL reset allowed)';
  end if;
  return new;
end
$$;
```

Apply via `mcp__supabase__apply_migration` with name `0006_event_demand_unfreeze`.

- [ ] **Step 2: Implement `api.ts`**

(Full implementation — see file. Key invariants below; subagent must write full file.)

- Slug generation: when `kind === 'exhibition' && input.slug == null`, derive `slugify(input.name, year(starts_on))`. On 23505, retry with `bumpSlug(base, attempt)` up to 5 times.
- `createEvent` returns the new event id.
- `updateEvent` calls `maybeSnapshotEvent(id)` then `maybeUnfreezeEvent(id)` after the row update completes.
- `maybeSnapshotEvent`: SELECT event row; if `starts_on <= todayInTz()`, fetch all event_demand rows for the event WHERE `committed_expected_qty IS NULL`, then UPDATE each one's `committed_expected_qty = expected_qty`. Do this as N single-row UPDATEs (v1 scale tolerates it; <15 products).
- `maybeUnfreezeEvent`: SELECT event row; if `starts_on > todayInTz()`, UPDATE all event_demand WHERE event_id = id AND committed_expected_qty IS NOT NULL SET committed_expected_qty = NULL.
- `duplicateEvent`: insert new event with name = nextYearName(old.name), same kind/lead_weeks, starts_on = ends_on = tomorrow (placeholder; mom edits), slug = null (re-derived on next save); then copy event_demand rows.

- [ ] **Step 3: Write `api.test.ts` covering**

These tests use Supabase mocking with `vi.mock`. Patterns mirror `src/features/customers/api.test.ts`. Subagent writes ~6 invariants:

1. `createEvent` with exhibition + no slug → calls `slugify(name, year)` and inserts.
2. `createEvent` 23505 on first slug → retries with `bumpSlug(base, 2)`.
3. `updateEvent` with starts_on in past + IS NULL committed → triggers snapshot UPDATEs on event_demand.
4. `updateEvent` with starts_on in future + non-null committed → triggers unfreeze UPDATEs to NULL.
5. `duplicateEvent` copies event_demand rows and bumps name year.
6. `listEvents('past')` filters by ends_on < today and sorts descending.

- [ ] **Step 4: Run tests**

`npm test -- src/features/events/api.test.ts`
Expected: 6 tests passing.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0006_event_demand_unfreeze.sql src/lib/database.types.ts \
        src/features/events/api.ts src/features/events/api.test.ts
git commit -m "Sprint 7: events API + snapshot/unfreeze (allow null reset on committed_expected_qty)"
```

---

### Task 4: Events list page

**Files:**
- Create: `src/features/events/EventsPage.tsx`
- Create: `src/features/events/EventsPage.test.tsx`

**Spec references:** v1-spec §6 Events list view, DESIGN_HANDOFF.md screenshot 12.

**UI:**
- Header: title "Events" + `+ Add event` button on right.
- Filter chips: `Upcoming` (default) | `Past` | `All`. URL-driven via `?filter=…` (mirrors Sprint 6 pattern).
- List rows (two-line):
  - Line 1: name + time-to-event (`in 2 weeks` / `5 days ago`) + arrow `→`
  - Line 2: kind badge + date range + lead_weeks + `N products set`
  - Inactive events: small "inactive" badge.
- Sort by filter (Upcoming asc by starts_on; Past desc by ends_on; All desc by starts_on).
- Empty states per spec §6.

- [ ] **Step 1: Implement page**

(See file. Subagent must implement following the Sprint 6 `CustomersPage` URL-state + filter-chip + search pattern. No search field on this page per spec.)

- [ ] **Step 2: Test with RTL**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EventsPage } from './EventsPage';

vi.mock('./api', () => ({
  listEvents: vi.fn(),
}));

import * as api from './api';

describe('EventsPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders Upcoming filter as default and calls listEvents("upcoming")', async () => {
    vi.mocked(api.listEvents).mockResolvedValue([]);
    render(
      <MemoryRouter>
        <EventsPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(api.listEvents).toHaveBeenCalledWith('upcoming'));
    expect(screen.getByText('Events')).toBeInTheDocument();
  });

  it('renders empty state with affordance when no events at all', async () => {
    vi.mocked(api.listEvents).mockResolvedValue([]);
    render(
      <MemoryRouter initialEntries={['/events?filter=all']}>
        <EventsPage />
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByText(/No events/i));
  });

  it('renders event row with name and weeks-to-event', async () => {
    vi.mocked(api.listEvents).mockResolvedValue([
      {
        id: 'e1',
        name: 'Diwali 2026',
        kind: 'festival',
        starts_on: '2026-11-06',
        ends_on: '2026-11-08',
        lead_weeks: 3,
        slug: null,
        active: true,
        pickup_window_start: null,
        pickup_window_end: null,
        venue_line: null,
        created_at: '2026-05-22T00:00:00Z',
        product_demand_count: 4,
      },
    ]);
    render(
      <MemoryRouter>
        <EventsPage />
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByText('Diwali 2026'));
    expect(screen.getByText(/products set/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add src/features/events/EventsPage.tsx src/features/events/EventsPage.test.tsx
git commit -m "Sprint 7: Events list page with Upcoming/Past/All filter chips"
```

---

### Task 5: Event detail / edit page

**Files:**
- Create: `src/features/events/EventDetailPage.tsx`

**Spec references:** v1-spec §6 detail/edit + retrospective + duplicate + delete.

This is the largest single component in Sprint 7. Render order top-to-bottom:

1. Retrospective summary card (only when `ends_on < today`).
2. Header section (name input, kind picker, date pickers, lead-weeks stepper, active toggle).
3. Public URL section (only when `kind === 'exhibition'`):
   - Auto-suggest slug on save when blank.
   - Copy link / Share via WhatsApp buttons.
4. Pickup window section (`pickup_window_start`, `pickup_window_end`, `venue_line`) — only when `kind === 'exhibition'`.
5. Expected demand table (one row per active in-house product; aggregated excluded per §6 spec).
6. Notes textarea.
7. Footer: Save (primary), Duplicate to next year (existing events only), Delete (with confirm).

Validation:
- `ends_on >= starts_on`
- `lead_weeks` in `[0, 12]`
- `slug` (when present) URL-safe `/^[a-z0-9-]+$/`
- `expected_qty >= 0` per product

Inline warning when editing dates after lead-up started.

- [ ] **Step 1: Implement page**

(See file. Subagent must include the full edit/create/duplicate/delete flow. Key snippets below.)

```tsx
// snippet — retrospective card
const isPast = today > event.ends_on;
{isPast && (
  <section className="rounded-card bg-brand-orangeSoft p-4">
    <h2 className="text-label uppercase text-ink-700">Retrospective ({event.name} — closed)</h2>
    {/* expected total = sum committed_expected_qty; actual total = sum order_items.qty for orders.target_fulfilment_date in [starts_on - lead_weeks, ends_on] */}
    <p className="mt-2 text-body text-ink-900">Total: Expected {expected} → Actual {actual} ({variancePill})</p>
    <p className="mt-1 text-body-sm text-ink-700">Top variance: {topVariance.name} ({topVariance.pct})</p>
    <Link to={`/reports?tab=trends`} className="mt-2 inline-block text-body-sm underline">→ View full breakdown in Reports</Link>
  </section>
)}
```

Slug field UX:
```tsx
// When kind === 'exhibition' and slug is blank, show "Will be: <suggested>" preview.
const suggestedSlug = slugify(name || '', new Date(starts_on).getFullYear() || todayYear);
```

WhatsApp share link:
```tsx
const url = `https://crunchies.app/order/${event.slug}`;
const msg = encodeURIComponent(`Hi! Place your order for ${event.name} here: ${url}`);
const waHref = `https://wa.me/?text=${msg}`;
```

- [ ] **Step 2: Manual smoke (no RTL test — too many interaction branches; the browser smoke covers it)**

Verify: load `/events/new` → fill required → Save → land on `/events/:id` (edit mode) with slug populated.

- [ ] **Step 3: Commit**

```bash
git add src/features/events/EventDetailPage.tsx
git commit -m "Sprint 7: Event detail/edit page (slug, demand grid, retrospective, duplicate, delete)"
```

---

### Task 6: Routing + UpcomingEventsSection on Production

**Files:**
- Modify: `src/App.tsx` (add `/events`, `/events/new`, `/events/:id`)
- Create: `src/features/events/UpcomingEventsSection.tsx`
- Modify: `src/features/production/ProductionPage.tsx` (mount section above the product list)

**Spec references:** DESIGN_HANDOFF §5 hard requirement #15; ENGINEERING_NOTES §2.2.

UpcomingEventsSection layout (per v2 wireframe):
- Header: `Upcoming events` label + `All events →` link
- Body: top 3 events (by starts_on ASC). Per row: name + kind badge + "in N weeks" + arrow.
- Footer buttons: `See all (N)` (link to `/events`) + `+ Add event` (link to `/events/new`)
- Empty state: "No upcoming events. Add the next one →" (link to `/events/new`)

- [ ] **Step 1: Routing**

```tsx
// Inside <Route element={<Protected />}> block, after /customers/:id/edit:
<Route path="/events" element={<EventsPage />} />
<Route path="/events/new" element={<EventDetailPage />} />
<Route path="/events/:id" element={<EventDetailPage />} />
```

- [ ] **Step 2: UpcomingEventsSection**

```tsx
// src/features/events/UpcomingEventsSection.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listUpcomingEvents, type EventListItem } from './api';
import { weeksUntil } from './eventLogic';
import { todayInTz } from '@/lib/utils';

export function UpcomingEventsSection() {
  const [rows, setRows] = useState<EventListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const all = await listUpcomingEvents();
      setRows(all.slice(0, 3));
      setTotal(all.length);
      setLoading(false);
    })();
  }, []);

  if (loading) return null;
  const today = todayInTz();

  return (
    <section className="mt-6">
      <header className="flex items-baseline justify-between">
        <h2 className="text-subtitle text-ink-900">Upcoming events</h2>
        <Link to="/events" className="text-body-sm text-ink-500 underline">All events →</Link>
      </header>
      {rows.length === 0 ? (
        <p className="mt-2 text-body-sm text-ink-500">
          No upcoming events. <Link to="/events/new" className="underline">Add the next one →</Link>
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {rows.map((e) => (
            <li key={e.id}>
              <Link to={`/events/${e.id}`} className="block rounded-card bg-paper-elevated p-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-body font-semibold text-ink-900">{e.name}</span>
                  <span className="text-body-sm text-ink-500">in {weeksUntil(e.starts_on, today)} {weeksUntil(e.starts_on, today) === 1 ? 'week' : 'weeks'}</span>
                </div>
                <div className="mt-1 text-body-sm text-ink-500">
                  {e.kind} · {e.product_demand_count} products set
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex gap-2">
        <Link to="/events" className="h-9 flex-1 rounded-btn-sm border border-ink-900/10 bg-paper-elevated text-center text-body-sm leading-9 text-ink-900">See all ({total})</Link>
        <Link to="/events/new" className="h-9 flex-1 rounded-btn-sm bg-brand-orange text-center text-body-sm font-semibold leading-9 text-white">+ Add event</Link>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Mount on ProductionPage above the product list**

Insert `<UpcomingEventsSection />` between `<header>` and the planning-entry-point section.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/features/events/UpcomingEventsSection.tsx src/features/production/ProductionPage.tsx
git commit -m "Sprint 7: Events routes + UpcomingEventsSection on Production"
```

---

### Task 7: source_event_id on AddCustomerPage

**Files:**
- Modify: `src/features/customers/AddCustomerPage.tsx`

**Spec references:** v1-spec §10 (exhibition orders attach `source_event_id`) + §8 (mom-entered customers with channel=Exhibition need the same attribution).

**Behaviour (advisor-locked):** always show a dropdown of active exhibition events when channel=Exhibition. Default selection: none. User selects explicitly. No "exactly one in window → auto-set" cleverness.

- [ ] **Step 1: Add state + fetch**

```tsx
const [sourceEventId, setSourceEventId] = useState<string | null>(null);
const [exhibitionEvents, setExhibitionEvents] = useState<EventRow[]>([]);

useEffect(() => {
  if (channelLower !== 'exhibition') return;
  (async () => {
    const { listInProgressExhibitions } = await import('@/features/events/api');
    setExhibitionEvents(await listInProgressExhibitions());
  })();
}, [channelLower]);
```

- [ ] **Step 2: Render dropdown when channel=Exhibition**

```tsx
{channelLower === 'exhibition' && exhibitionEvents.length > 0 && (
  <label className="block">
    <span className={labelSpan}>Source event (optional)</span>
    <select
      className={`${inputClass} bg-paper-elevated`}
      value={sourceEventId ?? ''}
      onChange={(e) => setSourceEventId(e.target.value || null)}
    >
      <option value="">— Not from an event —</option>
      {exhibitionEvents.map((ev) => (
        <option key={ev.id} value={ev.id}>{ev.name}</option>
      ))}
    </select>
  </label>
)}
```

- [ ] **Step 3: Wire into save**

Replace `source_event_id: null` at the `createCustomerFull` call site with `source_event_id: sourceEventId`. In edit mode, fetch existing event row and hydrate sourceEventId from `c.source_event_id`.

- [ ] **Step 4: Commit**

```bash
git add src/features/customers/AddCustomerPage.tsx
git commit -m "Sprint 7: AddCustomerPage source_event_id dropdown for Exhibition channel"
```

---

### Task 8: Public exhibition form (3-step wizard)

**Files:**
- Create: `src/features/public/api.ts`
- Create: `src/features/public/phoneValidation.ts`
- Create: `src/features/public/phoneValidation.test.ts`
- Create: `src/features/public/PublicOrderFormPage.tsx`
- Create: `src/features/public/PickStep.tsx`
- Create: `src/features/public/ContactStep.tsx`
- Create: `src/features/public/ConfirmStep.tsx`
- Modify: `src/App.tsx` (add `/order/:slug` outside `<Protected />`)

**Spec references:** v1-spec §10, DESIGN_HANDOFF screenshot 16.

- [ ] **Step 1: phoneValidation.ts + tests**

```ts
// src/features/public/phoneValidation.ts
export function cleanPhone(raw: string): string {
  let p = raw.replace(/[^0-9]/g, '');
  if (p.length === 12 && p.startsWith('91')) p = p.slice(2);
  return p;
}

export function isValidIndianMobile(raw: string): boolean {
  const p = cleanPhone(raw);
  return p.length === 10 && /^[6-9]/.test(p);
}
```

```ts
// src/features/public/phoneValidation.test.ts
import { describe, it, expect } from 'vitest';
import { cleanPhone, isValidIndianMobile } from './phoneValidation';

describe('cleanPhone', () => {
  it('strips +91 prefix', () => expect(cleanPhone('+91 98765 43210')).toBe('9876543210'));
  it('strips dashes and spaces', () => expect(cleanPhone('98765-43210')).toBe('9876543210'));
  it('keeps 10-digit as-is', () => expect(cleanPhone('9876543210')).toBe('9876543210'));
});

describe('isValidIndianMobile', () => {
  it('valid 9876543210 → true', () => expect(isValidIndianMobile('9876543210')).toBe(true));
  it('starts with 5 → false', () => expect(isValidIndianMobile('5876543210')).toBe(false));
  it('9 digits → false', () => expect(isValidIndianMobile('987654321')).toBe(false));
});
```

- [ ] **Step 2: public/api.ts (anon RPC wrappers)**

```ts
// src/features/public/api.ts
import { supabase } from '@/lib/supabase';

export type PublicEvent = {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  pickup_window_start: string | null;
  pickup_window_end: string | null;
  venue_line: string | null;
  slug: string;
};

export type PublicProduct = {
  id: string;
  name: string;
  unit: string;
  default_price: number;
  is_aggregated: boolean;
  source_maker_name: string | null;
};

export type PublicEventResponse = {
  event: PublicEvent;
  window_state: 'open' | 'not_yet_open' | 'ended' | 'inactive';
  products: PublicProduct[];
};

export async function fetchEventBySlug(slug: string): Promise<PublicEventResponse | null> {
  const { data, error } = await supabase.rpc('public_get_event_by_slug', { p_slug: slug });
  if (error) throw new Error(error.message);
  return (data ?? null) as PublicEventResponse | null;
}

export async function submitExhibitionOrder(input: {
  slug: string;
  name: string;
  phone: string;
  notes: string;
  items: { product_id: string; qty: number }[];
  honeypot: string;
}): Promise<{ order_id: string; public_order_number: string } | null> {
  const { data, error } = await supabase.rpc('public_create_exhibition_order', {
    p_slug: input.slug,
    p_name: input.name,
    p_phone: input.phone,
    p_notes: input.notes,
    p_items: input.items,
    p_honeypot: input.honeypot,
  });
  if (error) throw new Error(error.message);
  return (data ?? null) as { order_id: string; public_order_number: string } | null;
}

export type PublicOrderDetail = {
  order: {
    id: string;
    public_order_number: string;
    ordered_at: string;
    notes: string | null;
    total: number;
  };
  customer: { name: string; phone: string };
  event: PublicEvent;
  items: { product_id: string; name: string; unit: string; qty: number; unit_price: number }[];
};

export async function fetchOrderByRef(slug: string, orderId: string): Promise<PublicOrderDetail | null> {
  const { data, error } = await supabase.rpc('public_get_order_by_ref', {
    p_slug: slug,
    p_order_id: orderId,
  });
  if (error) throw new Error(error.message);
  return (data ?? null) as PublicOrderDetail | null;
}
```

- [ ] **Step 3: PublicOrderFormPage container + step components**

Container manages: `currentStep` (1|2|3), `event`, `windowState`, `products`, `qtys: Record<string, number>`, `name`, `phone`, `notes`, `honeypot`, `submitting`, `error`.

```tsx
// src/features/public/PublicOrderFormPage.tsx
import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { fetchEventBySlug, submitExhibitionOrder, type PublicEventResponse } from './api';
import { PickStep } from './PickStep';
import { ContactStep } from './ContactStep';
import { ConfirmStep } from './ConfirmStep';

export function PublicOrderFormPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [resp, setResp] = useState<PublicEventResponse | null | 'not_found'>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [honeypot, setHoneypot] = useState(''); // hidden CSS field
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill name/phone from URL params (for "Place another order →" loop)
  useEffect(() => {
    const url = new URL(window.location.href);
    const n = url.searchParams.get('name');
    const p = url.searchParams.get('phone');
    if (n) setName(n);
    if (p) setPhone(p);
  }, []);

  useEffect(() => {
    fetchEventBySlug(slug).then((r) => setResp(r ?? 'not_found'));
  }, [slug]);

  if (resp === null) return <div className="p-edge">Loading…</div>;
  if (resp === 'not_found') return <FailLanding message="Not found." />;
  if (resp.window_state === 'not_yet_open') return <FailLanding message={`This event opens ${resp.event.starts_on}.`} />;
  if (resp.window_state === 'ended') return <FailLanding message="This event has ended. Thank you!" />;
  if (resp.window_state === 'inactive') return <FailLanding message="Not currently accepting orders." />;

  async function onSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const items = Object.entries(qtys)
        .filter(([, q]) => q > 0)
        .map(([product_id, qty]) => ({ product_id, qty }));
      const result = await submitExhibitionOrder({
        slug, name, phone, notes, items, honeypot,
      });
      if (!result) {
        // honeypot tripped — pretend success but no nav (or nav to fail screen)
        setSubmitting(false);
        return;
      }
      navigate(`/order/${slug}/confirmed?ref=${result.order_id}`, { replace: true });
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-full bg-paper-surface">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 bg-brand-orange px-4 py-3 text-white">
        <h1 className="text-title font-bold">Crunchies</h1>
        <p className="text-body-sm">{resp.event.name} · {resp.event.starts_on} – {resp.event.ends_on}</p>
      </header>
      {/* Progress bar */}
      <div className="px-4 pt-3">
        <div className="flex gap-1">
          {[1, 2, 3].map((n) => (
            <div key={n} className={`h-1 flex-1 rounded-full ${n <= step ? 'bg-brand-orange' : 'bg-ink-900/10'}`} />
          ))}
        </div>
        <p className="mt-1 text-body-sm text-ink-500">Step {step} of 3</p>
      </div>
      {/* Honeypot (CSS-hidden) */}
      <input
        type="text"
        value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
        className="absolute left-[-9999px]"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
      />
      <main className="px-4 py-4">
        {step === 1 && (
          <PickStep products={resp.products} qtys={qtys} setQtys={setQtys} onContinue={() => setStep(2)} />
        )}
        {step === 2 && (
          <ContactStep
            products={resp.products}
            qtys={qtys}
            name={name} setName={setName}
            phone={phone} setPhone={setPhone}
            notes={notes} setNotes={setNotes}
            onBack={() => setStep(1)}
            onContinue={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <ConfirmStep
            event={resp.event}
            products={resp.products}
            qtys={qtys}
            name={name} phone={phone} notes={notes}
            error={error}
            submitting={submitting}
            onBack={() => setStep(2)}
            onPlace={onSubmit}
          />
        )}
      </main>
    </div>
  );
}

function FailLanding({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-8 text-center">
      <p className="text-body text-ink-700">{message}</p>
    </div>
  );
}
```

PickStep / ContactStep / ConfirmStep are small focused components — each renders inputs + a Continue/Back button. The pinned order-summary card on steps 2 and 3 derives from `qtys + products`. ContactStep validates phone via `isValidIndianMobile`.

- [ ] **Step 4: Wire route in App.tsx (OUTSIDE `<Protected />`)**

```tsx
<Routes>
  <Route path="/login" element={<LoginPage />} />
  <Route path="/order/:slug" element={<PublicOrderFormPage />} />
  <Route path="/order/:slug/confirmed" element={<OrderConfirmationPage />} />
  <Route element={<Protected />}>
    {/* … existing authenticated routes … */}
  </Route>
  <Route path="/" element={<Navigate to="/today" replace />} />
  <Route path="*" element={<Navigate to="/today" replace />} />
</Routes>
```

- [ ] **Step 5: Run tests**

```bash
npm test -- src/features/public/phoneValidation.test.ts
```

Expected: 6 passing.

- [ ] **Step 6: Commit**

```bash
git add src/features/public/ src/App.tsx
git commit -m "Sprint 7: public exhibition form (3-step wizard at /order/:slug)"
```

---

### Task 9: Order confirmation page

**Files:**
- Create: `src/features/public/OrderConfirmationPage.tsx`

**Spec references:** v1-spec §10 confirmation screen; DESIGN_HANDOFF screenshot 17 + §6.2.

Layout top-to-bottom:
- Large checkmark icon + "Order placed." heading
- "Thank you, {first_name}." (first whitespace-separated token of customer.name)
- Order number `#YYYY-NNNN` (from `order.public_order_number`)
- Pickup card: event name + date range + pickup window (if set) + venue (if set)
- Order summary table
- "Total · pay at pickup" line
- Primary CTA: `Save to WhatsApp` (deep-link `wa.me/91<phone>?text=<encoded message with order number + items + total>`)
- Secondary link: `Place another order →` (returns to `/order/:slug?name=…&phone=…`)
- Footer: business WhatsApp footer (use `BUSINESS_INFO.whatsapp` from `src/lib/business.ts`)

Reads via `fetchOrderByRef(slug, ref)` from `public/api.ts`. If response is null → render "Order not found" landing (anti-leak / wrong ref). If `ref` missing in URL → also "Order not found".

- [ ] **Step 1: Implement page**

```tsx
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { fetchOrderByRef, type PublicOrderDetail } from './api';
import { BUSINESS_INFO } from '@/lib/business';

export function OrderConfirmationPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [params] = useSearchParams();
  const ref = params.get('ref') ?? '';
  const [data, setData] = useState<PublicOrderDetail | null | 'not_found'>(null);

  useEffect(() => {
    if (!ref) { setData('not_found'); return; }
    fetchOrderByRef(slug, ref).then((d) => setData(d ?? 'not_found'));
  }, [slug, ref]);

  if (data === null) return <div className="p-edge">Loading…</div>;
  if (data === 'not_found') return <div className="flex min-h-screen items-center justify-center"><p>Order not found.</p></div>;

  const firstName = (data.customer.name.trim().split(/\s+/)[0] ?? 'there');
  const phoneDigits = data.customer.phone.replace(/[^0-9]/g, '');
  const itemsLine = data.items.map((i) => `${i.qty} × ${i.name}`).join(', ');
  const waMsg = encodeURIComponent(
    `Order ${data.order.public_order_number} placed for ${data.event.name}.\n${itemsLine}\nTotal ₹${data.order.total.toFixed(2)} · pay at pickup`,
  );
  const waHref = `https://wa.me/91${phoneDigits}?text=${waMsg}`;
  const restartHref = `/order/${slug}?name=${encodeURIComponent(data.customer.name)}&phone=${encodeURIComponent(data.customer.phone)}`;

  return (
    <div className="min-h-full bg-paper-surface p-4">
      <div className="mx-auto max-w-md">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-status-ok-bg text-status-ok-border" aria-hidden>✓</div>
          <h1 className="mt-3 text-title font-bold text-ink-900">Order placed.</h1>
          <p className="mt-1 text-body text-ink-700">Thank you, {firstName}.</p>
          <p className="mt-2 text-subtitle font-semibold text-brand-orange">{data.order.public_order_number}</p>
        </div>

        <section className="mt-6 rounded-card bg-paper-elevated p-4">
          <h2 className="text-label uppercase text-ink-500">Pickup</h2>
          <p className="mt-1 text-body text-ink-900">{data.event.name}</p>
          <p className="text-body-sm text-ink-700">{data.event.starts_on} – {data.event.ends_on}</p>
          {data.event.pickup_window_start && data.event.pickup_window_end && (
            <p className="text-body-sm text-ink-700">{formatPickupWindow(data.event.pickup_window_start, data.event.pickup_window_end)}</p>
          )}
          {data.event.venue_line && <p className="text-body-sm text-ink-700">{data.event.venue_line}</p>}
        </section>

        <section className="mt-4 rounded-card bg-paper-elevated p-4">
          <h2 className="text-label uppercase text-ink-500">Order summary</h2>
          <ul className="mt-2 divide-y divide-ink-900/10">
            {data.items.map((i) => (
              <li key={i.product_id} className="flex justify-between py-2 text-body">
                <span>{i.qty} × {i.name}</span>
                <span className="tabular-nums">₹{(i.qty * i.unit_price).toFixed(2)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex justify-between border-t border-ink-900/10 pt-2 text-body font-semibold">
            <span>Total · pay at pickup</span>
            <span className="tabular-nums">₹{data.order.total.toFixed(2)}</span>
          </div>
        </section>

        <a
          href={waHref}
          className="mt-6 block h-12 w-full rounded-btn bg-brand-orange text-center text-body font-semibold leading-[3rem] text-white"
        >
          Save to WhatsApp
        </a>
        <Link to={restartHref} className="mt-3 block text-center text-body-sm text-ink-700 underline">
          Place another order →
        </Link>
        <p className="mt-6 text-center text-body-sm text-ink-500">
          Questions? WhatsApp Archana at {BUSINESS_INFO.whatsapp}
        </p>
      </div>
    </div>
  );
}

function formatPickupWindow(start: string, end: string): string {
  const fmt = (iso: string) => new Date(iso).toLocaleString('en-IN', {
    weekday: 'short', day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
  return `${fmt(start)} – ${fmt(end)}`;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/public/OrderConfirmationPage.tsx
git commit -m "Sprint 7: order confirmation page at /order/:slug/confirmed"
```

---

### Task 10: NEW badge on Orders tab

**Files:**
- Create: `src/features/orders/newOrderBadge.ts`
- Create: `src/features/orders/newOrderBadge.test.ts`
- Modify: `src/components/BottomNav.tsx`

**Spec references:** v1-spec §10 "Notification to mom — small NEW badge on the Orders tab (cleared on tab visit)".

Approach:
- `localStorage` key `orders:lastSeenAt` stores ISO timestamp of last Orders tab visit.
- On BottomNav mount and on each route change, fetch count of `orders` rows where `source = 'exhibition_form' AND created_at > lastSeenAt`.
- When user navigates to `/orders`, write `now` to `lastSeenAt` and clear the badge.

- [ ] **Step 1: newOrderBadge.ts**

```ts
// src/features/orders/newOrderBadge.ts
import { supabase } from '@/lib/supabase';

const LAST_SEEN_KEY = 'orders:lastSeenAt';

export function getLastSeenAt(): string {
  try {
    return localStorage.getItem(LAST_SEEN_KEY) ?? '1970-01-01T00:00:00Z';
  } catch {
    return '1970-01-01T00:00:00Z';
  }
}

export function markOrdersSeen(): void {
  try {
    localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
  } catch {
    /* ignore */
  }
}

export async function fetchUnseenExhibitionOrderCount(): Promise<number> {
  const lastSeenAt = getLastSeenAt();
  const { count, error } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'exhibition_form')
    .gt('created_at', lastSeenAt);
  if (error) return 0; // silent fallback — never block nav on this query
  return count ?? 0;
}
```

- [ ] **Step 2: newOrderBadge.test.ts**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getLastSeenAt, markOrdersSeen } from './newOrderBadge';

describe('newOrderBadge', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to epoch when key absent', () => {
    expect(getLastSeenAt()).toBe('1970-01-01T00:00:00Z');
  });
  it('markOrdersSeen writes a recent ISO string', () => {
    markOrdersSeen();
    expect(new Date(getLastSeenAt()).getTime()).toBeGreaterThan(Date.now() - 1000);
  });
  it('roundtrip', () => {
    markOrdersSeen();
    const stored = getLastSeenAt();
    expect(stored).not.toBe('1970-01-01T00:00:00Z');
    expect(stored).toBe(localStorage.getItem('orders:lastSeenAt'));
  });
});
```

- [ ] **Step 3: BottomNav integration**

```tsx
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { fetchUnseenExhibitionOrderCount, markOrdersSeen } from '@/features/orders/newOrderBadge';

// inside BottomNav:
const [unseen, setUnseen] = useState(0);
const location = useLocation();

useEffect(() => {
  fetchUnseenExhibitionOrderCount().then(setUnseen);
}, [location.pathname]);

useEffect(() => {
  if (location.pathname.startsWith('/orders')) {
    markOrdersSeen();
    setUnseen(0);
  }
}, [location.pathname]);

// render: when label === 'Orders' and unseen > 0, render a small dot/badge next to the icon
```

- [ ] **Step 4: Commit**

```bash
git add src/features/orders/newOrderBadge.ts src/features/orders/newOrderBadge.test.ts src/components/BottomNav.tsx
git commit -m "Sprint 7: NEW badge on Orders tab for exhibition-form orders"
```

---

### Task 11: Browser verify script + sprint close

**Files:**
- Create: `scripts/verify-events-flow.py`

**Spec references:** Per memory `feedback_advisor_before_done.md`: browser verify must exercise interactive paths, not just renders.

Coverage:
1. Login as mom; navigate to `/events`; assert page renders.
2. Click `+ Add event`; fill name "Sprint 7 Smoke Event" + kind=Exhibition + dates today..today+5 + lead_weeks=1; Save.
3. Assert redirect to `/events/:id` with slug populated; assert Public URL block visible; assert slug is non-empty.
4. Read slug; sign out; navigate to `/order/<slug>`.
5. Assert public form renders. Click `+` on first product. Click Continue. Fill name + phone (9876543210). Continue. Click Place order.
6. Assert redirect to `/order/<slug>/confirmed?ref=<uuid>` with "Order placed." heading + `#YYYY-NNNN` badge.
7. Sign back in as mom. Navigate to `/orders`. Assert the new exhibition order appears at top.
8. Navigate to `/customers`. Assert the new customer (with the phone number) appears.

- [ ] **Step 1: Write Playwright script**

(Subagent writes following the pattern in `scripts/verify-customer-flow.py`.)

- [ ] **Step 2: Run it**

```powershell
python scripts/with_server.py --server "npm run dev" --port 5173 -- python scripts/verify-events-flow.py
```

Expected: all assertions pass, exit 0.

- [ ] **Step 3: typecheck + tests + advisor**

```bash
npm run typecheck
npm test
```

Expected: 0 errors, all tests passing.

Then call `advisor()` — must address any blockers before final commit.

- [ ] **Step 4: Commit the script and CLAUDE.md/ENGINEERING_NOTES updates**

```bash
git add scripts/verify-events-flow.py CLAUDE.md docs/ENGINEERING_NOTES.md \
        docs/decisions/2026-05-22-sprint-7-architecture-decisions.md
git commit -m "Sprint 7: verify-events-flow.py + decisions doc + status updates"
```

- [ ] **Step 5: Push**

```bash
git push origin main
```

---

## Self-review checklist (orchestrator runs before dispatching subagents)

- [ ] Three RPCs in 0005, all `security definer`, all granted to `anon, authenticated`.
- [ ] `committed_expected_qty` snapshot logic is app-level in `updateEvent` + `createEvent` — no Postgres-side scheduler.
- [ ] Public routes are siblings of `<Protected />`, not children.
- [ ] `next_public_order_number()` is referenced from `0005`, not redefined (it already exists in `0001_init.sql:189`).
- [ ] AddCustomerPage `source_event_id` is a user-selected dropdown when channel=Exhibition (no clever auto-set).
- [ ] NEW badge is the last functional task before browser verify (easiest to drop if sprint runs long).
- [ ] All date columns written via `todayInTz()` (`target_fulfilment_date` is unused here — only event reads pull dates back).
- [ ] `feedback_advisor_before_done.md` is honored: advisor + behaviour-shaped browser verify before push.

---

## Out of scope (carries to later sprints)

- Algorithm event-uplift consumption (v1-spec §11): events now have data; the algorithm code in `production/algorithm.ts` reads `event_uplift` not implemented yet. Sprint 8 / Sprint 9 can wire this in once Reports lands and proves the events data shape.
- Per-product event lead_weeks (v1-spec §2 explicit v2 deferral).
- PWA push notification for new exhibition orders (v1-spec §10 v2 deferral).
- Rate-limiting public form by IP (DESIGN_HANDOFF §10 v2 deferral).
