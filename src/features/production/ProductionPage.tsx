import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useRouteFocus } from '@/lib/a11y';
import {
  getProductionThisWeek,
  getProductionPlansForWeek,
} from './api';
import { composeWithPlan, type ProductionWeekRowFull } from './planLayer';
import { ProductDetailSheet } from './ProductDetailSheet';
import { SeedEstimateModal } from './SeedEstimateModal';
import { AggregatedSection } from './AggregatedSection';
import { UpcomingEventsSection } from '@/features/events/UpcomingEventsSection';
import { weekStartFor } from '@/lib/week';
import { todayInTz } from '@/lib/utils';

export function ProductionPage() {
  const [rows, setRows] = useState<ProductionWeekRowFull[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openProductId, setOpenProductId] = useState<string | null>(null);
  const [seedTarget, setSeedTarget] = useState<ProductionWeekRowFull | null>(null);
  const [doneOpen, setDoneOpen] = useState(false);
  const h1Ref = useRef<HTMLHeadingElement>(null);
  useRouteFocus(h1Ref);

  const weekStart = weekStartFor(todayInTz());

  async function reload() {
    setLoading(true);
    try {
      const [r, plans] = await Promise.all([
        getProductionThisWeek(),
        getProductionPlansForWeek(weekStart),
      ]);
      setRows(composeWithPlan(r, plans));
      setLoading(false);
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const notDone = rows.filter((r) => !r.done).sort((a, b) => {
    if (b.gap !== a.gap) return b.gap - a.gap;
    return a.name.localeCompare(b.name);
  });
  const done = rows.filter((r) => r.done).sort((a, b) => a.name.localeCompare(b.name));

  const anyPlan = rows.some((r) => r.planned_qty !== null);
  const openRow = rows.find((r) => r.product_id === openProductId) ?? null;

  return (
    <div>
      <header className="flex items-baseline justify-between">
        <h1 ref={h1Ref} tabIndex={-1} className="text-title text-ink-900 focus:outline-none">Production</h1>
        <Link to="/products" className="text-body-sm text-ink-500 underline">
          Manage products →
        </Link>
      </header>

      {error && <p className="mt-4 text-body-sm text-status-danger-fg">{error}</p>}

      <UpcomingEventsSection />

      <section className="mt-6">
        {/* Planning entry point — prominent when no plans, subtle "Edit plan →" once plans exist (per §5 spec) */}
        {!loading && rows.length > 0 && (
          anyPlan ? (
            <div className="text-right">
              <Link to="/production/plan-this-week" className="text-body-sm text-ink-500 underline">
                Edit plan →
              </Link>
            </div>
          ) : (
            <Link
              to="/production/plan-this-week"
              className="block rounded-card border border-brand-orange/40 bg-brand-orange/10 p-3 text-body text-ink-900"
            >
              Plan this week →
            </Link>
          )
        )}

        {notDone.length > 0 && (
          <div className="mt-4 grid grid-cols-[1fr_56px_70px_56px] gap-2 px-3">
            <div />
            <div className="text-eyebrow-tight uppercase text-right text-ink-2">Plan</div>
            <div className="text-eyebrow-tight uppercase text-right text-ink-2">Suggested</div>
            <div className="text-eyebrow-tight uppercase text-right text-ink-2">Made</div>
          </div>
        )}

        <ul className={`${notDone.length > 0 ? 'mt-1.5' : ''} space-y-2`}>
          {notDone.map((r) => (
            <li key={r.product_id} className="rounded-card bg-paper-elevated">
              <button
                type="button"
                onClick={() => setOpenProductId(r.product_id)}
                aria-label={`Open ${r.name} details`}
                className="block w-full cursor-pointer rounded-card p-3 text-left"
              >
                {!r.needs_seed ? (
                  <>
                    <div className="grid grid-cols-[1fr_56px_70px_56px] items-baseline gap-2">
                      <div>
                        <span className="block text-body font-semibold text-ink-900">{r.name}</span>
                        {r.subtitle?.startsWith('includes ramp-up for') ? (
                          <span className="mt-1 inline-block rounded-badge bg-mustard-tint px-1.5 py-0.5 text-[11px] text-brown">
                            ramp-up · {r.event_sources[0]?.event_name}
                          </span>
                        ) : (
                          r.subtitle && (
                            <p className="mt-1 text-body-sm text-ink-500">{r.subtitle}</p>
                          )
                        )}
                      </div>
                      <span className="text-right text-base font-bold text-ink">{r.planned_qty ?? '—'}</span>
                      <span className="text-right text-base font-bold text-ink-2">{r.suggested}</span>
                      <span className="text-right text-base font-bold text-ink">{r.produced_qty}</span>
                    </div>
                    <div className="mt-2.5 h-1 overflow-hidden rounded-pill bg-paper-2">
                      <div
                        className="h-full rounded-pill bg-brand"
                        style={{
                          width: `${
                            r.planned_qty && r.planned_qty > 0
                              ? Math.min(100, Math.round((r.produced_qty / r.planned_qty) * 100))
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex items-baseline justify-between">
                    <span className="text-body font-semibold text-ink-900">{r.name}</span>
                    <span className="text-body-sm text-ink-500">{r.unit}</span>
                  </div>
                )}
              </button>
              {r.needs_seed && (
                <div className="px-3 pb-3">
                  <button
                    type="button"
                    onClick={() => setSeedTarget(r)}
                    className="text-body-sm text-brand-orange underline"
                  >
                    Add a seed estimate →
                  </button>
                </div>
              )}
            </li>
          ))}
          {!loading && rows.length === 0 && !error && (
            <li className="text-body-sm text-ink-500">
              No products yet. <Link to="/products/new" className="underline">Add your first product →</Link>
            </li>
          )}
        </ul>

        {done.length > 0 && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setDoneOpen((v) => !v)}
              className="w-full rounded-card border border-ink-900/10 bg-paper-elevated p-3 text-left text-body-sm text-ink-700"
            >
              Done this week ({done.length}) {doneOpen ? '▾' : '▸'}
            </button>
            {doneOpen && (
              <ul className="mt-2 space-y-2">
                {done.map((r) => (
                  <li key={r.product_id}>
                    <button
                      type="button"
                      onClick={() => setOpenProductId(r.product_id)}
                      className="block w-full rounded-card bg-paper-elevated p-3 text-left opacity-80"
                    >
                      <div className="flex items-baseline justify-between">
                        <span className="text-body text-ink-900">{r.name}</span>
                        <span className="text-body-sm text-ink-500">
                          {r.produced_qty} ≥ {r.target} {r.unit} ✓
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <AggregatedSection />

      <div className="mt-8">
        <Link
          to="/production/new"
          className="block h-11 w-full rounded-btn bg-brand-orange text-center text-body font-semibold leading-[2.75rem] text-white"
        >
          + Log production
        </Link>
      </div>

      {openRow && (
        <ProductDetailSheet row={openRow} onClose={() => { setOpenProductId(null); reload(); }} />
      )}

      {seedTarget && (
        <SeedEstimateModal
          productId={seedTarget.product_id}
          productName={seedTarget.name}
          unit={seedTarget.unit}
          onClose={() => setSeedTarget(null)}
          onSaved={() => { setSeedTarget(null); reload(); }}
        />
      )}
    </div>
  );
}
