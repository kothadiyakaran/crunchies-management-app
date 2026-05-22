import { useEffect, useId, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDialogA11y } from '@/lib/a11y';
import {
  createEvent,
  updateEvent,
  deleteEvent,
  getEventDetail,
  upsertEventDemand,
  deleteEventDemand,
  duplicateEvent,
  listActiveInHouseProducts,
  type EventDemandRow,
} from './api';
import { slugify, defaultLeadWeeks, eventWindowState } from './eventLogic';
import { todayInTz } from '@/lib/utils';

type Kind = 'festival' | 'exhibition' | 'other';

type Product = { id: string; name: string; unit: string };

const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: 'festival', label: 'Festival' },
  { value: 'exhibition', label: 'Exhibition' },
  { value: 'other', label: 'Other' },
];

const SLUG_RE = /^[a-z0-9-]+$/;

const inputClass =
  'mt-1 h-11 w-full rounded-input border border-ink-900/10 bg-paper-elevated px-3 text-body';
const labelSpan = 'text-label uppercase text-ink-500';

/** datetime-local value (`YYYY-MM-DDTHH:MM`) → ISO string for Supabase. */
function localToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** ISO timestamp → `YYYY-MM-DDTHH:MM` for a datetime-local input. */
function isoToLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  // Local-time slice that <input type="datetime-local"> expects.
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;
  const navigate = useNavigate();

  // Header
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Kind>('exhibition');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [leadWeeks, setLeadWeeks] = useState(defaultLeadWeeks('exhibition'));
  const [leadWeeksUserSet, setLeadWeeksUserSet] = useState(false);
  const [active, setActive] = useState(true);

  // Exhibition-only
  const [slug, setSlug] = useState('');
  const [pickupStart, setPickupStart] = useState('');
  const [pickupEnd, setPickupEnd] = useState('');
  const [venueLine, setVenueLine] = useState('');

  // Demand grid
  const [products, setProducts] = useState<Product[]>([]);
  const [demand, setDemand] = useState<Record<string, string>>({}); // product_id -> string for input
  const [originalDemand, setOriginalDemand] = useState<EventDemandRow[]>([]);

  // Misc
  const [notes, setNotes] = useState('');

  // Lifecycle / UX
  const [loading, setLoading] = useState(isEditing);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [savedToast, setSavedToast] = useState(false);
  const [copied, setCopied] = useState(false);

  // Hydrate products list (always).
  useEffect(() => {
    listActiveInHouseProducts()
      .then((ps) => setProducts(ps))
      .catch((e: Error) => setError(e.message));
  }, []);

  // Hydrate event in edit mode.
  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const detail = await getEventDetail(id);
        if (!detail) {
          setError('Event not found.');
          setLoading(false);
          return;
        }
        const ev = detail.event;
        setName(ev.name);
        setKind(ev.kind);
        setStartsOn(ev.starts_on);
        setEndsOn(ev.ends_on);
        setLeadWeeks(ev.lead_weeks);
        setLeadWeeksUserSet(true); // existing event — don't auto-adjust on kind change
        setActive(ev.active);
        setSlug(ev.slug ?? '');
        setPickupStart(isoToLocal(ev.pickup_window_start));
        setPickupEnd(isoToLocal(ev.pickup_window_end));
        setVenueLine(ev.venue_line ?? '');
        setOriginalDemand(detail.demand);
        const next: Record<string, string> = {};
        for (const d of detail.demand) {
          next[d.product_id] = String(Number(d.expected_qty));
        }
        setDemand(next);
        setLoading(false);
      } catch (e) {
        setError((e as Error).message);
        setLoading(false);
      }
    })();
  }, [id]);

  function onKindChange(next: Kind) {
    setKind(next);
    if (!isEditing && !leadWeeksUserSet) {
      setLeadWeeks(defaultLeadWeeks(next));
    }
  }

  function onLeadWeeksChange(next: number) {
    if (Number.isNaN(next)) return;
    const clamped = Math.max(0, Math.min(12, Math.round(next)));
    setLeadWeeks(clamped);
    setLeadWeeksUserSet(true);
  }

  // Retrospective (edit mode + past event only).
  const today = todayInTz();
  const isPast = isEditing && endsOn !== '' && endsOn < today;
  const retro = useMemo(() => {
    if (!isPast) return null;
    let totalExpected = 0;
    const perProduct: { productId: string; expected: number }[] = [];
    for (const d of originalDemand) {
      const expected =
        d.committed_expected_qty != null ? Number(d.committed_expected_qty) : Number(d.expected_qty);
      totalExpected += expected;
      perProduct.push({ productId: d.product_id, expected });
    }
    return { totalExpected, perProduct };
  }, [isPast, originalDemand]);

  // Slug preview (exhibition only) — only used when slug field is blank.
  const slugPreview = useMemo(() => {
    if (kind !== 'exhibition') return '';
    if (!name.trim() || !startsOn) return '';
    const year = new Date(`${startsOn}T00:00:00Z`).getUTCFullYear();
    if (Number.isNaN(year)) return '';
    return slugify(name, year);
  }, [kind, name, startsOn]);

  const effectiveSlug = slug.trim() || slugPreview;
  const publicUrl = effectiveSlug ? `crunchies.app/order/${effectiveSlug}` : '';

  // Edit-mode dates-shift warning.
  const dateShiftWarning =
    isEditing && startsOn !== '' && endsOn !== '' && eventWindowState(startsOn, endsOn, today) !== 'upcoming';

  function validate(): string[] {
    const errs: string[] = [];
    if (!name.trim()) errs.push('Name is required.');
    if (!startsOn) errs.push('Start date is required.');
    if (!endsOn) errs.push('End date is required.');
    if (startsOn && endsOn && endsOn < startsOn) errs.push('End date must be on or after the start date.');
    if (leadWeeks < 0 || leadWeeks > 12) errs.push('Lead weeks must be between 0 and 12.');
    if (kind === 'exhibition' && slug.trim() && !SLUG_RE.test(slug.trim())) {
      errs.push('Slug must contain only lowercase letters, digits, and hyphens.');
    }
    for (const p of products) {
      const raw = demand[p.id];
      if (raw === undefined || raw === '') continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        errs.push(`Expected qty for "${p.name}" must be zero or positive.`);
      }
    }
    return errs;
  }

  async function persistDemand(eventId: string) {
    const previousByProduct = new Map<string, EventDemandRow>();
    for (const d of originalDemand) previousByProduct.set(d.product_id, d);

    for (const p of products) {
      const raw = demand[p.id];
      const n = raw === undefined || raw === '' ? 0 : Number(raw);
      const had = previousByProduct.has(p.id);
      if (n > 0) {
        await upsertEventDemand(eventId, p.id, n, null);
      } else if (had) {
        await deleteEventDemand(eventId, p.id);
      }
      // n === 0 and !had → skip
    }
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    const errs = validate();
    setValidationErrors(errs);
    if (errs.length > 0) return;

    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        kind,
        starts_on: startsOn,
        ends_on: endsOn,
        lead_weeks: leadWeeks,
        slug: kind === 'exhibition' ? (slug.trim() || null) : null,
        active,
        pickup_window_start: kind === 'exhibition' ? localToIso(pickupStart) : null,
        pickup_window_end: kind === 'exhibition' ? localToIso(pickupEnd) : null,
        venue_line: kind === 'exhibition' ? (venueLine.trim() || null) : null,
      };

      if (isEditing && id) {
        await updateEvent(id, payload);
        await persistDemand(id);
        // Refresh originalDemand snapshot so further saves diff against the new state.
        const detail = await getEventDetail(id);
        if (detail) {
          setOriginalDemand(detail.demand);
          if (detail.event.slug) setSlug(detail.event.slug);
        }
        setSavedToast(true);
        setTimeout(() => setSavedToast(false), 2000);
      } else {
        const newId = await createEvent(payload);
        await persistDemand(newId);
        navigate(`/events/${newId}`);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function onDuplicate() {
    if (!id) return;
    try {
      const newId = await duplicateEvent(id);
      navigate(`/events/${newId}`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function onConfirmDelete() {
    if (!id) return;
    setDeleting(true);
    try {
      await deleteEvent(id);
      navigate('/events');
    } catch (err) {
      setError((err as Error).message);
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function onCopyLink() {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(`https://${publicUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Surface but don't blow up — clipboard fails in some test/PWA contexts.
      setError('Could not copy to clipboard.');
    }
  }

  function onWhatsAppShare() {
    if (!publicUrl) return;
    const message = `Hi! Place your order for ${name} here: ${publicUrl}`;
    const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-title text-ink-900">{isEditing ? 'Edit event' : 'Add event'}</h1>
        <p className="mt-6 text-body-sm text-ink-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="pb-24">
      <h1 className="text-title text-ink-900">{isEditing ? 'Edit event' : 'Add event'}</h1>

      {/* Retrospective summary card */}
      {isPast && retro && (
        <section className="mt-4 rounded-card bg-brand-orangeSoft p-4">
          <p className={labelSpan}>
            RETROSPECTIVE ({name} — closed)
          </p>
          <p className="mt-2 text-body text-ink-900">
            {retro.totalExpected > 0
              ? <>Total: Expected {retro.totalExpected} units → Actual <span className="text-ink-500">Sprint 8</span></>
              : <>Total: <span className="text-ink-500">—</span></>}
          </p>
          <p className="mt-1 text-body-sm text-ink-700">
            {retro.perProduct.length > 0 ? (
              <>Top variance: <span className="text-ink-500">Sprint 8</span></>
            ) : (
              <>Top variance: —</>
            )}
          </p>
          <p className="mt-3 text-body-sm">
            <Link to="/reports?tab=trends" className="font-semibold text-brand-orange underline">
              → View full breakdown in Reports
            </Link>
          </p>
        </section>
      )}

      <form onSubmit={onSave} className="mt-6 space-y-4">
        {/* Name */}
        <label className="block">
          <span className={labelSpan}>Name</span>
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus={!isEditing}
          />
        </label>

        {/* Kind */}
        <div>
          <span className={labelSpan}>Kind</span>
          <div className="mt-1 flex gap-2">
            {KIND_OPTIONS.map((k) => (
              <button
                key={k.value}
                type="button"
                onClick={() => onKindChange(k.value)}
                className={`h-9 rounded-pill border px-3 text-body-sm ${
                  kind === k.value
                    ? 'border-brand-orange bg-brand-orange text-white'
                    : 'border-ink-900/20 bg-paper text-ink-900'
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={labelSpan}>Starts on</span>
            <input
              type="date"
              className={inputClass}
              value={startsOn}
              onChange={(e) => setStartsOn(e.target.value)}
            />
          </label>
          <label className="block">
            <span className={labelSpan}>Ends on</span>
            <input
              type="date"
              className={inputClass}
              value={endsOn}
              onChange={(e) => setEndsOn(e.target.value)}
            />
          </label>
        </div>

        {dateShiftWarning && (
          <p className="text-body-sm text-ink-500">
            This will shift the lead-up window. Production for affected weeks may re-distribute.
          </p>
        )}

        {/* Lead weeks stepper */}
        <div>
          <span className={labelSpan}>Lead weeks (production ramp-up)</span>
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onLeadWeeksChange(leadWeeks - 1)}
              disabled={leadWeeks <= 0}
              className="h-11 w-11 rounded-btn border border-ink-900/10 bg-paper-elevated text-body text-ink-900 disabled:opacity-50"
              aria-label="Decrease lead weeks"
            >
              −
            </button>
            <input
              type="number"
              min={0}
              max={12}
              className="h-11 w-20 rounded-input border border-ink-900/10 bg-paper-elevated px-3 text-center text-body"
              value={leadWeeks}
              onChange={(e) => onLeadWeeksChange(parseInt(e.target.value, 10))}
            />
            <button
              type="button"
              onClick={() => onLeadWeeksChange(leadWeeks + 1)}
              disabled={leadWeeks >= 12}
              className="h-11 w-11 rounded-btn border border-ink-900/10 bg-paper-elevated text-body text-ink-900 disabled:opacity-50"
              aria-label="Increase lead weeks"
            >
              +
            </button>
            <span className="ml-1 text-body-sm text-ink-500">weeks</span>
          </div>
        </div>

        {/* Active toggle */}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-5 w-5"
          />
          <span className="text-body text-ink-900">Active</span>
        </label>

        {/* Public URL — exhibition only */}
        {kind === 'exhibition' && (
          <section className="rounded-card bg-paper-elevated p-4">
            <p className={labelSpan}>Public URL</p>
            <p className="mt-2 break-all text-body text-ink-900">
              {effectiveSlug ? (
                <>{slug ? '' : 'Will be: '}<span className="font-mono">{publicUrl}</span></>
              ) : (
                <span className="text-ink-500">Enter a name and start date to preview the URL.</span>
              )}
            </p>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={onCopyLink}
                disabled={!publicUrl}
                className="h-11 flex-1 rounded-btn border border-ink-900/10 bg-paper px-3 text-body font-semibold text-ink-900 disabled:opacity-50"
              >
                {copied ? 'Copied!' : 'Copy link'}
              </button>
              <button
                type="button"
                onClick={onWhatsAppShare}
                disabled={!publicUrl}
                className="h-11 flex-1 rounded-btn border border-ink-900/10 bg-paper px-3 text-body font-semibold text-ink-900 disabled:opacity-50"
              >
                Share via WhatsApp
              </button>
            </div>

            <label className="mt-3 block">
              <span className={labelSpan}>Custom slug (optional)</span>
              <input
                className={`${inputClass} font-mono`}
                placeholder={slugPreview || 'auto-generated'}
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
              />
              <span className="mt-1 block text-body-sm text-ink-500">
                Lowercase letters, digits, and hyphens only.
              </span>
            </label>
          </section>
        )}

        {/* Pickup window + venue — exhibition only */}
        {kind === 'exhibition' && (
          <section className="rounded-card bg-paper-elevated p-4">
            <p className={labelSpan}>Pickup window + venue (optional)</p>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className={labelSpan}>Pickup starts</span>
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={pickupStart}
                  onChange={(e) => setPickupStart(e.target.value)}
                />
              </label>
              <label className="block">
                <span className={labelSpan}>Pickup ends</span>
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={pickupEnd}
                  onChange={(e) => setPickupEnd(e.target.value)}
                />
              </label>
            </div>
            <label className="mt-3 block">
              <span className={labelSpan}>Venue</span>
              <input
                className={inputClass}
                placeholder="Stall 14, Aundh Fair Ground"
                value={venueLine}
                onChange={(e) => setVenueLine(e.target.value)}
              />
            </label>
          </section>
        )}

        {/* Expected demand grid */}
        <section>
          <p className={labelSpan}>Expected demand</p>
          {products.length === 0 ? (
            <p className="mt-2 text-body-sm text-ink-500">
              No active in-house products yet. Add one from Products first.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {products.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-3 rounded-card bg-paper-elevated p-3"
                >
                  <span className="flex-1 text-body text-ink-900">{p.name}</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    className="h-11 w-24 rounded-input border border-ink-900/10 bg-paper px-3 text-right text-body"
                    value={demand[p.id] ?? ''}
                    onChange={(e) =>
                      setDemand((prev) => ({ ...prev, [p.id]: e.target.value }))
                    }
                  />
                  <span className="w-14 text-body-sm text-ink-500">{p.unit}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Notes */}
        <label className="block">
          <span className={labelSpan}>Notes (optional)</span>
          <textarea
            className="mt-1 w-full rounded-input border border-ink-900/10 bg-paper-elevated px-3 py-2 text-body"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder='e.g. "based on 2025 Diwali — bumped 10%"'
          />
        </label>

        {validationErrors.length > 0 && (
          <ul className="space-y-1 text-body-sm text-status-danger-fg">
            {validationErrors.map((m, i) => (
              <li key={i}>• {m}</li>
            ))}
          </ul>
        )}
        {error && <p className="text-body-sm text-status-danger-fg">{error}</p>}
        {savedToast && <p className="text-body-sm text-status-success-fg">Saved.</p>}

        <button
          type="submit"
          disabled={submitting}
          className="h-11 w-full rounded-btn bg-brand-orange text-body font-semibold text-white disabled:opacity-50"
        >
          {submitting ? 'Saving…' : isEditing ? 'Save changes' : 'Save event'}
        </button>

        {isEditing && (
          <div className="flex flex-col gap-2 pt-2">
            <button
              type="button"
              onClick={onDuplicate}
              className="h-11 w-full rounded-btn border border-ink-900/10 bg-paper-elevated text-body font-semibold text-ink-900"
            >
              Duplicate to next year
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="h-11 w-full rounded-btn border border-status-danger-fg/30 bg-paper-elevated text-body font-semibold text-status-danger-fg"
            >
              Delete event
            </button>
          </div>
        )}

        <p className="text-body-sm text-ink-500">
          <Link to="/events" className="underline">
            ← Back to events
          </Link>
        </p>
      </form>

      {confirmDelete && (
        <DeleteEventDialog
          name={name}
          deleting={deleting}
          onCancel={() => !deleting && setConfirmDelete(false)}
          onConfirm={onConfirmDelete}
        />
      )}
    </div>
  );
}

function DeleteEventDialog({
  name,
  deleting,
  onCancel,
  onConfirm,
}: {
  name: string;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const { closeBtnRef } = useDialogA11y(onCancel);
  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-ink-900/40"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-paper-elevated p-5 shadow-2xl"
      >
        <h2 id={titleId} className="text-subtitle text-ink-900">Delete {name}?</h2>
        <p className="mt-2 text-body text-ink-700">
          This will remove the event, its expected demand entries, and its retrospective.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="h-11 flex-1 rounded-btn-sm border border-ink-900/10 bg-paper-elevated text-body text-ink-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="h-11 flex-1 rounded-btn bg-status-danger-fg text-body font-semibold text-white disabled:opacity-50"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </>
  );
}
