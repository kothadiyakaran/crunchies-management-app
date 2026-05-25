# Sprint 9 — Architecture Decisions

**Date:** 2026-05-22
**Scope:** Settings (§13), event_uplift wire-up (§11), accessibility, performance, empty-state polish, backfill script

---

## ADR-40 — Single-row Settings table with anon-readable subset via SECURITY DEFINER RPC

**Context:** §13 needs a writable business-identity store for the bill PDF + mom-side gear icon, plus a tiny anon-readable subset (business name + tagline + whatsapp) for the public exhibition form's sticky header and confirmation page. The shape mirrors the existing `BUSINESS_INFO` constants in `src/lib/business.ts` exactly.

**Options considered:**
1. Multi-row key-value table (`settings(key, value)`) — flexible, ugly to type, RLS needs row-level granularity to expose a subset to anon.
2. Single-row columnar table with column-level grants to anon for the readable subset — Postgres supports this, but supabase-js + PostgREST surface column grants awkwardly and it's a maintenance footgun.
3. Single-row columnar table with anon access via SECURITY DEFINER RPC — anon retains zero direct table access (consistent with the Sprint 7 anon-surface pattern via `0005_public_rpcs.sql`); the RPC returns only `{ name, tagline, whatsapp }`.

**Decision:** Option 3. Single-row table `business_settings`, RLS gives authenticated full access (`authed_all` policy), anon has zero access; `public_get_business_identity()` is the single anon read surface.

**Enforcement of single-row:** `create unique index business_settings_singleton on business_settings ((true))`. Any second INSERT fails with `unique_violation`. Cleaner than a trigger.

**Consequences:** Pattern matches Sprint 7's public RPCs (ADRs 27-30). One round-trip from public pages to fetch identity. Type-safe: `BusinessInfo` type lives in `src/features/orders/billPdf.ts` (where it's structurally needed); `src/features/settings/api.ts` re-exports it so `useSettings().settings` and `buildBillPdf` share one type. `src/lib/business.ts` constants file deleted.

---

## ADR-41 — `event_uplift` consumed app-side; algorithm extended with two new input maps

**Context:** §11 requires `event_uplift(P, W) = sum over touching events E of expected_qty / (lead_weeks + 1)`. Algorithm is pure (`src/features/production/algorithm.ts`); fetch lives in `src/features/production/api.ts:getProductionThisWeek`.

**Decision:**
1. Extend `AlgorithmInput` with required `eventUplift: Record<product_id, number>` and `eventSources: Record<product_id, { event_name, qty }[]>` (sources retained for the subtitle).
2. `getProductionThisWeek` fetches all events where `(starts_on - lead_weeks*7) ≤ weekEnd AND ends_on ≥ weekStart AND active=true`, bulk-fetches their `event_demand` rows in one round-trip, computes per-product per-week contribution app-side. Pure helper `computeEventUplift(weekStart, events)` exported for testability.
3. Base formula extended: `base = (rolling_avg | seed | seed-if-seasonal) + event_uplift`.
4. Subtitle precedence per §11: `committed > base` wins ("includes pending orders"); else `event_uplift / max(base, 1) ≥ 0.1` → "includes ramp-up for {top-contributing event}".

**Why app-side:** clarity + testability; v1 scale tolerates the unfiltered fetch (mom has ≤20 active events). First migration candidate if performance degrades is to a SECURITY INVOKER Postgres function returning the per-product uplift map.

**Edge case noted (no action):** non-seasonal product with <4w history + no seed + an event uplift now has `base = uplift > 0`, but `needs_seed` still fires → ProductionPage hides Plan/Suggested/Made behind "Add a seed estimate →". This matches §11 line 1340: "Skipping seed entry is allowed; the product simply shows no algorithm suggestion until either a seed is added or 4 weeks of order history accumulate."

---

## ADR-42 — Route-level lazy + jspdf chunk split; deferred billPdf.ts static import

**Context:** Initial bundle pre-T9.6 included all routes + jspdf + html2canvas. Bill PDF generation is rare (~once per WhatsApp order); shipping jspdf in the cold-start path is wasteful on mom's phone.

**Decision:**
1. Every route in `src/App.tsx` converted to `React.lazy()` + `Suspense fallback={<PageSkeleton />}`. Login stays eager.
2. `vite.config.ts` adds `build.rollupOptions.output.manualChunks = { jspdf: ['jspdf'] }` so jspdf ships as its own cacheable chunk.

**Bundle sizes (gzipped):** initial 114 kB; jspdf chunk 118 kB; html2canvas chunk 48 kB; ReportsPage 12 kB; per-page chunks otherwise 1-5 kB.

**Carried forward to Sprint 10 buffer:** `src/features/orders/billPdf.ts` statically imports `jspdf`. With route-level lazy, the jspdf chunk loads when the user navigates to an OrderDetail route, not when they tap "Generate bill". Converting `billPdf.ts` to `await import('jspdf')` inside `BillPreviewModal` would defer further. Estimated ~10 min — Sprint 10 buffer task. Initial bundle is not affected, so this is a follow-up not a blocker.

---

## ADR-43 — Accessibility pass: dialog roles, focus management, axe verify; design-token contrast logged as debt

**Context:** Sprint 9 includes an a11y pass on all surfaces. WCAG AA = 4.5:1 contrast for normal text. Mom is reading-glasses age on a mobile screen — contrast matters operationally, not just legally.

