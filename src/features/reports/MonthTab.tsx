/**
 * Month tab — Sprint 8 Task 7. Spec: docs/v1-spec.md §9.2.
 *
 * Sections (top-to-bottom):
 *   1. Period selector with [← May 2026 →] + in-progress footnote
 *   2. Calibration summary hero (aggregated across the month's weeks)
 *   3. Order summary 4-tile grid with vs-prior-month comparison lines
 *   4. Channel breakdown (StackedBar) + new-customers-by-channel sub-line
 *   5. Customer base health (3 numbers row)
 *   6. Exhibition → repeat conversion (single line, hidden when show=false)
 *   7. Top 10 products (qty)
 *   8. Top 10 customers (value)
 *   9. Complaints summary (counts + average resolution + list)
 *
 * Aggregation pattern mirrors WeekTab — fetch in parallel, render fall-through.
 */

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  monthRange,
  previousMonth,
  nextMonth,
  currentMonth,
  formatMonthLabel,
  isCurrentMonth,
} from './dateRange';
import { weekStartFor } from '@/lib/week';
import {
  getCalibrationRowsForWeek,
  getOrderSummary,
  getChannelBreakdown,
  getCustomerBaseHealth,
  getExhibitionRepeatRate,
  getTopProducts,
  getTopCustomers,
  getComplaintsInRange,
  getNewCustomersByChannel,
  type OrderSummary,
  type ChannelBreakdownRow,
  type CustomerBaseHealth,
  type ExhibitionRepeatRate,
  type TopProductRow,
  type TopCustomerRow,
  type ComplaintListItem,
  type ChannelSplitRow,
} from './api';
import { type CalibrationRow } from './calibration';
import { ReportSection } from './ReportSection';
import { StackedBar } from './charts/StackedBar';
import { todayInTz } from '@/lib/utils';
import { formatINR } from '@/features/orders/orderFormatters';

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Mondays (week-starts) whose Monday falls inside [start, endExclusive).
 * Some month weeks may straddle the boundary; we attribute by the Monday's
 * calendar date, matching the spec's "weeks of the month" reading.
 */
function weekStartsInMonth(start: string, endExclusive: string): string[] {
  // First Monday >= start.
  let cursor = weekStartFor(start);
  if (cursor < start) {
    // weekStartFor returns the Monday of the calendar week containing `start`,
    // which may be in the prior month. Advance to the next Monday.
    const ms = new Date(`${cursor}T12:00:00Z`).getTime();
    cursor = new Date(ms + 7 * DAY_MS).toISOString().slice(0, 10);
  }
  const out: string[] = [];
  while (cursor < endExclusive) {
    out.push(cursor);
    const ms = new Date(`${cursor}T12:00:00Z`).getTime();
    cursor = new Date(ms + 7 * DAY_MS).toISOString().slice(0, 10);
  }
  return out;
}

/** Volume-weighted absolute variance % across a flat list of rows. */
function absoluteVariancePct(rows: { plan: number | null; demand: number }[]): number | null {
  let totalWeight = 0;
  let weightedAbsDiff = 0;
  for (const r of rows) {
    if (r.plan === null) continue;
    const weight = Math.max(r.demand, r.plan);
    if (weight <= 0) continue;
    const diff = Math.abs(r.demand - r.plan);
    weightedAbsDiff += diff;
    totalWeight += weight;
  }
  if (totalWeight === 0) return null;
  return Math.round((weightedAbsDiff / totalWeight) * 100);
}

type MonthlyAggRow = {
  product_id: string;
  product_name: string;
  unit: string;
  plan: number | null; // null = no plan saved across any week
  made: number;
  demand: number;
};

