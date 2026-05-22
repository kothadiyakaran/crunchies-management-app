# Engineering Notes — Crunchies v1

A working companion to `DESIGN_HANDOFF.md` (chosen variants, design tokens, open tasks) and `PRODUCT_BRIEF.md` (behavioural PRD). This document is engineering-facing: what was chosen, what's still open, what's deferred from design, and the order in which to build it.

It also flags divergences between the design handoff and `v1-spec.md` (the comprehensive engineering spec) so reconciliation happens before the first sprint, not during it.

---

## 1. Chosen variants — one-line summary

From `DESIGN_HANDOFF.md` §3. PNG paths are relative to `docs/`.

| Screen | Variant | Why this variant |
|---|---|---|
| Today (`design/screenshots/01-today-b.png`) | **B — calendar-anchored (week strip)** + v2 compressed layout | CTA + 5-tab bar must stay visible at 320×640 without scrolling |
| Production main (`02-production-b.png`) | **B — card + dial per product** + v2 layout | Progress dial reads in one glance; v2 adds the explicit `All events →` + `See all (N)` for nav (see §2 open task) |
| Plan this week (`03-plan-this-week.png`) | as drawn in v1 | Single column of suggestion-prefilled numeric inputs, no variant needed |
| Product bottom sheet (`04-product-sheet.png`) | as drawn in v1 | Standard bottom sheet pattern, keeps the production list visible behind |
| Orders browse (`05-orders-browse-b.png`) | **B — grouped by day** | Day-headers (today / yesterday / older) outperform a flat chronological list when mom is scanning for "did I log Tuesday's order" |
| Orders batch entry (`06-orders-batch.png`) | as drawn in v1 | Always-visible form + running list; matches the brief's batch-mode spec exactly |
| Add Order (`07-add-order-b.png`) | **B — accordion (progressive)** | One step expanded at a time + visual progress (numbered circles, checkmarks) beats a long single form for tap-and-go |
| Order detail (`08-order-detail.png`) | as drawn in v1 | Stacked action buttons (Fulfilled → Paid → Bill → Complaint), Edit/Delete secondary |
| Customers directory (`09-customers-directory.png`) | as drawn in v1 | Search + filter chips + sort dropdown is canonical |
| Customer detail (`10-customer-detail.png`) | as drawn in v1 | Header → stats → actions → notes → order history; outstanding ₹ in `status.danger.fg` |
| Add Customer (`11-add-customer.png`) | as drawn in v1 **+ custom-channel affordance** | Inline-creatable channel chip — see §2 open task |
| Events list (`12-events-list.png`) | as drawn in v1 | Filter chips + two-line rows |
| Event detail (`13-event-detail.png`) | as drawn in v1 | Public URL block conditional on `kind = exhibition` |
| Reports — Week calibration (`14-reports-week-b.png`) | **B — pip markers on a made-bar** | Single bar (made) with dashed tick (plan) + solid tick (demand) is denser and easier to scan than the original 3-bar variant |
| Reports — Trends (`15-reports-trends.png`) | **redesigned in v2** | Big accuracy %, rising line (up = better), per-product sparklines with delta + biggest miss. v1's signed-variance bar chart was unintuitive |
| Public exhibition form (`16-public-form-b-wizard.png`) | **B — 3-step wizard** | Pick → Contact → Confirm, with progress bar. Better for untrained users than the alternative long-form |
| Order confirmation (`17-order-confirmation.png`) | as drawn in v2 | New screen — see §2 open task |
| Bill PDF (`18-bill-traditional.png`) | **B — traditional invoice** | Double-border frame, orange header row, payment stamp, "— Archana" signature line. Looks like a real Indian small-business invoice |

---

## 2. Open development tasks

Each task names the data-model and routing impact.

### 2.1 · Custom channels (Add Customer)

**From:** `DESIGN_HANDOFF.md` §6.1.

**What changes:** the channel selector in Add Customer (and in Customers directory filter chips, and in Reports channel breakdown) must allow mom to add a new channel inline. `Personal / Reseller / Exhibition` become *seed rows* of an extensible set, not a fixed enum.

**Data-model impact (this overrides `v1-spec.md` §2):**

- `customers.channel` is currently typed as an enum (`reseller | personal | exhibition`). It becomes a **foreign key** to a new `channels` table:
  ```
  channels
    id            uuid PK
    name          text          -- max 20 chars, trimmed, case-insensitive unique
    is_system     bool          -- true for the three seed rows
    active        bool          -- false = soft-deleted (hidden from pickers, history preserved)
    created_at    timestamptz
  ```
