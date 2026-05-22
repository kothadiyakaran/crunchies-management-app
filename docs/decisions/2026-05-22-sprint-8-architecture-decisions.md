# Sprint 8 — Architecture Decisions

Locked-in calls made during Sprint 8 (Reports surface — Week / Month / Trends tabs). Builds on `2026-05-21-sprint-2-architecture-decisions.md` (ADR-1..7), `2026-05-21-sprint-3-4-architecture-decisions.md` (ADR-8..16), `2026-05-22-sprint-5-architecture-decisions.md` (ADR-17..21), `2026-05-22-sprint-6-architecture-decisions.md` (ADR-22..26), and `2026-05-22-sprint-7-architecture-decisions.md` (ADR-27..32). Numbering continues.

---

## ADR-33: Reports tab state via `?tab=` URL search param (no subroutes)

**Context:** Spec §9 defines three tabs (Week / Month / Trends) with asymmetric default periods. Routing options: (a) child routes `/reports/week`, `/reports/month`, `/reports/trends`; (b) single page at `/reports` with `?tab=week|month|trends`.

**Decision:** Option (b). The default tab is `week` (rendered when `?tab` is absent or invalid). Setting `?tab=week` deletes the parameter from the URL to keep the canonical form clean.

**Why search-param over subroutes:**
- Matches the established Sprint 4 / Sprint 6 pattern (`OrdersPage`, `CustomersPage`) — same mental model, same back-button behaviour.
- Section-level deep links from other surfaces use additional search params (`?tab=week&week=2026-05-04` from TrendsTab, `?tab=week` from §4 Block 0 Monday banner). Subroutes would force a more complex URL like `/reports/week/2026-05-04`.
- `useSearchParams` is already the project's URL-state primitive; no new patterns to learn.

**Tab strip implementation:** `role="tab"` + `aria-selected` for screen readers; bottom-border active indicator (no underline on inactive labels). Default action on click is `setParams(sp, { replace: true })` — no history entry per tab change (the back button takes the user out of Reports entirely, which is what mom expects).

**Cross-references:** `src/features/reports/ReportsPage.tsx`, `src/features/reports/ReportsPage.test.tsx`, `src/features/customers/CustomersPage.tsx` (reference pattern).

---

## ADR-34: Reports period selectors via `?week=` / `?month=` URL params; asymmetric defaults baked in

**Context:** Spec §9 line 932-934: "Week tab defaults to LAST COMPLETED week ... Month tab defaults to CURRENT month." Trends tab is rolling, no period selector.

**Decision:**
- **WeekTab** reads `?week=YYYY-MM-DD`; default = `lastCompletedWeekStart(todayInTz())`. Prev/Next arrows write the param.
- **MonthTab** reads `?month=YYYY-MM`; default = `currentMonth(todayInTz())`. The default value is stripped from the URL on the current-month case to keep the URL canonical.
- **TrendsTab** has no period selector. Section 1 (plan accuracy) is fixed to the last 8 completed weeks; section 3 (channel mix) is fixed to the last 6 months.

The TrendsTab line chart's `onPointClick` callback navigates to `/reports?tab=week&week=YYYY-MM-DD` — wiring matches spec line 1086 ("Tap on any point → week selector jumps to that week in the Week tab").

**Why asymmetric defaults are right (re-justifying the spec):**
- Week-tab focus is the calibration retrospective; mid-week numbers mislead because demand for in-progress days is still arriving.
- Month-tab focus is "how's this month going?" — mid-month reads are legitimate per spec line 933, with a "Month in progress" footnote.

**Current-period footnotes:** "Week in progress — figures will settle Sunday." (Week tab) and "Month in progress — figures update daily." (Month tab) render when `isCurrentWeek` / `isCurrentMonth` returns true. Pure helpers in `dateRange.ts`.

**Cross-references:** `src/features/reports/dateRange.ts`, `src/features/reports/WeekTab.tsx`, `src/features/reports/MonthTab.tsx`, `src/features/reports/TrendsTab.tsx`.

---

## ADR-35: Client-side aggregation in `reports/api.ts`; no Postgres RPCs in Sprint 8

**Context:** The Reports surface needs cross-table aggregations (calibration: products + production_plans + production_logs + order_items; channel breakdown: orders + customers + channels; per-product trends: 16 weeks of calibration). Options: (a) Postgres RPCs / views, (b) PostgREST embeds + JS group/sum.

**Decision:** Option (b), mirroring the `production/api.ts:getProductionThisWeek` pattern. Every aggregation function in `src/features/reports/api.ts` fetches the raw rows (often with a `select('a, b, related(...)')` embed) and groups/sums in TypeScript.

