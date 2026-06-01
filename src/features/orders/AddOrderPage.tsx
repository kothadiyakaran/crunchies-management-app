import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CustomerSearchPicker } from './CustomerSearchPicker';
import { createOrderWithItems, getOrderDetail, updateOrder, updateOrderItems, type OrderItemInput, type OrderRow } from './api';
import { listActiveProducts, type ProductRow } from '@/features/products/api';
import { getCustomerLite } from '@/features/customers/api';
import { orderTotal, resolveDiscount } from './discount';
import { todayInTz } from '@/lib/utils';

type Customer = { id: string; name: string; phone: string | null };
type DraftItem = { product_id: string; qty: string; unit_price: string };

type StepKey = 'customer' | 'source' | 'date' | 'target' | 'items' | 'discount' | 'payment' | 'notes';

const SOURCES: OrderRow['source'][] = ['whatsapp', 'in_person', 'phone'];
const PAYMENT_STATUSES: OrderRow['payment_status'][] = ['unpaid', 'paid', 'partial'];

export function AddOrderPage({ editingOrderId }: { editingOrderId?: string } = {}) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [source, setSource] = useState<OrderRow['source']>('whatsapp');
  const [orderedAt, setOrderedAt] = useState<string>(todayInTz());
  const [targetDate, setTargetDate] = useState<string>(todayInTz());
  const [items, setItems] = useState<DraftItem[]>([{ product_id: '', qty: '', unit_price: '' }]);
  const [paymentStatus, setPaymentStatus] = useState<OrderRow['payment_status']>('unpaid');
  const [notes, setNotes] = useState('');
  const [discountPercent, setDiscountPercent] = useState<string>('0');
  const [discountTouched, setDiscountTouched] = useState(false);
  const [expandedStep, setExpandedStep] = useState<StepKey>('customer');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listActiveProducts().then(setProducts).catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!editingOrderId) return;
    (async () => {
      try {
        const o = await getOrderDetail(editingOrderId);
        if (!o) {
          setError('Order not found.');
          return;
        }
        setCustomer({ id: o.customer_id, name: o.customer_name, phone: o.customer_phone });
        setSource(o.source);
        setOrderedAt(o.ordered_at.slice(0, 10));
        setTargetDate(o.target_fulfilment_date ?? todayInTz());
        setItems(
          o.items.map((it) => ({
            product_id: it.product_id,
            qty: String(it.qty),
            unit_price: String(it.unit_price),
          })),
        );
        setPaymentStatus(o.payment_status);
        setDiscountPercent(String(o.discount_percent));
        setDiscountTouched(true);
        setNotes(o.notes ?? '');
        setExpandedStep('items'); // skip past pre-filled steps
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [editingOrderId]);

  useEffect(() => {
    if (editingOrderId) return; // edit-mode hydration owns this
    const prefilledId = params.get('customer_id');
    if (!prefilledId || customer) return;
    (async () => {
      try {
        const c = await getCustomerLite(prefilledId);
        if (c) {
          setCustomer(c);
          setDiscountPercent(String(resolveDiscount({ customerDiscount: c.discount_percent, channelDefault: c.channel_default_discount_percent })));
          setExpandedStep('items'); // skip past the customer step since it's done
        }
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, editingOrderId]);

  function handleCustomer(c: Customer) {
    if (c.id === '') {
      setCustomer(null);
      setExpandedStep('customer');
      return;
    }
    setCustomer(c);
    setExpandedStep('items');
    void resolveDiscountFor(c.id);
  }

  async function resolveDiscountFor(customerId: string) {
    if (discountTouched) return;
    try {
      const c = await getCustomerLite(customerId);
      if (c) setDiscountPercent(String(resolveDiscount({ customerDiscount: c.discount_percent, channelDefault: c.channel_default_discount_percent })));
    } catch { /* leave field as-is on fetch failure */ }
  }

  function setItemField(i: number, patch: Partial<DraftItem>) {
    setItems((curr) => curr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function addItem() {
    setItems((curr) => [...curr, { product_id: '', qty: '', unit_price: '' }]);
  }
  function removeItem(i: number) {
    setItems((curr) => curr.filter((_, idx) => idx !== i));
  }

  const itemsValid: OrderItemInput[] = items
    .map((it) => {
      const qty = Number(it.qty);
      const unit_price = Number(it.unit_price);
      if (!it.product_id || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unit_price) || unit_price < 0) {
        return null;
      }
      return { product_id: it.product_id, qty, unit_price };
    })
    .filter((x): x is OrderItemInput => x !== null);

  const subtotal = itemsValid.reduce((s, it) => s + it.qty * it.unit_price, 0);
  const discountValue = Number(discountPercent);
  const discountValid = Number.isFinite(discountValue) && discountValue >= 0 && discountValue <= 100;
  const totals = orderTotal(subtotal, discountValid ? discountValue : 0);

  const canSubmit = customer !== null && itemsValid.length > 0 && targetDate.length === 10 && discountValid && !submitting;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !customer) return;
    setSubmitting(true);
    setError(null);
    try {
      if (editingOrderId) {
        await updateOrder(editingOrderId, {
          customer_id: customer.id,
          source,
          ordered_at: `${orderedAt}T12:00:00+05:30`,
          target_fulfilment_date: targetDate,
          payment_status: paymentStatus,
          notes: notes.trim() || null,
          discount_percent: discountValue,
        });
        await updateOrderItems(editingOrderId, itemsValid);
        navigate(`/orders/${editingOrderId}`);
      } else {
        await createOrderWithItems({
          customer_id: customer.id,
          source,
          ordered_at: `${orderedAt}T12:00:00+05:30`,
          target_fulfilment_date: targetDate,
          payment_status: paymentStatus,
          notes: notes.trim() || null,
          discount_percent: discountValue,
          items: itemsValid,
        });
        navigate('/orders');
      }
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  function StepHeader({ stepKey, n, label, summary, complete }: {
    stepKey: StepKey; n: number; label: string; summary: string; complete: boolean;
  }) {
    const active = expandedStep === stepKey;
    return (
      <button
        type="button"
        onClick={() => setExpandedStep(stepKey)}
        className="flex w-full items-center justify-between p-3 text-left"
      >
        <span className="flex items-center gap-3">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full text-label ${
              active ? 'bg-brand text-white' : 'border border-ink-3 text-ink-3'
            }`}
          >
            {complete ? '✓' : n}
          </span>
          <span className={active ? 'text-body font-semibold text-ink' : 'text-small text-ink-2'}>
            {label}
          </span>
        </span>
        {!active && (
          <span className="ml-2 truncate text-meta text-ink-3">{summary}</span>
        )}
      </button>
    );
  }

  // P0-05: 1.5px brand ring on the active (next-action) step card so it reads first.
  const stepCardCls = (key: StepKey) =>
    `rounded-card bg-paper-elevated${expandedStep === key ? ' ring-1 ring-brand' : ''}`;

  const inputClass = 'mt-1 input-shell h-11';

  return (
    <div>
      <h1 className="text-title text-ink-900">{editingOrderId ? 'Edit order' : 'Log new order'}</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-2">
        {/* Step 1: Customer */}
        <div className={stepCardCls('customer')}>
          <StepHeader
            stepKey="customer"
            n={1}
            label="Customer"
            summary={customer ? customer.name : 'Select a customer'}
            complete={customer !== null}
          />
          {expandedStep === 'customer' && (
            <div className="px-3 pb-3">
              <CustomerSearchPicker selected={customer} onSelect={handleCustomer} />
            </div>
          )}
        </div>

        {/* Step 2: Source */}
        <div className={stepCardCls('source')}>
          <StepHeader stepKey="source" n={2} label="Source" summary={source} complete={true} />
          {expandedStep === 'source' && (
            <div className="flex flex-wrap gap-2 px-3 pb-3">
              {SOURCES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setSource(s); setExpandedStep('items'); }}
                  className={`h-9 rounded-pill px-3 text-body-sm ${
                    source === s ? 'bg-brand-orange text-white' : 'border border-ink-900/10 text-ink-900'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Step 3: Date */}
        <div className={stepCardCls('date')}>
          <StepHeader stepKey="date" n={3} label="Date" summary={orderedAt} complete={true} />
          {expandedStep === 'date' && (
            <div className="px-3 pb-3">
              <input
                type="date"
                className={inputClass}
                value={orderedAt}
                onChange={(e) => setOrderedAt(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Step 4: Target fulfilment date */}
        <div className={stepCardCls('target')}>
          <StepHeader
            stepKey="target"
            n={4}
            label="Target fulfilment date"
            summary={targetDate}
            complete={targetDate.length === 10}
          />
          {expandedStep === 'target' && (
            <div className="px-3 pb-3">
              <input
                type="date"
                className={inputClass}
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
              <p className="mt-1 text-body-sm text-ink-500">The week this falls in is the demand week.</p>
            </div>
          )}
        </div>

        {/* Step 5: Items */}
        <div className={stepCardCls('items')}>
          <StepHeader
            stepKey="items"
            n={5}
            label="Items"
            summary={itemsValid.length > 0 ? `${itemsValid.length} item${itemsValid.length === 1 ? '' : 's'}` : 'Add at least one'}
            complete={itemsValid.length > 0}
          />
          {expandedStep === 'items' && (
            <div className="space-y-3 px-3 pb-3">
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-[1fr_60px_70px_24px] items-center gap-2">
                  <select
                    className="input-shell h-11"
                    value={it.product_id}
                    onChange={(e) => {
                      const pid = e.target.value;
                      const product = products.find((p) => p.id === pid);
                      setItemField(i, { product_id: pid, unit_price: product ? String(product.default_price) : it.unit_price });
                    }}
                  >
                    <option value="">— pick —</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    aria-label={`qty-${i}`}
                    placeholder="qty"
                    className="input-shell h-11"
                    value={it.qty}
                    onChange={(e) => setItemField(i, { qty: e.target.value })}
                  />
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    aria-label={`price-${i}`}
                    placeholder="₹"
                    className="input-shell h-11"
                    value={it.unit_price}
                    onChange={(e) => setItemField(i, { unit_price: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    disabled={items.length === 1}
                    aria-label={`Remove item ${i + 1}`}
                    className="text-body text-ink-500 disabled:opacity-30"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addItem}
                className="text-body-sm text-brand-orange underline"
              >
                + Add another item
              </button>
            </div>
          )}
        </div>

        {/* Step 6: Discount */}
        <div className={stepCardCls('discount')}>
          <StepHeader stepKey="discount" n={6} label="Discount" summary={`${discountValid ? discountValue : 0}%`} complete={true} />
          {expandedStep === 'discount' && (
            <div className="px-3 pb-3">
              <input
                type="number" inputMode="decimal" min="0" max="100" step="any"
                aria-label="discount-percent"
                className={inputClass}
                value={discountPercent}
                onChange={(e) => { setDiscountPercent(e.target.value); setDiscountTouched(true); }}
              />
              {!discountValid && <p className="mt-1 text-body-sm text-status-danger-fg">Enter 0–100.</p>}
              <p className="mt-1 text-body-sm text-ink-500">
                Subtotal ₹{totals.subtotal} · Discount −₹{totals.discount} · Total ₹{totals.total}
              </p>
            </div>
          )}
        </div>

        {/* Step 7: Payment */}
        <div className={stepCardCls('payment')}>
          <StepHeader stepKey="payment" n={7} label="Payment" summary={paymentStatus} complete={true} />
          {expandedStep === 'payment' && (
            <div className="flex gap-2 px-3 pb-3">
              {PAYMENT_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setPaymentStatus(s); setExpandedStep('notes'); }}
                  className={`h-9 rounded-pill px-3 text-body-sm ${
                    paymentStatus === s ? 'bg-brand-orange text-white' : 'border border-ink-900/10 text-ink-900'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Step 8: Notes */}
        <div className={stepCardCls('notes')}>
          <StepHeader stepKey="notes" n={8} label="Notes (optional)" summary={notes || '—'} complete={true} />
          {expandedStep === 'notes' && (
            <div className="px-3 pb-3">
              <textarea
                rows={3}
                className="input-shell mt-1 py-2"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          )}
        </div>

        {error && <p className="text-body-sm text-status-danger-fg">{error}</p>}

        <button
          type="submit"
          disabled={!canSubmit}
          className="btn-primary"
        >
          {submitting ? 'Saving…' : editingOrderId ? 'Save changes' : 'Save'}
        </button>
      </form>
    </div>
  );
}
