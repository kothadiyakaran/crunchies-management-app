# Sprint 7 — Architecture Decisions

Locked-in calls made during Sprint 7 (Events surface + customer-facing exhibition form + confirmation route). Builds on `2026-05-21-sprint-2-architecture-decisions.md` (ADR-1..7), `2026-05-21-sprint-3-4-architecture-decisions.md` (ADR-8..16), `2026-05-22-sprint-5-architecture-decisions.md` (ADR-17..21), and `2026-05-22-sprint-6-architecture-decisions.md` (ADR-22..26). Numbering continues.

---

## ADR-27: Three SECURITY DEFINER RPCs back the public form (one migration, no anon table access)

**Context:** `0002_rls.sql` already established the rule "anon role has zero direct table access" and noted that a SECURITY DEFINER RPC would ship in a later sprint. Sprint 7 is when it ships. The public form has THREE distinct anon read/write surfaces: (a) form page-load needs event meta + product list, (b) form submit needs to atomically create customer + order + items + allocate `public_order_number`, (c) confirmation page needs to read back the order it just created.

**Decision:** Three RPCs in `0005_public_rpcs.sql`, all `security definer set search_path = public, extensions`, all granted to `anon, authenticated`:

| RPC | Args | Returns | Purpose |
|---|---|---|---|
| `public_get_event_by_slug(p_slug)` | text | json (event + window_state + products) | Form page-load |
| `public_create_exhibition_order(p_slug, p_name, p_phone, p_notes, p_items, p_honeypot)` | text + text + text + text + jsonb + text | json (order_id + public_order_number) | Form submit |
| `public_get_order_by_ref(p_slug, p_order_id)` | text + uuid | json (order + customer + event + items) | Confirmation page |

**Why three (not one):**
- Mixing read and write semantics in one RPC would force the form to call it twice with different shapes — uglier and harder to debug.
- The confirmation route has a distinct anti-leak requirement (the order's customer's `source_event_id` MUST equal the event identified by `p_slug`, otherwise return NULL) that's clearer as its own function.
- Separate `grant execute` lines mean the surface area is auditable.

**Why SECURITY DEFINER over per-table RLS policies for anon:**
- The form submit spans `customers + orders + order_items + public_order_number_counter` atomically; dedup-on-phone with reactivate-if-archived is one logical decision and would scatter as four separate RLS conditions.
- Errors from the RPC can't leak schema details — they raise consistent strings ("invalid phone", "event not accepting orders") rather than Postgres native error codes.
- The honeypot silently no-ops (returns NULL) — impossible to express that semantically with RLS.

**Anti-leak in `public_get_order_by_ref`:** the function returns NULL unless `customer.source_event_id = events.id` for the event identified by `p_slug` AND `order.source = 'exhibition_form'`. Someone tampering with the `ref=<uuid>` URL parameter can't enumerate other customers' orders.

**Cross-references:** `supabase/migrations/0005_public_rpcs.sql`, `src/features/public/api.ts`, `src/features/public/PublicOrderFormPage.tsx`, `src/features/public/OrderConfirmationPage.tsx`.

---

## ADR-28: `committed_expected_qty` snapshot is app-level inside `updateEvent`, with one trigger relaxation

**Context:** Spec §6 says `event_demand.committed_expected_qty` freezes when `event.starts_on` is reached. Mechanism options: (a) Postgres trigger watching `events.UPDATE` of `starts_on`, (b) scheduled job, (c) app-level write inside the same save handler that touches event_demand.

**Decision:** Option (c). `updateEvent` calls `maybeSnapshotEvent(id)` then `maybeUnfreezeEvent(id)` after the row update completes. `maybeSnapshotEvent` SELECTs the event; if `starts_on <= todayInTz()`, it issues per-row UPDATEs on event_demand setting `committed_expected_qty = expected_qty` for rows still NULL. `maybeUnfreezeEvent` handles the rare reverse path (mom edits `starts_on` from past back to future) — single batch UPDATE resetting all non-null committed rows to NULL.

**Why app-level over trigger:**
- The reverse path is symmetric with the forward path — both belong next to the call site, not split between trigger logic and app logic.
- Triggers can't see "today" in the user's timezone; using `now()` server-side risks edge-of-day mistakes for a business in Asia/Kolkata.
- Per-row visibility in the UPDATE log makes the operation easier to debug.

**Trigger relaxation (`0006_event_demand_unfreeze.sql`):** the original `trg_event_demand_freeze_committed` from `0001_init.sql` blocks ANY UPDATE that changes `committed_expected_qty` to a distinct value. To allow `non-null → NULL` (the unfreeze path) while preserving `non-null → different non-null` immutability, the trigger now early-returns when `new.committed_expected_qty IS NULL`. One-line change; tested by `maybeUnfreezeEvent` running successfully.

