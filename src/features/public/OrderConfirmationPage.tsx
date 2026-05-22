import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Check } from 'lucide-react';
import { fetchOrderByRef, type PublicOrderDetail } from './api';
import { getPublicBusinessIdentity } from '@/features/settings/api';

type LoadState = PublicOrderDetail | null | 'not_found';

type BusinessIdentity = { name: string; tagline: string | null; whatsapp: string | null };

export function OrderConfirmationPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [params] = useSearchParams();
  const ref = params.get('ref') ?? '';
  const [data, setData] = useState<LoadState>(null);
  const [business, setBusiness] = useState<BusinessIdentity | null>(null);

  useEffect(() => {
    let alive = true;
    getPublicBusinessIdentity()
      .then((b) => {
        if (alive) setBusiness(b);
      })
      .catch(() => {
        // Graceful fallback — name renders empty/skeleton, footer hidden.
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    if (!ref) {
      setData('not_found');
      return;
    }
    fetchOrderByRef(slug, ref)
      .then((d) => {
        if (!alive) return;
        setData(d ?? 'not_found');
      })
      .catch(() => {
        if (!alive) return;
        setData('not_found');
      });
    return () => {
      alive = false;
    };
  }, [slug, ref]);

  if (data === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper-surface p-8 text-center">
        <p className="text-body text-ink-700">Loading…</p>
      </div>
    );
  }
  if (data === 'not_found') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper-surface p-8 text-center">
        <p className="text-body text-ink-700">Order not found.</p>
      </div>
    );
  }

  const { order, customer, event, items } = data;
  const firstName = (customer.name.trim().split(/\s+/)[0] ?? '') || 'there';

  const cleanPhoneDigits = customer.phone.replace(/[^0-9]/g, '').replace(/^91/, '');
  const itemsLine = items.map((i) => `${i.qty} × ${i.name}`).join(', ');
  const waMessage =
    `Order ${order.public_order_number} placed for ${event.name}.\n` +
    `${itemsLine}\n` +
    `Total ₹${order.total.toFixed(2)} · pay at pickup`;
  const waHref = `https://wa.me/91${cleanPhoneDigits}?text=${encodeURIComponent(waMessage)}`;
  const restartHref =
    `/order/${slug}?name=${encodeURIComponent(customer.name)}` +
    `&phone=${encodeURIComponent(customer.phone)}`;

  const businessWa = business?.whatsapp ?? null;
  const businessWaDigits = businessWa
    ? businessWa.replace(/[^0-9]/g, '').replace(/^91/, '')
    : null;

  return (
    <div className="min-h-screen bg-paper-surface">
      {/* Sticky orange header band — matches PublicOrderFormPage */}
      <header className="sticky top-0 z-10 bg-brand-orange px-4 py-3 text-white">
        <h1 className="text-title font-bold">
          {business ? business.name : <span className="opacity-0">…</span>}
        </h1>
        <p className="text-body-sm opacity-90">
          {event.name} · {formatDateRange(event.starts_on, event.ends_on)}
        </p>
      </header>

      <main className="mx-auto max-w-md px-4 py-6">
        {/* Heading section */}
        <section className="flex flex-col items-center text-center">
          <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-brand-orange">
            <Check className="h-9 w-9 text-white" strokeWidth={3} aria-hidden="true" />
          </div>
          <h2 className="text-title font-bold text-ink-900">Order placed.</h2>
          <p className="mt-1 text-body text-ink-700">Thank you, {firstName}.</p>
          <p className="mt-2 text-subtitle font-semibold text-brand-orange">
            {order.public_order_number}
          </p>
        </section>

        {/* Pickup card */}
        <section className="mt-6 rounded-card bg-paper-elevated p-4 shadow-card">
          <p className="text-label uppercase text-ink-500">PICKUP</p>
          <p className="mt-1 text-body text-ink-900">{event.name}</p>
          <p className="mt-1 text-body-sm text-ink-700">
            {formatDateRange(event.starts_on, event.ends_on)}
          </p>
          {event.pickup_window_start && event.pickup_window_end && (
            <p className="mt-1 text-body-sm text-ink-700">
              {formatPickupWindow(event.pickup_window_start, event.pickup_window_end)}
            </p>
          )}
          {event.venue_line && (
            <p className="mt-1 text-body-sm text-ink-700">{event.venue_line}</p>
          )}
        </section>

        {/* Order summary card */}
        <section className="mt-4 rounded-card bg-paper-elevated p-4 shadow-card">
          <p className="text-label uppercase text-ink-500">ORDER SUMMARY</p>
          <ul className="mt-2 divide-y divide-paper-muted">
            {items.map((item) => (
              <li
                key={item.product_id}
                className="flex items-center justify-between gap-3 py-2"
              >
                <span className="text-body text-ink-900">
                  {item.qty} × {item.name}
                </span>
                <span className="text-body tabular-nums text-ink-900">
                  ₹{(item.qty * item.unit_price).toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center justify-between gap-3 border-t border-paper-muted pt-3">
            <span className="text-body text-ink-900">Total · pay at pickup</span>
            <span className="text-body font-semibold tabular-nums text-ink-900">
              ₹{order.total.toFixed(2)}
            </span>
          </div>
        </section>

        {/* Primary CTA — Save to WhatsApp */}
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 flex h-12 w-full items-center justify-center rounded-btn bg-brand-orange text-body font-semibold text-white"
        >
          Save to WhatsApp
        </a>

        {/* Secondary link — Place another order */}
        <div className="mt-3 flex justify-center">
          <Link
            to={restartHref}
            className="inline-flex min-h-[44px] items-center text-body-sm text-ink-700 underline"
          >
            Place another order →
          </Link>
        </div>

        {/* Footer */}
        {businessWaDigits && businessWa && (
          <p className="mt-8 text-center text-body-sm text-ink-500">
            Questions? WhatsApp Archana at{' '}
            <a
              href={`https://wa.me/91${businessWaDigits}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              {businessWa}
            </a>
          </p>
        )}
      </main>
    </div>
  );
}

function formatDateRange(startsOn: string, endsOn: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    });
  if (startsOn === endsOn) return fmt(startsOn);
  return `${fmt(startsOn)} – ${fmt(endsOn)}`;
}

function formatPickupWindow(start: string, end: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('en-IN', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  return `${fmt(start)} – ${fmt(end)}`;
}