**Why:**
- v1 scale: ≤15 in-house products, ≤100 customers, ≤200 orders/month. Even the heaviest read (`getPerProductTrends` fetches 16 weeks × multiple supabase round-trips per week) lands well within Postgres + Supabase JS latency budgets.
- One source of truth for query shapes — same supabase client used everywhere; tests mock `@/lib/supabase` the same way.
- Migration path is clean: any single function can move to a Postgres RPC behind the same TS signature when a specific query starts feeling slow. ADR-35 itself names the most likely first candidate (per-product trends).

**Known performance cliffs (carry to Sprint 9 polish):**
- `getPerProductTrends` calls `getCalibrationRowsForWeek` 16× sequentially. At v1 scale (each call ~4 DB queries → ~64 round-trips per render), it's fine. If the Reports Trends tab starts feeling laggy after mom has used the app for ~6 months, materialize a `weekly_product_calibration` Postgres view + a `get_per_product_trends(today date)` RPC.
- `getCalibrationRowsForWeek` mirrors `getProductionThisWeek`'s pattern of fetching ALL `order_items` (no server-side date filter) and filtering by week in JS. At v1 scale, the unfiltered fetch is ~few KB. Migrate to indexed server-side `orders.target_fulfilment_date` filtering once order volume crosses ~5–10k.

**Cross-references:** `src/features/reports/api.ts` (all aggregation reads), `src/features/production/api.ts:getProductionThisWeek` (reference pattern).

---

## ADR-36: All charts hand-written SVG; no chart library dependency

**Context:** Sprint 8 needs PipMarkerBar (calibration rows), LineChart (Trends hero), Sparkline (per-product), StackedBar (channel breakdown). Options: (a) add a library like `recharts` or `victory`, (b) write SVG by hand.

**Decision:** Option (b). All four components live in `src/features/reports/charts/` and `src/features/reports/PipMarkerBar.tsx`, each ~50–100 lines of pure `<svg>` markup + Tailwind utility classes. StackedBar uses HTML+CSS flex (no SVG needed) since segment widths are simple proportional bars.

**Why no library:**
- Mom's PWA: every extra dep bloats the bundle that loads over her Pune-grade mobile data.
- v1 chart needs are minimal — no axes, no zoom, no animations, no tooltips. A 50-line LineChart that draws a polyline with gap handling beats a 200-line component that wraps `recharts`'s 100kB.
- Tailwind already handles colors via `fill-*` / `stroke-*` utilities; no need to plumb a theme through a library.
- LineChart's `onPointClick` callback is one event handler; libraries make this trivial but so does plain `<circle onClick>`.

