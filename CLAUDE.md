# Crunchies Management App

This file gives future Claude sessions the context to pick up work on this project without re-deriving it from chat history. Read it first.

## Context

My mother runs a small artisanal snacks business in Pune. She is a former stay-at-home mother who took to entrepreneurship recently — her primary motivation is meaningful engagement, confidence-building, and staying active, not profit maximisation. She has a team of 8–10 part-time women with fixed schedules. She sells through three channels: 8–10 shopkeeper accounts who resell her products, a personal network of friends/relatives/acquaintances who place direct orders, and exhibitions/fairs where she sells and acquires new customers.

She currently runs operations on WhatsApp + a paper notebook. Production is intuition-based. She is Android-savvy, comfortable with apps, but has never used Excel or any productivity software. Team coordination is smooth and not a pain point.

**I (Karan) am the product/design partner; Claude Code (with the `superpowers` plugin) does the actual coding.** I direct, review, decide on design and product calls, and test. CC executes step-by-step. When I said I wanted to "learn development," I meant learning to direct development via CC — not learning to write JavaScript myself. The goal is delivering a tool mom genuinely uses; my role is to guide that delivery, not to type the code.

## The three problems v1 must solve

All three. Weighted equally. Phasing them apart causes mom's interest to lapse before the payoff arrives, so v1 ships with all three solved.

1. **Production planning (highest leverage)** — she chronically underproduces; she has no method for estimating quantities.
2. **Customer & order history** — no structured record, especially for exhibition contacts who get lost.
3. **Order tracking** — currently WhatsApp + notebook leads to missed orders.

## Success criteria (3 months after launch)

All three must be true:
- Production matches demand (lost-sales-from-stockouts measurably drops).
- Zero lost customers/orders (every WhatsApp order captured, every exhibition contact retained).
- Mom feels in control and engaged (qualitative — she opens it daily, talks about it, trusts it).

## Key design decisions

### Audience & access
- **Mom:** authenticated, primary user.
- **Builder (Karan):** authenticated with admin role for debug, data-fix, raw queries.
- **Exhibition customers:** anonymous, fill a public per-event order URL.

### Scope of the customer surface
- Per-event order form for exhibitions only (e.g., `crunchies.app/order/diwali-2026`). New customer fills name/phone/products/qty → creates a customer (with `channel=exhibition`, `source_event=<slug>`) + an order.
- NOT in v1: repeat-order links for regulars, public catalogue page, WhatsApp Business API automation. WhatsApp stays as the primary channel for everything else; no automation.

### Capture timing
- Mixed: mom logs easy/quick orders live as WhatsApp pings come in; lets messy ones queue for end-of-day. UI must support both — lightweight single-entry plus a multi-order entry mode.

### Production rhythm — the app proposes one, not reflects one
- Mom currently has no clear production rhythm. The app's suggestion is *opinionated* and *teaching* her a rhythm, not mirroring an existing one.
- **Day-1 seed:** mom enters gut-feel weekly averages per product during setup ("how much do you usually make of X per week?").
- **Replacement:** once 4 weeks of real order data exist, the suggestion becomes a rolling 4-week average minus production already logged this week.
- Behaviour-change responsibility — design with care; this is more than tracking.

### Felt engagement — target: mastery + clarity
- **Mastery:** polished, organized, professional surface. Clean dashboards, structured records, things in their right place. Aesthetic and rigor matter.
- **Clarity:** a daily decision-support core. Mom opens the app and immediately knows: make X of Y, call Z, pack these orders for tomorrow.
- **NOT:** pride/progress dashboards, gamified "level up", whimsical "customer memory book" feel.

### Aggregated products (other makers' goods)
- v1: flag-only. Products table carries `is_aggregated: bool` and optional `source_maker_name: string`.
- Aggregated products are excluded from production suggestions; otherwise they appear normally in orders and customer history.
- v2: proper procurement workflow.

### Mom's iteration tolerance — CRITICAL CONSTRAINT
- **She will not tolerate rough-iterate cycles on the live app.** If v1 is rough she will disengage and write the project off as not worth it.
- Builder-side iteration is unconstrained.
- Phase 0 design (mockups, walkthroughs) is the ONLY thing mom sees rough — paper prototypes she'll accept differently than a buggy app.

