import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { VendorPicker, type VendorSelection } from './VendorPicker';
import { CategoryChipPicker } from './CategoryChipPicker';
import {
  createPurchase,
  getItemSuggestions,
  getLastItemEntry,
  getPurchase,
  listPurchaseCategories,
  updatePurchase,
  type PurchaseItemInput,
} from './api';
import { receiptTotal, type ItemEntry } from './purchaseMath';
import { formatShortDate } from './purchaseFormatters';
import { formatINR } from '@/features/orders/orderFormatters';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { todayInTz } from '@/lib/utils';

type DraftItem = {
  item_name: string;
  qty: string;
  unit: string;
  amount: string;
  category_id: string | null;
  hint: ItemEntry | null;
};

type Prefill = {
  vendorName?: string;
  itemName?: string;
  qty?: number;
  unit?: string;
  category?: string;
};

function emptyItem(categoryId: string | null): DraftItem {
  return { item_name: '', qty: '', unit: '', amount: '', category_id: categoryId, hint: null };
}

function hintLine(e: ItemEntry): string {
  const qtySeg = e.qty ? ` · ${e.qty} ${e.unit ?? ''}`.trimEnd() : '';
  return `Last: ${formatINR(e.amount)}${qtySeg} · ${e.vendor_name} · ${formatShortDate(e.purchased_on)}`;
}