/** Aggregate calibration rows across weeks, per product. */
function aggregateMonthly(rowsByWeek: CalibrationRow[][]): MonthlyAggRow[] {
  const acc = new Map<string, MonthlyAggRow>();
  for (const weekRows of rowsByWeek) {
    for (const r of weekRows) {
      const existing = acc.get(r.product_id);
      if (existing) {
        // Plan: sum of weeks that had a plan; null only if no week ever had one.
        if (r.plan !== null) {
          existing.plan = (existing.plan ?? 0) + r.plan;
        }
        existing.made += r.made;
        existing.demand += r.demand;
      } else {
        acc.set(r.product_id, {
          product_id: r.product_id,
          product_name: r.product_name,
          unit: r.unit,
          plan: r.plan,
          made: r.made,
          demand: r.demand,
        });
      }
    }
  }
  return Array.from(acc.values()).sort((a, b) => {
    const va = a.plan === null ? -Infinity : Math.abs(a.demand - a.plan);
    const vb = b.plan === null ? -Infinity : Math.abs(b.demand - b.plan);
    if (va !== vb) return vb - va;
    return a.product_name.localeCompare(b.product_name);
  });
}

/** Short prior-month label ("Apr") for comparison subtitles. */
function shortMonthLabel(yyyymm: string): string {
  const d = new Date(`${yyyymm}-01T12:00:00Z`);
  return new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'UTC' }).format(d);
}

/** Map a channel name to a hex color for StackedBar. */
function channelColor(name: string, index: number): string {
  const key = name.trim().toLowerCase();
  if (key === 'personal') return '#F4C56F'; // brand-mustard
  if (key === 'reseller') return '#D9591A'; // brand-orange
  if (key === 'exhibition') return '#4A2912'; // brand-brown
  const palette = ['#5A5048', '#FFF7C2']; // ink-700, sticky-yellow
  return palette[index % palette.length] ?? '#5A5048';
}

/** Percent change rounded to integer, or null when prior is zero. */
function pctChange(curr: number, prior: number): number | null {
  if (prior === 0) return null;
  return Math.round(((curr - prior) / prior) * 100);
}

/** Format a percent-change as an arrow + magnitude (or '—' when null). */
function fmtPct(diff: number | null, suffix: string): string {
  if (diff === null) return '—';
  if (diff === 0) return `= ${suffix}`;
  const arrow = diff > 0 ? '↑' : '↓';
  return `${arrow} ${Math.abs(diff)}% ${suffix}`;
}

/** Percentage-point change for fulfilment rate (curr - prior in percentage points). */
function ppChange(currPct: number, priorPct: number): number {
  return Math.round(currPct - priorPct);
}

function fmtPp(pp: number, suffix: string): string {
  if (pp === 0) return `= ${suffix}`;
  const arrow = pp > 0 ? '↑' : '↓';
  return `${arrow} ${Math.abs(pp)}pp ${suffix}`;
}

// ---------------------------------------------------------------------------
// Period selector
// ---------------------------------------------------------------------------

