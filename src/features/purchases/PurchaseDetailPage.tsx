import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  deletePurchase,
  getPurchase,
  listPurchaseCategories,
  type PurchaseRow,
} from './api';
import { formatINR } from '@/features/orders/orderFormatters';

const dateFmt = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

function formatFullDate(ymd: string): string {
  if (!ymd) return '';
  return dateFmt.format(new Date(`${ymd}T12:00:00Z`));
}

export function PurchaseDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [purchase, setPurchase] = useState<PurchaseRow | null>(null);
  const [categories, setCategories] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function load() {
    try {
      const [p, cats] = await Promise.all([getPurchase(id), listPurchaseCategories()]);
      if (!p) {
        setError('Purchase not found.');
        return;
      }
      setPurchase(p);
      setCategories(new Map(cats.map((c) => [c.id, c.name])));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function onDelete() {
    if (!confirm("Delete this purchase? This can't be undone.")) return;
    setWorking(true);
    try {
      await deletePurchase(id);
      navigate('/purchases');
    } catch (e) {
      setError((e as Error).message);
      setWorking(false);
    }
  }

  if (error && !purchase) return <p className="text-body-sm text-status-danger-fg">{error}</p>;
  if (!purchase) return <p className="text-body-sm text-ink-500">Loading…</p>;

  return (
    <div>
      <header>
        <h1 className="text-title text-ink-900">{purchase.vendor.name}</h1>
        <p className="mt-1 text-body-sm text-ink-500">{formatFullDate(purchase.purchased_on)}</p>
        {purchase.note && (
          <p className="mt-2 whitespace-pre-wrap text-body-sm text-ink-700">{purchase.note}</p>
        )}
      </header>

      <section className="mt-6">
        <h2 className="text-subtitle text-ink-900">Items</h2>
        <ul className="mt-2 space-y-2">
          {purchase.items.map((it) => (
            <li key={it.id} className="flex items-start justify-between gap-2.5">
              <div className="min-w-0 flex-1">
                <span className="text-body text-ink-900">{it.item_name}</span>
                {it.qty !== null && (
                  <span className="text-body-sm text-ink-500">
                    {' '}· {it.qty} {it.unit ?? ''}
                  </span>
                )}
                <div className="mt-1">
                  <span className="rounded-badge bg-paper-2 px-1.5 py-0.5 text-[11px] text-brown">
                    {categories.get(it.category_id) ?? '—'}
                  </span>
                </div>
              </div>
              <span className="shrink-0 text-body text-ink-700 tabular-nums">{formatINR(it.amount)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-baseline justify-between border-t border-rule pt-2">
          <span className="text-amount text-ink">Total</span>
          <span className="text-amount text-ink">{formatINR(purchase.total)}</span>
        </div>
      </section>

      {error && <p className="mt-4 text-body-sm text-status-danger-fg">{error}</p>}

      <section className="mt-8 flex gap-2">
        <Link
          to={`/purchases/${id}/edit`}
          className="flex h-11 flex-1 items-center justify-center rounded-btn border border-rule bg-card text-meta font-medium text-ink"
        >
          Edit purchase
        </Link>
      </section>

      <div className="mt-6 border-t border-rule pt-6">
        <button
          type="button"
          onClick={onDelete}
          disabled={working}
          className="h-11 w-full text-body text-danger disabled:opacity-50"
        >
          Delete purchase
        </button>
      </div>

      <p className="mt-6 text-body-sm text-ink-500">
        <Link to="/purchases" className="underline">
          ← Back to purchases
        </Link>
      </p>
    </div>
  );
}