function ItemRowEditor({
  index,
  item,
  canRemove,
  onPatch,
  onRemove,
}: {
  index: number;
  item: DraftItem;
  canRemove: boolean;
  onPatch: (patch: Partial<DraftItem>) => void;
  onRemove: () => void;
}) {
  const debouncedName = useDebouncedValue(item.item_name, 300);
  const [suggestions, setSuggestions] = useState<ItemEntry[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    const name = debouncedName.trim();
    if (name.length === 0) {
      onPatch({ hint: null });
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    getLastItemEntry(name)
      .then((entry) => {
        if (cancelled || !entry) {
          if (!cancelled) onPatch({ hint: null });
          return;
        }
        onPatch({
          hint: entry,
          unit: item.unit.trim() === '' ? (entry.unit ?? '') : item.unit,
          category_id: entry.category_id,
        });
      })
      .catch(() => { if (!cancelled) onPatch({ hint: null }); });
    if (name.length >= 2) {
      getItemSuggestions(name)
        .then((rs) => { if (!cancelled) setSuggestions(rs.slice(0, 5)); })
        .catch(() => { if (!cancelled) setSuggestions([]); });
    } else {
      setSuggestions([]);
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedName]);

  function applySuggestion(s: ItemEntry) {
    onPatch({
      item_name: s.item_name,
      unit: s.unit ?? '',
      category_id: s.category_id,
      hint: s,
    });
    setShowSuggestions(false);
  }

  return (
    <div className="rounded-card bg-paper-elevated p-3 space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <label htmlFor={`item-name-${index}`} className="sr-only">Item name</label>
          <input
            id={`item-name-${index}`}
            className="input-shell h-11"
            placeholder="Item name"
            value={item.item_name}
            onChange={(e) => { onPatch({ item_name: e.target.value }); setShowSuggestions(true); }}
            onFocus={() => setShowSuggestions(true)}
          />
          {showSuggestions && suggestions.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-card border border-ink-900/10 bg-paper-elevated shadow-sm">
              {suggestions.map((s) => (
                <li key={s.item_name.toLowerCase()} className="border-b border-ink-900/10 last:border-b-0">
                  <button
                    type="button"
                    onClick={() => applySuggestion(s)}
                    className="block w-full p-3 text-left text-body-sm text-ink-900"
                  >
                    {s.item_name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          aria-label={`Remove item ${index + 1}`}
          className="text-body text-ink-500 disabled:opacity-30"
        >
          ✕
        </button>
      </div>

      <div className="grid grid-cols-[64px_72px_1fr] gap-2">
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          aria-label={`Quantity for item ${index + 1}`}
          placeholder="Qty"
          className="input-shell h-11"
          value={item.qty}
          onChange={(e) => onPatch({ qty: e.target.value })}
        />
        <input
          aria-label={`Unit for item ${index + 1}`}
          placeholder="kg / pkt"
          className="input-shell h-11"
          value={item.unit}
          onChange={(e) => onPatch({ unit: e.target.value })}
        />
        <input
          inputMode="numeric"
          aria-label={`Amount for item ${index + 1}`}
          placeholder="₹"
          className="input-shell h-11"
          value={item.amount}
          onChange={(e) => onPatch({ amount: e.target.value })}
        />
      </div>

      <CategoryChipPicker
        value={item.category_id}
        onChange={(id) => onPatch({ category_id: id })}
      />

      {item.hint && (
        <p className="text-small text-ink-2">{hintLine(item.hint)}</p>
      )}
    </div>
  );
}

export function LogPurchasePage({ editingPurchaseId }: { editingPurchaseId?: string } = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const prefill = (location.state as { prefill?: Prefill } | null)?.prefill;

  const [vendor, setVendor] = useState<VendorSelection | null>(
    prefill?.vendorName ? { id: null, name: prefill.vendorName } : null,
  );
  const [purchasedOn, setPurchasedOn] = useState<string>(todayInTz());
  const [items, setItems] = useState<DraftItem[]>([
    {
      item_name: prefill?.itemName ?? '',
      qty: prefill?.qty != null ? String(prefill.qty) : '',
      unit: prefill?.unit ?? '',
      amount: '',
      category_id: null,
      hint: null,
    },
  ]);
  const [note, setNote] = useState('');
  const [defaultCategoryId, setDefaultCategoryId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(!editingPurchaseId);

  useEffect(() => {
    listPurchaseCategories()
      .then((cats) => {
        const other = cats.find((c) => c.name.toLowerCase() === 'other');
        const prefillCat = prefill?.category
          ? cats.find((c) => c.name.toLowerCase() === prefill.category!.toLowerCase())
          : undefined;
        const fallback = other?.id ?? cats[0]?.id ?? null;
        setDefaultCategoryId(fallback);
        setItems((curr) =>
          curr.map((it) => (it.category_id === null ? { ...it, category_id: prefillCat?.id ?? fallback } : it)),
        );
      })
      .catch((e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!editingPurchaseId) return;
    (async () => {
      try {
        const p = await getPurchase(editingPurchaseId);
        if (!p) {
          setError('Purchase not found.');
          setHydrated(true);
          return;
        }
        setVendor({ id: p.vendor.id, name: p.vendor.name });
        setPurchasedOn(p.purchased_on);
        setNote(p.note ?? '');
        setItems(
          p.items.map((it) => ({
            item_name: it.item_name,
            qty: it.qty != null ? String(it.qty) : '',
            unit: it.unit ?? '',
            amount: String(it.amount),
            category_id: it.category_id,
            hint: null,
          })),
        );
        setHydrated(true);
      } catch (e) {
        setError((e as Error).message);
        setHydrated(true);
      }
    })();
  }, [editingPurchaseId]);

  function patchItem(i: number, patch: Partial<DraftItem>) {
    setItems((curr) => curr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function addItem() {
    setItems((curr) => [...curr, emptyItem(defaultCategoryId)]);
  }
  function removeItem(i: number) {
    setItems((curr) => curr.filter((_, idx) => idx !== i));
  }

  const itemsValid: PurchaseItemInput[] = items
    .map((it) => {
      const name = it.item_name.trim();
      const amount = Number(it.amount);
      if (!name || !it.category_id || !Number.isFinite(amount) || amount < 0) return null;
      let qty: number | null = null;
      if (it.qty.trim() !== '') {
        const q = Number(it.qty);
        if (!Number.isFinite(q) || q <= 0) return null;
        qty = q;
      }
      const unit = it.unit.trim() === '' ? null : it.unit.trim();
      return { item_name: name, category_id: it.category_id, qty, unit, amount };
    })
    .filter((x): x is PurchaseItemInput => x !== null);

  const total = receiptTotal(itemsValid);
  const canSubmit = vendor !== null && itemsValid.length > 0 && purchasedOn.length === 10 && !submitting;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !vendor) return;
    setSubmitting(true);
    setError(null);
    try {
      const input = {
        vendorId: vendor.id,
        vendorName: vendor.name,
        purchased_on: purchasedOn,
        note: note.trim() || null,
        items: itemsValid,
      };
      if (editingPurchaseId) {
        await updatePurchase(editingPurchaseId, input);
        navigate(`/purchases/${editingPurchaseId}`);
      } else {
        await createPurchase(input);
        navigate('/purchases');
      }
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  if (!hydrated) return <p className="text-body-sm text-ink-500">Loading…</p>;

  return (
    <div>
      <h1 className="text-title text-ink-900">{editingPurchaseId ? 'Edit purchase' : 'Log purchase'}</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-6">
        <section>
          <h2 className="text-subtitle text-ink-900">From</h2>
          <div className="mt-2">
            <VendorPicker selected={vendor} onSelect={setVendor} />
          </div>
        </section>

        <section>
          <h2 className="text-subtitle text-ink-900">Date</h2>
          <div className="mt-2">
            <label htmlFor="purchased-on" className="sr-only">Purchase date</label>
            <input
              id="purchased-on"
              type="date"
              className="input-shell h-11"
              value={purchasedOn}
              onChange={(e) => setPurchasedOn(e.target.value)}
            />
          </div>
        </section>

        <section>
          <h2 className="text-subtitle text-ink-900">Items</h2>
          <div className="mt-2 space-y-3">
            {items.map((it, i) => (
              <ItemRowEditor
                key={i}
                index={i}
                item={it}
                canRemove={items.length > 1}
                onPatch={(patch) => patchItem(i, patch)}
                onRemove={() => removeItem(i)}
              />
            ))}
            <button
              type="button"
              onClick={addItem}
              className="text-body-sm text-brand-orange underline"
            >
              + Add another item
            </button>
          </div>
        </section>

        <section>
          <h2 className="text-subtitle text-ink-900">Note (optional)</h2>
          <div className="mt-2">
            <label htmlFor="purchase-note" className="sr-only">Note</label>
            <textarea
              id="purchase-note"
              rows={2}
              className="input-shell py-2"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </section>

        <div className="flex items-baseline justify-between border-t border-rule pt-3">
          <span className="text-amount text-ink">Total</span>
          <span className="text-amount text-ink tabular-nums">{formatINR(total)}</span>
        </div>

        {error && <p className="text-body-sm text-status-danger-fg">{error}</p>}

        <button type="submit" disabled={!canSubmit} className="btn-primary">
          {submitting ? 'Saving…' : editingPurchaseId ? 'Save changes' : 'Save purchase'}
        </button>
      </form>

      <p className="mt-6 text-body-sm text-ink-500">
        <Link to="/purchases" className="underline">← Back to purchases</Link>
      </p>
    </div>
  );
}
