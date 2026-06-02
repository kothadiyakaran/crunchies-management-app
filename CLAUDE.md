# Crunchies Management App

Maintenance-phase context for Claude sessions opening this repo. Read first. For build-time context (sprint history, deliverable narratives), see `docs/BUILD_HISTORY.md`. For full feature specs, see `docs/v1-spec.md`.

## What this is

A PWA for Karan's mother (Archana) to manage her small artisanal snacks business in Pune. She runs operations across three channels — 8-10 shopkeeper resellers, a personal network of friends/relatives, and exhibition/fair stalls — previously on WhatsApp + a paper notebook. The app replaces the notebook and gives her structure for production planning, customer + order history, and pending-order tracking.

**Roles:** Karan is the product/design partner and the only authenticated builder; Claude Code does the actual coding. Mom (Archana) is the primary authenticated user. Exhibition customers fill an anonymous per-event public form. There are no other users.

**Status (2026-06-02): feature-complete, live, and in maintenance-only mode.** Phase 1 build (11 sprints, 0-10) + Phase 2 maintenance + a full UI polish pass are all shipped to `https://www.crunchies.app` (Vercel auto-deploy from `main`; PWA on mom's Android). **Do not make further changes unless mom requests one or a bug requires a fix** — no unsolicited features or redesigns.
- **Phase 2 maintenance:** inline add-customer fix, bill-preview canvas fix (Android WebView), reversibility (revert fulfilled/paid + delete complaint), discounts (reseller/customer/order), exhibition order↔event link.
- **UI polish pass (2026-06-02):** an additive design-token layer + shared input/button primitives + ~40 per-screen visual refinements (focus rings, disabled states, status-chip tints, the Today / Production / Reports / Order-detail / Customers re-layouts, a warmer bill PDF). **Visual only — zero behaviour/data/route change.**
- **Records:** `docs/superpowers/specs/` (Phase 2 decision records), `docs/superpowers/plans/2026-06-01-ui-critique-polish-pass.md` (polish-pass plan + finding map), `docs/superpowers/SESSION_STATE.md` (session log).

## Stack

- **Frontend:** Vite + React 18 + TypeScript (strict, `noUncheckedIndexedAccess`), Tailwind 3 with brand tokens in `tailwind.config.ts`, react-router-dom, jsPDF (lazy-loaded on bill-tap)
- **Backend:** Supabase Postgres + Auth + RLS. SECURITY DEFINER RPCs for the anon-callable public-form surface (anon has zero direct table access). Migrations live in `supabase/migrations/`.
- **PWA:** Vite plugin generates service worker; manifest in `public/`.
- **Deploy:** Vercel from `main`. Custom domain `crunchies.app`.
- **Test:** Vitest + RTL for units; Playwright behaviour smokes in `scripts/verify-*.py`.

## Repo map

| Path | What's here |
|---|---|
| `src/App.tsx` | Routes (all lazy except Login); Protected wrapper; SettingsProvider |
| `src/components/` | AppShell, BottomNav, shared UI primitives |
| `src/features/<lens>/` | Per-feature code (today, orders, customers, production, events, reports, settings, public). Each has `*Page.tsx` + `api.ts` + pure helpers + tests. |
| `src/features/orders/billPdf.ts` | Pure bill generator. Uses dynamically-imported jsPDF via `loadJsPDF()`. |
| `src/lib/` | Cross-cutting: supabase client, week math, a11y helpers, todayInTz |
| `supabase/migrations/` | Sequential SQL migrations (0001-0009). All schema + RLS + RPCs live here. |
| `scripts/` | Playwright smokes (`verify-*.py`) + `dev-seed.sql` |
| `docs/v1-spec.md` | Comprehensive feature spec (§1-§14) with implementation pointers |
| `docs/BUILD_HISTORY.md` | Sprint-by-sprint Phase 1 narrative |
| `docs/decisions/` | ADRs by sprint — read when investigating "why is X this way" |
| `docs/DESIGN_HANDOFF.md` + `docs/design/` | Claude Design output: chosen variants, tokens, wireframes |
| `docs/PRODUCT_BRIEF.md` | Original behavioural PRD sent to Claude Design |

## How to work

### Commands

```bash
npm run dev           # Vite dev server on :5173
npm run build         # Production build to dist/
npm run preview       # Serve dist/ on :4173 (use this for prod-build smokes)
npm run typecheck     # tsc -b --noEmit — ALWAYS this, never bare `npx tsc`
npm run test:run      # vitest run — ONE-SHOT full suite (279 tests across 39 files). Use this.
npm run test          # vitest WATCH mode — never exits. NOT the one-shot suite.
npx tsc -b --force    # Bypass incremental cache after shared-type changes
```

### Smokes (Playwright)

All scripts read `SMOKE_EMAIL` / `SMOKE_PASSWORD` from `.env.local` or process env. All accept `--url <url>` (default localhost:5173) except `verify-a11y.py` (reads `SMOKE_URL` env). Run against the PROD build (`npm run build` + `npm run preview`), not `npm run dev`. Use `scripts/with_server.py` from the webapp-testing skill for server lifecycle. Each smoke is idempotent + self-cleaning (creates uniquely-named throwaway data, tears it down in `finally`).

| Script | Covers |
|---|---|
| `verify-launch-readiness.py` | All 8 §3 daily flows + planning ritual + event setup. `--browser {chromium,firefox,webkit}`. The broad regression smoke. |
| `verify-a11y.py` | axe-core via CDN across 7 authed routes + public form. Asserts 0 violations. |
| `verify-bill-flow.py` | Bill PDF generation + **canvas** preview (pdfjs) + Share, at 360×640. |
| `verify-customer-flow.py` | Customer CRUD + quiet-nudge. |
| `verify-events-flow.py` | Event create + anon public form submit + confirmation. |
| `verify-reports-flow.py` | Reports tab switching + deep-links. |
| `verify-settings-flow.py` | Settings edit + persistence + bill-modal wiring. |
| `verify-inline-add-customer.py` | Inline "+ New customer" during order entry (no page reload). |
| `verify-revert-flow.py` | Revert fulfilled/paid + delete complaint (reversibility). |
| `verify-discounts-flow.py` | Discount prefill (reseller/customer) + per-order override + discounted bill. |
| `verify-exhibition-repeat.py` | REST-only: repeat customer's cross-event confirmation resolves + anti-leak holds. |

**Which smokes to run (scope by blast radius — confirmed 2026-05-27):**
- **chromium-only by default.** Mom's only runtime is the Android Chromium PWA. Run the firefox+webkit matrix **only** for cross-browser-sensitive diffs (PDF/canvas, service worker/PWA, CSS layout, Web Share/File APIs, focus/dialog). firefox/webkit otherwise surface only pre-existing teardown noise, already tolerated in `verify-launch-readiness.py`'s `CONSOLE_KNOWN_FLAKY_PATTERNS` (printed as WARN, doesn't fail the gate).
- **Pick the affected smokes, don't run all every time.** Map by change area: order/bill/customer/reports/settings → that feature's smoke + `verify-launch-readiness.py`(chromium). **Public-RPC / migration changes → `verify-events-flow.py` + `verify-exhibition-repeat.py` + `verify-a11y.py`.** Always include launch-readiness(chromium) as the general integration check.
- **Re-run the FULL set + the 3-browser matrix only for architectural changes** (routing, lazy-loading, shared components/AppShell, build config) and before a release milestone. (Route-level lazy loading silently broke `verify-bill-flow.py` in Sprint 9 — that's the scar this guards.)
- Diagnose efficiently: targeted REST probes at the failing boundary (auth → RPC) first, then the minimum browser test — not the whole suite (see task #7, 2026-05-27).

### Invariants — must not violate

- **Date columns (`fulfilled_at`, `paid_at`, `made_on`, `week_start`, `target_fulfilment_date`, `reported_at`, `resolved_at`) are Postgres `date`, not `timestamptz`.** Write `todayInTz()` (YYYY-MM-DD), never `new Date().toISOString()`. The runtime won't catch this — Postgres will coerce, then date math breaks at week boundaries.
- **Typecheck via `npm run typecheck` only.** Bare `tsc --noEmit` misses project-references strict flags and ships broken code to Vercel.
- **After adding REQUIRED fields to shared row types** (e.g. `OrderRow`), run `npm run build` or `npx tsc -b --force`. The `.tsbuildinfo` incremental cache can skip re-checking fixtures, masking failures until Vercel's clean build catches them.
- **Anon SQL access is locked off.** All public-form surface area goes through SECURITY DEFINER RPCs in `0005_public_rpcs.sql` + `0007_business_settings.sql` (`public_get_event_by_slug`, `public_create_exhibition_order`, `public_get_order_by_ref`, `public_get_business_identity`). RLS allows no direct table reads/writes for anon. **`0009` redefined `public_create_exhibition_order` + `public_get_order_by_ref`** (event_id stamp + anti-leak) — if you change an exhibition RPC, edit the latest migration's `create or replace`, never the original 0005 body.
- **Maintenance-only mode (2026-06-02).** The app is feature-complete. Make changes only when mom requests one or a bug requires a fix — no unsolicited features, refactors, or redesigns. Mom won't tolerate rough cycles on the live app, so any mom-visible change still gets full review + blast-radius smoke verification before push. Builder-side iteration (branches, experiments) remains unconstrained.

### Authoring style

- **Don't write comments** unless the *why* is non-obvious (hidden invariant, workaround for a specific bug, surprising behaviour). Well-named identifiers explain *what*. Never reference the current task, PR, or caller in a comment — those rot.
- **No backwards-compatibility hacks** for code we control. Delete unused code; don't leave `// removed` markers.
- **Edit existing files** over creating new ones. Match local style.

## Data model

Single Postgres schema (`public`). Twelve tables form one **data spine** with three lenses (production / orders / customers) on top:

```
customers ─┬─ orders ─── order_items ─── products
           │     ├─ complaints
           │     └─ (orders.customer_id ref)
           └─ source_event_id ──┐
                                │
events ──── event_demand ───────┴─── (source_event for exhibition customers)

products ─── seed_demand
         └── production_logs (date, qty)
         └── production_plans (week_start, planned_qty, original_planned_qty)

channels ── customers.channel_id (system: Personal/Reseller/Exhibition; custom: chip-added)
business_settings (single row, anon-readable subset via RPC)
```

Full schemas: `supabase/migrations/0001_*.sql` through `0009_*.sql`. Behavioural spec (what each column drives): `docs/v1-spec.md` §2.

**Phase 2 additions:** `channels.default_discount_percent` (Reseller=20), `customers.discount_percent` (nullable=inherit), `orders.discount_percent` (per-order snapshot) — migration `0008`. `orders.event_id` (FK→events, ties exhibition orders to their event) — migration `0009`.

## Architecture pointers

- **Routing:** every page lazy-loaded in `src/App.tsx`. Public routes outside `<Protected />`.
- **Production algorithm:** pure function `src/features/production/algorithm.ts` (`base = rolling_avg | seed | seed-if-seasonal + event_uplift`; `suggested = max(0, max(base, committed) - produced)`). Plan composition layer `planLayer.ts` overlays mom's saved plan. Subtitle precedence: committed > base → "includes pending orders" wins; else uplift ≥ 10% → "includes ramp-up for {event}".
- **Bill PDF:** `buildBillPdf` is pure, takes a `jsPDFCtor` parameter. `BillPreviewModal` calls `await loadJsPDF()` first so the 118 kB jspdf chunk loads only on bill-tap. Noto Sans TTFs lazy-loaded for ₹ glyph + real bold. **Preview renders to a `<canvas>` via lazy `pdfjs-dist`** (`pdfPreview.ts`) — Android WebView can't render an `<iframe>` blob-PDF; canvas bounded `max-h-[60vh] overflow-y-auto` so Close/Share stay reachable; pdfjs render cancelled on close.
- **Bill numbers:** atomic via `allocate_bill_number(uuid)` RPC. Sequence starts 1001.
- **Discounts:** pure `orderTotal(subtotal, pct)` + `resolveDiscount({customerDiscount, channelDefault})` in `src/features/orders/discount.ts` (nearest-rupee; order > customer > channel-default > 0). Resolved at order creation and **snapshotted** to `orders.discount_percent`; the order form prefills it (editable). Every total site (order list/detail, customer outstanding, reports, bill) routes through `orderTotal`. `numeric` columns arrive from PostgREST as **strings** — coerce with `Number(...)`. Batch-entry orders intentionally default to 0%.
- **Reversibility:** persistent secondary buttons on `OrderDetailPage` (`revertFulfilled`/`revertPaid` → null/'unpaid') + `deleteComplaint` in `ComplaintSheet`, each native-`confirm()`-guarded. Forward actions (Mark fulfilled/paid) stay one-tap.
- **Exhibition order ↔ event:** `orders.event_id` (0009) links each exhibition order to its event. `public_get_order_by_ref`'s anti-leak matches `order.event_id == event.id` (not `customer.source_event_id`, which dedup-on-phone pins to the customer's first event) so repeat customers at a new event still see their confirmation.
- **Quiet customers:** pure `isQuiet()` in `src/features/customers/quiet.ts` (per-channel thresholds, Asia/Kolkata-day-normalised).
- **Reports charts:** raw SVG only (`src/features/reports/charts/`). No recharts/d3 dependency.
- **Refresh model:** refetch-on-tab-focus. No realtime subscriptions in v1 (one writer).
- **Design system (2026-06 polish):** `tailwind.config.ts` holds the full token set; `src/index.css` defines the shared `.input-shell` (form-field shell + the soft brand focus ring) and `.btn-primary` (primary button + `paper-2`/`ink-3` disabled retone) primitives, plus the global `:focus-visible` outline (inputs included — `.input-shell:focus` sets `outline:none` + its own ring so migrated inputs don't double-ring). New form controls should use these primitives rather than re-deriving border/focus/disabled classes. Status-chip palette + the full per-finding map live in `docs/superpowers/plans/2026-06-01-ui-critique-polish-pass.md`.

## Pointers for common questions

- **"Why is X this way?"** → `docs/decisions/` ADRs (Phase 1; the Sprint 10 ADR has a Phase 1 close summary). **Phase 2 maintenance decisions** → `docs/superpowers/specs/` (one design doc per change) + `docs/superpowers/SESSION_STATE.md` (the maintenance-session log).
- **"What was the spec?"** → `docs/v1-spec.md` (sections are marked with implementation pointers as of Phase 1 close).
- **"How did we build it?"** → `docs/BUILD_HISTORY.md` for the sprint-by-sprint narrative; `git log --oneline | grep Sprint` for the commit trail.
- **"What's deferred to v2?"** → `docs/v1-spec.md` §2 "Deliberately NOT in v1" + §14 parking lot.

## Hard constraints (still load-bearing)

- **Don't push without explicit user authorization.** Karan reviews everything before push.
- **Don't change design tokens without user approval.** `tailwind.config.ts` is the source of truth. The Sprint-10 retune cleared WCAG AA (`ink-500 #6E655E`, `brand-orange #B8450F`); the 2026-06 polish pass **added** a semantic layer — `brand` DEFAULT/`soft`/`muted`/`deep`, `ink` DEFAULT/`2`/`3`, `paper-2`, `card`, `rule`, `mustard`, `brown`, `ok` (soft/stamp), `warn`, `danger`, `mustard-tint`; type tokens `amount`/`small`/`meta`/`eyebrow`/`eyebrow-tight`; `rounded-badge` — **purely additive, nothing redefined.** **AA traps (learned the hard way):** `ink-3` (#A29A92) is NOT AA-safe as readable text (~2.7:1) — use it only for placeholders / disabled labels; the Pending/Unpaid status chip uses `text-brand-deep` (not `text-brand`, which is 4.49:1 on `brand-muted`). Verify any token/colour change with `verify-a11y.py` (axe) — but note axe only scans each route's default tab/state.
- **Don't skip the advisor + behaviour-shaped browser verify before declaring a sprint or substantial change done.** Green unit tests alone are insufficient.
- **Don't add features beyond what the task requires.** No premature abstractions, no fallbacks for impossible states, no validation at internal boundaries.
