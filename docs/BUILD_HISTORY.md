# Crunchies — Build History (Phase 0 + Phase 1)

Preserved narrative of the build. Reference doc — Claude doesn't read this every session. Use it when:
- Investigating "when / why did we build X" without digging through git history
- Onboarding a new collaborator
- Auditing decisions captured in commit messages but not in ADRs

The structural source-of-truth docs are:
- `README.md` (top-level overview + docs map)
- `CLAUDE.md` (current state + how to work)
- `docs/v1-spec.md` (feature spec)
- `docs/superpowers/SESSION_STATE.md` (Phase 2 maintenance + the 2026-06 UI polish pass — most recent first)
- `docs/decisions/*-architecture-decisions.md` (ADRs)
- Git log (`git log --oneline | grep Sprint`)

> **Scope of this file:** Phase 0 + Phase 1 only. Phase 2 maintenance and the 2026-06 UI polish pass are logged in `docs/superpowers/SESSION_STATE.md` and `docs/superpowers/plans/`, not here.

## Phase 0 — discovery, design, validation

**Status: closed.** All six steps either done in-flow or consciously skipped. Spec was locked for build at end of Phase 0.

| Step | Status | Notes |
|---|---|---|
| P0.1 — Interview with mom | Done pre-spec | Interview happened *before* the spec was written; the spec is the codified output of her answers. No separate notes file. |
| P0.2 — Spec reconciliation against interview | Done in spec authorship | Mom's answers shaped every section directly. |
| P0.3 — Design brief for Claude Design | Done | `docs/PRODUCT_BRIEF.md` sent alongside the brochure. |
| P0.4 — Clickable mockup | Done | Claude Design produced wireframe HTMLs at `docs/design/wireframes/` plus per-screen JSX + 18 PNGs. Design references only — not shipped. |
| P0.5 — Mom walkthrough | Skipped | Karan's review of the wireframes was deemed sufficient. Mom sees the app once, at launch (finished form). |
| P0.6 — Lock for build | Done | Concurrent with the reconciliation pass that absorbed 7 design-handoff divergences (see `docs/decisions/` and `docs/DESIGN_HANDOFF.md`). |

Two big design concepts crystallised in Phase 0 §5 design discussion:
- **Mom's own weekly production plan as a first-class number** alongside the algorithm's suggestion (calibration loop — her intuition learns over time).
- **Events** (festivals + exhibitions) as first-class objects that drive multi-week production ramp-ups via the algorithm.

## Phase 1 — the build (10 sprints + Sprint 0 foundation)

11 sprints total (0-10). Deployed to `https://www.crunchies.app` via Vercel auto-deploy from `main`. Phase 1 closed 2026-05-22.

### Sprint 0 — Foundation

Vite + React + TS + PWA scaffold, Supabase schema + RLS on every table, mom + admin auth users, Vercel auto-deploy pipeline, custom domain `crunchies.app`. PWA installed and verified on Karan's Android. Login flow verified via `scripts/smoke-test-login.py`.

### Sprint 1 — Walking skeleton

5-tab bottom nav + AppShell, minimal Add Order and Log Production forms wired end-to-end, Today renders raw queries. Dev fixtures seeded via `scripts/dev-seed.sql` (5 `[DEV]` products + 4 `[DEV]` customers across all channels).

### Sprint 2 — Production lens (part 1)

Products CRUD at `/products`. §11 production-suggestion algorithm (rolling avg + seed fallback + committed demand, pure TypeScript function in `src/features/production/algorithm.ts` with 11 unit tests, `needs_seed` flag for unseeded+<4w-history). Production Section C with `Plan: — / Suggested: N / Made: N` rows + "Manage products →" header link. LogProduction prefilled via `?product_id=`. Today Block 1 with seed footnote when all visible rows are seed-based. ADRs in `docs/decisions/2026-05-21-sprint-2-architecture-decisions.md`.

### Sprint 3 — Production lens (part 2)

Full calibration loop. Planning view at `/production/plan-this-week` with `original_planned_qty` frozen on first save (§12 immutability rule). Plan composition layer (`composeWithPlan` in `src/features/production/planLayer.ts`) yielding plan-aware `target`/`gap`/`done`/`subtitle` per row. "includes pending orders" subtitle when committed > base (event-uplift subtitle deferred to Sprint 7). Product-detail bottom sheet with this-week log list and tap-to-edit at `/production/log/:id` (full edit/delete). "Done this week (N)" collapse on Production. Section D read-only "From other makers" table. "Add a seed estimate →" affordance via SeedEstimateModal. Seed read-only on EditProductPage once weeks_of_history ≥ 4. Today Block 1 now plan-aware.

