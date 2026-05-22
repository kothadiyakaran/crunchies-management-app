/**
 * Trends tab — Reports surface.
 *
 * Spec: docs/v1-spec.md §9.3.
 *
 * Layout (top → bottom):
 *   1. Plan accuracy (hero) — big % + caption + LineChart + sample-size line
 *   2. Per-product trends — name/unit + sparkline + delta + biggest-miss caption
 *   3. Channel mix trend — 6 monthly stacked bars (last 6 months)
 *   4. Past event retrospectives — list, descending by ends_on (hidden when empty)
 *
 * Read-only surface; no mutations. Chart points navigate to Week tab via
 * `/reports?tab=week&week=YYYY-MM-DD`. Past event rows nav to `/events/:id`.
 * Per-product rows nav to `/products/:id`.
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { todayInTz } from '@/lib/utils';
import {
  getPerWeekAccuracyLastN,
  getPerProductTrends,
  getMonthlyChannelMixLastN,
  getPastEventRetrospectives,
  type PerWeekAccuracy,
  type PerProductTrend,
  type MonthlyChannelMix,
  type PastEventRetrospective,
} from './api';
import { LineChart } from './charts/LineChart';
import { Sparkline } from './charts/Sparkline';
import { StackedBar } from './charts/StackedBar';
import { ReportSection } from './ReportSection';
import { formatMonthLabel } from './dateRange';

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const dayMonthFmt = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  timeZone: 'UTC',
});
const dayMonthYearFmt = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

function formatDayMonth(ymd: string): string {
  return dayMonthFmt.format(new Date(`${ymd}T12:00:00Z`));
}
function formatDayMonthYear(ymd: string): string {
  return dayMonthYearFmt.format(new Date(`${ymd}T12:00:00Z`));
}

/**
 * Stable color per channel name. System channels get brand colors; custom
 * channels hash into a fallback palette. Kept in this file for now; MonthTab
 * (Task 7) should reuse this — extract to a helper if both files survive.
 */
export function channelColor(name: string): string {
  const n = name.trim().toLowerCase();
  if (n === 'personal') return '#F4C56F'; // brand-mustard
  if (n === 'reseller') return '#D9591A'; // brand-orange
  if (n === 'exhibition') return '#4A2912'; // brand-brown
  const palette = ['#5A5048', '#FFF7C2', '#F1ECE1', '#8A8079', '#FDE2C8'];
  let h = 0;
  for (let i = 0; i < n.length; i += 1) h = (h * 31 + n.charCodeAt(i)) >>> 0;
  return palette[h % palette.length] ?? '#5A5048';
}

const PRODUCT_INITIAL = 5;

