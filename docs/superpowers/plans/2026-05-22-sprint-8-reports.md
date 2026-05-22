# Sprint 8 — Reports (Week / Month / Trends) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the §9 Reports surface with three tabs (Week / Month / Trends) backed by client-side aggregation against Postgres, raw-SVG charts (no chart library), and asymmetric default periods (Week → last completed, Month → current).

**Architecture:**
- Single Reports page at `/reports` with `?tab=week|month|trends` URL state (mirrors Sprint 4's `?filter=` pattern). Each tab is its own component; the page is a shell + tab strip + tab body.
- Client-side aggregation in `src/features/reports/api.ts` mirroring the `production/api.ts:getProductionThisWeek` pattern — fetch raw rows, group/sum in TypeScript. v1 scale (≤15 products, ≤100 customers, ≤200 orders/month) tolerates this comfortably; no RPCs.
- Pure math in `src/features/reports/calibration.ts` (per-product per-week variance, weighted accuracy %, etc.). Unit tested.
- Pure-SVG chart components in `src/features/reports/charts/` (LineChart, Sparkline, PipMarkerBar) — no `recharts`/`d3` dependency.
- No mutations on Reports — entirely read-only per spec.

**Tech Stack:** Vite + React 18 + TypeScript strict + Tailwind + Supabase JS + Vitest/RTL. Raw `<svg>` markup for all charts.

**Cross-references locked before write:**
- `docs/v1-spec.md` §9 (Reports surface, asymmetric defaults, all three tabs, every section's definition).
- `docs/DESIGN_HANDOFF.md` §3 — screenshot 14 (Week pip-marker variant B) and 15 (Trends redesigned: big accuracy %, rising line up-is-better, per-product sparklines with delta + biggest miss). §4 design tokens. §5 hard requirement #11 (refetch on tab focus).
- Existing files of relevance: `src/features/production/api.ts:getProductionThisWeek` (the aggregation pattern), `src/features/reports/ReportsPage.tsx` (current stub), `src/lib/week.ts` (`weekStartFor`), `src/lib/utils.ts` (`todayInTz`), `src/features/customers/quiet.ts` (for the "reactivated" + "currently quiet" Month-tab definitions).

**Out of scope (explicit deferrals):**
- Algorithm event-uplift consumption is Sprint 9 polish (events data exists, algorithm doesn't yet read it; Trends tab's past-event retrospective uses `committed_expected_qty` directly from `event_demand`, which already works).
- CSV export — explicit v2 per spec §9.
- Per-product detail drill-in from sparklines — Trends tab links sparkline → Week tab with that week selected; full per-product detail screen is v2.

---

## File structure

### New files

```
src/features/reports/api.ts                                  # all aggregation reads
src/features/reports/api.test.ts                             # ~6 invariants
src/features/reports/calibration.ts                          # pure math
src/features/reports/calibration.test.ts                     # ~10 invariants
src/features/reports/dateRange.ts                            # weekRange/monthRange helpers
src/features/reports/dateRange.test.ts                       # ~6 invariants
src/features/reports/WeekTab.tsx
src/features/reports/MonthTab.tsx
src/features/reports/TrendsTab.tsx
src/features/reports/ReportSection.tsx                       # shared card wrapper
src/features/reports/PipMarkerBar.tsx                        # Week calibration row visual
src/features/reports/charts/LineChart.tsx                    # Trends hero
src/features/reports/charts/Sparkline.tsx                    # Per-product trends
src/features/reports/charts/StackedBar.tsx                   # Month channel breakdown + Trends channel mix
scripts/verify-reports-flow.py                               # headless smoke
```

### Modified files

```
src/features/reports/ReportsPage.tsx          # full implementation (was stub)
```

---

### Task 1: Pure date-range helpers

**Files:**
- Create: `src/features/reports/dateRange.ts`
- Create: `src/features/reports/dateRange.test.ts`

Pure helpers for the period selectors. No DB, no React.

**API:**

```ts
// All inputs/outputs YYYY-MM-DD (string-compare-safe) unless noted.
export function weekRange(weekStart: string): { start: string; endExclusive: string };
// weekRange('2026-05-18') → { start: '2026-05-18', endExclusive: '2026-05-25' }

export function previousWeekStart(weekStart: string): string;
export function nextWeekStart(weekStart: string): string;

export function lastCompletedWeekStart(today: string): string;
// today='2026-05-22' (Fri) → '2026-05-11' (Mon of the prior week — week that ended Sun 17 May)

export function monthRange(yyyymm: string): { start: string; endExclusive: string };
// monthRange('2026-05') → { start: '2026-05-01', endExclusive: '2026-06-01' }

export function previousMonth(yyyymm: string): string; // '2026-05' → '2026-04'
export function nextMonth(yyyymm: string): string;     // '2026-05' → '2026-06'
export function currentMonth(today: string): string;   // today='2026-05-22' → '2026-05'

export function formatWeekLabel(weekStart: string): string;
// '2026-05-18' → 'Mon 18 – Sun 24 May'

export function formatMonthLabel(yyyymm: string): string;
// '2026-05' → 'May 2026'

export function isCurrentWeek(weekStart: string, today: string): boolean;
export function isCurrentMonth(yyyymm: string, today: string): boolean;
```

- [ ] **Step 1: Write test file (RED)**

```ts
import { describe, it, expect } from 'vitest';
import {
  weekRange, previousWeekStart, nextWeekStart, lastCompletedWeekStart,
  monthRange, previousMonth, nextMonth, currentMonth,
  formatWeekLabel, formatMonthLabel, isCurrentWeek, isCurrentMonth,
} from './dateRange';

describe('weekRange', () => {
  it('returns start + endExclusive 7 days later', () => {
    expect(weekRange('2026-05-18')).toEqual({ start: '2026-05-18', endExclusive: '2026-05-25' });
  });
});

describe('lastCompletedWeekStart', () => {
  it('Friday 22 May → Mon 11 May (prior full week)', () => {
    expect(lastCompletedWeekStart('2026-05-22')).toBe('2026-05-11');
  });
  it('Monday 18 May → Mon 11 May (current week is not yet complete)', () => {
    expect(lastCompletedWeekStart('2026-05-18')).toBe('2026-05-11');
  });
  it('Sunday 24 May → Mon 11 May (Sunday is the last day of the not-yet-complete week)', () => {
    expect(lastCompletedWeekStart('2026-05-24')).toBe('2026-05-11');
  });
});

describe('previous/nextWeekStart', () => {
  it('shifts ±7 days', () => {
    expect(previousWeekStart('2026-05-18')).toBe('2026-05-11');
    expect(nextWeekStart('2026-05-18')).toBe('2026-05-25');
  });
});

describe('monthRange', () => {
  it('full month boundaries', () => {
    expect(monthRange('2026-05')).toEqual({ start: '2026-05-01', endExclusive: '2026-06-01' });
    expect(monthRange('2026-12')).toEqual({ start: '2026-12-01', endExclusive: '2027-01-01' });
  });
});

describe('previous/nextMonth', () => {
  it('December rolls into January of next year', () => {
    expect(nextMonth('2026-12')).toBe('2027-01');
    expect(previousMonth('2026-01')).toBe('2025-12');
  });
});

describe('currentMonth', () => {
  it('extracts YYYY-MM from todayInTz', () => {
    expect(currentMonth('2026-05-22')).toBe('2026-05');
  });
});

describe('formatWeekLabel', () => {
  it('formats Mon 18 – Sun 24 May', () => {
    expect(formatWeekLabel('2026-05-18')).toBe('Mon 18 – Sun 24 May');
  });
});

describe('formatMonthLabel', () => {
  it('formats May 2026', () => {
    expect(formatMonthLabel('2026-05')).toBe('May 2026');
  });
});

describe('isCurrentWeek/isCurrentMonth', () => {
  it('today=2026-05-22, weekStart=2026-05-18 → current', () => {
    expect(isCurrentWeek('2026-05-18', '2026-05-22')).toBe(true);
    expect(isCurrentWeek('2026-05-11', '2026-05-22')).toBe(false);
  });
  it('today=2026-05-22 → month=2026-05 is current', () => {
    expect(isCurrentMonth('2026-05', '2026-05-22')).toBe(true);
    expect(isCurrentMonth('2026-04', '2026-05-22')).toBe(false);
  });
});
```

- [ ] **Step 2: Implement** — use the existing `src/lib/week.ts:weekStartFor` mental model for Monday math; arithmetic on `new Date(`${ymd}T00:00:00Z`).getTime() + N*86400000`.

- [ ] **Step 3: Run tests** — all 13+ pass.

- [ ] **Step 4: Commit**

```bash
git add src/features/reports/dateRange.ts src/features/reports/dateRange.test.ts
git commit -m "Sprint 8 T1: pure date-range helpers (week/month range, prev/next, labels)"
```

---

### Task 2: Pure calibration math

**Files:**
- Create: `src/features/reports/calibration.ts`
- Create: `src/features/reports/calibration.test.ts`

**Spec references:** v1-spec §9.1 Calibration card row math; §9.3 Plan accuracy definition.

**API:**

```ts
export type CalibrationRow = {
  product_id: string;
  product_name: string;
  unit: string;
  plan: number | null;        // original_planned_qty for the week
  made: number;               // SUM(production_logs.qty)
  demand: number;             // SUM(order_items.qty for orders with target_fulfilment_date in week)
  plan_set_retrospectively: boolean; // entered_at > week_end_iso
};

/** Returns (demand - plan) when plan != null, else null. */
export function calibrationVariance(row: { plan: number | null; demand: number }): number | null;

/** Returns variance % rounded to integer when plan > 0, else null. */
export function calibrationVariancePct(row: { plan: number | null; demand: number }): number | null;

/** Per-row accuracy %: 100 - |demand - plan| / max(demand, plan) * 100.
 *  Returns null when plan === null OR (plan === 0 AND demand === 0).
 *  Clamps to [0, 100]. */
export function rowAccuracyPct(row: { plan: number | null; demand: number }): number | null;

/** Volume-weighted weekly accuracy %. Weight = max(demand, plan) per row.
 *  Ignores rows where plan_set_retrospectively=true (per spec line 1083).
 *  Returns null when no eligible rows. */
export function weeklyAccuracyPct(rows: CalibrationRow[]): number | null;

/** Filters out rows where Plan=null AND Made=0 AND Demand=0 (per spec line 964) */
export function visibleCalibrationRows(rows: CalibrationRow[]): CalibrationRow[];

/** Sort by |variance| DESC (biggest misses first). Rows with null plan are sorted last. */
export function sortByVarianceDescending(rows: CalibrationRow[]): CalibrationRow[];
```

Tests (≥10 invariants): plan=5/demand=6 → variance=+1, varPct=+20, accuracy=83 (5/6); plan=null → variance=null, accuracy=null; plan=10/demand=0 → variance=-10, varPct=-100, accuracy=0; plan=5/demand=5 → variance=0, accuracy=100; weighted-mean across rows; retrospective rows excluded from accuracy; visibleCalibrationRows hides zeros; sort by abs variance descending.

- [ ] **Step 1: tests** (RED)
- [ ] **Step 2: implement**
- [ ] **Step 3: run tests** → all green
- [ ] **Step 4: commit**

```bash
git add src/features/reports/calibration.ts src/features/reports/calibration.test.ts
git commit -m "Sprint 8 T2: pure calibration math (variance, accuracy, sort/filter)"
```

---

### Task 3: Reports API — aggregation reads

**Files:**
- Create: `src/features/reports/api.ts`
- Create: `src/features/reports/api.test.ts`

**Spec references:** v1-spec §9 throughout. Mirror the `production/api.ts:getProductionThisWeek` pattern — fetch raw rows from Postgres, group/sum in TypeScript.

**API:**

```ts
import type { CalibrationRow } from './calibration';

// ---------- Week tab reads ----------
export async function getCalibrationRowsForWeek(weekStart: string): Promise<CalibrationRow[]>;
// JOIN products + production_plans + production_logs (made_on in week) + order_items->orders
// (target_fulfilment_date in week OR (target null AND ordered_at in week)). Aggregated products excluded.

export type OrderSummary = {
  total_orders: number;
  total_value: number;
  fulfilled_count: number;
  outstanding_value: number;
  outstanding_count: number;
};
export async function getOrderSummary(start: string, endExclusive: string): Promise<OrderSummary>;
// Orders with ordered_at >= start AND < endExclusive.
// total_value: sum order_items.qty * unit_price.
// outstanding: where payment_status in ('unpaid', 'partial').

export type ChannelSplitRow = { channel_name: string; count: number };
export async function getNewCustomersByChannel(start: string, endExclusive: string): Promise<ChannelSplitRow[]>;
// customers.created_at in range; group by channel_id; resolve channel_name via channels table.

export type TopProductRow = { product_id: string; name: string; unit: string; qty: number; value: number };
export async function getTopProducts(start: string, endExclusive: string, limit: number): Promise<TopProductRow[]>;
// SUM order_items.qty + value for orders with ordered_at in range, group by product_id, ORDER BY qty DESC LIMIT.

export type TopCustomerRow = { customer_id: string; name: string; channel_name: string; order_count: number; value: number };
export async function getTopCustomers(start: string, endExclusive: string, limit: number): Promise<TopCustomerRow[]>;
// Same window, group by customer_id, ORDER BY value DESC LIMIT.

export type ComplaintListItem = {
  id: string;
  order_id: string;
  customer_name: string;
  kind: string;
  description: string;
  reported_at: string;
  resolved_at: string | null;
};
export async function getComplaintsInRange(start: string, endExclusive: string): Promise<ComplaintListItem[]>;

// ---------- Month tab reads ----------
// All Week-tab functions reusable with monthRange. Plus:
export type ChannelBreakdownRow = { channel_name: string; count: number; value: number };
export async function getChannelBreakdown(start: string, endExclusive: string): Promise<ChannelBreakdownRow[]>;
// Orders in range grouped by customer.channel_id → channel_name.

export type CustomerBaseHealth = {
  new_this_month: number;
  currently_quiet: number;
  reactivated_this_month: number;
};
export async function getCustomerBaseHealth(monthYyyymm: string, today: string): Promise<CustomerBaseHealth>;
// new_this_month: count customers.created_at in monthRange
// currently_quiet: count active customers where isQuiet({...}, today).isQuiet — uses src/features/customers/quiet.ts
// reactivated_this_month: customer who (a) met quiet threshold at some point in the prior 30d from today AND (b) ordered in this month.
//   "met quiet threshold in prior 30d": MAX(last_ordered_at, last_contacted_at, created_at) was <= today - 30d AT THE START OF THE 30D WINDOW.
//   Approximate: customer.last_ordered_at (current denorm) is within monthRange AND prior_anchor (max of last_contacted_at OR created_at, excluding last_ordered_at) is <= today - threshold. See spec line 1038-1042 — "Reactivated" precise definition.

export type ExhibitionRepeatRate = {
  total_acquired: number;
  repeated: number;
  pct: number;
  show: boolean; // false when total_acquired < 5
};
export async function getExhibitionRepeatRate(today: string): Promise<ExhibitionRepeatRate>;
// Rolling 90 days ending at today. Acquired = customers with channel_id=Exhibition + created_at in last 90d.
// Repeated = those who also have orders.ordered_at > created_at (i.e., a second order).

// ---------- Trends tab reads ----------
export type PerWeekAccuracy = { weekStart: string; accuracy: number | null };
export async function getPerWeekAccuracyLastN(weeksBack: number, today: string): Promise<PerWeekAccuracy[]>;
// For each of the N most recent COMPLETED weeks, compute weeklyAccuracyPct(getCalibrationRowsForWeek).
// Returns null for weeks where no plan was saved.

export type PerProductTrend = {
  product_id: string;
  name: string;
  unit: string;
  sparkline: (number | null)[]; // per-week accuracy %, last 8 weeks
  delta: number | null;          // vs prior 8 weeks
  biggest_miss: { weekStart: string; variancePct: number } | null;
};
export async function getPerProductTrends(today: string): Promise<PerProductTrend[]>;
// Per active in-house product: 8 weeks of per-product accuracy + delta vs prior 8w + biggest miss week.

export type MonthlyChannelMix = { yyyymm: string; channels: ChannelBreakdownRow[]; totalValue: number };
export async function getMonthlyChannelMixLastN(months: number, today: string): Promise<MonthlyChannelMix[]>;

export type PastEventRetrospective = {
  event_id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  expected_total: number;
  actual_total: number;
  variance_qty: number;
  variance_pct: number;
};
export async function getPastEventRetrospectives(): Promise<PastEventRetrospective[]>;
// Events with ends_on < todayInTz(). For each:
//   expected_total = SUM(committed_expected_qty) over event_demand
//   actual_total = SUM(order_items.qty) for in-house products where order.target_fulfilment_date in
//                  [event.starts_on - lead_weeks*7d, event.ends_on]
```

Tests (~6 invariants): mock supabase; assert each function shapes results correctly. Don't test all aggregation correctness in unit tests — the smoke covers end-to-end.

- [ ] **Step 1: tests (mock supabase)**
- [ ] **Step 2: implement all functions**
- [ ] **Step 3: run tests**
- [ ] **Step 4: commit**

```bash
git add src/features/reports/api.ts src/features/reports/api.test.ts
git commit -m "Sprint 8 T3: reports aggregation reads (week/month/trends, client-side)"
```

---

### Task 4: Raw-SVG chart primitives

**Files:**
- Create: `src/features/reports/PipMarkerBar.tsx`
- Create: `src/features/reports/charts/LineChart.tsx`
- Create: `src/features/reports/charts/Sparkline.tsx`
- Create: `src/features/reports/charts/StackedBar.tsx`

Each component takes a small props interface and renders a `<svg>` block — no `d3`, no `recharts`.

**PipMarkerBar** (Week tab calibration row visual):

```tsx
type Props = {
  plan: number | null;
  made: number;
  demand: number;
  max?: number; // defaults to max(plan ?? 0, demand, made, 1)
};
// Renders an SVG width=full height=~24px:
// - Track (bg-paper-muted full-width thin bar)
// - Fill bar (bg-brand-orange, width proportional to made/max)
// - Dashed vertical tick at plan/max position (only if plan != null)
// - Solid vertical tick at demand/max position
// Legend rendered ONCE by parent below the section.
```

**LineChart** (Trends hero, 8 weeks):

```tsx
type Props = {
  points: ({ x: string; y: number } | { x: string; y: null })[]; // null = gap
  height?: number;     // default 120
  yMin?: number;       // default 0
  yMax?: number;       // default 100
  ariaLabel?: string;
  onPointClick?: (x: string) => void;
};
// Renders SVG with:
// - Y-axis gridlines at 0/50/100
// - Polyline connecting non-null points (gaps for nulls — split into multiple polylines or use SVG path with M between gaps)
// - Circle markers at each non-null point; clickable if onPointClick provided
// - x-axis labels at first/last point (e.g., "May 4" / "May 18")
```

**Sparkline** (Per-product trends, tiny inline):

```tsx
type Props = {
  values: (number | null)[]; // 8 entries
  width?: number;  // default 80
  height?: number; // default 24
};
// Same as LineChart but no axes, no labels, single stroke. Gap-aware.
```

**StackedBar** (Month channel breakdown + Trends channel mix):

```tsx
type Segment = { label: string; value: number; color: string };
type Props = {
  segments: Segment[];
  height?: number;     // default 32
  showLabels?: boolean;
};
// Horizontal stacked bar. Segments rendered left-to-right with their proportional widths.
// Labels (label · ₹value) below each segment if showLabels.
```

- [ ] **Step 1: implement 4 components**
- [ ] **Step 2: write tiny snapshot/structure tests** (e.g., LineChart with all-null points renders the empty-state message; PipMarkerBar with plan=null doesn't render the dashed tick)
- [ ] **Step 3: commit**

```bash
git add src/features/reports/PipMarkerBar.tsx src/features/reports/charts/
git commit -m "Sprint 8 T4: raw-SVG chart primitives (PipMarkerBar, LineChart, Sparkline, StackedBar)"
```

---

### Task 5: Reports route + tab strip

**Files:**
- Modify: `src/features/reports/ReportsPage.tsx`
- Create: `src/features/reports/ReportSection.tsx`

ReportsPage handles:
- URL state via `useSearchParams`. `?tab=week|month|trends` (default `week`).
- Tab strip styled per design tokens (border-bottom active indicator).
- Renders the matching tab body component (WeekTab / MonthTab / TrendsTab).

ReportSection is a small reusable card wrapper:

```tsx
type Props = { title: string; children: React.ReactNode; hidden?: boolean };
// Renders <section> with a uppercase label header + the children inside a rounded-card.
// hidden=true returns null (used for §9.1.6 "Complaints this week — hidden when 0").
```

- [ ] **Step 1: implement**
- [ ] **Step 2: 2-3 RTL tests** asserting `?tab=` routing
- [ ] **Step 3: commit**

```bash
git add src/features/reports/ReportsPage.tsx src/features/reports/ReportSection.tsx
git commit -m "Sprint 8 T5: Reports route shell with URL-driven Week/Month/Trends tabs"
```

---

### Task 6: Week tab

**File:** Create `src/features/reports/WeekTab.tsx`.

**Spec references:** v1-spec §9.1 (Week tab — calibration card, order summary, new customers, top products, top customers, complaints).

Layout top-to-bottom (mirror spec):
1. **Period selector** (top): `Mon 18 – Sun 24 May (last week)` with prev/next arrows. Default = `lastCompletedWeekStart(todayInTz())`. When current week selected, append footnote *"Week in progress — figures will settle Sunday."*
2. **Calibration card (hero)** — `getCalibrationRowsForWeek` → `visibleCalibrationRows` → `sortByVarianceDescending`. Each row: product name + unit, PipMarkerBar, numeric line `Plan {plan ?? '—'} · Made {made} · Demand {demand}`, variance pill `+{n} (+{p}%)` colored per direction. Legend printed once below the section.
3. **Order summary** — 4-tile grid: total orders, total value, fulfilment rate, outstanding.
4. **New customers this week** — single line per-channel breakdown.
5. **Top products this week** — top 5.
6. **Top customers this week** — top 5.
7. **Complaints this week** — hidden when 0.

Variance pill formula: `+{demand-plan} (+{round((demand-plan)/max(plan,1)*100)}%)`, sign on both. Color:
- Over-planned (negative): `text-status-warn-fg`.
- Under-planned (positive): `text-status-danger-fg`.
- Exact (0): `text-ink-500`.

Empty states per spec lines 994-998.

- [ ] **Step 1: implement WeekTab**
- [ ] **Step 2: 2 RTL tests** — period selector renders default last-completed; calibration empty-state copy renders when no data.
- [ ] **Step 3: commit**

```bash
git add src/features/reports/WeekTab.tsx
git commit -m "Sprint 8 T6: Week tab (calibration card hero + summary + top-N + complaints)"
```

---

### Task 7: Month tab

**File:** Create `src/features/reports/MonthTab.tsx`.

**Spec references:** v1-spec §9.2.

Layout top-to-bottom:
1. **Period selector** (top): `May 2026` with prev/next arrows. Default = `currentMonth(today)`. When current month selected, footnote *"Month in progress — figures update daily."*
2. **Calibration summary (hero)** — headline `Plan vs demand variance: ±X%`. Below: per-product monthly aggregate table (Plan/Made/Demand sums + variance), sorted by absolute variance descending.
3. **Order summary with comparison** — 4-tile grid + per-tile comparison line vs prior month.
4. **Channel breakdown** — horizontal `StackedBar` of orders by channel + sub-line "N customers from {channel} this month".
5. **Customer base health** — three numbers in a row (new / currently quiet / reactivated).
6. **Exhibition→repeat conversion** — single line. Hidden when sample < 5 (spec).
7. **Top products this month** — top 10.
8. **Top customers this month** — top 10.
9. **Complaints summary** — line + list.

Use the volume-weighted accuracy formula from `calibration.ts`.

- [ ] **Step 1: implement MonthTab**
- [ ] **Step 2: 2 RTL tests** — period selector default; exhibition rate hidden when < 5
- [ ] **Step 3: commit**

```bash
git add src/features/reports/MonthTab.tsx
git commit -m "Sprint 8 T7: Month tab (calibration hero + comparison + channel + health + complaints)"
```

---

### Task 8: Trends tab

**File:** Create `src/features/reports/TrendsTab.tsx`.

**Spec references:** v1-spec §9.3.

Layout top-to-bottom:
1. **Plan accuracy (hero)** — `getPerWeekAccuracyLastN(8, today)` → big display number = average of non-null entries. Caption beneath: `Your plans matched demand X% on average over the last 8 weeks.` Then `<LineChart>` with the per-week points (gaps for nulls). Below chart: `N of last 8 weeks planned.` Tap on a non-null point → `navigate('/reports?tab=week&week=YYYY-MM-DD')` (WeekTab reads `?week=` URL param to override default).
2. **Per-product trends** — `getPerProductTrends(today)` → top-5 by lifetime volume default + `see all →` to expand. Per row: name + unit, `<Sparkline>`, delta indicator, biggest-miss caption.
3. **Channel mix trend** — `getMonthlyChannelMixLastN(6, today)` → per-month stacked bar (6 bars). Total ₹ above each bar.
4. **Past event retrospectives** — `getPastEventRetrospectives()` → list, descending by ends_on. Each row links to `/events/:id`.

Empty states per spec lines 1118-1124.

- [ ] **Step 1: implement TrendsTab**
- [ ] **Step 2: 2 RTL tests** — empty state when no weeks have plans; row tap calls navigate
- [ ] **Step 3: WeekTab `?week=` override** — modify WeekTab to read `?week=YYYY-MM-DD` and use it as the default `weekStart` instead of `lastCompletedWeekStart(today)`.
- [ ] **Step 4: commit**

```bash
git add src/features/reports/TrendsTab.tsx src/features/reports/WeekTab.tsx
git commit -m "Sprint 8 T8: Trends tab (accuracy hero + sparklines + channel mix + past events) + WeekTab ?week= override"
```

---

### Task 9: Browser verify + sprint close

**Files:**
- Create: `scripts/verify-reports-flow.py`

Coverage:
1. Login as mom.
2. Navigate `/reports`. Assert default tab is Week.
3. Assert period selector shows `(last week)` or equivalent default; calibration card or empty-state copy renders.
4. Click Month tab; assert URL updates to `?tab=month` and Month layout renders (current month default).
5. Click Trends tab; assert URL updates to `?tab=trends`. Assert either "Trends become useful after a few weeks of planning" empty state OR a `<svg>` is present.
6. Navigate `/reports?tab=week&week=2026-05-11`. Assert period selector shows that week (not the default).
7. Take screenshots of all three tabs.

Then:
- Run `npm run typecheck` → exit 0.
- Run `npm test` → all green.
- Call `advisor()`.
- Address any blockers.
- Write `docs/decisions/2026-05-22-sprint-8-architecture-decisions.md` (ADRs 33+).
- Update CLAUDE.md + ENGINEERING_NOTES.md status lines.
- Commit + push.

---

## Self-review checklist

- [ ] No chart library imported — all `<svg>` is hand-written.
- [ ] URL state via `?tab=` and `?week=`/`?month=` for deep linking.
- [ ] Asymmetric defaults: Week → last completed; Month → current.
- [ ] Aggregated products excluded from all calibration math.
- [ ] Reactivated-this-month uses the §9.2 precise definition.
- [ ] No mutations anywhere on the Reports surface (read-only per spec).
- [ ] Browser verify + advisor before push (per memory `feedback_advisor_before_done.md`).

---

## Out of scope

- CSV export (v2).
- Per-product detail drill-in (v2; sparkline → Week-tab deep link is the v1 affordance).
- Pull-to-refresh (spec calls it "optional").
- Per-event lifetime trend charts beyond the past-events list (v2).