- Seed three `is_system = true` rows on first migration: Personal, Reseller, Exhibition. System rows can be soft-deleted (hidden) but not hard-deleted.
- All other places that reference channel today must read from this table:
  - Customers directory filter chips (§8.3.1 of brief) — render dynamically from `channels WHERE active = true`.
  - Reports channel breakdown (§8.6.2 §3) — group orders by channel id, show channels with any data in the period.
  - Add Customer chip row (§8.3.3) — render `is_system` chips first, then any `active` custom channels, then the dashed `+ Add channel…` chip at the end.
  - Public exhibition form — does NOT use this picker; exhibition-form orders always attach to a fixed "Exhibition" channel (or the event's configured channel; v1 stays simple — always "Exhibition").
- Custom channel chips render identical to default ones (no "user-added" visual differentiation, per the handoff rule).

**Routing impact:** none. Inline creation in the Add Customer form, no navigation.

**Sprint placement:** Sprint 3 (Customer lens) — implement the table + the inline-add affordance + all consumer surfaces in one pass so we don't have partial states.

### 2.2 · Production → Events nav

**From:** `DESIGN_HANDOFF.md` §5 hard requirement #15.

**What changes:** the "Upcoming events" card on the Production screen currently relies on row-tap to open Event detail. The handoff says row-tap alone is insufficient discovery. The card must additionally have:
- A clickable **`All events →`** label/link in the card header
- A **`See all (N)`** button alongside the existing `+ Add event` affordance

**Data-model impact:** none.

**Routing impact:** existing `/events` (Events list) becomes the target of two additional entry points from the Production main screen. Plus the existing per-event detail route remains the row-tap target.

**Sprint placement:** Sprint 2 (Production lens part 1) — implement alongside the production card.

### 2.3 · Order confirmation route (public form)

**From:** `DESIGN_HANDOFF.md` §6.2.

**What changes:** after `Place order →` on the public exhibition form, route to a new confirmation page:

```
/order/<event-slug>/confirmed?ref=<order-id>
```

The screen content is designed in `design/wireframes/Crunchies Wireframes v2.html` → `confirm` artboard (PNG: `design/screenshots/17-order-confirmation.png`):
- Big checkmark + "Order placed."
- Personalized thank-you ("Thank you, {first name}")
- Order number `#YYYY-NNNN`
- Pickup card: event name + date + time window + stall/venue line
- Order summary table (products × qty + total)
- **"Total · pay at pickup"** explicit copy (no online payment in v1)
- Primary CTA: `Save to WhatsApp` (deep-links to the customer's own WhatsApp via `wa.me` with a pre-filled message — not a merchant notification)
- Secondary link: `Place another order →` (returns to a fresh form with name + phone auto-filled)
- Footer: WhatsApp Archana on the registered business number

**Data-model impact** — reconciled into `v1-spec.md` (2026-05-21 pass):
- `orders.public_order_number` (text, nullable) added — populated at order creation for `source = exhibition_form` orders, formatted `#YYYY-NNNN` with `NNNN` as a per-year sequence. Decoupled from internal `bill_number`. (Spec: §2 `orders` table.)
- `events.pickup_window_start`, `events.pickup_window_end` (timestamptz, nullable) and `events.venue_line` (text, nullable) added for the confirmation pickup card. (Spec: §2 `events` table.)
- Settings gets a `business_whatsapp` field for the confirmation footer's WhatsApp deep-link. (Spec: §13 open items.)

**Routing impact:**
- New public route `/order/<event-slug>/confirmed?ref=<order-id>` — anonymous, no auth.
- The route must validate that `ref` belongs to an order created from `event-slug` (anti-leak: someone can't enumerate other customers' orders by changing `ref`).

**Sprint placement:** Sprint 5 (Events + exhibition form) — implement alongside the 3-step wizard form.

---

## 3. Out of scope from design — sprint-blocking analysis

From `DESIGN_HANDOFF.md` §8. Mapped to the sprint that would be blocked.

| Out-of-scope item | Blocks which sprint? | Resolution |
|---|---|---|
| Onboarding / first-launch | Sprint 9 (onboarding) | Karan-walked-through-live at launch per `v1-spec.md` §3 + §14 — empty screens with "add your first X" affordances. No design polish needed pre-Sprint-9. **Not blocking.** |
| Products setup (add/edit/archive product) | **Sprint 2 (Production lens)** | **Soft blocker.** Production planning needs a product catalogue to plan against. Recommendation: build a minimal Products screen from brand tokens + `v1-spec.md` §2 (products fields) + the cross-cutting patterns from `PRODUCT_BRIEF.md` §7. Flag for design review at mid-fi, but don't block Sprint 2 on it. |
| Settings detail | Sprint 8 (settings + onboarding + polish) | `v1-spec.md` §13 specifies the fields; mom-provided values are pending. Build the form from §13 + brand tokens. **Not blocking.** |
| Empty / loading / error states gallery | Throughout | Each screen has inline empty states in the brief. Loading skeletons + error inline messages follow the patterns in `PRODUCT_BRIEF.md` §7.7, §7.15. **Not blocking** but consolidate a gallery in Sprint 8 polish. |
| Complaint logging bottom sheet | Sprint 4 (Order lens part 2) | Spec is short (`PRODUCT_BRIEF.md` §8.2.6). Build from the spec + bottom-sheet pattern (§7.9). **Not blocking.** |
| Bill share-flow (preview modal + share sheet) | Sprint 4 (Order lens part 2) | OS share sheet is platform-native; we render the preview modal from the bill PDF (variant B). **Not blocking.** |
| PWA install prompt | Sprint 0 (foundation) | Use the browser's default `beforeinstallprompt` event behaviour for v1; design polish (custom prompt UI) deferred to v2. **Not blocking.** |
| Accessibility pass | Pre-launch (Sprint 9) | Touch-target / contrast / aria-labels enforced inline throughout. Consolidated audit in the launch sprint. **Not blocking.** |

**Items to surface to the design team before Sprint 2:**
- Products setup screen (the only soft blocker).

---

## 4. Divergences between `DESIGN_HANDOFF.md` and `v1-spec.md` — needs reconciliation

**Reconciliation completed 2026-05-21.** All 7 divergences are now resolved into `v1-spec.md`. Table preserved below for traceability.

| Topic | `v1-spec.md` originally said | `DESIGN_HANDOFF.md` says | Resolution applied |
|---|---|---|---|
| `customers.channel` | enum (`reseller \| personal \| exhibition`) | extensible table with seed rows + inline-add (§6.1) | ✅ `v1-spec.md` §2 — `customers.channel_id` is FK to new `channels` table; three system seed rows; inline-add affordance in §8.3.3. |
| Orders browse layout | reverse-chronological flat list | grouped by day (variant B) | ✅ `v1-spec.md` §7 Orders browse — day-headers (`TODAY`, `YESTERDAY`, dated for older); flat sort retained under `Pending fulfilment` filter. |
| Add Order form | linear single-form fields 1-8 | accordion progressive with numbered steps (variant B) | ✅ `v1-spec.md` §7 Log new order flow — accordion with numbered circles, checkmarks on completed steps, auto-jump to first invalid step on save. |
| Reports — Week calibration card | three bars (plan / made / demand) per product + variance pill = plan vs demand | single bar (made) with dashed tick (plan) + solid tick (demand) + variance pill | ✅ `v1-spec.md` §9.1 Week tab — pip-marker single-bar treatment with shared legend; variance pill semantics unchanged. |
| Reports — Trends hero | per-week signed-variance bar chart | big accuracy %, rising line over 8 weeks (up = better), per-product sparklines + biggest miss | ✅ `v1-spec.md` §9.3 Trends — display accuracy %, up-is-better line chart, per-product sparkline rows with delta and biggest-miss caption. |
| Order confirmation screen | minimal: "Order received." + summary, no order number shown | full screen with order number `#YYYY-NNNN`, pickup card, save-to-WhatsApp CTA | ✅ `v1-spec.md` §10 — full confirmation screen with personalized thank-you, `#YYYY-NNNN`, pickup card, "Total · pay at pickup", `Save to WhatsApp` and `Place another order →`, footer WhatsApp line; `orders.public_order_number` + `events.pickup_window_*` + `events.venue_line` columns added. |
| Bill PDF visual | "looks like a legitimate Indian small-business invoice" (loose) | traditional double-border frame, orange header row, payment stamp box, "— Archana" signature line | ✅ `v1-spec.md` §7 Bill content — double-border frame, orange header band, orange items-table header row, stamped payment box, signature line *"— Archana"*. |

**Founder-confirmed behaviour calls** (resolved during reconciliation, all "yes"):
1. Signature line `"— Archana"` ships in v1.
2. Public order numbers `#YYYY-NNNN` shown on confirmation. Annual reset of the sequence limits cross-year volume inference.
3. `payment_status = unpaid` is the default for exhibition-form orders — aligned with `Total · pay at pickup` copy.
4. Business WhatsApp number captured as a new Settings field (`business_whatsapp`) — value pending the §13 batch from mom.

The six open questions from `DESIGN_HANDOFF.md` §10 are addressed in `v1-spec.md`:
- **Bill numbering** — sequential per business starting at `1001`, app-wide (not per-customer). `v1-spec.md` §7 Bill number lifecycle.
- **Outstanding balance** — computed live as `SUM(unpaid order totals)` per customer; for v1's data volumes (~100s of orders/customer) this is well within Postgres latency.
- **Public-form spam** — honeypot field + slug + active-window check. Rate-limiting deferred to v2 (`v1-spec.md` §14 parking lot).
- **Quiet thresholds** — hardcoded for v1 (`v1-spec.md` §8); promoted to Settings if mom finds them off after ~2 months.
- **Production "made" granularity** — per batch (qty + date + notes), editable/deletable per row (`v1-spec.md` §5 Production product-detail bottom sheet).
- **Exhibition customer dedup** — dedup on phone, link to existing customer, auto-reactivate if archived (`v1-spec.md` §10 server-side behaviour).

---

## 5. Recommended implementation order — annotated

From `DESIGN_HANDOFF.md` §9, with the bundle/spec files that inform each step.

### Step 1 · Data model + auth

**Reference inputs:**
- `v1-spec.md` §2 — comprehensive table definitions
- `DESIGN_HANDOFF.md` §6.1 — channels table replaces the enum (this divergence applies here)
- `v1-spec.md` §1 — Supabase + RLS context
- `public/manifest.json` and `public/icons/head-snippet.html` — PWA wiring during foundation

**Touches:** `customers` (modified — channel becomes FK), `products`, `orders` (new `public_order_number` column), `order_items`, `production_logs`, `production_plans`, `events` (new `pickup_window_*` and `venue_line`), `event_demand`, `seed_demand`, `complaints`, `channels` (new). All RLS policies sketched.

### Step 2 · Today + Orders browse + Add Order + Order detail

**Reference inputs:**
- `design/screenshots/01-today-b.png` + `design/wireframes/wireframes/today.jsx` + `v2.jsx` — Today screen
- `design/screenshots/05-orders-browse-b.png` + `orders.jsx` — Orders browse variant B (grouped by day)
- `design/screenshots/07-add-order-b.png` + `orders.jsx` — Add Order accordion variant B
- `design/screenshots/08-order-detail.png` + `orders.jsx` — Order detail
- `PRODUCT_BRIEF.md` §8.1, §8.2 — behavioural specs
- `v1-spec.md` §4, §7 — engineering details (target_fulfilment_date mandatory, source enum, batch persistence semantics, etc.)
- `DESIGN_HANDOFF.md` §4 — design tokens

### Step 3 · Customers directory + detail + add (with custom-channel)

**Reference inputs:**
- `design/screenshots/09-customers-directory.png` + `customers.jsx`
- `design/screenshots/10-customer-detail.png` + `customers.jsx`
- `design/screenshots/11-add-customer.png` + `customers.jsx`
- `DESIGN_HANDOFF.md` §6.1 — custom-channel affordance rules (this is where it lands)
- `PRODUCT_BRIEF.md` §8.3 — behavioural specs
- `v1-spec.md` §8 — engineering details (quiet-customer thresholds, `last_contacted_at` triggers, archive vs delete, etc.)

### Step 4 · Production main + Plan this week + product sheet

**Reference inputs:**
- `design/screenshots/02-production-b.png` + `design/wireframes/wireframes/production.jsx` + `v2.jsx` (for the upcoming-events nav additions)
- `design/screenshots/03-plan-this-week.png` + `production.jsx`
- `design/screenshots/04-product-sheet.png` + `production.jsx`
- `PRODUCT_BRIEF.md` §8.4 — behavioural specs
- `v1-spec.md` §5 (UI), §11 (algorithm), §12 (planning loop) — engineering details
- `DESIGN_HANDOFF.md` §6 hard-req #15 — Production→Events nav (this is where it lands)

### Step 5 · Events list + detail + public exhibition form + confirmation

**Reference inputs:**
- `design/screenshots/12-events-list.png` + `events.jsx`
- `design/screenshots/13-event-detail.png` + `events.jsx`
- `design/screenshots/16-public-form-b-wizard.png` + `public_form.jsx` + `v2.jsx` — 3-step wizard variant
- `design/screenshots/17-order-confirmation.png` + `v2.jsx` — confirmation screen
- `PRODUCT_BRIEF.md` §8.5, §9 — behavioural specs
- `v1-spec.md` §6, §10 — engineering details (RLS for anonymous insert, slug validation, dedup-on-phone, archive-reactivation, etc.)
- `DESIGN_HANDOFF.md` §6.2 — order confirmation route (this is where it lands)

### Step 6 · Reports (Week + Month + Trends)

**Reference inputs:**
- `design/screenshots/14-reports-week-b.png` + `reports.jsx` + `v2.jsx` — Week tab pip-marker variant
- `design/screenshots/15-reports-trends.png` + `v2.jsx` — Trends redesigned
- `PRODUCT_BRIEF.md` §8.6 — behavioural specs
- `v1-spec.md` §9 — engineering details (calibration definitions, reactivated metric, exhibition→repeat formula, etc.)
- The Month tab has no chosen wireframe variant — derive from `v1-spec.md` §9.2 + design tokens

### Step 7 · Bill PDF generation

**Reference inputs:**
- `design/screenshots/18-bill-traditional.png` + `bill.jsx` — traditional variant B
- `PRODUCT_BRIEF.md` §10
- `v1-spec.md` §7 (bill_number lifecycle, backfill rule) + §10 (PDF layout)
- `DESIGN_HANDOFF.md` §4 — token use in the PDF (orange header band, payment stamp)
- `src/assets/crunchies-logo.svg` — embedded in the PDF header

### Step 8 · Settings + onboarding + empty-states polish + accessibility

**Reference inputs:**
- `v1-spec.md` §13 — Settings fields (mom-provided values pending)
- `v1-spec.md` §3 — onboarding model (empty screens, no wizard; Karan-walked-through)
- `PRODUCT_BRIEF.md` §11, §12 — empty/loading/error/offline + accessibility
- `DESIGN_HANDOFF.md` §4 — token consistency across polish

---

## 6. Pre-sprint clarifications — all closed

All three review items are resolved:

1. ✅ **Seven divergences reconciled** into `v1-spec.md` on 2026-05-21. Table in §4 above is preserved for traceability with "Resolution applied" cells pointing to the updated spec sections. Founder-confirmed behaviour calls (signature, public order numbers, payment posture, business WhatsApp) noted in §4.
2. ✅ **Products setup screen** — confirmed Option A (build from `v1-spec.md` §2 + brand tokens during Sprint 2; flag for design review at mid-fi). No design-team pause required.
3. ✅ **Sprint sequence locked.** Step 7 (Bill PDF) is folded into Sprint 4 (Order lens part 2) since the order-detail screen and bill generation ship together. Otherwise the order in §5 above stands.

**Phase 1 status (2026-05-22):** Sprints 0–9 complete; Sprint 10 (internal QA + cross-browser smoke) is the active sprint. Detail (deliverables, test counts, decisions) lives in `CLAUDE.md` under "Phase 1 status" and in `docs/decisions/*-architecture-decisions.md`. The Sprint 9+10 pair lands together; next review checkpoint is after Sprint 10 close.

> **Note on stale sprint numbers in §3-§5 above:** earlier subsections of this document were written during the design handoff and use an older sprint-numbering snapshot. The authoritative current sequence lives in `v1-spec.md` §14: Sprint 5 is Order lens part 2 (bill / complaint / batch), Sprint 6 is Customer lens, Sprint 7 is Events + exhibition form. Treat any sprint-number-by-feature reference in this doc as historical; cross-check against `v1-spec.md` §14 before acting on it.

Outstanding values that arrive separately (mom-provided): the §13 Settings inputs (business name, address, GST, bill footer, contact info, business WhatsApp, logo asset). These slot into Sprint 9 (Settings + polish) and don't block earlier sprints. Domain is resolved — `crunchies.app`.

---

## 7. Do-not-ship reminder

Per the handoff §2 and user instruction:
- `docs/design/wireframes/*.html` and `docs/design/wireframes/wireframes/*.jsx` are **design references only**. They use Patrick Hand display fonts, dashed borders, 2px hard shadows, and the lo-fi B&W + orange palette — all wireframe register only.
- None of the JSX from the bundle ships to production. The app is built fresh in the chosen stack (React + Vite + TypeScript + PWA, per `v1-spec.md` §1) using the design tokens from `DESIGN_HANDOFF.md` §4.
- The wireframes are visual + behavioural references for the team building the real screens.