### Timeline
- No external time pressure. Mom is aware and excited but not waiting impatiently.
- Lean on Claude Code as coach throughout the build.
- Realistic estimate: Phase 0 ~1–2 weeks, Phase 1 build ~10–14 weeks.

## v1 feature scope (everything below ships together)

From the project summary:
- Customer directory (name, contact, channel, notes)
- Product catalogue (name, unit, price)
- Order logging (who, what, when, qty, payment status)
- Production log (date, product, qty)
- Demand-based production suggestion view
- Customer order history view
- Pending orders view ("today's pending", "this week's outstanding")
- Exhibition order capture (per-event public form)
- Seed-demand setup flow (gut-feel weekly averages)

From the older discussion notes — explicitly confirmed in scope:
- Customer categorization (channel + size tier — small retailer / large retailer / personal / exhibition)
- Bill generation (client-side `jsPDF`, shared via OS share sheet to WhatsApp)
- Weekly/monthly reporting view
- Complaint / return tracking

Out of v1 (deferred to v2 or later):
- Repeat-order links for regulars
- Public catalogue page
- Aggregated-product procurement workflow
- Seasonal/festival product tagging beyond a simple `is_seasonal` flag
- WhatsApp Business API integration of any kind
- Native mobile app
- Server-side rendering / Next.js features

## Selected approach: design-first custom PWA

### Phase 0 — ~1–2 weeks, no code
1. Run mom's experience-based interview (questions from the project summary):
   - "What's the most annoying part of your week with the business?"
   - "Has there ever been a situation where you wished you had remembered something but didn't?"
   - "When a new customer contacts you after an exhibition, what do you do — how do you keep track of them?"
   - "When you decide how much to make in a week, how do you figure that out?"
2. Lock the data model based on her answers.
3. Build a clickable mockup (Figma or static HTML).
4. Walk her through the mockup ONCE for ergonomics feedback. This is the only "rough" thing she sees.

### Phase 1 — ~10–14 weeks, the build
- React + Vite + TypeScript PWA, installable on mom's Android.
- Supabase backend: Postgres + auth + Row-Level Security (RLS).
- Client-side `jsPDF` for bill generation; sharing via OS share sheet.
- Deploy: Vercel or Cloudflare Pages, GitHub-connected.
- Short custom domain for the exhibition form (e.g., `crunchies.app/order/<event-slug>`).

### Phase 2 — ongoing after launch
- Small fixes and additions; no major UX overhauls expected (per iteration-tolerance constraint).

## The integration thesis (agreed contingent on outcomes)

All three problems are queries against one `orders` table. The system is **one data spine** with **three lenses**:

- **Data spine:** `customers`, `channels`, `products`, `orders`, `order_items`, `production_logs`, `production_plans`, `complaints`, `events`, `event_demand`, `seed_demand`.
- **Three lenses on top:**
  - Production dashboard (problem 1) — rolling average demand minus production-this-week → suggested make
  - Customer detail (problem 2) — orders filtered by customer, plus profile fields
  - Order book (problem 3) — orders filtered by status (pending fulfilment, unpaid)

**User position:** the thesis is acceptable so long as the table structures genuinely serve the intended outcomes. The concrete data model must be justified outcome-by-outcome, not by abstract appeal to the thesis.

## Process constraints to honour going forward

- Heavy upfront design is non-negotiable — mom won't iterate with us.
- Phase 0 interview happens BEFORE final architecture lock. Her answers may shift the data model.
- Mom's UI constraints: mobile-first, English, 30-second interactions, big touch targets, dropdown-heavy, minimal typing.
- Builder grants Claude discretion on stack details unless they materially affect outcomes.

## Source documents

- `Discussion notes on app requirements for mom.md` — earlier discussion notes from a meeting with mom (2026-05-05). Some items here did NOT make the project summary; those that are still in scope are listed above under "From the older discussion notes — explicitly confirmed in scope."
- `snacks_app_project_summary.md` — the consolidated project summary that supersedes most of the discussion notes.

## Design progress

The detailed design lives in `docs/v1-spec.md` — read that for full data model schemas, screen designs, daily flows, and behaviour decisions. Keep CLAUDE.md as the high-level starter.