### Sprint 4 — Order lens (part 1)

Orders browse mode at `/orders` with customer search (200ms debounce via `useDebouncedValue`), filter chips (`?filter=` URL state), and day-grouped list (`TODAY` / `YESTERDAY` / `WED 13 MAY`). Order detail at `/orders/:id` with mark fulfilled / mark paid / delete (bill / complaint / edit are disabled placeholders for Sprint 5). Add Order at `/orders/new` is the §7 7-step progressive accordion with multi-item entry, source picker, backdating, **mandatory `target_fulfilment_date`** (the §12 calibration anchor). Reusable `CustomerSearchPicker` + `AddCustomerInlineModal`. Today Block 2 spec-compliant (up to 5 + "see all →"). `createOrderWithItems` uses sequential inserts with cleanup-on-failure for multi-item atomicity at v1 scale. `markFulfilled` / `markPaid` write to Postgres `date` columns using `todayInTz()`. ADRs in `docs/decisions/2026-05-21-sprint-3-4-architecture-decisions.md`.

### Sprint 5 — Order lens (part 2)

Bill PDF generation via jsPDF + OS share sheet, traditional variant B per `DESIGN_HANDOFF.md` §3 (double-border frame, orange header band, items table, payment stamp, signature line). `buildBillPdf` is a pure generator in `src/features/orders/billPdf.ts` with 10 invariant tests; `BillPreviewModal` wraps it with iframe preview + Web Share API Level 2 (`navigator.canShare({ files })`) + download fallback. Bill numbers allocated via atomic `allocate_bill_number(uuid)` Postgres RPC (migration `0004_bill_number_rpc.sql`) backed by `bill_number_seq` (starts at 1001). Noto Sans Regular + Bold TTFs (`public/fonts/`) lazy-loaded on first bill render so ₹ renders per spec AND `setBold()` produces actual bold glyphs; falls back to `Rs.` prefix + Helvetica when font unavailable. Business identity in `src/lib/business.ts` (`BUSINESS_INFO` constants) — Sprint 9 swapped this for a Settings table read. ComplaintSheet bottom-sheet at `OrderDetail` for log/edit. Edit Order at `/orders/:id/edit` reuses `AddOrderPage` with an `editingOrderId` prop — no field-level locking per spec §7 ("no locks"). Batch entry mode at `/orders/batch` with flat always-visible form. `scripts/verify-bill-flow.py` is the headless Playwright browser smoke for this flow. ADRs in `docs/decisions/2026-05-22-sprint-5-architecture-decisions.md`.

### Sprint 6 — Customer lens

Full §8 Customers surface. Directory at `/customers` (replaces the stub) with search (name OR phone, 200ms debounced via `useDebouncedValue`), URL-driven filter chips (`All` / `Large` / `Small` / `Unsorted` / `Quiet` + dynamic channel chips read from `channels` table, system rows first), sort selector (Recent order / A–Z / Most ordered), two-line rows with relative-date last-order and `quiet Nw` marker. Detail at `/customers/:id` with header (name + tap-to-copy phone + channel/size chips + "Customer since {month year}" + source-event line), stats card (order count · outstanding ₹ · last ordered), action buttons (`+ Log new order`, `Send WhatsApp` calling `bumpLastContacted` then opening `wa.me/<phone>`), inline-edit notes, full order history, open complaints sub-section, footer Edit/Archive/Delete (delete gated on `order_count === 0`). Add at `/customers/new` using the chip-based `ChannelChipPicker` (incl. inline `+ Add channel…` affordance per `DESIGN_HANDOFF.md` §6.1, backed by `createChannel(name)` with case-insensitive uniqueness handling), phone-required-for-personal/reseller validation, dup-on-phone detection modal. Edit at `/customers/:id/edit` reuses `AddCustomerPage` in edit mode (no field-level locking per §8). Today block 2.5 — `QuietCustomerNudge` (up to 3 most-overdue, dismiss `×` advances `last_contacted_at`). Sprint 4's `AddCustomerInlineModal` upgraded to the same chip picker. Pure `isQuiet()` predicate in `src/features/customers/quiet.ts` with 12 invariants (Asia/Kolkata-day-normalised anchor diff so boundary thresholds are exact). `scripts/verify-customer-flow.py` is the headless Playwright browser smoke for this flow. ADRs in `docs/decisions/2026-05-22-sprint-6-architecture-decisions.md`.

### Sprint 7 — Events + customer-facing exhibition form