**Known coverage limitations (acceptable for v1):**
- LineChart has no tooltip on hover (mom uses a touch device; tooltips don't translate). Tapping a point performs the navigation directly.
- StackedBar has no animation on data change. Mom doesn't navigate fast enough between months to benefit from one.

**Cross-references:** `src/features/reports/PipMarkerBar.tsx`, `src/features/reports/charts/LineChart.tsx`, `src/features/reports/charts/Sparkline.tsx`, `src/features/reports/charts/StackedBar.tsx`.

---

## ADR-37: Pure-function calibration math + 27 invariants; weekly accuracy excludes retrospectively-set plans

**Context:** The accuracy headline on Trends and the variance pills on Week need consistent definitions. Spec §9.1 and §9.3 spell out the formulas — they need to live in one place, not inlined into UI components.

**Decision:** Pure helpers in `src/features/reports/calibration.ts`:
- `calibrationVariance(row)`, `calibrationVariancePct(row)`, `rowAccuracyPct(row)`.
- `weeklyAccuracyPct(rows)`: volume-weighted average of per-row accuracy. Weight = `max(demand, plan)`. **Excludes rows with `plan_set_retrospectively=true`** per spec line 1083 — these represent plans mom set AFTER the week ended, which don't measure her real-time eyeballing skill.
- `visibleCalibrationRows`, `sortByVarianceDescending` for UI ordering.

27 invariants in `calibration.test.ts` covering: per-row formulas, null returns, zero-handling, weighted aggregation, retrospective exclusion, sort tiebreaks.

**Why pure + heavily tested:**
- These are the only formulas in the codebase that depend on mom understanding the math. A bug here would silently mislead her about whether her planning is improving — the inverse of the calibration loop's intent.
- 27 tests is the actual correctness gate for the math; the browser smoke validates render paths, not math (see ADR-39).

**Cross-references:** `src/features/reports/calibration.ts`, `src/features/reports/calibration.test.ts`.

---

## ADR-38: Per-product trends sorted by lifetime volume (advisor catch); empty-state offers planning link

**Context:** Spec §9.3 line 1091: *"top 5 by lifetime volume shown by default; `see all →` expands to all."* The T8 implementer initially shipped products in name-ASC order (the order `getPerProductTrends` returned them). Mom would have seen the wrong "top 5."

**Decision:** `getPerProductTrends` now performs a one-extra-query lifetime-volume lookup against `order_items` (sum `qty` per `product_id`), then sorts the returned `PerProductTrend[]` by lifetime volume DESC with product-name as the tiebreak. The `TrendsTab` UI slices the first 5 for the default view and the `see all (N) →` toggle expands to the full list.

**Why one extra query is fine:** at v1 scale `order_items` is small (~few hundred rows after a year of operation). The data is fetched once per Trends render; ~tens of milliseconds.

**Empty-state link (separate advisor catch):** Spec §9.3 lines 1121-1122 distinguish "<2 weeks of plan data" (encouragement copy) from "all gaps in the 8-week window" (link to `/production/plan-this-week`). Without a separate API call to know whether the user has ANY plans EVER, the implementation can't perfectly distinguish the two. **The chosen empty-state copy combines both messages**: *"No plans saved in the last 8 weeks yet. Trends become useful after a few weeks of planning."* with a `Plan this week →` link to `/production/plan-this-week`. This is friendlier than the spec's split (mom doesn't need to know whether she's a new user or just a delinquent planner) AND gives her the forward path in both cases.

**Cross-references:** `src/features/reports/api.ts:getPerProductTrends`, `src/features/reports/TrendsTab.tsx`.

---

## Browser verification

`scripts/verify-reports-flow.py` is the Sprint 8 smoke. Headless Playwright covering:
1. Login as mom
2. `/reports` renders with 3 tabs; Week tab default
3. Switch to Month → URL contains `?tab=month`, label shows current month
4. Switch to Trends → URL contains `?tab=trends`, either empty-state copy OR `<svg>` present
5. Deep-link `/reports?tab=week&week=2026-05-04` → period selector reflects that week
6. No console errors

Screenshots: `sprint8-{week-default, month, trends, week-deeplink}.png` (not committed; consistent with prior sprints).

**Known smoke limitation (per advisor):** The smoke validates render paths (each tab renders the expected layout) but not math correctness — the smoke account has sparse/empty data, so aggregations frequently produce empty-state copy. The 27 unit tests in `calibration.test.ts` plus the 32 tests in `dateRange.test.ts` are the actual correctness gate. Sprint 9 polish could add a fixtures-backed smoke that pre-seeds known calibration data and verifies the rendered numbers against expected values.

---

## Post-implementation fixes

Two advisor catches addressed before push (both committed together as `fa28c5a`):

1. **Per-product trends top 5 was sorted by product name, not lifetime volume.** (ADR-38 above.)
2. **TrendsTab empty state had no forward-path link.** (ADR-38 above — added the `Plan this week →` link.)

One advisor flag accepted as a non-blocker (already documented above):
- The third concern from advisor was whether `getCalibrationRowsForWeek` excludes aggregated products. Verified: line 70 of `api.ts` has `.eq('is_aggregated', false)`. Same filter applied in `getPerProductTrends`. Calibration math is safe.

---

## Open items carrying into Sprint 9+

- **Algorithm event-uplift consumption** (v1-spec §11). Sprint 7 ships events data; Reports Trends shows past-event retrospectives. The algorithm in `production/algorithm.ts` still doesn't read `event_demand`. Sprint 9 polish should wire this in once mom has a real festival on the calendar.
- **`reactivated_this_month` approximation.** Uses `customers.last_ordered_at` denorm to detect "ordered in this month". A customer who ordered in April AND May would only count as reactivated for May. Spec line 1038-1042's "precise definition" requires more bookkeeping (a customer-events log) — explicit v2.
- **Channel-mix segment ordering** (spec line 1029): "system rows in seed order, custom in creation order." Sprint 8's `channelColor()` doesn't enforce ordering. Defer to Sprint 9 polish — visually low impact at v1 scale.
- **Month-tab variance headline formula reading.** Sprint 8 reads spec line 1006 as `Σ|demand-plan| / Σ max(demand,plan)` (row-level weighting). The spec phrases it as "volume-weighted average of absolute per-week-per-product variance" — same formula, different sentence. Documented as the accepted reading.
- **`getPerProductTrends` performance.** 16 weeks × ~4 DB queries each = ~64 round-trips per Trends render. v1 scale tolerates. First migrate-to-RPC candidate.
- **CSV export.** Explicit v2 per spec §9.
- **Pull-to-refresh on Reports.** Spec calls it "optional"; deferred to Sprint 9 polish.
- **Sparkline / sparkline-detail drill-in.** Sprint 8 navigates sparkline rows to `/products/:id`. Full per-product detail view (full history beyond 8 weeks) is v2.
- **Smoke fixtures.** Sprint 8 smoke validates renders but not math. Sprint 9 polish could pre-seed known fixtures and verify the rendered numbers (e.g., assert `84%` accuracy when fed a controlled plan+demand dataset).