Companion docs (from the Claude Design handoff, restructured into the repo):
- `docs/PRODUCT_BRIEF.md` — the brief sent to Claude Design (behavioural PRD).
- `docs/DESIGN_HANDOFF.md` — Claude Design's handoff: chosen variants, design tokens, hard requirements.
- `docs/ENGINEERING_NOTES.md` — chosen-variant summary, three open dev tasks, sprint sequence with bundle/spec cross-references.
- `docs/design/wireframes/` — HTML + JSX wireframes (design references; **do not ship to production**).
- `docs/design/screenshots/` — 18 PNGs, one per chosen variant.

**Phase 0 status:** complete. P0.1 + P0.2 happened pre-spec (the spec IS the codified output of mom's interview); P0.3 + P0.4 done (brief sent, Claude Design returned wireframes); P0.5 skipped (Karan's review sufficient — mom sees the app only at launch); P0.6 closed concurrent with the design-handoff reconciliation pass. Spec is locked for build.

**Phase 1 status:** Sprints 0–5 complete and deployed to `https://www.crunchies.app` (2026-05-22).
- **Sprint 0** — Vite + React + TS + PWA scaffold, Supabase schema + RLS on every table, mom + admin auth users, Vercel auto-deploy on push to `main`, PWA installed and verified on Karan's Android.
- **Sprint 1** (walking skeleton) — 5-tab bottom nav + AppShell, minimal Add Order and Log Production forms wired end-to-end, Today renders raw queries. Dev fixtures seeded via `scripts/dev-seed.sql` (5 `[DEV]` products + 4 `[DEV]` customers across all channels).
- **Sprint 2** (Production lens part 1) — Products CRUD at `/products`, §11 production-suggestion algorithm (rolling avg + seed fallback + committed demand, pure TypeScript function in `src/features/production/algorithm.ts` with 11 unit tests, `needs_seed` flag for unseeded+<4w-history), Production Section C with `Plan: — / Suggested: N / Made: N` rows + "Manage products →" header link, LogProduction prefilled via `?product_id=`, Today Block 1 with seed footnote when all visible rows are seed-based.
- **Sprint 3** (Production lens part 2) — full calibration loop. Planning view at `/production/plan-this-week` with `original_planned_qty` frozen on first save (§12 immutability rule), plan composition layer (`composeWithPlan` in `src/features/production/planLayer.ts`) yielding plan-aware `target`/`gap`/`done`/`subtitle` per row, "includes pending orders" subtitle when committed > base (event-uplift subtitle deferred to Sprint 7), product-detail bottom sheet with this-week log list and tap-to-edit at `/production/log/:id` (full edit/delete), "Done this week (N)" collapse on Production, Section D read-only "From other makers" table, "Add a seed estimate →" affordance via SeedEstimateModal, seed read-only on EditProductPage once weeks_of_history ≥ 4. Today Block 1 now plan-aware.
- **Sprint 4** (Order lens part 1) — Orders browse mode at `/orders` with customer search (200ms debounce via `useDebouncedValue`), filter chips (`?filter=` URL state), and day-grouped list (`TODAY` / `YESTERDAY` / `WED 13 MAY`); Order detail at `/orders/:id` with mark fulfilled / mark paid / delete (bill / complaint / edit are disabled placeholders for Sprint 5); Add Order at `/orders/new` is now the §7 7-step progressive accordion with multi-item entry, source picker, backdating, **mandatory `target_fulfilment_date`** (the §12 calibration anchor); reusable `CustomerSearchPicker` + `AddCustomerInlineModal`; Today Block 2 spec-compliant (up to 5 + "see all →"). `createOrderWithItems` uses sequential inserts with cleanup-on-failure for multi-item atomicity at v1 scale. `markFulfilled` / `markPaid` write to Postgres `date` columns using `todayInTz()`.
- **Sprint 5** (Order lens part 2) — Bill PDF generation via jsPDF + OS share sheet, traditional variant B per `DESIGN_HANDOFF.md` §3 (double-border frame, orange header band, items table, payment stamp, signature line). `buildBillPdf` is a pure generator in `src/features/orders/billPdf.ts` with 10 invariant tests; `BillPreviewModal` wraps it with iframe preview + Web Share API Level 2 (`navigator.canShare({ files })`) + download fallback. Bill numbers allocated via atomic `allocate_bill_number(uuid)` Postgres RPC (migration `0004_bill_number_rpc.sql`) backed by the existing `bill_number_seq` (starts at 1001). Noto Sans TTF (`public/fonts/NotoSans-Regular.ttf`) lazy-loaded on first bill render so ₹ renders per spec; falls back to `Rs.` prefix when font unavailable. Business identity in `src/lib/business.ts` (`BUSINESS_INFO` constants) — Sprint 9 will swap this for a Settings table read. ComplaintSheet bottom-sheet at `OrderDetail` for log/edit (kind dropdown + description, resolution + resolved toggle on edit), `reported_at` / `resolved_at` written via `todayInTz()` per the date-column rule. Edit Order at `/orders/:id/edit` reuses `AddOrderPage` with an `editingOrderId` prop — no field-level locking per spec §7 ("no locks"); `updateOrder` patch type extended with customer_id/source/ordered_at. Batch entry mode at `/orders/batch` with flat always-visible form, Save & next committing per entry, running list of saved orders, Done dismisses to `/orders`; Browse/Batch pill toggle on `OrdersPage`.