Full §6 + §10 surfaces. Events directory at `/events` with URL-driven `Upcoming` / `Past` / `All` filter chips. Event detail at `/events/:id` (create at `/events/new`, same `EventDetailPage` dual-mode via `useParams<{id}>()`) with kind picker (Festival / Exhibition / Other), date pickers, lead-weeks stepper with `defaultLeadWeeks` auto-fill on kind change (create mode only, until user touches), Public URL section (only for exhibitions; slug auto-derived via `slugify(name, year)`, Copy link + WhatsApp share buttons), pickup window + venue inputs, expected-demand grid (one row per active in-house product; aggregated excluded per §6), notes, retrospective summary card when `ends_on < today`, footer Save / Duplicate-to-next-year / Delete. Pure event logic in `src/features/events/eventLogic.ts` (`slugify`, `bumpSlug`, `nextYearName`, `defaultLeadWeeks`, `eventWindowState`, `weeksUntil`) with 15 unit tests. Three SECURITY DEFINER RPCs in `0005_public_rpcs.sql` (`public_get_event_by_slug`, `public_create_exhibition_order`, `public_get_order_by_ref`) — anon retains zero direct table access; the RPCs enforce slug + active-window + anti-leak validation, honor honeypot, dedup on phone with auto-reactivate. `committed_expected_qty` snapshot is app-level inside `updateEvent` (calls `maybeSnapshotEvent` + `maybeUnfreezeEvent`); migration `0006_event_demand_unfreeze.sql` loosens the freeze trigger to allow non-null→NULL reset for the rare "starts_on edited back to future" path. Slug derivation in `createEvent` retries on 23505 with `bumpSlug` up to 5 attempts. Public form at `/order/:slug` (outside `<Protected />`) is the 3-step wizard (`PickStep` / `ContactStep` / `ConfirmStep`) per `DESIGN_HANDOFF.md` §3 variant B; sticky orange header with business+event identity; progress bar (3 thin bars); CSS-hidden honeypot field. Phone validation via pure `cleanPhone` + `isValidIndianMobile` (strips `+91`, requires 10 digits starting 6–9). Confirmation page at `/order/:slug/confirmed?ref=<uuid>` calls the third RPC (anti-leak validates `order.customer.source_event_id === event.id`), renders checkmark + "Order placed." + `#YYYY-NNNN` order number + pickup card + summary + `Save to WhatsApp` (deep-link to `wa.me/91<phone>?text=…` with order summary) + `Place another order →`. `BUSINESS_INFO.whatsapp` footer line conditionally hidden when null. `UpcomingEventsSection` on `ProductionPage` shows top-3 + `All events →` link + `See all (N)` button + `+ Add event` button. AddCustomerPage extended with `source_event_id` dropdown when channel = Exhibition. NEW badge on Orders tab via localStorage-backed `lastSeenAt`. `scripts/verify-events-flow.py` is the headless smoke. ADRs in `docs/decisions/2026-05-22-sprint-7-architecture-decisions.md` (ADRs 27-32).

### Sprint 8 — Reports (Week / Month / Trends)

Full §9 surface at `/reports`. Single page with `?tab=week|month|trends` URL state (no subroutes); asymmetric defaults per spec (Week → `lastCompletedWeekStart(today)`, Month → `currentMonth(today)`, Trends → rolling 8w / 6m). Period selectors via `?week=YYYY-MM-DD` / `?month=YYYY-MM`. **Week tab**: pip-marker calibration card hero (`PipMarkerBar` — single bar = made, dashed tick = plan, solid tick = demand) sorted by `sortByVarianceDescending`, variance pill `+{var} (+{pct}%)` color-coded; plus 4-tile order summary, single-line new-customers-by-channel, top-5 products, top-5 customers, complaints (hidden when 0). "Week in progress" footnote on current week. **Month tab**: calibration summary headline `Plan vs demand variance: ±X%`; 4-tile summary WITH prev-month comparison lines (`↑ K% vs Apr` factual not celebratory, `pp` for fulfilment rate); `StackedBar` channel breakdown with brand palette; customer base health; exhibition→repeat rate hidden when acquired<5; top-10 products + customers; complaints summary with average resolution time. **Trends tab**: big accuracy % hero + caption + `LineChart` (raw SVG, `M`-jumps over null gaps, `onPointClick` → `/reports?tab=week&week=YYYY-MM-DD`); per-product trends sorted by lifetime volume DESC; `<StackedBar>` × 6 months channel mix grid with legend; past-event retrospectives list. All charts are pure raw-SVG (`src/features/reports/charts/`) — no recharts/d3 deps. Pure helpers: `src/features/reports/dateRange.ts` (32 tests) and `src/features/reports/calibration.ts` (27 tests). Client-side aggregation in `src/features/reports/api.ts`. All Reports tables filter `is_aggregated=false`. `weeklyAccuracyPct` excludes `plan_set_retrospectively=true` rows per spec §9.3. `scripts/verify-reports-flow.py` is the smoke. ADRs in `docs/decisions/2026-05-22-sprint-8-architecture-decisions.md` (ADRs 33-38).