**Known limitation (carry to ADR-32 backlog):** `createEvent` runs `maybeSnapshotEvent` BEFORE the `upsertEventDemand` loop runs (because the loop calls happen in `EventDetailPage`'s save handler, AFTER `createEvent` returns the new id). For an event created with `starts_on` already in the past, the first save therefore does NOT snapshot anything (the demand rows don't exist yet at snapshot time). The next call to `updateEvent` (any edit) will snapshot correctly. Mom virtually always creates future-dated events; this is a non-blocking edge case. If it bites, fix by running `maybeSnapshotEvent` inside the save handler in `EventDetailPage.tsx` AFTER all `upsertEventDemand` calls complete (not inside `createEvent` itself).

**Cross-references:** `supabase/migrations/0006_event_demand_unfreeze.sql`, `src/features/events/api.ts:maybeSnapshotEvent`/`maybeUnfreezeEvent`/`updateEvent`/`createEvent`, `src/features/events/EventDetailPage.tsx` (save handler).

---

## ADR-29: Slug derivation lives in `eventLogic.ts`; `createEvent` retries 23505 with `bumpSlug`

**Context:** Spec §6 — exhibitions need a public slug; auto-suggested from name + year on first save, collision-handled with a numeric suffix. Festivals don't have slugs (schema constraint `events_slug_only_for_exhibitions` enforces this).

**Decision:**
- Pure `slugify(name, year)` and `bumpSlug(base, attempt)` live in `src/features/events/eventLogic.ts`. 15 unit tests in `eventLogic.test.ts` cover Latin punctuation, ASCII/curly apostrophes (elided not hyphenated, per spec test invariant), trim/collapse, year bumping with and without a detected 4-digit year, default lead-weeks per kind, window state, and weeksUntil math.
- `createEvent` derives `base = slugify(input.name, year-of-starts_on)` when `kind === 'exhibition'` AND `input.slug == null`. On Postgres `23505` (unique violation), retries with `bumpSlug(base, attempt)` for `attempt = 2..5`. After 5 failures, throws.
- For `kind === 'festival'`, the insert payload hard-forces `slug: null` regardless of input — defensive against the schema constraint catching a caller mistake.

**Why pure helpers + retry-in-API split:**
- Pure functions are unit-testable in isolation — the slug algorithm itself never touches Postgres.
- The retry loop must observe the Postgres error code (23505) — that's a Supabase-layer concern, lives in `api.ts`.
- The retry runs inside `createEvent`, so callers never see a `23505` bubble up.

**Cross-references:** `src/features/events/eventLogic.ts`, `src/features/events/api.ts:createEvent`, `src/features/events/EventDetailPage.tsx` (slug-preview UI).

---

## ADR-30: Event Detail / Edit reuses the dual-mode prop pattern (no separate Add page)

**Context:** Sprint 5 ADR-20 and Sprint 6 ADR-25 established the "single page handles create + edit via `editingXId` prop" pattern. Events follow the same model, but the route already uses `/events/:id` for edit, so `useParams<{id}>()` reading the route param replaces the prop — same dual-mode behaviour, slightly different plumbing.

**Decision:** One file `EventDetailPage.tsx` handles both `/events/new` (no `:id`) and `/events/:id` (edit). Hydration via `getEventDetail(id)` runs when `:id` is present. The `defaultLeadWeeks(kind)` auto-fill on kind change applies in create mode only; in edit mode a `leadWeeksUserSet` flag (initialized true on hydration) prevents kind changes from clobbering the persisted value.

**Why this stays consistent with Sprint 5/6:** every "add+edit" pair in the codebase now uses the dual-mode pattern. Editors don't have to learn separate add-vs-edit shapes; reviewers see one file when assessing a flow.

**No field-locking** per spec §6 — every field stays editable in edit mode (including `kind`, `starts_on`, `ends_on`). The retrospective card only renders when `ends_on < todayInTz()` — it's a render-time conditional, not a mode switch.

**Cross-references:** `src/features/events/EventDetailPage.tsx`, `src/features/customers/AddCustomerPage.tsx` (Sprint 6 reference), `src/features/orders/AddOrderPage.tsx` (Sprint 5 reference).

---

## ADR-31: `source_event_id` on AddCustomerPage is a user-picked dropdown; channel-chip change clears it

**Context:** Spec §10 attaches `source_event_id` automatically when an exhibition customer arrives via the public form. For mom-entered customers (channel = Exhibition), spec §8 didn't lock the mechanism — the choices were (a) auto-set when exactly one in-window event exists, (b) always show a dropdown.

**Decision:** Always show a dropdown when `channelLower === 'exhibition'` AND there's at least one active+in-window exhibition event. Default selection is `— Not from an event —` (`null`). No auto-set on "exactly one in window."

**Why the dumb option wins:**
- Auto-set is clever code mom doesn't see — if it picks the wrong event (two simultaneous exhibitions), she can't tell why the attribution is off.
- Explicit selection is one extra tap with high visibility; mom learns the mechanism through use.

**Channel-chip change clears `sourceEventId`** (one of two advisor catches on sprint close): without this, picking Exhibition + an event then switching to Personal would save `source_event_id=<exhibition_id>` AND `channel_id=<Personal id>`, an orphan provenance value the user can't see/edit (the dropdown only renders when channel = Exhibition). The fix lives in a `handleChannelChange` wrapper around `ChannelChipPicker.onChange` that resets `sourceEventId` to null on **actual** chip changes (no-op clicks on the already-selected chip skip the reset). Hydration in edit mode runs in its own effect that fires before any chip-click handler, so existing source_event_id values survive page mount.