Smoke at `scripts/smoke-test-walking-skeleton.py` (re-runnable; reads `SMOKE_EMAIL` / `SMOKE_PASSWORD` from process env or `.env.local`, supports both Vite `KEY=value` and PowerShell `$env:KEY = "value"` forms). Test count: 69 across 15 vitest files.

Sprint 6 (Customer lens — channels table with inline custom-channel add, Customers directory + detail + add, quiet-customer nudge, Today block 2.5) is the next coding move per the §14 sequence. Architectural decisions for Sprint 5 captured in `docs/decisions/2026-05-22-sprint-5-architecture-decisions.md`; Sprint 3-4 decisions in `docs/decisions/2026-05-21-sprint-3-4-architecture-decisions.md`; Sprint 2 in `docs/decisions/2026-05-21-sprint-2-architecture-decisions.md`.

Status:
- [x] §1 Architecture & integration thesis
- [x] §2 Data model (updated with `production_plans`, `event_demand`; `events` generalized for festivals + exhibitions)
- [x] §3 Mom's app: navigation, daily flows, common UI patterns
- [x] §4 Today screen
- [x] §5 Production screen — locked, includes upcoming events section + plan column + planning view
- [x] §6 Events screen — locked, includes retrospective summary card + duplicate-to-next-year
- [x] §7 Orders screen — locked; includes batch mode, bill generation (sequential `bill_number` starting #1001), complaints
- [x] §8 Customers screen — locked; includes "quiet customers" soft re-engagement nudge (per-channel thresholds, dismissable via `×`); archive-instead-of-delete with `customers.active`; duplicate-on-phone detection
- [x] §9 Reports screen — locked, 3 tabs (Week/Month/Trends) with asymmetric defaults (Week→last completed, Month→current); calibration card hero in Week+Month, plan-accuracy bar chart hero in Trends; reactivated metric defined as quiet-in-prior-30d + ordered-this-month
- [x] §10 Customer-facing exhibition form — locked; per-event public URL, anonymous insert via RLS, dedup-on-phone server-side, honeypot anti-spam, no push notification in v1
- [x] §11 Production rhythm: algorithm & seed flow — locked, includes hybrid seed entry (encouraged at setup, lazy fallback) and silent seed→rolling-average transition with single global footnote
- [x] §12 Production planning loop — locked, includes first-saved-plan immutability (`original_planned_qty`), Monday retrospective banner on Today, and target_fulfilment_date driving demand attribution (now mandatory in mom's UI)
- [ ] §13 Settings & onboarding — specifics from builder pending
- [x] §14 Phase 0 plan + build sequencing — locked, Phase 0 = interview + spec reconciliation + Claude Design brief + HTML mockup (CC-built) + one mom walkthrough; Phase 1 = 10 sprints walking-skeleton-then-breadth-first, mom sees zero in-progress builds, synthetic dev data, real backfill at launch

Two big concepts added during §5 design: (a) mom's own weekly **production plan** as a first-class number alongside the algorithm's suggestion (calibration loop — her intuition learns over time); (b) **events** (festivals + exhibitions) as first-class objects that drive multi-week production ramp-ups via the algorithm.

Plan file with full session capture: `C:\Users\Karan\.claude\plans\cheeky-snacking-petal.md`.