**Sprint 8 follow-up — bill payment-stamp redesign** (ADR-39): Karan reviewed a generated bill for an unpaid order and flagged the UNPAID stamp as too prominent / accusatory on a customer-facing document. Redesigned `buildBillPdf` to asymmetric treatment: **PAID** keeps a stamp box (slimmer 32×10mm at 12pt; adds a small `Received on {date}` ink-500 caption beneath when `orders.paid_at` is set), **UNPAID / PARTIAL** drop the box entirely in favor of a single right-aligned ink-700 line under the Total (`Payment due on collection` / `Partial payment received · balance due on collection`). Wired `paid_at` through all four orders-table SELECT clauses + `BillPreviewModal.toBillInput` + `BillInput.paidAt`. `billPdf.test.ts` extended to 12 invariants.

### Sprint 9 — Settings + event uplift + polish + backfill

§13 Settings, §11 event_uplift wired, accessibility + performance + empty-state polish, idempotent backfill script.

**§13 Settings:** single-row `business_settings` table (migration `0007_business_settings.sql`) with `authed_all` RLS + SECURITY DEFINER `public_get_business_identity()` RPC exposing the customer-facing subset (name/tagline/whatsapp) to anon — same anon-surface-via-RPC pattern as Sprint 7 (ADR-40). `src/features/settings/api.ts` + `SettingsContext` mounted inside `<Protected />`. `BusinessInfo` type moved from deleted `src/lib/business.ts` into `src/features/orders/billPdf.ts`. Settings page at `/settings` (gear icon top-right of Today header) with Identity / Bill / Contact sections, phone validation, inline "Saved." indicator.

**§11 event_uplift (ADR-41):** algorithm extended with required `eventUplift` + `eventSources` input maps. `base = (rolling_avg | seed | seed-if-seasonal) + event_uplift`. Pure `computeEventUplift(weekStart, events)` helper in `production/api.ts` does the `(starts_on - lead_weeks*7) ≤ weekEnd AND ends_on ≥ weekStart` touches-week math + `expected_qty / (lead_weeks + 1)` per-week split. Subtitle precedence per §11: committed > base wins; else uplift ≥ 10% of base → "includes ramp-up for {top contributor}". 22 new tests.

**Accessibility (ADR-43):** new `src/lib/a11y.ts` with `useDialogA11y` + `useRouteFocus` helpers. 7 dialogs/sheets upgraded to `role="dialog"` + `aria-modal` + `aria-labelledby` + Escape-to-close + focus-on-mount + focus-restore-on-unmount. ReportsPage tab strip gets `role="tablist"` + `role="tabpanel"` + roving tabIndex. Route-change focus on 6 high-traffic pages. ProductionPage card refactored from `<div role="button">`-with-nested-button to a real `<button>` with sibling seed CTA (fixed axe serious `nested-interactive` × 4). Global `:focus-visible` outline. `scripts/verify-a11y.py` injects axe-core 4.10.0 via CDN. Color-contrast initially surfaced as design-debt; retuned in Sprint 10 close (see below).

**Performance (ADR-42):** every route in `src/App.tsx` converted to `React.lazy()` + `Suspense fallback={<PageSkeleton />}`. `vite.config.ts` `manualChunks` splits `jspdf` into its own chunk. Initial bundle 114 kB gzip (was ~520 kB pre-split); jspdf 118 kB gzip. Sprint 10 closed the carry to also defer jspdf import inside `billPdf.ts` itself.

**First-run empty states:** Today / Customers / WeekTab / TrendsTab copy polished to match spec §3-§9.

