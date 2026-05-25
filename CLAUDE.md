# Crunchies Management App

Maintenance-phase context for Claude sessions opening this repo. Read first. For build-time context (sprint history, deliverable narratives), see `docs/BUILD_HISTORY.md`. For full feature specs, see `docs/v1-spec.md`.

## What this is

A PWA for Karan's mother (Archana) to manage her small artisanal snacks business in Pune. She runs operations across three channels — 8-10 shopkeeper resellers, a personal network of friends/relatives, and exhibition/fair stalls — previously on WhatsApp + a paper notebook. The app replaces the notebook and gives her structure for production planning, customer + order history, and pending-order tracking.

**Roles:** Karan is the product/design partner and the only authenticated builder; Claude Code does the actual coding. Mom (Archana) is the primary authenticated user. Exhibition customers fill an anonymous per-event public form. There are no other users.

**Status (2026-05-22):** Phase 1 build complete. All 11 sprints (0-10) closed; deployed to `https://www.crunchies.app` via Vercel auto-deploy from `main`. PWA installed on mom's Android. In post-launch maintenance / Phase 2.

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
| `supabase/migrations/` | Sequential SQL migrations (0001-0007). All schema + RLS + RPCs live here. |
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
npm run test          # vitest run (full suite, 258 tests across 36 files)
npx tsc -b --force    # Bypass incremental cache after shared-type changes
```

### Smokes (Playwright)

All scripts read `SMOKE_EMAIL` / `SMOKE_PASSWORD` from `.env.local` or process env. Most accept `--url <url>` (default localhost:5173). Use `scripts/with_server.py` from the webapp-testing skill for dev-server lifecycle.

| Script | Covers |
|---|---|
| `verify-launch-readiness.py` | All 8 §3 daily flows + planning ritual + event setup. `--browser {chromium,firefox,webkit}`. Idempotent + self-cleaning. |
| `verify-a11y.py` | axe-core via CDN across 7 authed routes + public form. Asserts 0 violations. |
| `verify-bill-flow.py` | Bill PDF generation + iframe preview. |
| `verify-customer-flow.py` | Customer CRUD + quiet-nudge. |
| `verify-events-flow.py` | Event create + anon public form submit + confirmation. |
| `verify-reports-flow.py` | Reports tab switching + deep-links. |
| `verify-settings-flow.py` | Settings edit + persistence + bill-modal wiring. |

**Process note:** after any architectural change (lazy loading, type changes, schema changes), **re-run ALL `verify-*.py`** scripts, not just the smoke for the area you touched. Route-level lazy loading silently broke `verify-bill-flow.py` during Sprint 9; only caught in Sprint 10.

### Invariants — must not violate

- **Date columns (`fulfilled_at`, `paid_at`, `made_on`, `week_start`, `target_fulfilment_date`, `reported_at`, `resolved_at`) are Postgres `date`, not `timestamptz`.** Write `todayInTz()` (YYYY-MM-DD), never `new Date().toISOString()`. The runtime won't catch this — Postgres will coerce, then date math breaks at week boundaries.
- **Typecheck via `npm run typecheck` only.** Bare `tsc --noEmit` misses project-references strict flags and ships broken code to Vercel.
- **After adding REQUIRED fields to shared row types** (e.g. `OrderRow`), run `npm run build` or `npx tsc -b --force`. The `.tsbuildinfo` incremental cache can skip re-checking fixtures, masking failures until Vercel's clean build catches them.
- **Anon SQL access is locked off.** All public-form surface area goes through SECURITY DEFINER RPCs in `0005_public_rpcs.sql` + `0007_business_settings.sql` (`public_get_event_by_slug`, `public_create_exhibition_order`, `public_get_order_by_ref`, `public_get_business_identity`). RLS allows no direct table reads/writes for anon.
- **Mom's iteration tolerance is the hard product constraint.** She won't tolerate rough cycles on the live app. Any change visible to her gets full review + smoke verification before push. Builder-side iteration is unconstrained.

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

Full schemas: `supabase/migrations/0001_*.sql` through `0007_*.sql`. Behavioural spec (what each column drives): `docs/v1-spec.md` §2.

## Architecture pointers

- **Routing:** every page lazy-loaded in `src/App.tsx`. Public routes outside `<Protected />`.
- **Production algorithm:** pure function `src/features/production/algorithm.ts` (`base = rolling_avg | seed | seed-if-seasonal + event_uplift`; `suggested = max(0, max(base, committed) - produced)`). Plan composition layer `planLayer.ts` overlays mom's saved plan. Subtitle precedence: committed > base → "includes pending orders" wins; else uplift ≥ 10% → "includes ramp-up for {event}".
- **Bill PDF:** `buildBillPdf` is pure, takes a `jsPDFCtor` parameter. `BillPreviewModal` calls `await loadJsPDF()` first so the 118 kB jspdf chunk loads only on bill-tap. Noto Sans TTFs lazy-loaded for ₹ glyph + real bold.
- **Bill numbers:** atomic via `allocate_bill_number(uuid)` RPC. Sequence starts 1001.
- **Quiet customers:** pure `isQuiet()` in `src/features/customers/quiet.ts` (per-channel thresholds, Asia/Kolkata-day-normalised).
- **Reports charts:** raw SVG only (`src/features/reports/charts/`). No recharts/d3 dependency.
- **Refresh model:** refetch-on-tab-focus. No realtime subscriptions in v1 (one writer).

## Pointers for common questions

- **"Why is X this way?"** → `docs/decisions/` ADRs. The Sprint 10 ADR has a Phase 1 close summary.
- **"What was the spec?"** → `docs/v1-spec.md` (sections are marked with implementation pointers as of Phase 1 close).
- **"How did we build it?"** → `docs/BUILD_HISTORY.md` for the sprint-by-sprint narrative; `git log --oneline | grep Sprint` for the commit trail.
- **"What's deferred to v2?"** → `docs/v1-spec.md` §2 "Deliberately NOT in v1" + §14 parking lot.

## Hard constraints (still load-bearing)

- **Don't push without explicit user authorization.** Karan reviews everything before push.
- **Don't change design tokens without user approval.** Token table in `tailwind.config.ts`; current values cleared WCAG AA at Sprint 10 close (`ink-500 #6E655E`, `brand-orange #B8450F`).
- **Don't skip the advisor + behaviour-shaped browser verify before declaring a sprint or substantial change done.** Green unit tests alone are insufficient.
- **Don't add features beyond what the task requires.** No premature abstractions, no fallbacks for impossible states, no validation at internal boundaries.