**Decision (implemented):**
1. New `src/lib/a11y.ts` with `useDialogA11y(onClose, { initialFocusRef })` and `useRouteFocus(ref)` helpers.
2. 7 dialogs/sheets upgraded to `role="dialog"` + `aria-modal="true"` + `aria-labelledby` + Escape-to-close + focus-on-mount + focus-restore-on-unmount.
3. ReportsPage tab strip: `role="tablist"` + `role="tab"` + `aria-controls` + roving tabIndex + `role="tabpanel"` with `id`/`aria-labelledby`.
4. Route-change focus on 6 high-traffic pages (TodayPage, OrdersPage, CustomersPage, ProductionPage, ReportsPage, SettingsPage) — h1 with tabIndex={-1} + useRouteFocus.
5. Customers sort `<select>` got `aria-label="Sort customers"` (fixed axe critical `select-name`).
6. ProductionPage card refactor: `<div role="button">` with nested seed-estimate `<button>` → real `<button>` with seed CTA as sibling (fixes axe serious `nested-interactive` × 4).
7. Global `:focus-visible` outline in `index.css` — 2px solid brand-orange ring, keyboard-only.
8. `scripts/verify-a11y.py` — axe-core 4.10.0 via CDN, 7 authenticated routes + 1 anonymous public-form route, asserts 0 serious/critical non-contrast violations.

**Axe results at HEAD:**
- 7 authenticated routes: 0 serious/critical, 0 moderate/minor (non-contrast)
- 1 anonymous public-form route: 0 serious/critical, 0 moderate/minor (after T9.9 missing-landmark fix wrapping content in `<main>`)

**Design debt (NOT fixed — needs Karan's design-token decision):**

| Pair | Ratio | Need |
|---|---|---|
| `ink-500` #8a8079 on `paper-surface` #fbf8f1 | 3.63 | ≥4.5 |
| `ink-500` #8a8079 on `paper-elevated` #ffffff | 3.85 | ≥4.5 |
| `brand-orange` #d9591a on white | 3.89 | ≥4.5 |

108 nodes total across 8 routes. Recommended remediation: `ink-500` → `#6e655e` (4.5:1 on paper-surface); `brand-orange` darken slightly OR pair only with ≥18px text. Surfaced to Karan in the Sprint 9 close note. If approved, Sprint 10 buffer can take the token retune.

---

## ADR-44 — Backfill script architecture: idempotent, dry-run default, service-role required

> **Superseded 2026-05-25.** The backfill was never run. Karan decided mom starts from a clean slate rather than importing notebook history. The script + tests + fixture are archived at `docs/archive/build-artifacts/backfill/`; see `ARCHIVE_NOTE.md` there for decision context and revival instructions. The decision below documents what was built and why, faithful to the Sprint 9 design moment — it does not reflect current intent.

**Context:** §14 Sprint 9 line 1613: "Backfill script: import mom's notebook history into customers + orders (one-time, idempotent, dry-run before commit)."

**Decision:** `scripts/backfill-notebook.ts` — Node + tsx (added as devDep). CSV input. Three idempotency primitives:
1. Customers: lookup by `cleanPhone(phone)`; reuse id if exists.
2. Products: lookup by lowercase name; abort row with clear error if missing (the backfill does not invent products — mom enters them via UI first).
3. Orders: composite fingerprint of `(customer_id, ordered_on, sorted item composition)`; matched against existing same-day orders for that customer.

**Defaulted fields (CSV doesn't carry):**
- `orders.source` → `whatsapp`
- `orders.ordered_at` → `{ordered_on}T12:00:00+05:30` (stable for re-run idempotency)
- `orders.fulfilled_at` → `ordered_on` (historical rows are completed; otherwise they'd flood Today's pending)
- `orders.paid_at` → `ordered_on` when `paid`, else null

**Service-role requirement:** the script requires `SUPABASE_SERVICE_KEY` to bypass RLS. anon would fail (no INSERT policy for anon); authenticated would require a session (clumsy for a script).

**Limitation (carried):** the `--apply` path has not been exercised end-to-end against a live DB in Sprint 9 (the env-gate stopped execution at the missing service key). 23 unit tests cover the logic against a fake supabase client (dry-run idempotency / apply-mode insert chain / second-apply 100%-EXISTS / missing-product abort / invalid-phone validation / multi-row grouping). The env-load + first-insert sequence is covered structurally but not live. Karan should provision the service key and dry-run a small fixture before running the real backfill at launch session.

---

## Post-implementation fixes

- **T9.9 public-form landmark fix:** axe flagged 1 moderate `region` violation on `/order/<slug>` because the progress bar div and honeypot input sat between `<header>` and `<main>`. Moved both inside `<main>`. Re-running verify-a11y.py would now show 0 non-contrast violations on the public form.

## Open carry items into Sprint 10

1. **billPdf.ts static jspdf import** → convert to dynamic import inside BillPreviewModal (~10 min). ADR-42 carry.
2. **Color-contrast token retune** if Karan approves (see ADR-43 table). Sprint 10 buffer task.
3. **Live backfill smoke** — once service key provisioned, run a 3-4 row CSV in `--apply` mode against a non-production DB or a clean dev DB; verify second-apply EXISTS path. ADR-44 carry.
4. **Open Sprint 0 carry** — PWA install + launch on mom's actual Android (§14 line 1538). Karan can do this asynchronously any time before launch session.