export function TrendsTab() {
  const navigate = useNavigate();
  const today = todayInTz();

  const [accuracy, setAccuracy] = useState<PerWeekAccuracy[] | null>(null);
  const [productTrends, setProductTrends] = useState<PerProductTrend[] | null>(null);
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [channelMix, setChannelMix] = useState<MonthlyChannelMix[] | null>(null);
  const [pastEvents, setPastEvents] = useState<PastEventRetrospective[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getPerWeekAccuracyLastN(8, today),
      getPerProductTrends(today),
      getMonthlyChannelMixLastN(6, today),
      getPastEventRetrospectives(),
    ])
      .then(([a, p, m, e]) => {
        if (cancelled) return;
        setAccuracy(a);
        setProductTrends(p);
        setChannelMix(m);
        setPastEvents(e);
      })
      .catch(() => {
        /* silent — sections fall back to empty / hidden */
      });
    return () => {
      cancelled = true;
    };
  }, [today]);

  const accuracyValues = (accuracy ?? [])
    .map((a) => a.accuracy)
    .filter((x): x is number => x !== null);
  const meanAccuracy =
    accuracyValues.length > 0
      ? Math.round(
          accuracyValues.reduce((s, n) => s + n, 0) / accuracyValues.length,
        )
      : null;
  const accuracyLoaded = accuracy !== null;
  const accuracyEmpty = accuracyLoaded && accuracyValues.length === 0;

  const visibleProducts =
    productTrends === null
      ? []
      : showAllProducts
        ? productTrends
        : productTrends.slice(0, PRODUCT_INITIAL);

  return (
    <div>
      {/* 1. Plan accuracy (hero) */}
      <ReportSection title="Plan accuracy">
        {!accuracyLoaded ? (
          <p className="text-body-sm text-ink-500">Loading…</p>
        ) : accuracyEmpty ? (
          <div>
            <p className="text-body-sm text-ink-500">
              No plans saved in the last 8 weeks yet. Trends become useful after a few weeks of planning.
            </p>
            <Link
              to="/production/plan-this-week"
              className="mt-2 inline-block text-body-sm text-brand-orange underline"
            >
              Plan this week →
            </Link>
          </div>
        ) : (
          <div className="rounded-card bg-paper-elevated p-4">
            <p className="text-display text-brand-orange tabular-nums">
              {meanAccuracy}%
            </p>
            <p className="mt-1 text-body-sm text-ink-700">
              Your plans matched demand {meanAccuracy}% on average over the last 8 weeks.
            </p>
            <div className="mt-3">
              <LineChart
                points={(accuracy ?? []).map((a) => ({
                  x: a.weekStart,
                  y: a.accuracy,
                }))}
                ariaLabel="Plan accuracy over the last 8 weeks"
                onPointClick={(x) => navigate(`/reports?tab=week&week=${x}`)}
              />
            </div>
            <p className="mt-2 text-body-sm text-ink-500">
              {accuracyValues.length} of last 8 weeks planned.
            </p>
          </div>
        )}
      </ReportSection>

      {/* 2. Per-product trends */}
      {productTrends && productTrends.length > 0 && (
        <ReportSection title="Per-product trends">
          <ul className="space-y-1">
            {visibleProducts.map((p) => (
              <li key={p.product_id}>
                <button
                  type="button"
                  onClick={() => navigate(`/products/${p.product_id}`)}
                  className="block w-full rounded-card bg-paper-elevated p-3 text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body text-ink-900">{p.name}</p>
                      <p className="text-body-sm text-ink-500">{p.unit}</p>
                    </div>
                    <div className="text-brand-orange">
                      <Sparkline values={p.sparkline} />
                    </div>
                    <div className="w-14 text-right text-body-sm tabular-nums">
                      {p.delta === null ? (
                        <span className="text-ink-500">—</span>
                      ) : p.delta > 0 ? (
                        <span className="text-status-ok-fg">+{p.delta}%</span>
                      ) : p.delta < 0 ? (
                        <span className="text-status-danger-fg">
                          {/* unicode minus already from negative number */}
                          {p.delta}%
                        </span>
                      ) : (
                        <span className="text-ink-700">0%</span>
                      )}
                    </div>
                  </div>
                  {p.biggest_miss && (
                    <p className="mt-1 text-body-sm text-ink-500">
                      Biggest miss: {formatDayMonth(p.biggest_miss.weekStart)} (
                      {p.biggest_miss.variancePct > 0 ? '+' : ''}
                      {p.biggest_miss.variancePct}%)
                    </p>
                  )}
                </button>
              </li>
            ))}
          </ul>
          {productTrends.length > PRODUCT_INITIAL && (
            <button
              type="button"
              onClick={() => setShowAllProducts((s) => !s)}
              className="mt-2 text-body-sm text-brand-orange"
            >
              {showAllProducts
                ? 'show fewer'
                : `see all (${productTrends.length}) →`}
            </button>
          )}
        </ReportSection>
      )}

      {/* 3. Channel mix trend */}
      {channelMix && channelMix.length > 0 && (
        <ReportSection title="Channel mix">
          <div className="grid grid-cols-6 gap-2">
            {channelMix.map((m) => (
              <div key={m.yyyymm} className="flex flex-col">
                <p className="truncate text-body-sm text-ink-700">
                  {formatMonthLabel(m.yyyymm).split(' ')[0]}
                </p>
                <p className="truncate text-body-sm text-ink-500 tabular-nums">
                  {INR.format(m.totalValue)}
                </p>
                <div className="mt-1">
                  <StackedBar
                    segments={m.channels.map((c) => ({
                      label: c.channel_name,
                      value: c.value,
                      color: channelColor(c.channel_name),
                    }))}
                    height={48}
                  />
                </div>
              </div>
            ))}
          </div>
          {/* Legend: union of channel names across the window */}
          {(() => {
            const seen = new Set<string>();
            const legend: string[] = [];
            for (const m of channelMix) {
              for (const c of m.channels) {
                if (!seen.has(c.channel_name)) {
                  seen.add(c.channel_name);
                  legend.push(c.channel_name);
                }
              }
            }
            if (legend.length === 0) return null;
            return (
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-body-sm text-ink-700">
                {legend.map((name) => (
                  <div key={name} className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-2 rounded-sm"
                      style={{ backgroundColor: channelColor(name) }}
                      aria-hidden="true"
                    />
                    <span>{name}</span>
                  </div>
                ))}
              </div>
            );
          })()}
        </ReportSection>
      )}

      {/* 4. Past event retrospectives — hidden when none */}
      {pastEvents && pastEvents.length > 0 && (
        <ReportSection title="Past events">
          <ul className="space-y-1">
            {pastEvents.map((e) => {
              const sign = e.variance_qty > 0 ? '+' : '';
              const pctSign = e.variance_pct > 0 ? '+' : '';
              const colorClass =
                e.variance_qty > 0
                  ? 'text-status-warn-fg'
                  : e.variance_qty < 0
                    ? 'text-status-danger-fg'
                    : 'text-ink-500';
              return (
                <li key={e.event_id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/events/${e.event_id}`)}
                    className="block w-full rounded-card bg-paper-elevated p-3 text-left"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-body font-semibold text-ink-900">
                        {e.name}
                      </span>
                      <span className="text-body-sm text-ink-500">
                        {formatDayMonthYear(e.ends_on)}
                      </span>
                    </div>
                    <p className="mt-1 text-body-sm text-ink-700">
                      {formatDayMonth(e.starts_on)} – {formatDayMonth(e.ends_on)}
                    </p>
                    <div className="mt-1 flex items-baseline justify-between text-body-sm">
                      <span className="text-ink-700 tabular-nums">
                        Expected {e.expected_total} · Actual {e.actual_total}
                      </span>
                      <span className={`tabular-nums ${colorClass}`}>
                        {sign}
                        {e.variance_qty} ({pctSign}
                        {e.variance_pct}%)
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </ReportSection>
      )}
    </div>
  );
}