**Backfill (ADR-44):** `scripts/backfill-notebook.ts` (tsx) — CSV importer. `--dry-run` default, requires `SUPABASE_SERVICE_KEY` for `--apply`. Idempotency primitives: customer lookup by `cleanPhone`, product lookup by lowercase name (aborts row with clear error if missing — backfill doesn't invent products), order composite fingerprint `(customer_id, ordered_on, sorted item composition)`. Defaulted fields documented in README. 23 unit tests against a fake supabase client. *(Note 2026-05-25: backfill was never run live. Karan decided mom starts from a clean slate rather than importing notebook history. Script archived to `docs/archive/build-artifacts/backfill/`; `tsconfig.scripts.json` removed alongside since no `.ts` scripts remain in `scripts/`.)*

`scripts/verify-settings-flow.py` is the smoke. ADRs in `docs/decisions/2026-05-22-sprint-9-architecture-decisions.md` (ADRs 40-44).

### Sprint 10 — Internal QA + cross-browser smoke + buffer (Phase 1 close)

`scripts/verify-launch-readiness.py` covers all 8 §3 daily flows (log order live → batch → log production → mark fulfilled → mark paid → add customer → generate bill → log complaint) + weekly planning ritual + event setup. Behaviour-shaped + idempotent + cleans up after itself (try/finally so cleanup runs on assertion failure). `--browser {chromium,firefox,webkit}` flag and `--url <url>` flag enable the cross-browser launch matrix. Console-error gate with engine-aware allowlist for firefox-only dynamic-import-retry noise (fires in BOTH dev `.tsx` and prod `.js` paths — verified by running prod-build).

**Prod-build matrix at HEAD** (against `npm run build && npm run preview` on port 4173): chromium 10/10 / 0 errors, firefox 10/10 / 0 errors, webkit 10/10 / 0 errors.

**ADR-47 (Sprint 10 carry of ADR-42)**: `src/features/orders/billPdf.ts` switched from runtime `import { jsPDF } from 'jspdf'` to `import type` (erased) + new async `loadJsPDF()` helper; `buildBillPdf(input, business, jsPDFCtor, opts?)` takes the constructor as a parameter; `BillPreviewModal` awaits `loadJsPDF()` before each call (second call hits module cache). Instrumented run confirmed 0 jspdf network requests before bill-tap, 1 after.

**Drive-by:** `verify-bill-flow.py` was broken at HEAD pre-Sprint-10 due to a `networkidle` race introduced by Sprint 9's route-level lazy + `OrderDetailPage`'s deferred load — Sprint 9 close should have caught this by re-running every verify-*.py. Process note added to launch checklist.

**Spec drift surfaced (implementation is source of truth, spec updated post-launch):** AddOrderPage saves to `/orders` not `/orders/:id`; AddCustomerPage saves to `/customers/:id` not `/customers`; ProductDetailSheet CTA is "+ Log new batch" not "Log production"; BillPreviewModal share button is "Share" not "Share to WhatsApp".

ADRs in `docs/decisions/2026-05-22-sprint-10-architecture-decisions.md` (ADRs 45-49).

### Sprint 10 close + post-review polish

After Sprint 10 close, Karan approved the color-contrast token retune deferred from ADR-43/48:
- `ink-500` #8A8079 → #6E655E (clears 4.5:1 on paper-surface)
- `brand-orange` #D9591A → #B8450F (clears 4.5:1 on white)

All 8 routes (7 authed + 1 public) now report 0 axe violations including color-contrast. `scripts/verify-a11y.py` updated to drop the design-debt contrast carve-out.

Documentation overhaul (same session): CLAUDE.md slimmed to maintenance-phase orientation; sprint-by-sprint narrative moved here; `docs/v1-spec.md` annotated with implementation pointers; ENGINEERING_NOTES trimmed to chosen-variants reference only.

## Test count + bundle size at Phase 1 close

- **Tests:** 258 across 36 vitest files. Plus 7 Playwright behaviour smokes.
- **Build:** initial bundle 114.40 kB gzip; jspdf chunk 118.66 kB gzip (lazy on bill-tap); per-route chunks 1-15 kB gzip.

## Memory notes / patterns established during build

Persisted across sessions in `~/.claude/projects/.../memory/`:
- `feedback_typecheck_command.md` — always `npm run typecheck`, never bare `tsc`. After REQUIRED-field shared-type changes, run `npm run build` or `tsc -b --force` to bypass `.tsbuildinfo` cache.
- `feedback_advisor_before_done.md` — never declare a sprint complete on green tests alone; advisor + behaviour-shaped browser verify are non-negotiable.
- `project_date_columns.md` — Postgres `date` columns need `todayInTz()`, not `new Date().toISOString()`.
- `feedback_outcome_first.md` — design backward from outcomes; don't treat docs as set-in-stone specs; justify structure outcome-by-outcome.
- `feedback_proactive_skills.md` — invoke relevant skills without being asked.
- `feedback_reason_from_objectives.md` — never let "easier to build / library / overhead" be the deciding voice in design.
- `feedback_windows_read_permissions.md` — `Read(C:/...)` not `Read(C:\\...)`; backslash form is valid JSON but never matches.
- `user_karan_builder.md` — Karan is the builder, beginner at web dev, uses Claude Code as coach.
