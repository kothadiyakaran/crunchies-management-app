import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  fetchEventBySlug,
  submitExhibitionOrder,
  type PublicEventResponse,
} from './api';
import { getPublicBusinessIdentity } from '@/features/settings/api';
import { PickStep } from './PickStep';
import { ContactStep } from './ContactStep';
import { ConfirmStep } from './ConfirmStep';

type LoadState = PublicEventResponse | null | 'not_found';

type BusinessIdentity = { name: string; tagline: string | null; whatsapp: string | null };

export function PublicOrderFormPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [resp, setResp] = useState<LoadState>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [business, setBusiness] = useState<BusinessIdentity | null>(null);

  // Pre-fill name/phone from URL params (supports "Place another order →" loop).
  useEffect(() => {
    const url = new URL(window.location.href);
    const n = url.searchParams.get('name');
    const p = url.searchParams.get('phone');
    if (n) setName(n);
    if (p) setPhone(p);
  }, []);

  // Fetch public business identity (name shown in sticky header).
  useEffect(() => {
    let alive = true;
    getPublicBusinessIdentity()
      .then((b) => {
        if (alive) setBusiness(b);
      })
      .catch(() => {
        // Graceful fallback — leave header name as a placeholder.
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    fetchEventBySlug(slug)
      .then((r) => {
        if (!alive) return;
        setResp(r ?? 'not_found');
      })
      .catch(() => {
        if (!alive) return;
        setResp('not_found');
      });
    return () => {
      alive = false;
    };
  }, [slug]);

  if (resp === null) {
    return <div className="p-edge text-body text-ink-700">Loading…</div>;
  }
  if (resp === 'not_found') {
    return <FailLanding message="Not found." />;
  }
  if (resp.window_state === 'not_yet_open') {
    return <FailLanding message={`This event opens ${resp.event.starts_on}.`} />;
  }
  if (resp.window_state === 'ended') {
    return <FailLanding message="This event has ended. Thank you!" />;
  }
  if (resp.window_state === 'inactive') {
    return <FailLanding message="Not currently accepting orders." />;
  }

  const event = resp.event;
  const products = resp.products;

  async function onSubmit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const items = Object.entries(qtys)
        .filter(([, q]) => q > 0)
        .map(([product_id, qty]) => ({ product_id, qty }));
      const result = await submitExhibitionOrder({
        slug,
        name: name.trim(),
        phone,
        notes,
        items,
        honeypot,
      });
      if (!result) {
        // Honeypot tripped server-side — silent no-op. Leave the user on the screen.
        setSubmitting(false);
        return;
      }
      navigate(`/order/${slug}/confirmed?ref=${result.order_id}`, { replace: true });
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-paper-surface">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 bg-brand-orange px-4 py-3 text-white">
        <h1 className="text-title font-bold">
          {business ? business.name : <span className="opacity-0">…</span>}
        </h1>
        <p className="text-body-sm opacity-90">
          {event.name} · {event.starts_on} – {event.ends_on}
        </p>
      </header>

      <main className="px-4 py-4">
        {/* Progress bar */}
        <div className="pt-1 pb-3">
          <div className="flex gap-1">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className={`h-1 flex-1 rounded-full ${
                  n <= step ? 'bg-brand-orange' : 'bg-ink-900/10'
                }`}
              />
            ))}
          </div>
          <p className="mt-1 text-body-sm text-ink-500">Step {step} of 3</p>
        </div>

        {/* Honeypot — CSS-hidden, must remain empty */}
        <input
          type="text"
          name="company"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          className="absolute left-[-9999px] h-0 w-0 opacity-0"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
        />

        {step === 1 && (
          <PickStep
            products={products}
            qtys={qtys}
            setQtys={setQtys}
            onContinue={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <ContactStep
            products={products}
            qtys={qtys}
            name={name}
            setName={setName}
            phone={phone}
            setPhone={setPhone}
            notes={notes}
            setNotes={setNotes}
            onBack={() => setStep(1)}
            onContinue={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <ConfirmStep
            event={event}
            products={products}
            qtys={qtys}
            name={name}
            phone={phone}
            notes={notes}
            error={error}
            submitting={submitting}
            onBack={() => setStep(2)}
            onPlace={onSubmit}
          />
        )}
      </main>
    </div>
  );
}

function FailLanding({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper-surface p-8 text-center">
      <p className="text-body text-ink-700">{message}</p>
    </div>
  );
}