function PeriodSelector({
  yyyymm,
  setMonth,
}: {
  yyyymm: string;
  setMonth: (m: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setMonth(previousMonth(yyyymm))}
        aria-label="Previous month"
        className="h-9 w-9 rounded-btn-sm border border-ink-900/10 text-ink-700 hover:bg-paper-muted"
      >
        ←
      </button>
      <div className="flex-1 text-center text-subtitle text-ink-900">
        {formatMonthLabel(yyyymm)}
      </div>
      <button
        type="button"
        onClick={() => setMonth(nextMonth(yyyymm))}
        aria-label="Next month"
        className="h-9 w-9 rounded-btn-sm border border-ink-900/10 text-ink-700 hover:bg-paper-muted"
      >
        →
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tile (mirrors WeekTab pattern)
// ---------------------------------------------------------------------------

function Tile({
  label,
  value,
  comparison,
}: {
  label: string;
  value: string;
  comparison?: string;
}) {
  return (
    <div className="rounded-card border border-ink-900/10 bg-paper-elevated p-3 shadow-card">
      <div className="text-label uppercase text-ink-500">{label}</div>
      <div className="mt-1 text-title text-ink-900">{value}</div>
      {comparison !== undefined && (
        <div className="mt-1 text-body-sm text-ink-500">{comparison}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MonthTab
// ---------------------------------------------------------------------------

type State = {
  loading: boolean;
  yyyymm: string;
  calibRowsByWeek: CalibrationRow[][];
  summary: OrderSummary | null;
  priorSummary: OrderSummary | null;
  channels: ChannelBreakdownRow[];
  newByChannel: ChannelSplitRow[];
  health: CustomerBaseHealth | null;
  exhibition: ExhibitionRepeatRate | null;
  topProducts: TopProductRow[];
  topCustomers: TopCustomerRow[];
  complaints: ComplaintListItem[];
};

export function MonthTab() {
  const [params, setParams] = useSearchParams();
  const today = todayInTz();
  const initial = useMemo(() => {
    const fromUrl = params.get('month');
    if (fromUrl && /^\d{4}-\d{2}$/.test(fromUrl)) return fromUrl;
    return currentMonth(today);
  }, [params, today]);

  const [state, setState] = useState<State>({
    loading: true,
    yyyymm: initial,
    calibRowsByWeek: [],
    summary: null,
    priorSummary: null,
    channels: [],
    newByChannel: [],
    health: null,
    exhibition: null,
    topProducts: [],
    topCustomers: [],
    complaints: [],
  });

  function setMonth(next: string) {
    const sp = new URLSearchParams(params);
    if (next === currentMonth(today)) sp.delete('month');
    else sp.set('month', next);
    setParams(sp, { replace: true });
    setState((s) => ({ ...s, yyyymm: next, loading: true }));
  }

  useEffect(() => {
    let cancelled = false;
    const yyyymm = state.yyyymm;
    const { start, endExclusive } = monthRange(yyyymm);
    const priorYyyymm = previousMonth(yyyymm);
    const priorRange = monthRange(priorYyyymm);
    const weekStarts = weekStartsInMonth(start, endExclusive);

    async function run() {
      const [
        calibRowsByWeek,
        summary,
        priorSummary,
        channels,
        newByChannel,
        health,
        exhibition,
        topProducts,
        topCustomers,
        complaints,
      ] = await Promise.all([
        Promise.all(weekStarts.map((w) => getCalibrationRowsForWeek(w))),
        getOrderSummary(start, endExclusive),
        getOrderSummary(priorRange.start, priorRange.endExclusive),
        getChannelBreakdown(start, endExclusive),
        getNewCustomersByChannel(start, endExclusive),
        getCustomerBaseHealth(yyyymm, today),
        getExhibitionRepeatRate(today),
        getTopProducts(start, endExclusive, 10),
        getTopCustomers(start, endExclusive, 10),
        getComplaintsInRange(start, endExclusive),
      ]);
      if (cancelled) return;
      setState({
        loading: false,
        yyyymm,
        calibRowsByWeek,
        summary,
        priorSummary,
        channels,
        newByChannel,
        health,
        exhibition,
        topProducts,
        topCustomers,
        complaints,
      });
    }
    run().catch((err) => {
      if (cancelled) return;
      // eslint-disable-next-line no-console
      console.error('MonthTab load failed', err);
      setState((s) => ({ ...s, loading: false }));
    });
    return () => {
      cancelled = true;
    };
  }, [state.yyyymm, today]);

  const inProgress = isCurrentMonth(state.yyyymm, today);
  const monthLabel = formatMonthLabel(state.yyyymm);

  // Aggregated calibration rows + headline variance.
  const monthlyAgg = useMemo(
    () => aggregateMonthly(state.calibRowsByWeek),
    [state.calibRowsByWeek],
  );
  const headlineVariance = useMemo(() => {
    const flat = state.calibRowsByWeek.flat();
    return absoluteVariancePct(flat);
  }, [state.calibRowsByWeek]);

  // Empty-state decision: this month has zero orders.
  const monthHasOrders = (state.summary?.total_orders ?? 0) > 0;
  const priorHasOrders = (state.priorSummary?.total_orders ?? 0) > 0;
  const firstEverEmpty =
    !state.loading && !monthHasOrders && !priorHasOrders && monthlyAgg.length === 0;

  if (state.loading) {
    return (
      <div>
        <PeriodSelector yyyymm={state.yyyymm} setMonth={setMonth} />
        <p className="mt-6 text-body-sm text-ink-500">Loading…</p>
      </div>
    );
  }

  if (firstEverEmpty) {
    return (
      <div>
        <PeriodSelector yyyymm={state.yyyymm} setMonth={setMonth} />
        <p className="mt-6 text-body-sm text-ink-500">
          Reports become useful after a week of orders.
        </p>
      </div>
    );
  }

  if (!monthHasOrders) {
    return (
      <div>
        <PeriodSelector yyyymm={state.yyyymm} setMonth={setMonth} />
        <p className="mt-6 text-body-sm text-ink-500">No activity in {monthLabel}.</p>
      </div>
    );
  }

  // Section 3: comparison data
  const summary = state.summary!;
  const prior = state.priorSummary;
  const showComparison = prior !== null && prior.total_orders > 0;
  const priorLabel = shortMonthLabel(previousMonth(state.yyyymm));

  const fulfilmentPct =
    summary.total_orders > 0
      ? Math.round((summary.fulfilled_count / summary.total_orders) * 100)
      : 0;
  const priorFulfilmentPct =
    prior && prior.total_orders > 0
      ? Math.round((prior.fulfilled_count / prior.total_orders) * 100)
      : 0;

  return (
    <div>
      <PeriodSelector yyyymm={state.yyyymm} setMonth={setMonth} />
      {inProgress && (
        <p className="mt-2 text-body-sm text-ink-500">
          Month in progress — figures update daily.
        </p>
      )}

      {/* 1. Calibration summary (hero) */}
      <ReportSection title="Calibration">
        <div className="rounded-card border border-ink-900/10 bg-paper-elevated p-4 shadow-card">
          <div className="text-title text-ink-900">
            Plan vs demand variance:{' '}
            {headlineVariance === null ? '—' : `±${headlineVariance}%`} this month
          </div>
          {monthlyAgg.length > 0 ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-body-sm">
                <thead>
                  <tr className="text-left text-ink-500">
                    <th className="py-1 pr-2 font-medium">Product</th>
                    <th className="py-1 px-2 text-right font-medium">Plan</th>
                    <th className="py-1 px-2 text-right font-medium">Made</th>
                    <th className="py-1 px-2 text-right font-medium">Demand</th>
                    <th className="py-1 pl-2 text-right font-medium">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyAgg.map((r) => {
                    const variance = r.plan === null ? null : r.demand - r.plan;
                    const varianceLabel =
                      variance === null
                        ? '—'
                        : variance === 0
                          ? '0'
                          : `${variance > 0 ? '+' : ''}${variance} ${r.unit}`;
                    const varianceClass =
                      variance === null
                        ? 'text-ink-500'
                        : variance === 0
                          ? 'text-ink-700'
                          : 'text-status-danger-fg';
                    return (
                      <tr key={r.product_id} className="border-t border-ink-900/5">
                        <td className="py-1 pr-2 text-ink-900">{r.product_name}</td>
                        <td className="py-1 px-2 text-right text-ink-700">
                          {r.plan === null ? '—' : r.plan}
                        </td>
                        <td className="py-1 px-2 text-right text-ink-700">{r.made}</td>
                        <td className="py-1 px-2 text-right text-ink-700">{r.demand}</td>
                        <td className={`py-1 pl-2 text-right ${varianceClass}`}>
                          {varianceLabel}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 text-body-sm text-ink-500">
              No calibration rows yet for {monthLabel}.
            </p>
          )}
          {inProgress && (
            <p className="mt-3 text-body-sm text-ink-500">
              Month in progress — figures update daily.
            </p>
          )}
        </div>
      </ReportSection>

      {/* 2. Order summary with comparison */}
      <ReportSection title="Order summary">
        <div className="grid grid-cols-2 gap-2">
          <Tile
            label="Total orders"
            value={String(summary.total_orders)}
            comparison={
              showComparison && prior
                ? fmtPct(pctChange(summary.total_orders, prior.total_orders), `vs ${priorLabel}`)
                : undefined
            }
          />
          <Tile
            label="Total value"
            value={formatINR(summary.total_value)}
            comparison={
              showComparison && prior
                ? fmtPct(pctChange(summary.total_value, prior.total_value), `vs ${priorLabel}`)
                : undefined
            }
          />
          <Tile
            label="Fulfilment"
            value={`${summary.fulfilled_count} / ${summary.total_orders} (${fulfilmentPct}%)`}
            comparison={
              showComparison && prior
                ? fmtPp(ppChange(fulfilmentPct, priorFulfilmentPct), `vs ${priorLabel}`)
                : undefined
            }
          />
          <Tile
            label="Outstanding"
            value={formatINR(summary.outstanding_value)}
            comparison={
              showComparison && prior
                ? fmtPct(
                    pctChange(summary.outstanding_value, prior.outstanding_value),
                    `vs ${priorLabel}`,
                  )
                : undefined
            }
          />
        </div>
      </ReportSection>

      {/* 3. Channel breakdown */}
      <ReportSection title="Channel breakdown">
        <StackedBar
          segments={state.channels.map((c, i) => ({
            label: c.channel_name,
            value: c.value,
            color: channelColor(c.channel_name, i),
          }))}
          showLabels
        />
        {state.newByChannel.length > 0 && (
          <ul className="mt-2 text-body-sm text-ink-500">
            {state.newByChannel.map((r) => (
              <li key={r.channel_name}>
                {r.count} {r.count === 1 ? 'customer' : 'customers'} from {r.channel_name} this month
              </li>
            ))}
          </ul>
        )}
      </ReportSection>

      {/* 4. Customer base health */}
      {state.health && (
        <ReportSection title="Customer base health">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-card border border-ink-900/10 bg-paper-elevated p-3 shadow-card">
              <div className="text-label uppercase text-ink-500">New this month</div>
              <div className="mt-1 text-title text-ink-900">{state.health.new_this_month}</div>
              {state.newByChannel.length > 0 && (
                <div className="mt-1 text-body-sm text-ink-500">
                  {state.newByChannel.map((r) => `${r.count} ${r.channel_name}`).join(' · ')}
                </div>
              )}
            </div>
            <Link
              to="/customers?filter=quiet"
              className="rounded-card border border-ink-900/10 bg-paper-elevated p-3 shadow-card hover:bg-paper-muted"
            >
              <div className="text-label uppercase text-ink-500">Currently quiet</div>
              <div className="mt-1 text-title text-ink-900">{state.health.currently_quiet}</div>
            </Link>
            <div className="rounded-card border border-ink-900/10 bg-paper-elevated p-3 shadow-card">
              <div className="text-label uppercase text-ink-500">Reactivated</div>
              <div className="mt-1 text-title text-ink-900">
                {state.health.reactivated_this_month}
              </div>
            </div>
          </div>
        </ReportSection>
      )}

      {/* 5. Exhibition → repeat conversion */}
      {state.exhibition && state.exhibition.show && (
        <ReportSection title="Exhibition → repeat">
          <p className="text-body text-ink-700">
            Of {state.exhibition.total_acquired} exhibition customers acquired in last 90 days,{' '}
            {state.exhibition.repeated} ({state.exhibition.pct}%) placed a second order.
          </p>
        </ReportSection>
      )}

      {/* 6. Top products */}
      <ReportSection title="Top products this month">
        {state.topProducts.length === 0 ? (
          <p className="text-body-sm text-ink-500">No product sales recorded.</p>
        ) : (
          <ul className="divide-y divide-ink-900/5 rounded-card border border-ink-900/10 bg-paper-elevated shadow-card">
            {state.topProducts.map((p, idx) => (
              <li
                key={p.product_id}
                className="flex items-center justify-between gap-2 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span className="w-6 text-ink-500 text-body-sm">{idx + 1}.</span>
                  <span className="text-ink-900 text-body">{p.name}</span>
                </div>
                <div className="text-ink-700 text-body-sm">
                  {p.qty} {p.unit} · {formatINR(p.value)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </ReportSection>

      {/* 7. Top customers */}
      <ReportSection title="Top customers this month">
        {state.topCustomers.length === 0 ? (
          <p className="text-body-sm text-ink-500">No customer orders recorded.</p>
        ) : (
          <ul className="divide-y divide-ink-900/5 rounded-card border border-ink-900/10 bg-paper-elevated shadow-card">
            {state.topCustomers.map((c, idx) => (
              <li
                key={c.customer_id}
                className="flex items-center justify-between gap-2 px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-6 text-ink-500 text-body-sm">{idx + 1}.</span>
                  <div className="min-w-0">
                    <div className="truncate text-ink-900 text-body">{c.name}</div>
                    <div className="text-ink-500 text-body-sm">{c.channel_name}</div>
                  </div>
                </div>
                <div className="text-right text-ink-700 text-body-sm">
                  <div>{formatINR(c.value)}</div>
                  <div className="text-ink-500">{c.order_count} orders</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </ReportSection>

      {/* 8. Complaints summary */}
      <ReportSection title="Complaints">
        <ComplaintsBlock complaints={state.complaints} />
      </ReportSection>
    </div>
  );
}

function ComplaintsBlock({ complaints }: { complaints: ComplaintListItem[] }) {
  const filed = complaints.length;
  const resolved = complaints.filter((c) => c.resolved_at !== null).length;
  const open = filed - resolved;

  const resolutions = complaints
    .filter((c) => c.resolved_at !== null)
    .map((c) => {
      const ra = new Date(`${c.reported_at}T00:00:00Z`).getTime();
      // `resolved_at` may be a YYYY-MM-DD date or an ISO timestamp depending on
      // historical write paths; normalise by parsing the date portion.
      const resolvedYmd = c.resolved_at!.slice(0, 10);
      const rb = new Date(`${resolvedYmd}T00:00:00Z`).getTime();
      return Math.max(0, Math.round((rb - ra) / DAY_MS));
    });
  const avgDays =
    resolutions.length > 0
      ? Math.round(resolutions.reduce((s, n) => s + n, 0) / resolutions.length)
      : null;

  if (filed === 0) {
    return <p className="text-body-sm text-ink-500">No complaints this month.</p>;
  }

  return (
    <div>
      <p className="text-body text-ink-700">
        {filed} filed this month · {resolved} resolved · {open} open
      </p>
      {avgDays !== null && (
        <p className="text-body-sm text-ink-500">Average resolution time: {avgDays} days</p>
      )}
      <ul className="mt-2 divide-y divide-ink-900/5 rounded-card border border-ink-900/10 bg-paper-elevated shadow-card">
        {complaints.map((c) => (
          <li key={c.id} className="px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-ink-900 text-body">{c.customer_name}</span>
              <span className="text-ink-500 text-body-sm">{c.kind}</span>
            </div>
            <div className="text-ink-700 text-body-sm">{c.description}</div>
            <div className="text-ink-500 text-body-sm">
              Reported {c.reported_at}
              {c.resolved_at && ` · Resolved ${c.resolved_at.slice(0, 10)}`}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