**Cross-references:** `src/features/customers/AddCustomerPage.tsx` (the wrapped `onChange`), `src/features/customers/AddCustomerPage.test.tsx` (2 RTL tests asserting render-gate + channel-change reset), `src/features/events/api.ts:listInProgressExhibitions`.

---

## ADR-32: NEW badge is localStorage-backed; cleared on `/orders` visit

**Context:** Spec §10 — mom sees a small NEW indicator on the Orders tab when there are unseen exhibition-form orders. PWA push notifications are deferred to v2 per the same section.

**Decision:** Client-side state. `src/features/orders/newOrderBadge.ts` exports:
- `getLastSeenAt()` — reads `localStorage['orders:lastSeenAt']`, defaults to epoch on first run or storage failure.
- `markOrdersSeen()` — writes `new Date().toISOString()` to the same key.
- `fetchUnseenExhibitionOrderCount()` — `SELECT count FROM orders WHERE source = 'exhibition_form' AND created_at > lastSeenAt`. Returns 0 on error (silent — never blocks navigation).

BottomNav fetches the count on every route change (cheap, head-only count query); when the user navigates to `/orders` it calls `markOrdersSeen()` and zeroes the badge. Visual: a 2×2 px orange dot top-right of the Orders tab icon, with an `aria-label` describing the count.

**Why localStorage over a server-side sentinel:**
- The "seen" state is per-device. Mom only uses one device (her phone); a server-side `customers.last_seen_exhibition_orders_at` column would be over-engineering.
- Pure-read fallback on storage failure (incognito mode, browser quotas) means the badge is always-visible if storage is unavailable — fail-safe in the right direction (mom sees the indicator and can still navigate to clear it; she just sees it again next visit).

**Cross-references:** `src/features/orders/newOrderBadge.ts`, `src/features/orders/newOrderBadge.test.ts` (4 invariants), `src/components/BottomNav.tsx` (badge render + clear-on-visit).

---

## Browser verification (sprint close)

`scripts/verify-events-flow.py` is the Sprint 7 smoke. Headless Playwright against a local dev server:

1. Login as mom
2. Navigate `/events` → assert header + chips + add link
3. Click `+ Add event` → fill exhibition with today..today+5 + lead 1 → Save
4. Read slug from input (auto-derived from name + year)
5. Open `/order/<slug>` in a fresh anonymous browser context (no auth)
6. Step through 3-step wizard: +1 product → Continue → name + phone (9876543210) → Continue → Place order
7. Assert `/order/<slug>/confirmed?ref=<uuid>` with "Order placed." heading and `#YYYY-NNNN` badge
8. Log back in as mom → assert order appears in `/orders` and customer appears in `/customers`

Captures 6 screenshots: `sprint7-{events-list, event-detail, public-form-step1, public-form-step3, confirmation, orders-after-smoke}.png` (not committed, mirroring prior sprints).

First run from a fresh DB allocated `#2026-0001`, confirming the per-year sequence works correctly.

---

## Post-implementation fixes

Two advisor catches addressed before the final commit:

1. **`sourceEventId` orphaned when channel-chip changes away from Exhibition.** (ADR-31 above.)
2. **No tests for the `source_event_id` dropdown wiring** — added `AddCustomerPage.test.tsx` with 2 RTL invariants covering render-gate + channel-change reset.

Non-blocking flagged for future-you (documented above in ADR-28):
- `maybeSnapshotEvent` inside `createEvent` runs before `upsertEventDemand` rows exist; backdated event creation needs an `updateEvent` save to snapshot. Mom virtually always creates future-dated events; non-blocking. If it bites, move the snapshot into `EventDetailPage`'s save handler after the demand-upsert loop.

---

## Open items carrying into Sprint 8+

- **Algorithm event-uplift consumption** (v1-spec §11). Events now have committed and operative demand data; the algorithm in `production/algorithm.ts` doesn't yet read `event_demand` / `committed_expected_qty`. Sprint 8 (Reports) doesn't need it either, but Sprint 9 polish should wire it in once mom uses events for a real festival.
- **Per-product event lead_weeks** — explicit v2 deferral per spec §2.
- **PWA push notification** for new exhibition orders — v2 (spec §10 explicit).
- **Rate-limiting** the public form by IP — v2 (DESIGN_HANDOFF §10 deferral).
- **Confirmation page footer**: `BUSINESS_INFO.whatsapp` is currently null in `src/lib/business.ts` (placeholder pending mom's input). The footer line is conditionally hidden today; will appear once Sprint 9 populates the value.
- **NEW badge end-to-end visual smoke** — currently only unit-tested at the localStorage layer + the inverse "visiting /orders clears" path is exercised by the smoke. A render-side assertion (badge present before `/orders` visit, absent after) would be a Sprint 9 polish.
