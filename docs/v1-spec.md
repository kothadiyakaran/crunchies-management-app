# Crunchies Management App — v1 Detailed Spec

The locked feature spec for v1. Companion to `CLAUDE.md` — that file gives high-level context, current state, and how to work; this file gives the locked behavioural detail.

## Implementation status (2026-06-02)

**Phase 1 build complete + Phase 2 maintenance shipped + UI polish pass shipped. The app is feature-complete and in maintenance-only mode** (changes only on mom's request or a required fix). All 14 sections below are implemented and deployed to `https://www.crunchies.app`. The 2026-06 UI polish pass was **visual-only** (a design-token layer, shared input/button primitives, and per-screen styling — see `docs/superpowers/plans/2026-06-01-ui-critique-polish-pass.md`) and changed **no behaviour**, so the behavioural spec below stands unchanged. Each section header below lists `→ Implementation:` pointers to the relevant files. Where implementation differs from the original spec text, the implementation is the source of truth and the spec text below is annotated `[Drift — see ADR-45]` with the correction. **Post-launch Phase 2 changes** (reversibility, discounts, canvas bill preview, exhibition order↔event link, inline add-customer fix) are marked `[Phase 2]` inline and summarised in §14 → "Phase 2 — Ongoing (post-launch)"; their decision records live in `docs/superpowers/specs/`.

Outcomes referenced throughout:
- **O1** — production matches demand (mom stops underproducing)
- **O2** — zero lost customers/orders (every WhatsApp order captured, every exhibition contact retained)
- **O3** — mom feels mastery + clarity (qualitative — opens daily, talks about it, trusts it)

Section status:
- [x] §1 Architecture — `src/App.tsx`, `src/lib/supabase.ts`
- [x] §2 Data model — `supabase/migrations/0001_*.sql` through `0009_*.sql`
- [x] §3 Mom's app — `src/components/AppShell.tsx` + `src/components/BottomNav.tsx`
- [x] §4 Today screen — `src/features/today/TodayPage.tsx`
- [x] §5 Production screen — `src/features/production/`
- [x] §6 Events screen — `src/features/events/`
- [x] §7 Orders screen — `src/features/orders/`
- [x] §8 Customers screen — `src/features/customers/`
- [x] §9 Reports screen — `src/features/reports/`
- [x] §10 Customer-facing exhibition form — `src/features/public/`
- [x] §11 Production rhythm — `src/features/production/algorithm.ts` + `planLayer.ts`
- [x] §12 Production planning loop — `src/features/production/PlanWeekPage.tsx`
- [x] §13 Settings — `src/features/settings/` (single-row `business_settings` + RPC)
- [x] §14 Phase 0 + build sequencing — closed; full sprint narrative in `docs/BUILD_HISTORY.md`

---

## §1 Architecture (summary; full text in CLAUDE.md)

- React + Vite + TypeScript PWA, mobile-first, installable on Android.
- Supabase: Postgres + auth + Row-Level Security.
- Client-side `jsPDF` for bill generation; OS share sheet to WhatsApp.
- Vercel or Cloudflare Pages, GitHub-connected.
- One data spine, three lenses (production / customer / order).
- Three audiences: mom (auth), Karan (auth + admin), exhibition customers (anonymous insert via per-event URL).

---

## §2 Data model

All tables justified outcome-by-outcome. RLS sketch at the bottom of this section.

### `customers`

| Field | Type | Justification |
|---|---|---|
| `id` | uuid PK | — |
| `name` | text | O2 — identity for retrieval |
| `phone` | text | O2 — exhibition contact retention; also WhatsApp link generation |
| `channel_id` | uuid FK → `channels` | O3 — categorization for filtered views (where the relationship came from). Replaces the original enum to support custom channels (see new `channels` table below and §8.3.3). Three system rows are seeded (Personal / Reseller / Exhibition); mom can add more inline. |
| `size_tier` | enum: `small` \| `large`, **nullable** | O3 — volume tier, applies to any channel (personal customers can be as big as resellers). Nullable because new customers (especially exhibition walk-ins) aren't classifiable yet. Mom can set or change any time. |
| `source_event_id` | uuid FK → `events` nullable | O2 — links exhibition customers back to where they came from |
| `notes` | text nullable | O2 — free-text memory ("prefers low-sugar", "lives near Aundh") |
| `active` | bool default true | O2 — archive instead of delete when a customer has order history. Filtered out of pickers; history preserved. |
| `last_contacted_at` | timestamptz nullable | O2 — drives the "quiet customers" nudge (§8). Updated whenever mom acknowledges the customer: `Send WhatsApp` button tap, long-press WhatsApp link from phone field, or dismiss-nudge `×` tap. NOT updated by notes/profile edits (those are record-keeping, not contact). |
| `last_ordered_at` | timestamptz nullable | O2 — denormalized "most recent order timestamp" for the quiet-customer query. Maintained when orders are inserted/edited/deleted (trigger or app-level upsert). Cheaper than `MAX(orders.ordered_at)` on every directory render. NULL when the customer has never ordered. |
| `discount_percent` | numeric **nullable** (0–100) | O3 — per-customer universal discount, any channel. `null` = inherit the channel default; an explicit value (incl. 0) overrides. Snapshotted onto each order at creation. *[Phase 2 — migration 0008]* |
| `created_at` | timestamptz | — |

**Note on size_tier:** v1 is purely manual. The "should the app auto-suggest a tier from order volume?" question is v2.

### `channels` *(new — extensible customer-channel set)*

Replaces the original `customers.channel` enum. Three rows are seeded as `is_system = true` (Personal / Reseller / Exhibition); mom can add additional rows inline from Add Customer (see §8.3.3).

| Field | Type | Justification |
|---|---|---|
| `id` | uuid PK | — |
| `name` | text | O3 — display name on chips and filters. Max 20 chars, trimmed, case-insensitive unique. |
| `is_system` | bool default false | O3 — true for the three seed rows; system rows can be soft-hidden but not hard-deleted. |
| `active` | bool default true | O3 — false hides the channel from pickers/filters; historic customers referencing it keep their attribution. |
| `default_discount_percent` | numeric not null default 0 | O3 — category default discount (0–100); Reseller seeded to 20, others 0. Resolved into a per-order snapshot at order creation. *[Phase 2 — migration 0008]* |
| `created_at` | timestamptz | — |

**Behaviour calls:**
- Custom channel chips render identical to system ones — no "user-added" visual differentiation (per `DESIGN_HANDOFF.md` §6.1).
- Seed migration on first run inserts (`Personal`, `Reseller`, `Exhibition`) with `is_system = true`.
- The public exhibition form does not use this picker; exhibition-form orders attach the customer to the seed "Exhibition" channel automatically.

### `products`

| Field | Type | Justification |
|---|---|---|
| `id` | uuid PK | — |
| `name` | text | — |
| `unit` | text (e.g., "250g box", "kg") | O1 — production suggestion needs a comparable unit |
| `default_price` | numeric | O3 — bill generation needs price; defaults editable per-order |
| `is_seasonal` | bool default false | O1 — seasonal items get a toggle, not full demand-average treatment |
| `is_aggregated` | bool default false | O1 — excluded from production *suggestions*, but kept visible in a separate Production-screen section (procurement reminder) |
| `source_maker_name` | text nullable | O3 — required disclosure when `is_aggregated=true` |
| `active` | bool default true | O3 — retire products without deleting history |
| `created_at` | timestamptz | — |

### `orders`

The center of gravity. One row per order, not per line item.

| Field | Type | Justification |
|---|---|---|
| `id` | uuid PK | — |
| `customer_id` | uuid FK → `customers` | O1, O2 — every order ties to a customer for history + demand aggregation |
| `ordered_at` | timestamptz | O1 — demand windows; O3 — "today's pending" |
| `target_fulfilment_date` | date **nullable in schema, mandatory in mom's UI** | O1, O2, O3 — promised delivery date. Drives demand-week attribution (§11, §12). Required on mom's order entry forms (defaults to today). Schema stays nullable to allow exhibition-form orders to submit without it; mom completes on review. NULL = "treat as due today" for pending logic; "attribute to week of ordered_at" for demand math. |
| `source` | enum: `whatsapp` \| `exhibition_form` \| `in_person` \| `phone` | O2 — answers "how did this order arrive?" |
| `fulfilled_at` | date nullable | O2, O3 — pending vs fulfilled view; `null` = still pending. Day-granular (mom thinks in days, not hours). |
| `payment_status` | enum: `unpaid` \| `paid` \| `partial` | O3 — payment-tracking requirement from older doc |
| `paid_at` | date nullable | O3 — date for reporting |
| `bill_number` | int **nullable** | O3 — sequential bill number stamped on first `Generate bill` action; reused on regeneration. App-wide sequence starting at 1001. |
| `public_order_number` | text **nullable** | O2, O3 — public-facing identifier shown to exhibition-form customers on the confirmation screen (§10), formatted `#YYYY-NNNN` where `NNNN` is a per-year sequence. Populated at order creation for `source = exhibition_form`; remains NULL for mom-entered orders. Stable across reads (does not re-derive). |
| `notes` | text nullable | O2 — special instructions, delivery preferences |
| `discount_percent` | numeric not null default 0 | O3 — per-order discount snapshot (0–100), resolved order > customer > channel-default > 0 at creation and frozen here; the only value bills/totals read. *[Phase 2 — migration 0008]* |
| `event_id` | uuid FK → `events` nullable, on delete set null | O2 — ties an exhibition order to its event so the confirmation lookup is correct regardless of customer provenance (was inferred via `customer.source_event_id`, which broke cross-event repeat customers). NULL for non-exhibition orders. *[Phase 2 — migration 0009]* |
| `created_at` | timestamptz | — |

### `order_items`

| Field | Type | Justification |
|---|---|---|
| `id` | uuid PK | — |
| `order_id` | uuid FK → `orders` (cascade delete) | — |
| `product_id` | uuid FK → `products` | O1 — demand aggregation is `SUM(qty) GROUP BY product_id` |
| `qty` | numeric | O1 — the actual demand quantity |
| `unit_price` | numeric | O3 — snapshot at order time (price can change later without rewriting history) |

### `production_logs`

| Field | Type | Justification |
|---|---|---|
| `id` | uuid PK | — |
| `product_id` | uuid FK → `products` | O1 — production suggestion subtracts this from the demand average |
| `made_on` | date | O1 — week-of-production rollup (mom makes weekly, not daily) |
| `qty` | numeric | O1 — quantity produced |
| `notes` | text nullable | O3 — batch notes if any |
| `created_at` | timestamptz | — |

### `production_plans` *(new — planning loop)*

Mom's own per-week production targets, set at the start of each week. Compared against algorithm suggestion and actual production for the calibration loop.

| Field | Type | Justification |
|---|---|---|
| `product_id` | uuid FK → `products` | O1 — one plan row per product per week |
| `week_start` | date | O1 — Monday of the week being planned |
| `planned_qty` | numeric | O1 — mom's intended make quantity for this product this week. Mutable all week — operative target on Today/Production. |
| `original_planned_qty` | numeric | O1 — frozen first-saved value for the retrospective. Set on INSERT, never updated. Protects the calibration feedback loop (see §12). |
| `entered_at` | timestamptz | O1 — first-save timestamp; used to flag retrospective plans set after week's end |
| `notes` | text nullable | O3 — optional reasoning ("low — going to Mumbai Wed–Thu") |
| **PK:** `(product_id, week_start)` | | |

`planned_qty` is mutable any time. `original_planned_qty` is set once on insert and never updated — the retrospective uses it so mom's calibration signal stays honest (§12).

### `seed_demand`

The day-1 gut-feel-average mechanism — replaced by rolling average once 4 weeks of real data accumulate per product.

| Field | Type | Justification |
|---|---|---|
| `product_id` | uuid PK FK → `products` | O1 — one seed value per product |
| `weekly_avg_qty` | numeric | O1 — mom's gut-feel weekly demand entered at setup |
| `entered_at` | timestamptz | O1 — for transparency / context |

Per-product decision at suggestion time: if the product has ≥4 weeks of order history → rolling average; else → `seed_demand.weekly_avg_qty`.

### `events` *(generalized)*

Now represents both exhibitions (with public order forms) and festivals (no public form). Festivals drive production planning via expected demand; exhibitions do both that AND provide a customer-facing URL.

| Field | Type | Justification |
|---|---|---|
| `id` | uuid PK | — |
| `name` | text | O3 — e.g., "Diwali 2026", "Aundh Diwali Fair" |
| `kind` | enum: `festival` \| `exhibition` \| `other` | O1 — affects display & whether it has a public form |
| `starts_on` | date | O1 — event window start |
| `ends_on` | date | O1 — event window end |
| `lead_weeks` | int default 2 | O1 — how many weeks before the event production should start ramping. Per-event (not per-product) in v1 for simplicity. |
| `slug` | text unique **nullable** | O2 — public URL `crunchies.app/order/<slug>` (only for exhibitions) |
| `active` | bool default true | O2 — manual override on top of the date check |
| `pickup_window_start` | timestamptz **nullable** | O2 — start of the customer-facing pickup window, shown on the public confirmation screen's pickup card (§10). NULL for festivals. |
| `pickup_window_end` | timestamptz **nullable** | O2 — end of pickup window. NULL for festivals. |
| `venue_line` | text **nullable** | O2 — short stall/venue description shown on the confirmation screen ("Stall 14, Aundh Fair"). NULL for festivals or when not applicable. |
| `created_at` | timestamptz | — |

### `event_demand` *(new — events feature)*

Per-product expected demand for an event. Distributed across the lead-up weeks + event week by the algorithm.

| Field | Type | Justification |
|---|---|---|
| `event_id` | uuid FK → `events` | — |
| `product_id` | uuid FK → `products` | — |
| `expected_qty` | numeric | O1 — total extra demand expected for this event. Operative value used by the algorithm; mutable up to and during the event window. |
| `committed_expected_qty` | numeric nullable | O1 — frozen snapshot of `expected_qty` at the moment `event.starts_on` is reached. Used by the §6/§9 event retrospective so mom's year-over-year calibration signal stays honest. NULL until event start; set once, never updated thereafter. |
| `notes` | text nullable | O3 — optional reasoning ("based on last year's Rakhi") |
| **PK:** `(event_id, product_id)` | | |

`expected_qty` is editable up to and during the event window so the algorithm can redistribute uplift as mom revises. `committed_expected_qty` is a one-shot freeze at event start, mirroring the `original_planned_qty` rule from `production_plans` (see §12).

### `complaints`

Lightweight tracking; not a full ticketing system.

| Field | Type | Justification |
|---|---|---|
| `id` | uuid PK | — |
| `order_id` | uuid FK → `orders` | O3 — complaints are tied to a specific order |
| `reported_at` | date | O3 — reporting / timeline |
| `kind` | enum: `quality` \| `delivery` \| `wrong_item` \| `other` | O3 — categorize for monthly report |
| `description` | text | O3 — free-text detail |
| `resolution` | text nullable | O3 — what mom did about it |
| `resolved_at` | date nullable | O3 — open vs closed |

### Deliberately NOT in v1

- **`bills`** — bills are derived (PDF generation) from an order, not stored entities.
- **`inventory_snapshots`** — production-vs-demand math is computed live.
- **`users`** — Supabase `auth.users` handles mom + Karan.
- **`payments` ledger** — `orders.payment_status` + `paid_at` is enough.
- **`tags` / `labels`** beyond the enums above. YAGNI.
- **Per-product `lead_weeks` on events** — per-event lead time is the v1 simplification. v2 may add granular per-product.
- **Procurement workflow for aggregated products** — v1 is read-only awareness.

### Row-Level Security sketch

- All tables: read+write to authenticated users (mom, admin).
- Anonymous (exhibition form) gets **insert-only** access to `customers`, `orders`, `order_items`, scoped through a check that the referenced `events.slug` is `active=true` AND today is between `starts_on` and `ends_on`.
- No anonymous reads of anything.

---

## §3 Mom's app: navigation, daily flows, common UI patterns

### Navigation: 5-tab bottom bar

```
[Today]  [Orders]  [Customers]  [Production]  [Reports]
```

Five tabs is the upper bound for thumb-reach mobile nav. Each tab maps to a different mental mode. Events screen lives as a sub-route under Production (not a 6th tab — see §6).

### The 8 core daily flows

| Flow | Budget | Path |
|---|---|---|
| Log a new order (live, single) | ~30s | `+ Log new order` from anywhere → customer dropdown / `+ new` inline → product chips → qty → payment status → save |
| Log multiple orders (batch) | ~5–10 min for 5–10 orders | Orders tab → `Batch mode` toggle → looping mini-form → `Done — save all` |
| Log production | ~15s | Production screen → tap a row OR `+ Log production` → qty → save |
| Mark order fulfilled | ~5s | Order detail → `Mark fulfilled` |
| Mark order paid | ~5s | Order detail → `Mark paid` |
| Add a customer (standalone) | ~30s | Customers → `+ Add customer` → name, phone, channel, (size), (notes) → save |
| Generate a bill | ~5s + share | Order detail → `Generate bill` → jsPDF generates → OS share sheet → WhatsApp |
| Log a complaint | ~30s | Order detail → `Log complaint` → kind, description → save |

Plus the weekly planning ritual (§12) and event setup (§6) which are lower-frequency.

### Opinionated UI choices (apply to all screens)

- **Customer picker = search-as-you-type, not a long dropdown.** Type 2 letters → top matches → tap.
- **Product picker = chips of "recently used" + full list below.** Mom's hero products will dominate; recently-used chips make 80% of orders one-tap on the product.
- **Numeric keypad** for qty/price fields, not a generic text input.
- **No icons-only buttons.** Every actionable button has a text label.
- **No confetti / no badges / no nudges.** Mastery feel = quiet competence, not gamification.
- **System default font (Roboto on Android).** Custom display fonts → v2.
- **Refresh model:** refetch on tab focus, not realtime subscriptions. v1 has effectively one writer.
- **Week boundary:** Mon → Sun. Auto-rolls Monday 00:00 local time.

### Onboarding / first-run

Empty screens, not a guided wizard. Karan will sit with mom for first-time setup (entering product catalogue, seeding gut-feel weekly averages, adding upcoming events for the next 6–12 months, adding a starter customer or two). Each screen's empty state has a clear "add your first X" affordance.

---

## §4 Today screen *(locked)*

**Purpose:** mom opens the app, gets clarity on what to do today/this week. Read in 5 seconds, act in another 5. The entire "clarity" outcome lives here.

### Layout, top to bottom

**Header — very small, top corner**
- Today's date, e.g., "Mon, 20 May 2026"
- Small font; orientation only, not a focal point
- No greeting, no app name

**Block 0 — Last week retrospective (Mondays only)** *(see §12)*
- A single-line banner: *"Last week — planned X, made Y, demand Z. See details →"*
- Numbers are weekly totals (summed across all in-house products).
- Tap row → Reports last-week retrospective view (§9).
- `×` on the right dismisses for the week.
- Auto-clears at next Monday 00:00 regardless of dismissal.
- Block hidden on Tue–Sun and on first Monday before any week of data exists.
- This is the deliberate exception to §3's "no nudges" rule — it serves the calibration loop directly (O1), informational not gamified.

**Block 1 — This week, make**
- **Weekly framing throughout.** Mom makes products weekly, not daily. Target = weekly. Made-so-far = sum in this week's window. Never decompose into per-day suggestions.
- Sorted by remaining gap (biggest first → most urgent)
- Each row: product name, target qty (her **plan** if set, else algorithm suggestion), made-so-far, tap target
- Tap a row → opens "Log production" with the product pre-filled
- Products that have met or exceeded their weekly target collapse into a "Done this week (N)" expandable strip at the bottom
- Products where `target = 0 AND made = 0` are hidden
- **Aggregated products are not shown on Today.** They live on the Production screen only.

**Block 2 — Pending today**
- Up to 5 rows, then "see all →" link to filtered Orders view
- Each row: customer name, product summary
- Tap a row → order detail with `Mark fulfilled` / `Mark paid` / `Generate bill`
- Sorted: overdue first, then by target date ascending
- "Pending today" definition: orders where `(target_fulfilment_date <= today OR target_fulfilment_date IS NULL) AND fulfilled_at IS NULL`

**Block 2.5 — Quiet customers** *(see §8 for the model)*
- Header: `QUIET CUSTOMERS (N)`
- Up to 3 rows. Each: customer name, channel · weeks-since-last-touch, `×` dismiss on the right
- Sorted by most-overdue first (days past threshold, descending)
- Tap row → customer detail. Tap `×` → row removed (sets `last_contacted_at = now()`).
- Block hidden entirely when N = 0
- Neutral styling — no red/orange, no urgency

**Block 3 — Primary CTA**
- Full-width prominent button: `+ Log new order`
- Single CTA only. No "+ Log production" here — production logging is one tap from Block 1 or from the Production tab.

### Empty / first-run states

| State | Display |
|---|---|
| No products seeded yet | Block 1 says "Add products and seed averages to see your weekly plan." with link to Products setup |
| Products seeded, no orders yet | Block 1 shows seed-based suggestions with a small footnote: "Based on your initial estimates. Will refine as real orders accumulate." |
| No pending orders | Block 2 collapses to a single line: "All caught up." with a checkmark |
| First day ever | Header date only, all three blocks in empty states, with one onboarding affordance to Products setup |

### Behaviour calls

- **Target priority:** when mom has set a plan for the current week, the row shows her plan number. Otherwise falls back to the algorithm's suggestion. The fallback is silent — no badge or label needed.
- **Suggestion never goes negative.** Overproduced → row shows "0 — already covered" rather than "−2".
- **Sort tie-breaks** (when multiple products have equal gap): alphabetical, for stability across visits.

---

## §5 Production screen *(locked)*

**Purpose:** mom's home for production planning (O1). The full calibration loop lives here — her plan, the algorithm's suggestion, what she's made, plus upcoming events. Two user states drive every design decision:
1. *"I'm about to start production for the week — what should I make?"*
2. *"I just finished a batch — let me log it."*

### Layout, top to bottom

**A. Week selector (top)**
- Default: `This week (Mon 20 – Sun 26 May)`. Week range shown explicitly.
- Toggle to `Next week` — for planning ahead or logging pre-made batches.
- No "Last week" toggle — past-week retrospective lives in Reports.

**B. Upcoming events section**
- Always visible (when any future events exist).
- Up to 3 rows. If more, "see all →".
- Each row: event name, time-to-event (e.g., "in 2 weeks"), tap → Events screen drilldown.
- "+ Add event" affordance in this section.

```
UPCOMING EVENTS (3)
  Rakhi          in 2 weeks    →
  Ganpati        in 5 weeks    →
  Diwali         in 14 weeks   →
  [ + Add event ]
```

**C. In-house products — this week (the hero)**

Each row is a triplet plus state:

```
Laddu     Plan: 5    Suggested: 4    Made: 1
          (small subtitle: "includes ramp-up for Rakhi (+1)")
```

- **Plan:** mom's number for this week (from `production_plans`). When unset, shows "—" with a subtle "Plan this week →" affordance leading to the planning view.
- **Suggested:** algorithm output. When current-week orders or event uplift drive the number above the rolling average, a small subtitle on that row explains why ("includes pending orders" or "includes ramp-up for Rakhi").
- **Made:** sum of `production_logs` for the week.
- **State indicator:** checkmark when made ≥ plan (or ≥ suggested if no plan).

**Sorting:**
- By remaining gap (`plan − made`, or `suggested − made` if no plan) descending — biggest urgency first.
- Met-or-exceeded products collapse into "Done this week (N)" at the bottom.
- Hidden when `target = 0 AND made = 0` (same rule as Today).

**Planning entry point:**
- When the current week has no plan rows: a full-width affordance at the top of Section C — `Plan this week →`. Unmissable but quiet.
- When the current week has a plan: each row shows the plan number directly; small `edit plan` affordance per row to revise.

**D. Sourced from others (read-only, sub-section of C)**

Header: *"From other makers"*

| Product | Source | This week's demand |
|---|---|---|
| Til Chikki | Made by Sunita Kaki | 3 packs |
| Anarse | Made by Smita Tai | 1 dozen |

Read-only. No procurement workflow in v1. Hidden when no aggregated products have demand this week.

**E. Bottom CTA**
- Full-width `+ Log production` (no product pre-fill — has product picker).
- Primary log-production path is still: tap an in-house row → log for that product.

### Planning view (entered via "Plan this week →")

Full-screen list:

```
Plan production for week of Mon 20 May

Laddu     [ 4 ] boxes   (suggested: 4)
Chivda    [ 2 ] kg      (suggested: 2)
Mathri    [ 0 ] kg      (suggested: 1)   ← she chose to skip
Chakli    [ 1 ] kg      (suggested: 1)

[ Save plan ]
```

- Pre-fill from algorithm suggestion (or `seed_demand` for products with no order history yet).
- All in-house products listed. Aggregated products excluded.
- Edits per product → save → returns to Production screen with plan numbers populated.
- Editable mid-week from the same view (revise plan).

### Product detail (bottom sheet, opened by tapping an in-house row)

```
Laddu — this week
  Plan: 5 boxes
  Suggested: 4 boxes
  Made so far: 1 box

  [ + LOG NEW BATCH ]

  This week's logs:
    Mon 20 May    1 box     ⋯ (tap to edit/delete)
```

- **+ Log new batch** opens a small form: qty, date (defaults today), optional notes. Save → returns to product panel with updated total.
- **This week's logs** lists every `production_logs` row for this product in the current week window. Tap any → edit qty/date/notes or delete.
- Bottom sheet (not full screen), keeps the list visible behind it.

### Empty states

| State | Display |
|---|---|
| No products in catalogue | "Add products to start planning." with link to Products setup |
| Products exist but no seed estimates and no order history | Each row shows "Add a seed estimate →" instead of a suggested number |
| Aggregated products exist but no demand this week | Section D hidden entirely |
| No upcoming events | Section B hidden entirely. "+ Add event" affordance appears in Settings or via Events screen entry from elsewhere (TBD in §6) |

### Behaviour calls

- **Plan as operative target.** When mom has set a plan for the current week, that's the target. Suggestion is reference. Today screen and gap math use `planned_qty` (the mutable operative value).
- **Plan is mutable any time; retrospective uses the first-saved value.** Mom can edit `planned_qty` mid-week and beyond (so she can correct course as reality unfolds). The retrospective in §9 reads `original_planned_qty` — the value frozen on first save — to preserve the calibration learning loop. See §12 for the rule and reasoning.
- **No "carry over deficit" to next week.** Past misses don't compound — the algorithm uses historical average, not last-week's-shortfall.
- **Over-production is celebrated quietly.** Made 6 when target 4 → "6 made (target 4) ✓". No warning.
- **Past production stays editable.** Logs are full rows in `production_logs`, not running counters.
- **Suggestion shifts mid-week are explained.** When current-week orders or event uplift drive the suggestion above the rolling average, a small subtitle on that row appears. When the suggestion is at the rolling-average baseline, no subtitle.

### Open carries into §6 (Events) and §11 (algorithm)

- Event uplift distribution across `lead_weeks + 1` is even-split in v1. §11 details the formula.
- Tapping an event row in Section B opens the Events screen. §6 details that screen.

---

## §6 Events screen *(locked)*

**Purpose:** mom manages festivals and exhibitions that drive future production demand. The algorithm consumes this data (per §11); this screen lets her create, edit, and review events. Calibration loop applied to events: she sees post-event retrospectives and her estimation gets sharper over years.

**Access:** sub-route from the Production screen's "Upcoming events" section or its "+ Add event" affordance. Full-screen drilldown. Not a 6th tab — the 5-tab limit holds.

**Why a dedicated screen:** events are long-lived, multi-event-visible, and management-heavy enough to warrant their own surface. Burying them in Production would underweight a feature mom relies on for festival prep.

### Layout — Events list view

**Header**
- Title: "Events"
- Right side: `+ Add event` button (prominent)

**Filter chips**
- `Upcoming` (default) | `Past` | `All`

**List rows** (two-line)

```
Diwali 2026                                     in 14 weeks  →
  Festival • Fri 6 Nov – Sun 8 Nov • 3 weeks lead • 4 products set
```

- Line 1: name, time-to-event ("in 2 weeks" / "5 days ago"), tap-affordance arrow
- Line 2: kind badge, date range, lead_weeks, count of products with demand set
- Inactive events display with a small "inactive" badge but remain in the list

**Sort**
- Upcoming: ascending by `starts_on` (soonest first)
- Past: descending by `ends_on` (most recent first)

### Layout — Event detail/edit view

Used for both viewing and editing. Past events default to read-only with an "Edit" toggle.

**Header section**
- Event name (text input)
- Kind picker (`Festival` / `Exhibition` / `Other`)
- Date range pickers (`starts_on`, `ends_on`)
- Lead-time stepper (`lead_weeks`, range 0–12, **context-aware default**: festival → 3, exhibition → 1, other → 2)
- Active toggle (default on)

**Public URL section** — only visible when `kind = exhibition`

```
Public URL
  crunchies.app/order/diwali-fair-aundh-2026

  [ Copy link ]    [ Share via WhatsApp ]
```

- Slug auto-suggested from name on first save: lowercased, hyphenated, **year suffix appended** (`diwali-fair-aundh` → `diwali-fair-aundh-2026`).
- If still colliding, auto-suffix a numeric counter (`-2`, `-3`).
- Editable; must be unique and URL-safe (`a-z0-9-`).
- Hidden entirely for festivals.
- WhatsApp share pre-fills: *"Hi! Place your order for {event name} here: crunchies.app/order/{slug}"* — mom can edit before sending.

**Expected demand per product**

```
EXPECTED DEMAND
  Laddu              [ 200 ] boxes
  Chivda             [  50 ] kg
  Mathri             [  20 ] kg
  Chakli             [   0 ] kg
  Karanji            [  80 ] dozen
```

- One row per **active in-house product**.
- **Aggregated products excluded** from this list in v1 (no procurement workflow yet — v2).
- Empty/zero = no extra demand expected (no uplift contribution).
- Inputs use numeric keypad.

**Notes (optional)**
- Free-text field for context ("based on 2025 Diwali — bumped 10%")

**Footer**
- `Save` button (full-width, prominent)
- `Duplicate to next year` (visible on existing events; opens a new event pre-filled with same kind, lead_weeks, expected demand; dates blanked, name suffix-bumped)
- `Delete` (with confirmation: *"Delete {name}? This will remove the event, its expected demand entries, and its retrospective."*) — hard delete; `event_demand` cascades.

### Past event retrospective (compact summary on detail view)

When `ends_on < today`, a summary card appears at the top of the detail view, above the editable fields:

```
RETROSPECTIVE (Diwali 2025 — closed)

  Total: Expected 245 units → Actual 277 units (+13%)
  Top variance: Mathri (−40%, expected 20, actual 12)

  → View full breakdown in Reports
```

- Compact summary inline + link to Reports for full per-product table and trends.
- **Expected** = `event_demand.committed_expected_qty` (frozen at event start; see §2 and §12). Preserves the year-over-year calibration signal.
- **Actual** = sum of `order_items.qty` for in-house products with event_demand rows, where `orders.target_fulfilment_date` falls within `[event.starts_on - lead_weeks, event.ends_on]`.
- **Baseline NOT subtracted in v1.** Footnote: *"Actual includes all demand in the event window, not just festival-driven."* Honest about the limitation.

### Add event flow

- Tap `+ Add event` → opens detail/edit view in empty state
- Required: name, kind, dates
- Optional at create: lead_weeks (default per kind), expected demand per product, notes
- After save → navigates to the event's detail page (`/events/:id`) so the user can immediately copy the public URL or add expected demand. *(Implementation source of truth: `EventDetailPage.tsx`. Earlier spec said "returns to events list" — implementation landed on the detail page.)*

### Empty states

| State | Display |
|---|---|
| No events at all | "No events yet. Add your first festival or exhibition." Prominent `+ Add event` button. |
| All events in past | Past list visible; banner above: "Add upcoming events to start planning ahead." |
| Filter is `Upcoming` but none exist | "No upcoming events. Add the next one →" |

### Validation

- `ends_on >= starts_on`
- `lead_weeks` ∈ [0, 12]
- `slug` (when present) unique and URL-safe (`a-z0-9-`)
- `expected_qty` ≥ 0 per product

### Behaviour calls

- **Inactive + within window:** public form returns "not currently active"; list shows "inactive" badge.
- **Active + outside window:** public form returns "not yet open" or "this event has ended" depending on date.
- **Overlapping events:** allowed; each contributes uplift independently (§11).
- **Editing `event_demand` after event start:** allowed and expected — demand evolves. Subsequent algorithm runs use new numbers.
- **Editing dates after lead-up started:** allowed but produces inline warning *"This will shift the lead-up window. Production for {affected weeks} may re-distribute."* Not a blocker.
- **Editing `starts_on` to the past when snapshot hasn't fired:** the `committed_expected_qty` snapshot fires immediately on save (treat the event as already started for snapshot purposes).
- **Editing `starts_on` from past back to future after snapshot has fired:** `committed_expected_qty` is unfrozen (reset to NULL). It will re-freeze when `starts_on` is next reached. Rare path; not worth retaining the prior snapshot value.
- **Slug uniqueness across all events** (not just active): recycled names get auto-suffixed.

### Carries into other sections

- **§9 Reports** — full per-product event retrospective (the page the summary card links to). Includes plan/actual comparison and over-event trend across years.
- **§11 algorithm** — `event_uplift` formula consumes `event_demand` rows + event dates + `lead_weeks`.
- **Customer-facing exhibition form (§10)** — derives its existence and behaviour from `events.slug` + `active` + window check.

---

## §7 Orders screen *(locked)*

**Purpose:** the most-used mom-side screen. Every WhatsApp order flows through it. Two interaction modes (live single-entry + end-of-day batch), full order management, bill generation, complaint logging.

### Layout — Browse mode (default)

**Top bar**
- Search input — by customer name (search-as-you-type, ~200ms debounce)
- Right side: `+ Log new order` button

**Filter chips (horizontally scrollable, single-select)**
- `All` (default), `Pending fulfilment`, `Unpaid`, `This week`, `This month`

**Mode toggle (top-right, small)**
- `Browse` (default) | `Batch entry`

**List rows — grouped by day** *(variant B chosen per `DESIGN_HANDOFF.md` §3)*

Rows are organized under day-group headers. Day-group labels: `TODAY`, `YESTERDAY`, then date labels (`MON 13 MAY`, `SAT 11 MAY`, etc.) for older days. Day headers use the section-label treatment (small, all-caps, muted) from `DESIGN_HANDOFF.md` §4 typography.

Within each day group, rows are reverse-chronological by `ordered_at`. Each row is two lines:

```
TODAY
  Sunita Patil                                       08:42  •  ₹420
    2 boxes laddu, 1 kg chivda    [pending] [unpaid]      →
  Vikas Mehta                                        09:15  •  ₹180
    1 kg chivda                   [fulfilled] [paid]      →

YESTERDAY
  ...
```

- Line 1: customer name, time (today) or "—" (older days, since the day-header already conveys the date), total amount.
- Line 2: product summary, status badges, tap arrow.
- Default page size: ~3 day groups visible; infinite scroll for older days.

**Sort**
- Default: reverse chronological by `ordered_at`, naturally bucketed by day-group.
- Under `Pending fulfilment` filter: day-grouping disabled; sort by `target_fulfilment_date` ascending (most urgent first), NULL treated as today.
- Sort persists during session, resets on app restart.

### Layout — Batch entry mode

End-of-day catch-up. Optimized for low transition cost between entries.

**Header**
- "Batch entry — N saved so far" counter
- `Done` button (right side; dismisses batch mode)

**Always-visible form**
- Customer (search-as-you-type / `+ New customer` inline)
- Products + quantities (chips + qty inputs; `+ Add another item`)
- Payment status (defaults `unpaid`)
- Notes (optional)
- `Save & next` button (primary)

**Running list at the bottom**
- Collapsed rows of orders entered this batch
- Tap any → expanded edit/remove view (inline)

**Persistence semantics**
- Each `Save & next` commits to DB immediately (resilient to crashes)
- `Done` just dismisses the mode — doesn't re-commit anything
- Closing without saving the current draft loses only the in-progress form, not previous entries

### Layout — Order detail screen

**Top section**
- Customer name (tap → customer detail §8)
- Order date (full date + time if today, else just date)
- Source badge (`WhatsApp` / `Exhibition form` / `In person` / `Phone`)
- Status badges (`Pending`/`Fulfilled`, `Unpaid`/`Paid`/`Partial`)

**Dates section**
- `Due by Fri 24 May` (if `target_fulfilment_date` set)
- `Fulfilled on Wed 22 May` (if `fulfilled_at` set)
- `Paid on Thu 23 May` (if `paid_at` set)

**Items list**
- Each: product, qty, unit price, line total
- Subtotal at bottom

**Notes block** (if any) — read-only display

**Action buttons (full-width, stacked)**
- `Mark fulfilled` (if `fulfilled_at IS NULL`)
- `Mark paid` (if `payment_status ≠ paid`)
- `Generate bill`
- `Log complaint` (or `Edit complaint` if one exists)
- `Edit order` / `Delete order` (secondary)

**Complaints sub-section** (if any logged on this order)
- Each: kind, date, description, resolution status
- Tap to edit/resolve

### Layout — Log new order flow (live, single) — accordion (variant B)

*Per `DESIGN_HANDOFF.md` §3, the Add Order screen uses the **progressive accordion** variant.* One step is expanded at a time. Each step in the left rail shows a numbered circle (1, 2, 3, …) that becomes a checkmark once the step is filled. Tapping a completed step re-expands it for edit. The "Save" button is permanently visible at the bottom, disabled until validation passes.

Step list (top to bottom in the accordion):

1. **Customer** — search-as-you-type. `+ New customer` inline (mini-form modal: name, phone, channel chip; size_tier and notes deferrable). Step completes when a customer is selected.
2. **Source** — defaults `WhatsApp`; tap to change. Auto-completes since it has a default.
3. **Date** — defaults today; date picker for backdating. Auto-completes since it has a default.
4. **Target fulfilment date** — **required.** Date picker, defaults to today. One tap to change for future-dated orders. The week this falls in is the week demand counts against (§11, §12), so accuracy here drives the calibration loop's signal. Auto-completes since it has a default.
5. **Items** — at least one item with `qty > 0` required (product chips + qty + unit_price from `products.default_price`, editable; `+ Add another item`). Step completes when at least one valid item exists.
6. **Payment status** — defaults `Unpaid`. Auto-completes since it has a default.
7. **Notes** — optional, no completion gate.

**Save** button at the bottom of the screen — full-width, primary. Disabled until customer + items are valid. Save navigates to `/orders` (the orders list). *(Implementation source of truth: `AddOrderPage.tsx`. Earlier spec drafts said "returns to wherever launched from" — that behaviour was not implemented; landing on the orders list gives mom one consistent post-save location.)*

**Validation behaviour:** when the user taps `Save` with steps incomplete, the accordion auto-jumps to the first invalid step and shows an inline error. No modal interruption.

(Batch entry mode (§7 batch section) retains its flat always-visible form — accordion progression is for the live single-entry path only.)

### Bill generation flow

Tap `Generate bill`:
1. **Preview modal** shows the generated bill (jsPDF client-side render)
2. Mom taps `Share` → **OS share sheet** opens
3. She picks WhatsApp → bill PDF attached, with a pre-filled message: *"Hi {customer name}, please find your bill attached."* (mom can edit before sending)

**Bill content** — traditional invoice format *(variant B per `DESIGN_HANDOFF.md` §3)*, mobile-friendly portrait, narrow column. The visual register is a real Indian small-business invoice — not a thermal receipt, not a corporate PDF.

Frame and layout (top to bottom):
- **Double-border frame** around the entire invoice (outer + inner stroke) — the visual signature of the traditional variant.
- **Header band** (inside the frame, top): the brand orange (`brand.orange` from the design tokens) as a thin horizontal band, with the logo on the left, business name (large) centred or beside the logo, and business address + GST (if set in Settings, §13) in small caps below the name.
- **Bill identifier block** (centred or right-aligned under the header band):
  - Bill number `#1001`, `#1002`, ... (sequential integer; see `orders.bill_number` in §2)
  - Order date (full, day-first format)
  - Customer name + phone (left-aligned, paired with the bill identifier)
- **Items table** with an **orange header row** (`brand.orange` background, white text): columns `Product · Qty · Unit price · Line total`. One row per `order_item`. Right-align numeric columns; tabular-figures typography.
- **Totals block** below the items table: Subtotal, Total. Right-aligned, with the Total in heavier weight.
- **Payment stamp box** — a clearly-bordered box at the bottom containing `PAID` / `UNPAID` / `PARTIAL`. Stamped visual treatment (heavier border, distinct color: green-bordered for `PAID`, warm warning for `UNPAID`/`PARTIAL` matching `status.warn.border` / `status.danger.fg` tokens).
- **Signature line** at the very bottom: a thin rule with *"— Archana"* centred or right-aligned beneath it. Mom's signature presence on the document — confirmed for v1.
- **Footer note** (centred, small, below the signature): the footer text from Settings (default *"Thank you"*).

Contact info from Settings (phone / WhatsApp / email — whichever are set) renders in a small line under the business address in the header.

**Bill number lifecycle:** generated on first `Generate bill`, persisted to `orders.bill_number`, reused on regeneration. App-wide sequence starting at 1001. Backfilled historical orders (imported at launch per §14 Sprint 9) carry `bill_number = NULL`; if mom later generates a bill for one, it draws the next live sequence number at that moment — pre-launch orders do not burn numbers from the live sequence on import.

### Complaint logging

`Log complaint` → form:
- Kind dropdown (`Quality` / `Delivery` / `Wrong item` / `Other`)
- Description (free text, required)
- Save → returns to order detail with complaint visible inline

Editing an existing complaint: tap → prefilled form; adds `Resolution` field + `Resolved` toggle (sets/clears `resolved_at`).

### Editability & deletion

**No locks. Mom can edit or delete any order, any time.**
- Edits to historical orders shift the rolling-average demand intentionally — she's correcting reality, algorithm should reflect reality.
- Generated bills already sent are immutable in the customer's possession regardless.
- Delete confirmation: simple modal — *"Delete this order? This can't be undone."*

### Empty / first-run states

| State | Display |
|---|---|
| No orders ever | "No orders logged yet. Tap + to start." |
| Filter returns empty | "No orders match this filter." with a "Clear filter" link |
| Customer picker has no matches | "No customer found. + Add as new?" |
| Batch mode with no saves yet | Form visible normally; counter says "0 saved" |

### Behaviour calls

- **Currency format:** ₹ symbol, Indian numbering (`₹1,20,500.00`), 2 decimals. Locale fixed (en-IN).
- **Backdating orders:** allowed. Demand history adjusts accordingly.
- **Partial payment:** `payment_status = partial` is a state only; no `partial_amount` field in v1. Quantitative tracking deferred to v2.
- **Multiple orders per day from one customer:** separate rows, no auto-merge.
- **Source = `exhibition_form`** is read-only; only set by public form submission.
- **Search-as-you-type debounced ~200ms.**

## §8 Customers screen *(locked)*

**Purpose:** O2's main surface — every customer (especially exhibition walk-ins) is retrievable, with full history. O3 — organized, professional. Mom thinks "Sunita Patil from Aundh ordered laddu last month" and gets there in 2 taps. Also home for the soft re-engagement nudge.

### Layout — Directory (default)

**Top bar**
- Search input — searches name AND phone, search-as-you-type (~200ms debounce)
- Right side: `+ Add customer`

**Filter chips (horizontally scrollable, single-select)**

Rendered dynamically. Fixed chips: `All` (default) · `Large` · `Small` · `Unsorted` (size_tier IS NULL) · `Quiet`. Channel chips are interleaved per `channels` table (`active = true`): the three system channels first in seed order (`Reseller` · `Personal` · `Exhibition`), then any custom channels in creation order. As mom adds channels (§8.3.3), they appear here automatically.

**Sort selector (small, top-right under chips)**
- `Recent order` (default) · `A–Z` · `Most ordered`

**List rows (two-line)**

```
Sunita Patil                                   ordered 3 days ago
  Personal · Large · 12 orders · quiet 8w                       →
```

- Line 1: name, last-order relative date ("never ordered" for fresh adds)
- Line 2: channel badge · size_tier (or `—` if unset) · order count · `quiet Nw` marker when applicable
- Exhibition-sourced rows include `from <event name>` chip
- Archived (`active = false`) customers are hidden from the directory; admin (Karan) can view via raw queries

### Layout — Customer detail screen

**Header**
- Name (large)
- Phone — tap to copy, long-press WhatsApp link via `wa.me/<phone>`
- Channel badge · size_tier · "Customer since {month year}"
- If `source_event_id` set: small line *"Met at: Diwali Fair 2025"* (tap → event detail)

**Stats row (compact)**
```
12 orders   ·   ₹420 outstanding   ·   last 3 days ago
```

- Outstanding = sum of unpaid order totals (actionable; she'll nudge for payment)
- Lifetime spend deliberately omitted in v1 (vanity metric)

**Action buttons (full-width, stacked)**
- `+ Log new order` (pre-fills customer)
- `Send WhatsApp` (opens `wa.me/<phone>`; updates `last_contacted_at = now()`. No pre-fill message in v1.)

**Notes block** — inline edit: tap to expand → multi-line input → save

**Order history**
- All orders for this customer, reverse chronological
- Same row format as Orders screen but no customer name
- Status badges (pending/fulfilled, paid/unpaid)
- Tap → order detail

**Open complaints section** (only when unresolved complaints exist)
- Aggregated across all orders for this customer
- Each row: order date · kind · brief description · tap → order detail

**Footer secondary actions**
- `Edit profile` (form: name, phone, channel, size_tier, source_event, notes)
- `Archive customer` (confirmation: *"Archive {name}? They'll be hidden from pickers but their order history stays."*)
- `Delete customer` only available when zero orders (confirmation: *"Delete {name}? This can't be undone."*)

### Quiet customers (soft re-engagement nudge)

The mechanism. Surfaced on Today (Block 2.5) and Customers (`Quiet` filter chip + per-row marker).

**Definition.** A customer is "quiet" if `MAX(last_ordered_at, last_contacted_at, created_at) + threshold < today`.

| Channel | Quiet after |
|---|---|
| Reseller | 21 days |
| Personal | 60 days |
| Exhibition (zero orders) | 30 days after `created_at` |
| Exhibition (with orders) | 90 days |

Hardcoded for v1. Move to Settings (§13) if mom finds them off after ~2 months of use.

**How `last_contacted_at` advances:**
- Mom taps `Send WhatsApp` button on customer detail → `last_contacted_at = now()`
- Mom long-presses the phone number on customer detail (opens `wa.me/<phone>`) → `last_contacted_at = now()` (same intent as the button)
- Mom taps `×` on a quiet-customer row (Today block or Customers list) → `last_contacted_at = now()`
- An order from this customer arrives → `last_ordered_at` advances (denormalized column on `customers`, maintained on order insert/edit/delete; see §2)

Edits to notes or profile fields do NOT update `last_contacted_at` — those are record-keeping actions, not "contact." Phone calls aren't captured either; she'll see the customer again next cycle and either order or follow up.

The WhatsApp button tap, the long-press phone-link tap, and the dismiss tap are functionally equivalent — all three record "mom acknowledged this customer."

**Dismiss is reversible.** Doing nothing → customer goes quiet again after the threshold elapses from the dismiss.

**Today block volume cap:** 3 rows, most-overdue first.

**Tone.** "Quiet," not "Overdue" / "Lost" / "At risk." Neutral grey, no badges, no urgency styling. No notifications. No streaks.

### Add customer flow (standalone)

Fields:
1. Name (required)
2. Phone (required for personal/reseller; optional for exhibition)
3. **Channel** (required) — chip row rendered dynamically from `channels WHERE active = true`, with system rows first, then any custom channels in creation order, then a dashed **`+ Add channel…`** chip at the very end.
4. Size tier (optional)
5. Source event (optional dropdown; auto-set when the selected channel is `Exhibition` and an active event exists)
6. Notes (optional)

**Adding a custom channel inline** *(per `DESIGN_HANDOFF.md` §6.1)*: tapping the `+ Add channel…` chip expands an inline single-line input labelled "Channel name" with a `Save` button beside it. On save, the new channel is inserted into `channels` (validation: trimmed, ≤20 chars, case-insensitive unique against existing rows), the new chip appears in the row and is auto-selected, and the inline input collapses. The user stays in the Add Customer form — no navigation. New custom channels become immediately available everywhere `channels` is referenced: Customers directory filter chips, Reports channel breakdown, and any subsequent Add Customer session. Custom chips render identically to system chips (no "user-added" badge).

**Duplicate detection on save:** if phone matches an existing customer, modal: *"Sunita Patil already exists — use existing?"* with `Use existing` / `Save as new` buttons. v2 will add full merge UI.

Save navigates to the new customer's detail page (`/customers/:id`). *(Implementation source of truth: `AddCustomerPage.tsx`. Earlier spec said "returns to directory" — implementation landed on the detail page so the user can immediately edit notes or log the first order without an extra tap.)*

(Inline `+ New customer` mini-form from order flows — already in §7 — collects only name + phone + channel chip. Profile completion happens from the detail screen later.)

### Empty / first-run states

| State | Display |
|---|---|
| No customers ever | "No customers yet. Add your first → [+ Add customer]" |
| Filter returns empty | "No customers match this filter. Clear filter →" |
| `Quiet` filter, none quiet | "No quiet customers — you're in touch with everyone." |
| Customer detail, zero orders | Stats row reads "No orders yet · last contact {date}" |

### Behaviour calls

- **Channel is freely editable.** Exhibition contact who becomes a regular: change channel to `personal`. `source_event_id` stays as provenance.
- **Phone optional for exhibition only.** Public form (§10) honours the same rule.
- **No customer merge in v1.** Duplicate-detection on add is the only safety net.
- **Archive vs delete:** archive = `active=false`, filtered from pickers, history preserved. Delete only when zero orders.

### Carries

- §9 Reports — customer-level rollups (top customers, channel/tier mix, exhibition→repeat conversion).
- §10 Exhibition form auto-creates `channel=exhibition`, `source_event_id=<event>`, phone optional.

## §9 Reports screen *(locked)*

**Purpose:** retrospective + calibration + loop-closure. The only surface in v1 that looks backward. Forward-looking action lives on Today, Orders, Customers, Production — Reports answers *"how did the week/month go, and am I getting better at this?"* No actionable buttons here (those duplicate other surfaces). Reports earns its tab by giving mom three things no other screen can: (a) the post-hoc calibration signal that drives her demand-eyeballing skill (O1), (b) period summaries that don't exist as aggregates anywhere else (O3), and (c) loop-closure metrics on the retention work (exhibition→repeat, quiet-customer pipeline, complaints) that prove the app's investments paid off (O2).

### Tabs

Three top-level tabs in the bottom navbar's Reports surface:

```
[ Week ]  [ Month ]  [ Trends ]
```

**Why three (not the original two):** the cross-week calibration trend is the central teaching tool of the app. Subordinating it inside "Month" buries the proof that the app makes mom sharper. A dedicated Trends tab is also the surface Karan will use during reviews to walk her through progress.

### Default-period behaviour — asymmetric

- **Week tab defaults to LAST COMPLETED week** (Mon 13 – Sun 19 May when today is in the following week). The calibration card is only meaningful once the week is closed; mid-week numbers mislead. This pairs with §4 Block 0's Monday banner — tap-through lands on a fully settled view.
- **Month tab defaults to CURRENT month.** Monthly aggregates are coarser and tolerate mid-period reads; mid-month "how's May going?" is a legitimate O3 mastery glance. Forcing her to look at last month would feel like the app is yanking her gaze backward when she wants present-tense context.
- **Trends tab is rolling** (last 8 weeks for plan-accuracy, last 6 months for channel mix). No period selector — trends are inherently cross-period.

### Period selectors

- Week tab: at top, displays `Mon 13 – Sun 19 May (last week)` with prev/next arrows. Browsable to any week including the current in-progress one. When current week is selected, calibration card carries a small footnote *"Week in progress — figures will settle Sunday."* No hiding, just honest framing.
- Month tab: `May 2026` with prev/next arrows. Browsable to any month.

---

### Week tab — sections (top to bottom)

**1. Calibration card (hero)**

Per-product rows, sorted by absolute variance descending (biggest misses first — most teachable). Aggregated products excluded.

Each row uses the **pip-marker single-bar treatment** (variant B per `DESIGN_HANDOFF.md` §3):
- Product name + unit
- A single horizontal filled bar = **made** quantity, scaled so the bar's max represents the larger of plan vs demand.
- Two tick markers overlaid on the bar (or its track):
  - A **dashed vertical tick** at the position of `plan` (her commitment)
  - A **solid vertical tick** at the position of `demand` (what reality wanted)
- Numeric labels under the bar: `Plan 5 · Made 4 · Demand 6` — same three numbers as before, now expressed once.
- Variance pill on right shows **plan vs demand** — the calibration signal. Formula: `(demand − plan)` displayed as `+2 (+33%)` when she under-planned, `−1 (−20%)` when she over-planned. Both absolute qty and percentage shown (qty is meaningful for low-volume products, percentage for high-volume). Made-vs-demand (the operational fulfilment gap) is visible from the bar's fill relative to the solid demand tick — Reports' unique role is calibration, not operational status, so it does not get its own pill.
- Legend printed **once** below the section (not per-row): *"bar = made · `┊` plan · `│` demand"* (or the equivalent visual key Claude Design produced).
- Tap row → product-week drilldown (a bottom sheet listing this product's `production_logs` rows for the week + `order_items` rows for orders with `target_fulfilment_date` in the week)

**Plan** = `production_plans.original_planned_qty` (frozen first-saved value, per §12).
**Made** = `SUM(production_logs.qty)` for the week.
**Demand** = `SUM(order_items.qty)` for orders with `target_fulfilment_date` in the week (NULL `target_fulfilment_date` orders attributed to week of `ordered_at`, per §12).

Rows where `Plan = NULL AND Made = 0 AND Demand = 0` are hidden. Rows where mom set a plan retroactively (after week end) display with a small *"plan set retrospectively"* footnote and are excluded from the Trends tab's accuracy aggregate.

**2. Order summary**

A 4-tile compact grid:
- Total orders: `N`
- Total value: `₹X`
- Fulfilment rate: `Y / N (Z%)` (fulfilled count / total count)
- Outstanding: `₹W (P orders unpaid)`

No tap-through action; outstanding triage lives in Orders screen filter. Read-only here.

**3. New customers this week**

Single line: `4 new this week — 1 personal, 3 exhibition`. Per-channel breakdown. Tap → filtered Customers list scoped to "added in last 7 days."

**4. Top products this week**

Top 5 by qty sold. Two-column rows: product name (left), `qty · ₹value` (right). Tap product → product detail (catalogue).

**5. Top customers this week**

Top 5 by ₹ value of orders placed (using `ordered_at`, not `target_fulfilment_date` — "who bought this week" is the customer-relationship lens). Per row: name, channel badge, `N orders · ₹X`. Tap → customer detail (§8).

**6. Complaints this week** *(hidden when 0)*

List of complaints with `reported_at` in the week. Per row: customer name, kind, brief description, open/resolved badge. Tap → order detail (§7).

### Week tab — empty states

| State | Display |
|---|---|
| First-ever week with no data | Single message: *"Reports become useful after a week of orders. Check back Monday."* No section rendering. |
| Selected week has no plan, no made, no orders | *"No activity this week."* |
| Calibration card has no rows (all-zero everywhere) | Card hidden; rest of sections render |

---

### Month tab — sections (top to bottom)

**1. Calibration summary (hero)**

Headline number: `Plan vs demand variance: ±X% this month` (volume-weighted average of absolute per-week-per-product variance). Below it, a per-product monthly aggregate table:

- Product · Plan (sum) · Made (sum) · Demand (sum) · Variance
- Same plan/made/demand definitions as Week tab, summed across the month's weeks.
- Sort by absolute variance descending.
- Aggregated products excluded.

When the month is in progress, footnote: *"Month in progress — figures update daily."*

**2. Order summary with comparison**

4-tile grid (same as Week) plus a small comparison line beneath each tile:

```
Total orders     Total value     Fulfilment        Outstanding
   84               ₹52,400         77 / 84 (92%)     ₹4,800
   ↑ 12% vs Apr     ↑ 8% vs Apr     ↓ 3pp vs Apr      ↓ 22% vs Apr
```

Comparisons are factual ("Up 12%"), not celebratory ("Great month!"). When viewing the first month with no prior month available, comparison lines are hidden.

**3. Channel breakdown**

Horizontal stacked bar of orders by channel, with absolute counts and ₹ values labelled. Sub-line: total customers ordered from per channel this month. Segments come from `channels` (`active = true`) — both system rows (Reseller / Personal / Exhibition) and any custom channels with data this month. System rows render in seed order; custom rows in creation order.

**4. Customer base health**

Three numbers in a row:
- **New this month:** `N` (with per-channel breakdown beneath, small text)
- **Currently quiet:** `M` (count of customers meeting §8's quiet definition as of today; tap → Customers screen with `Quiet` filter applied)
- **Reactivated this month:** `R`

**"Reactivated" precise definition:** a customer who (a) met §8's quiet threshold at some point during the prior 30 days from today AND (b) placed an order with `ordered_at` in this month. Computed at query time from existing fields — no schema additions needed.

Notes:
- "Quiet at month start vs end" deliberately not shown — `last_contacted_at` updates in place when mom dismisses or sends WhatsApp, so the past quiet-state can't be honestly reconstructed without an event log. v2 may add this.
- "Currently quiet" is always today's count, regardless of which month is selected (current-state metric, not period-bounded).

**5. Exhibition→repeat conversion**

Single-line summary: `Of N exhibition customers acquired in last 90 days, X (Y%) placed a second order.`

Computed over a rolling 90-day window ending at the selected month's end. Hidden if the 90-day window yields fewer than 5 exhibition customers (sample too small to be meaningful — protects against noisy percentages on small denominators).

**6. Top products this month**

Top 10 by qty sold. Same row format as Week.

**7. Top customers this month**

Top 10 by ₹ value. Same row format as Week.

**8. Complaints summary**

Two-line summary: `P filed this month · Q resolved · R open` and `Average resolution time: D days` (across resolved complaints in the month).

Followed by a list of all complaints `reported_at` in the month (same row format as Week).

### Month tab — empty states

| State | Display |
|---|---|
| First-ever month with no data | *"Reports become useful after a week of orders."* |
| Month with zero orders | *"No activity in May 2026."* |
| Comparison fields with no prior month | Comparison lines hidden, no error styling |

---

### Trends tab — sections (top to bottom)

**1. Plan accuracy (hero) — redesigned per `DESIGN_HANDOFF.md` §3**

A large display number expresses **accuracy as a single percentage** (e.g., `84%`), accompanied by a one-line caption (e.g., *"Your plans matched demand 84% on average over the last 8 weeks."*). Below the headline:

- A **simple line chart** showing per-week accuracy % over the last 8 completed weeks. The Y-axis runs from 0% to 100%, **up = better** (higher accuracy). A rising line is the visual narrative the chart exists to deliver.
- **Accuracy definition** (per-week): `100 − absolute_variance_percent`, where the per-week variance is the volume-weighted average of `|demand − plan| / max(demand, plan)` across all products that had a plan that week.
- Weeks where mom never saved a plan are **skipped (gap in the line)**, not zeroed.
- Weeks where plans were set retroactively (`entered_at > week_end`) are also skipped — they don't represent her real-time eyeballing skill.
- Context line under chart: `5 of last 8 weeks planned.` So mom understands the sample.
- Tap on any point → week selector jumps to that week in the Week tab.

This is the calibration story compressed into one chart: are her plans converging on reality over time? The variant chosen by the design team (line, up = better) is more intuitive than the original signed-variance bar chart and avoids the "is +5% good or bad?" ambiguity.

**2. Per-product trends — sparklines with delta**

For each in-house product (top 5 by lifetime volume shown by default; `see all →` expands to all): a compact row with:
- Product name + unit (left)
- **Sparkline** showing per-week accuracy % over the last 8 weeks (small line, no axis, same up-is-better orientation as Section 1)
- **Delta indicator** showing accuracy change vs the prior 8-week window (e.g., `+9%` if accuracy improved, `−3%` if it slipped)
- **Biggest miss** sub-caption naming the worst week and product variance for that week (e.g., *"Biggest miss: Mathri week of 6 May (−40%)"*)
- Tap row → drills into a per-product detail view (full history, not just 8 weeks)

Same week-skipping rules as Section 1.

**3. Channel mix trend**

Stacked bar by month, last 6 months. Segments come from `channels` (`active = true`) — both system rows (Reseller / Personal / Exhibition) and any custom channels with data in the window. Above each bar: total ₹.

Answers: is the exhibition channel growing? Is the reseller proportion holding?

**4. Past event retrospectives**

A list of past events (any `kind`), descending by `ends_on`. Each row:
- Event name + date range
- Expected total: `E` (sum of `committed_expected_qty` across products)
- Actual total: `A`
- Variance: `±V (±W%)`
- Tap → §6 event detail screen (with its retrospective card)

**Link only — no detail rendered here.** §6 owns the per-event retrospective UI; Trends just provides the cross-event index for spotting patterns (Diwali consistently over, Rakhi consistently under, etc.).

### Trends tab — empty states

| State | Display |
|---|---|
| <2 weeks of plan data | *"Trends become useful after a few weeks of planning. Keep going."* |
| Plan accuracy chart has all gaps | *"No plans saved in the last 8 weeks yet."* with link to the §5 planning view |
| No past events | Past Event Retrospectives section hidden |

---

### Cross-cutting behaviour calls

- **All time windows use Monday–Sunday weeks** (per §3). Month boundaries are calendar months in local time.
- **Currency format:** ₹ symbol, en-IN locale, 2 decimals (consistent with §7).
- **No edit buttons on Reports anywhere.** Reports is read-only; edits happen on the source screen the row links to.
- **No CSV export in v1.** If Karan needs raw data he uses admin queries.
- **Refresh:** on tab focus, same as the rest of the app (§3). No realtime.
- **Variance display rule:** always show `±qty (±%)`. Qty is meaningful at low volumes; percentage at high volumes. Both costs no extra screen space at the row level.

### Carries

- §4 — Monday Block 0 banner deep-links to the Week tab with last completed week selected.
- §5 — Production screen's "see Reports for retrospective" affordances (if any) deep-link to the Week tab.
- §6 — Trends tab's past event list links to event detail; §6 retrospective card has a *"View full breakdown in Reports"* link back to the Trends tab's events list (or directly to the past-event row).
- §12 — Reports is the home of the calibration retrospective. `original_planned_qty` and `committed_expected_qty` are the immutable inputs that make these views honest.

---

## §10 Customer-facing exhibition form *(locked)*

**Purpose:** capture exhibition walk-ins as structured customers + orders (O2). The only non-mom-facing surface in v1. Designed for untrained users on their phone at a fair, under 60 seconds.

### URL & access

`crunchies.app/order/<slug>` — slug from `events.slug` (only exhibitions have slugs; festivals don't appear here).

**Access gate** (server-side via RLS):
- `events.active = true`
- `today` between `events.starts_on` and `events.ends_on` (inclusive)

Fail states return distinct landing pages — no form, just message:
- Slug not found → standard 404
- Event hasn't started → *"This event opens {date}."*
- Event has ended → *"This event has ended. Thank you!"*
- Inactive within window → *"Not currently accepting orders."*

### Page layout — 3-step wizard *(variant B per `DESIGN_HANDOFF.md` §3)*

The form is a 3-step progressive wizard: **Pick → Contact → Confirm**. A progress bar at the very top indicates the user's position (Step 1 of 3, Step 2 of 3, Step 3 of 3). The sticky header sits above the progress bar on every step. In steps 2 and 3, an **order summary** card is always visible (the running total of products + qtys the user picked in step 1), so they can sanity-check without backing out.

**Sticky header (top, every step)**
- Business name (large, from Settings §13)
- Event name + dates underneath (small)

**Step 1 — Pick**

- Greeting line at top: *"Place your order — we'll be in touch to confirm."*
- Product list (scrollable). All active in-house products (`active=true AND is_aggregated=false`) PLUS aggregated products with source-maker disclosure inline (*"Til Chikki — by Sunita Kaki"*).
- Each row: name, unit, price (₹), qty stepper (`−` 0 `+`).
- Prices shown publicly; mom can still adjust on her side before billing.
- Seasonal items shown if `active=true`. No photos in v1.
- Primary CTA at bottom: `Continue →` — disabled until at least one qty > 0.

**Step 2 — Contact**

- Order summary card pinned at top (collapsible; products + qtys + running total).
- Name (required, free text).
- Phone (required, numeric keypad) — strip `+91`, spaces, dashes; require resulting 10 digits starting with 6–9. Inline error if invalid: *"Please enter a 10-digit Indian mobile number."*
- Notes (optional, *"Anything we should know? (delivery preference, etc.)"*).
- Privacy disclosure (small, just above the CTA): *"We'll use your name and phone number only to confirm and deliver this order. We don't share your details."* Minimal compliance posture for DPDP-Act-era expectations without legalese. No separate Privacy Policy page in v1.
- Buttons: `← Back` (secondary) · `Continue →` (primary; disabled until name + valid phone).

**Step 3 — Confirm (review screen)**

- Order summary card (full, all line items + total) — still pinned/visible.
- "Picking up at:" mini-card with event name, dates, pickup window (if `events.pickup_window_*` set), and venue line (if `events.venue_line` set).
- Contact recap (name, phone — read-only; tap to edit jumps back to step 2).
- Buttons: `← Back` (secondary) · `Place order` (primary, full-width).

A hidden honeypot field (CSS-hidden text input) is rendered on the form — bots that fill it cause the submission to be silently rejected.

### Confirmation screen *(after `Place order` succeeds; variant from v2 wireframes)*

A full-screen confirmation page replaces the wizard. Layout top to bottom:

- **Large checkmark** + **"Order placed."** as the heading.
- **Personalized thank-you line**: *"Thank you, {first name}."* (first name = whatever the customer typed in step 2; if it contained multiple words, use the first whitespace-separated token).
- **Order number**: `#YYYY-NNNN` format (e.g., `#2026-0042`). The `YYYY` is the year of `orders.ordered_at`; `NNNN` is a per-year sequence (zero-padded to 4 digits, expandable as needed). Persisted to `orders.public_order_number` at creation. Stable, displayed prominently. The year resets the counter on Jan 1, which limits cross-year volume inference from sequence-number gaps.
- **Pickup card**:
  - Event name + date range
  - Pickup window — formatted from `events.pickup_window_start` / `events.pickup_window_end` (e.g., *"Sun 8 Nov · 11:00 am – 4:00 pm"*). Hidden if not set on the event.
  - Venue line — from `events.venue_line` (e.g., *"Stall 14, Aundh Fair Ground"*). Hidden if not set.
- **Order summary table** — products × qty + line totals + final total.
- **Payment posture line**: *"Total · pay at pickup"* — explicit copy, no online payment in v1.
- **Primary CTA**: `Save to WhatsApp` — a `wa.me/91<customer_phone>` deep-link with a pre-filled message containing the order number, items, and total. The link opens the *customer's own* WhatsApp so they have a copy of the order in their chat history. This is not a merchant notification.
- **Secondary link**: `Place another order →` — returns to a fresh wizard at Step 1 with name and phone auto-filled from this submission (the wizard pre-fills steps 2's fields; step 1 starts empty).
- **Footer**: small line *"Questions? WhatsApp Archana at {business_whatsapp}"* — `business_whatsapp` from Settings (§13).

### Server-side behaviour on submit

Atomic insert (single Supabase edge function or transaction):

1. **Customer dedup on phone.** If `customers.phone` matches an existing row → link new order to that customer. Do NOT update their `source_event_id` (provenance preserved — `source_event_id` is "where we first met them," not "most recent event"). If the matched customer has `active = false` (previously archived), set `active = true` on the match — a returning order is evidence that archiving was premature; the system heals the state automatically. Mom isn't notified of the reactivation; the customer just reappears in pickers.
2. If no match → create new customer: `channel_id = <id of the seed 'Exhibition' row from the channels table>`, `source_event_id=<event.id>`, `phone=<entered>`, `name=<entered>`.
3. **Create order:** `customer_id=<above>`, `source=exhibition_form`, `ordered_at=now()`, `target_fulfilment_date=NULL` (mom completes on review — see §7/§12; until dated, the order is attributed to the week of `ordered_at` for demand math and surfaces in Today's pending block), `payment_status=unpaid`, `notes=<entered or null>`, `public_order_number = #<YYYY>-<NNNN>` (computed atomically — see below).
4. **Create `order_items`** rows from qty steppers > 0, with `unit_price` snapshotted from `products.default_price`.

**Public order number allocation:** the `NNNN` sequence is per calendar year. The simplest implementation is a separate per-year counter (e.g., a `public_order_seq` row keyed by year, incremented within the transaction). Format: `#{YYYY}-{NNNN}` with `NNNN` zero-padded to 4 digits up to 9999; extend digit width only if a year exceeds 9999 orders (won't happen in v1).

### Notification to mom

**v1:** none. She sees new exhibition orders on next app open — Today screen pending block, Orders list, and a small `NEW` badge on the Orders tab (cleared on tab visit). PWA push notifications deferred to v2.

### Spam / abuse defence

- Per-event slug + active-window check is the primary filter (URL is only valid during the event window).
- Honeypot field (hidden CSS input, must be empty on submit; bots fill it).
- No CAPTCHA — friction for the customer is worse than v1 spam risk.

### Visual tone

- Clean, business-like, mom's brand surface to a stranger.
- Mobile-first, single column.
- High-contrast, large tap targets.
- System font, no flourish.

### Empty / edge states

| State | Display |
|---|---|
| Event has no products configured (all inactive) | "No items available right now." form disabled. |
| Network failure on submit | Inline retry: "Couldn't submit. Try again →" |
| Validation fail | Inline red text under offending field |

### Behaviour calls — locked

- **Aggregated products included** on the form with source-maker disclosure inline. Procurement remains manual in v1.
- **Prices shown** publicly; mom adjusts on her side if needed.
- **Notes field kept** — optional, captures customer voice.
- **No "Pickup now" toggle** — for on-the-spot sales, mom captures via form then immediately marks fulfilled+paid on her side.
- **Phone validation:** strict — 10 digits, starting 6–9, after stripping `+91`/spaces/dashes.
- **Returning customer:** linked to existing by phone; `source_event_id` stays at original event.
- **PWA push notification:** v2 (deferred).

### Carries

- §11 — orders from this surface contribute to `committed_demand` and the rolling average like any other order.
- §9 Reports — exhibition→repeat conversion rate (how many exhibition customers placed a second order in subsequent weeks).

---

## §11 Production rhythm: algorithm & seed flow *(locked)*

### Algorithm

For a given product P and week W:

```
rolling_avg(P)        = average weekly demand over the last 4 weeks of orders
event_uplift(P, W)    = sum over upcoming events touching W where W is within
                        [event.starts_on - lead_weeks, event.ends_on]:
                          event_demand(event, P).expected_qty / (lead_weeks + 1)
                        // even split across prep weeks + event week
committed_demand(P, W) = sum of order_items.qty for product P in orders where
                         target_fulfilment_date falls within week W
                         // for orders with NULL target_fulfilment_date (exhibition-form orders
                         // pending mom's review), attribute to week of ordered_at until dated
this_week_produced(P, W) = sum of production_logs.qty for product P in week W

base = rolling_avg(P) + event_uplift(P, W)
       // if P has <4 weeks of order history → use seed_demand.weekly_avg_qty instead of rolling_avg

suggested = MAX(0, MAX(base, committed_demand(P, W)) − this_week_produced(P, W))
```

### When the row subtitle appears

- `committed_demand > base` → "includes pending orders"
- `event_uplift > 0` and is contributing meaningfully to the number → "includes ramp-up for <event name>"
- Otherwise → no subtitle (rolling-average baseline).

### Seed → rolling-average transition

- Per-product: if the product has ≥4 weeks of order history → use rolling average.
- Otherwise → use `seed_demand.weekly_avg_qty`.
- Transition is silent (no banner, no notification — quiet competence).

**"≥4 weeks of order history" — precise definition:** four full calendar weeks have elapsed since the product's first order (any order in `order_items` referencing the product, ordered by `MIN(orders.ordered_at)`). Sparse-order weeks count as zero in the rolling average; they don't extend the seed period. This is honest about real demand — a slow-selling product gets a rolling average that legitimately includes its empty weeks.

### Seasonal products

Products flagged `is_seasonal = true` (§2) are excluded from the rolling-average calculation. Their suggestion comes from `seed_demand.weekly_avg_qty + event_uplift(P, W)` only.

Rationale: a seasonal product (e.g., Modak around Ganpati, Karanji around Diwali) has demand concentrated in specific weeks; a year-round rolling average understates demand during the season and overstates it off-season. Mom can manually adjust `seed_demand.weekly_avg_qty` to 0 during off-season and bump it during the season, with event uplift carrying the festival-driven spike on top.

This is the minimal v1 mechanism. A richer "active-season window" model with auto-toggling per-product seasons is deferred to v2.

### Multiple overlapping events

- Each event contributes its own uplift independently.
- Mom's plan can override the total at the weekly granularity if it gets out of hand.

### Seed flow

**When mom enters `seed_demand` — hybrid (encouraged at setup, optional later):**

- The **Add Product** form (used during first-run with Karan present, and for any new product added later) includes an inline `Weekly average (your guess): [ __ ]` field. Placeholder text: *"Roughly how much per week?"* Optional — she can skip products she's unsure about.
- Skipped products surface on the Production screen via the §5 empty-row affordance: `Add a seed estimate →`. Tapping opens a one-field modal (qty + save).
- Karan coaches her through hero products live during the setup ritual; long-tail products can be filled lazily.

**Transparency — silent transition, single global footnote:**

- No per-row badge, no inline label distinguishing "seed-based" from "rolling-average-based" suggestions.
- A single small footnote appears under Block 1 of the Today screen *only when every displayed product is still seed-based*: *"Based on your initial estimates. Will refine as real orders accumulate."*
- As soon as any product crosses the 4-week threshold, the footnote disappears. From that point on, transitions are silent.

**Editing `seed_demand` after entry:**

- Editable from the Products catalogue screen (the product's edit form).
- Once a product has ≥4 weeks of order history, the seed is read-only in that form (subtitle: *"No longer used — suggestions now use your actual order history."*). The data stays in the row for historical reference.
- The Production-screen `Add a seed estimate →` affordance handles the in-flow case for unseeded products.

**Behaviour calls:**
- Skipping seed entry is allowed; the product simply shows no algorithm suggestion until either a seed is added or 4 weeks of order history accumulate.
- Seasonal products (`is_seasonal=true`) can be seeded with 0 if mom doesn't expect them this week — algorithm still uses event uplift if any event drives them.
- Aggregated products are not seeded (excluded from suggestions per §2).

---

## §12 Production planning loop *(locked)*

**Purpose:** the calibration feedback loop. Mom plans → executes → sees retrospective → learns. Over weeks and months, her eye for demand gets sharper. This isn't a tracking system, it's a teaching system. Every design choice protects the feedback signal.

### The weekly loop

1. **Monday — plan.** Mom sets per-product targets via the §5 planning view. Her **first saved value** is the calibration commitment — preserved as `production_plans.original_planned_qty`, immutable after first save.
2. **Mon → Sun — execute.** She logs production. The operative `planned_qty` remains mutable (so she can correct course mid-week); `original_planned_qty` stays frozen.
3. **Sun → Mon rollover.** Week's data settles. Retrospective ready.
4. **Monday — see last week.** A single-line retrospective banner appears at the top of the Today screen (see §4 Block 0). Tap → Reports last-week view (§9). `×` dismisses for the week. Auto-clears at next Monday 00:00.
5. **Reports retrospective.** Per-product three-bar comparison (**plan / made / demand**), plus weekly summary metrics. Detail in §9.
6. **Trends.** §9 trends section shows variance % per week over the last 8 weeks — the calibration signal made visible.

### Plan immutability for retrospectives — the design rule

- `production_plans.planned_qty` — current operative target (mutable all week, what Today and Production screens read).
- `production_plans.original_planned_qty` — frozen at first save (immutable). **This is what retrospectives use.**

**Why first-saved, not last-saved:** the calibration loop teaches mom to eyeball demand. If her Saturday revision after seeing actual orders overwrites Monday's commitment, the retrospective shows artificial accuracy and the learning signal dies. The operative target must stay mutable (mom needs to respond to mid-week reality on the Today/Production screens), but the retrospective must stay anchored (so she sees her honest forecast vs reality, week after week).

**Edge cases:**
- **No row in `production_plans`** for product P, week W → retrospective shows *"no plan set"*; uses algorithm's suggestion as comparator only (no calibration row contributes to her accuracy trend for that product that week).
- **A row exists with `original_planned_qty = 0`** → mom explicitly planned to skip this product this week. Counts as a real commitment of zero, fully factored into her calibration accuracy. **Distinct from "no plan set."**
- **Retroactive plan detection.** A plan is "set retroactively" when `production_plans.entered_at > production_plans.week_start + 7 days` (i.e., the first save happened after the planned week ended). Such plans are recorded normally but flagged in the retrospective as *"plan set after week"* and excluded from the Trends tab's accuracy aggregate — they don't represent her real-time eyeballing skill.
- Mom doesn't see the dual-storage distinction in the planning UI — she sees and edits one number (`planned_qty`). Retrospective is the only place the frozen `original_planned_qty` surfaces.

### "Actual demand" definition

`demand(P, W)` = `SUM(order_items.qty)` for orders where `target_fulfilment_date` falls within week W.

**Implications (cascade through other sections):**
- `orders.target_fulfilment_date` becomes **mandatory for mom-entered orders** (UI-enforced; default today; see §7).
- Exhibition-form orders may submit with NULL `target_fulfilment_date` (customer doesn't pick); mom completes on review (§10).
- For algorithm purposes, orders with NULL `target_fulfilment_date` are attributed to the week of `ordered_at` until mom assigns the date — they show up as urgent on Today (existing pending logic) and shift to their correct week once dated.
- §11 `committed_demand` formula updates accordingly.

**Why `target_fulfilment_date`, not `ordered_at`:** demand belongs to the week mom must **deliver**, not the week she received the order. A Monday WhatsApp ping for delivery next Friday is next-week's production demand. Calibration only works if "demand for week W" means "what week W actually had to produce."

### Event variant of the loop

- Mom enters expected demand per product for an event (§6).
- Algorithm distributes that uplift across `lead_weeks + 1` (§11).
- Mom's weekly plan can override per-week if she learns the distribution should be different.
- Post-event retrospective: Reports event-detail view shows expected vs actual demand per product. The expected number stays the original `event_demand.expected_qty` she committed to — same immutability principle as weekly plans (preserves the calibration signal across years for the same recurring festival).

### Data model addition

**`production_plans`** gains a new column (full table in §2):

| Field | Type | Justification |
|---|---|---|
| `original_planned_qty` | numeric | O1 — frozen first-saved value for retrospective. Set on INSERT, never updated. Operative target lives in `planned_qty`. |

**`event_demand`** mirrors this rule — `expected_qty` is the operative (mutable) value used by the algorithm and the event detail UI. `committed_expected_qty` is set once when the event reaches `starts_on` and is the value the retrospective reads. Edits to `expected_qty` after event start affect the algorithm in flight but do not change the retrospective's anchor. (Full table in §2.)

### Carries / cross-section impact

- **§2** — `production_plans` gets `original_planned_qty`.
- **§4** — new Block 0 (Monday retrospective banner).
- **§7** — order entry forms make `target_fulfilment_date` mandatory.
- **§10** — exhibition form keeps NULL on submission; mom completes on review.
- **§11** — `committed_demand` formula uses `target_fulfilment_date`.
- **§9** — Reports retrospective views read `original_planned_qty`, render the plan/made/demand comparison and the 8-week variance trend.

---

## §13 Settings & onboarding — pending *(specifics from mom)*

**Status:** structure deferred until mom provides business-identity inputs in one batch. The list below captures what's needed; the section is not blocked for the Phase 1 build and can be filled in at any point before the launch session.

**Access:** small gear icon on the Today screen header (top-right). Single access location. Settings is not a tab and is not linked from elsewhere in v1.

### Open items — to collect from mom in one go

| Item | Used by | Notes |
|---|---|---|
| Business name (bill header) | §7 bill generation; §10 public form sticky header | Default placeholder: "Crunchies" |
| Bill footer note | §7 bill generation | Default placeholder: "Thank you" |
| Logo on bill | §7 bill PDF | Yes/no; image asset if yes — else deferred to v2 |
| Business address on bill | §7 bill PDF | Yes/no + text |
| GST number on bill | §7 bill PDF | Legal-display decision: if registered, likely required |
| Contact info on bill (phone / WhatsApp / email) | §7 bill PDF | Which of these to include |
| Business WhatsApp number | §10 public-form confirmation footer ("Questions? WhatsApp Archana at …") | 10-digit Indian mobile; used in the `wa.me/91…` deeplink and as the displayed number on the confirmation page. Can be the same as the "Contact info on bill" WhatsApp number if mom wants. |
| Domain name for exhibition form | §10 public URL | CLAUDE.md placeholder is `crunchies.app/order/<slug>`; confirm actual registered/intended domain |

### Onboarding flow (already locked in §3)

First-run onboarding is **empty screens, no guided wizard**. Karan sits with mom for first-time entry of:
- Product catalogue (with inline seed estimates per §11)
- Upcoming events for next 6–12 months (per §6)
- One or two starter customers (per §8)

Each screen's empty state already has its "add your first X" affordance specified in its respective section. No additional onboarding UI required in v1.

---

## §14 Phase 0 plan + build sequencing *(locked)*

**Role split:** Karan partners with Claude Code (`superpowers` plugin) to build the app. Karan directs and reviews; CC executes. Where this section says "build" or "implement," CC does it; where it says "decide," "review," or "interview mom," Karan does it. Pace is Karan's review cadence — calendar weeks below are the directional 10–14 week budget from CLAUDE.md, not commitments to specific dates.

---

### Phase 0 — Discovery, design, validation *(complete)*

**Status (as of 2026-05-21):** Phase 0 is closed. All six steps below are either done in-flow or consciously skipped. The spec is locked for build.

| Step | Status | Notes |
|---|---|---|
| P0.1 — Interview with mom | ✅ Done pre-spec | The interview happened *before* this spec was written; the spec is the codified output of her answers. No separate notes file. |
| P0.2 — Spec reconciliation against interview | ✅ Done in spec authorship | Mom's answers shaped every section directly. |
| P0.3 — Design brief for Claude Design | ✅ Done | `docs/PRODUCT_BRIEF.md` (sent to Claude Design alongside the brochure). |
| P0.4 — Clickable mockup | ✅ Done | Claude Design produced wireframe HTMLs at `docs/design/wireframes/` plus per-screen JSX. These are design references (do not ship). |
| P0.5 — Mom walkthrough | ⊘ Skipped | Karan's review of the wireframes was deemed sufficient. Mom now sees the app exactly once, at launch (finished form). |
| P0.6 — Lock for build | ✅ Done | This locking is concurrent with the reconciliation pass that absorbed the 7 design-handoff divergences (see `docs/ENGINEERING_NOTES.md` §4). |

The original P0.1–P0.6 sequence (with the four interview questions and the walkthrough script) is preserved below for reference and for future minor releases that may run a similar Phase-0 cycle.

---

#### Reference: original Phase 0 plan (target ~2 weeks)

The only phase where mom sees something rough. Goal: lock the spec, validate ergonomics on a real device.

**Step P0.1 — Experience interview with mom** *(Karan only, no CC)*

The four questions from CLAUDE.md, run as a 60–90 minute conversation. Recorded with permission. Karan writes a transcript or detailed notes.

Questions (verbatim, in mom's preferred language):
1. *"What's the most annoying part of your week with the business?"*
2. *"Has there ever been a situation where you wished you had remembered something but didn't?"*
3. *"When a new customer contacts you after an exhibition, what do you do — how do you keep track of them?"*
4. *"When you decide how much to make in a week, how do you figure that out?"*

Follow up where her answers surface new threads. Don't pitch the app or describe features — discovery only.

**Step P0.2 — Spec reconciliation** *(Karan + CC)*

Karan brings interview notes back to CC. Together: re-read this spec (§§1–13) section by section, flag any line her answers contradict or shift. Likely candidates: production rhythm (§11) seed values mom couldn't articulate, quiet-customer thresholds (§8) — adjust if she described different cadences, exhibition workflow (§10) — adjust if her capture flow differs from assumption. Update the spec in place; the spec is the source of truth, not the original assumption.

**Step P0.3 — Design spec for Claude Design** *(CC builds; Karan uploads)*

CC produces a detailed markdown design brief covering every v1 screen, interaction pattern, empty state, brand-tone guidance, and component requirements. Karan uploads that markdown + mom's existing brochure (used as style guide + logo source) to Claude Design. Claude Design outputs visual mockups / styled component specs.

**Step P0.4 — HTML clickable mockup** *(CC builds)*

CC builds a static HTML/CSS clickable mockup based on the Claude Design output. **Static only** — no Supabase, no real data, no auth. Scope (per the §3 walkthrough scope decision):

- Today screen (Block 0 + 1 + 2 + 2.5 + CTA)
- Production screen + planning view + product-detail bottom sheet
- Add order (live, single)
- Batch entry mode
- Customer detail (with quiet-customer dismiss interaction)
- Exhibition public form

Skipped from mockup (rationale: low ergonomic risk):
- Reports tabs, Events screen, Settings, onboarding empty states.

Mockup is hosted on a temporary URL (Vercel preview / GitHub Pages) so mom can open it on her own phone.

**Step P0.5 — Mom walkthrough** *(Karan + mom; one pass only)*

Karan sits with mom, mom holds her own phone, opens the mockup. Karan narrates target flows ("imagine you've just got a WhatsApp order from Sunita…") and observes:
- Tap target reach and accuracy
- Terminology comprehension
- Flow speed against the budgets in §3
- Surprised reactions ("wait, how do I…")

What to **capture:** ergonomics issues — buttons too small, words mom doesn't recognise, flows that feel slow.

What to **decline:** feature requests, "can it also do X" suggestions. Politely note them ("noted for later") but don't entertain. Phase 0 is ergonomics validation; feature creep here kills the timeline.

**Step P0.6 — Lock for build** *(Karan + CC)*

Incorporate ergonomic feedback into the spec. Anything that requires changing a data-model field gets flagged before Phase 1 begins. The spec is now build-ready.

---

### Phase 1 — Build (target ~10–14 weeks of paced sprints)

Each sprint = a focused unit of work CC and Karan complete together, paced by Karan's review cadence. Sprints are sequential, not calendar-locked. Walking-skeleton first sprint, then breadth-first feature completion.

**Sample data discipline (throughout Phase 1):** development uses **entirely synthetic data** — CC generates ~50–100 plausible orders, customers, and events drawn from mom's notebook patterns (Karan provides patterns, CC fabricates rows). Mom's real history does NOT enter the dev database. *(Original spec called for a one-time backfill of mom's notebook history at launch; Karan dropped backfill on 2026-05-25 — mom starts from a clean slate. Archived script preserved at `docs/archive/build-artifacts/backfill/` for reference.)*

**Mom's visibility during Phase 1: zero.** No interim demos. Karan gives her verbal progress updates ("orders screen is done, working on customers next") to keep anticipation up. She sees the app once, at launch, in a state she'll trust.

#### Sprint 0 — Foundation ✅ *complete 2026-05-21*

- [x] Vite + React + TypeScript project scaffolding (+ Tailwind 3 with brand tokens, shadcn/ui conventions, ESLint + Prettier + Vitest)
- [x] Supabase project setup; all §2 tables migrated (3 migrations); RLS enabled on every table with `authed_all` policy for mom + admin
- [x] Auth shell built — mom + admin users created via dashboard; login flow verified end-to-end against the live deploy via `scripts/smoke-test-login.py`
- [x] Vercel deploy pipeline, GitHub-connected, env vars set; `vercel.json` SPA-rewrite added so deep links work
- [x] PWA manifest + service worker shipped; manifest serves correctly on the live domain and the shell renders
- [ ] **Open Sprint 0 task — install + launch verified on mom's actual phone.** The spec placed this in Sprint 0 specifically to *fail early* if there are Android/Chrome quirks. The app is live and stable enough to install — Karan can do this asynchronously (just open `crunchies.app` on her phone, install to home screen, confirm launch). Discovering an install bug now is cheap; discovering it at the Sprint 9 launch session is expensive.
- [x] Custom domain `crunchies.app` resolving via Vercel; SPA routes (e.g. `/login`, `/order/<slug>`) verified 200 OK

#### Sprint 1 — Walking skeleton

- 5-tab bottom nav (Today / Orders / Customers / Production / Reports)
- Each tab renders a stub
- Minimal Add Order: customer dropdown (no search yet), one product, qty, save — writes to `orders` + `order_items`
- Minimal Production log: pick product, qty, save — writes to `production_logs`
- Today screen shows raw query results
- Goal: end-to-end data path proven; layout discoverable; foundations not theoretical

#### Sprint 2 — Production lens (part 1)

- §11 algorithm implemented (rolling avg + seed fallback)
- Production screen §5 sections C (in-house) and E (CTA)
- Product creation form with inline seed estimate field
- Today screen Block 1

#### Sprint 3 — Production lens (part 2)

- §5 planning view (per-product plan entry, save → `production_plans` with `original_planned_qty` set)
- Product-detail bottom sheet with log list
- Production-screen subtitles (committed orders / event uplift)

#### Sprint 4 — Order lens (part 1)

- Orders screen §7 browse mode + filters + customer search
- Order detail screen (full)
- Add Order flow with mandatory `target_fulfilment_date`
- Today Block 2 (pending today)

#### Sprint 5 — Order lens (part 2)

- Batch entry mode
- Bill generation (jsPDF): preview modal + OS share sheet integration
- **Bill share verified on mom's phone** with real WhatsApp install (second-highest technical-unknown)
- `bill_number` sequence starting 1001
- Complaint logging from order detail

#### Sprint 6 — Customer lens

- Customers screen §8 directory + filters + sort
- Customer detail (header, stats, action buttons, order history, notes)
- Quiet customers logic + Today Block 2.5 + Customers `Quiet` filter
- WhatsApp share button (`wa.me/<phone>`, updates `last_contacted_at`)
- Duplicate-on-phone detection
- Archive / delete

#### Sprint 7 — Events + exhibition form

- Events screen §6 (list, detail, duplicate-to-next-year)
- Production screen Section B (upcoming events)
- §11 algorithm: event_uplift integrated
- Anonymous-insert RLS policies for `customers` / `orders` / `order_items` (gated on slug + active + window)
- Exhibition public form §10 at `crunchies.app/order/<slug>` (honeypot, dedup-on-phone, atomic insert)
- Edge function or transaction for the public-form insert path; verify with synthetic submissions
- `committed_expected_qty` snapshot trigger / scheduled job at `event.starts_on`
- §6 retrospective card

#### Sprint 8 — Reports + calibration banner

- Reports screen §9 all three tabs (Week / Month / Trends)
- Calibration card (plan/made/demand bars + variance pill)
- Plan-accuracy trend chart on Trends tab
- Channel-mix and per-product trends
- Past-event retrospectives list (links to §6)
- Monday banner on Today (Block 0)
- All metric definitions per §9 (reactivated, exhibition→repeat conversion, etc.)

#### Sprint 9 — Settings, onboarding, polish (real-data backfill dropped post-launch)

- Settings (§13) — populate once mom provides the open items
- Bill PDF template wired to settings (logo, business name, address, GST, footer)
- First-run empty states refined per §3
- Backfill script: import mom's notebook history into customers + orders (one-time, idempotent, dry-run before commit)
- Accessibility pass (focus order, ARIA labels, contrast)
- Performance pass (initial load on mom's phone)

#### Sprint 10 — Internal QA + buffer

- CC + Karan run every flow in §3's 8-flow list with synthetic data (backfill of real data was originally scoped here; dropped 2026-05-25)
- Cross-browser smoke (Karan's phone, mom's phone, desktop preview)
- Buffer absorbs whatever Sprint 1–9 didn't fully close

**Launch session**

A scheduled in-person sit-down. Karan walks mom through:
1. Install the PWA on her home screen.
2. Open it. Show her the 5 tabs.
3. Add 2–3 real products live (catalogue setup ritual).
4. Enter seed estimates for those products.
5. Add 1–2 upcoming events.
6. Log the next WhatsApp order live, together.

She walks away with a working app and a starter dataset. Subsequent customer/order entry happens organically.

---

### Phase 2 — Ongoing (post-launch)

Per CLAUDE.md: small fixes/additions only, no major UX overhauls. Iteration tolerance constraint holds.

**Shipped (2026-05-27 / 05-28)** — decision records in `docs/superpowers/specs/`, behaviour smokes in `scripts/verify-*.py`:
- **Inline add-customer fix** — "+ New customer" during order entry portals out of the order `<form>` (a nested form caused a native reload that aborted the insert). `verify-inline-add-customer.py`.
- **Bill preview → canvas** — Android WebView can't render an `<iframe>` blob-PDF; the preview now rasterises page 1 to a `<canvas>` via lazy `pdfjs-dist`. Share path unchanged. `verify-bill-flow.py`.
- **Reversibility** — order detail has persistent secondary "Mark as not fulfilled" / "Mark as unpaid" buttons; the complaint sheet has "Delete complaint"; all native-`confirm()`-guarded. Forward actions stay one-tap. `verify-revert-flow.py`. (§7)
- **Discounts** — Reseller channel default 20%, optional per-customer override, per-order snapshot (order > customer > channel > 0, nearest-rupee). Order form prefills + freezes; bill + order-detail + reports + customer-outstanding show the discounted total. Migration `0008`; `verify-discounts-flow.py`. (§2, §7, §8, §9)
- **Exhibition order ↔ event link** — `orders.event_id` (migration `0009`) fixes repeat customers ordering at a different event seeing "Order not found." on confirmation; `public_get_order_by_ref`'s anti-leak now matches `order.event_id`, not `customer.source_event_id`. `verify-exhibition-repeat.py`. (§10)
- **Tooling** — events-flow smoke made deterministic + self-cleaning; `verify-launch-readiness.py` tolerates (but surfaces) pre-existing firefox/webkit teardown console noise. Smoke cadence is now blast-radius-scoped (CLAUDE.md "Which smokes to run").

**Shipped (2026-07-07)** — spec in `docs/superpowers/specs/2026-07-07-purchases-design.md`:
- **Purchases ("Buy") feature** — mom-requested money-out log, receipt model: vendors (inline-created), `purchase_categories` (seeded + chip-add), line items (qty?, unit?, amount, category), item price memory ("Last: ₹…" hint, unit/category autofill for fresh rows only), all-time Items price-history view, month-grouped Receipts view. Six-tab bottom nav (Production label → **Make**, new **Buy** tab); page h1s keep the nouns. Production's "From other makers" rows gained a "Log purchase →" prefill shortcut (§6 D — no longer read-only). Month report gained a **Spending** section (total + prior-month comparison + category split + "Left over: sales − purchases" line). Migration `0010`; `verify-purchases-flow.py`.

**Parking lot (deferred from v1):**
- ~~Procurement workflow for aggregated products~~ — the logging half shipped 2026-07-07 as the Purchases feature (+ from-other-makers shortcut); still deferred: BOM/shopping-list generation from the production plan, purchase↔product linkage
- Customer merge UI
- PWA push notifications (exhibition-form new-order alerts)
- Per-product event lead-time
- Year-over-year retrospective comparisons
- Sparkline trends per row
- Quiet-customer threshold to Settings (if mom finds hardcoded values off after ~2 months)
- Partial-payment quantitative tracking
- Richer seasonal-product model (auto-toggling per-product active-season window)
- Rate-limiting / abuse defence on the public exhibition form beyond honeypot
- Offline write queueing for the PWA (queued mutations sync on reconnect)

Phase 2 work proceeds case-by-case based on mom's actual usage feedback, not pre-planned.

---

### Risk register

| Risk | Mitigation |
|---|---|
| PWA install or launch quirks on mom's specific Android | Verified in Sprint 0 — fail-early, fix-or-fall-back-to-bookmark |
| jsPDF + OS share sheet flow on Android | Verified in Sprint 5 — same fail-early discipline |
| Supabase anonymous RLS for exhibition form | Sprint 7 dedicated; CC tests with synthetic curl/anonymous submissions before exposing |
| Mom's data import quality (notebook → DB) | Sprint 9 backfill script must be idempotent + dry-runnable; Karan reviews diff before commit |
| Scope creep mid-build | "Noted for v2" discipline. No mid-Phase-1 spec changes unless a blocker is found. |
| Karan review-cadence drift | Self-managed; CC reminds at sprint end |

---

### Cross-references

- §3 walkthrough — 8 core daily flows are the QA acceptance criteria in Sprint 10.
- §13 — Settings inputs from mom block Sprint 9 but not earlier work.
- §11 / §12 — the calibration loop's correctness is tested in Sprint 8 once Reports renders.
- §10 — exhibition form RLS is the trickiest Supabase piece; budget extra review in Sprint 7.
