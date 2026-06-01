// Settings page — single form for the business identity row.
// Sprint 9 T9.2. Reads from useSettings(), writes via updateSettings(), then
// calls refresh() so all in-tree consumers (BillPreviewModal etc. once T9.3
// lands) see the new values without a full page reload.
//
// Toast pattern: inline savedToast boolean auto-clearing after 2s — matches
// EventDetailPage.tsx (no sonner dependency in v1; see plan T9.2 note).

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/features/auth/AuthProvider';
import { useSettings } from './SettingsContext';
import { updateSettings, type BusinessInfo } from './api';
import { cleanPhone, isValidIndianMobile } from '@/features/public/phoneValidation';
import { useRouteFocus } from '@/lib/a11y';

const EMAIL_RE = /.+@.+\..+/;

export function SettingsPage() {
  const { settings, refresh, loading, error: ctxError } = useSettings();
  const { user, signOut } = useAuth();

  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [addressText, setAddressText] = useState('');
  const [gstLine, setGstLine] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [billFooter, setBillFooter] = useState('Thank you');
  const [signatureLine, setSignatureLine] = useState('— Archana');

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [savedToast, setSavedToast] = useState(false);
  const h1Ref = useRef<HTMLHeadingElement>(null);
  useRouteFocus(h1Ref);

  // Hydrate fields from context once settings load.
  useEffect(() => {
    if (!settings) return;
    setName(settings.name);
    setTagline(settings.tagline ?? '');
    setAddressText((settings.addressLines ?? []).join('\n'));
    setGstLine(settings.gstLine ?? '');
    setPhone(settings.phone ?? '');
    setWhatsapp(settings.whatsapp ?? '');
    setEmail(settings.email ?? '');
    setBillFooter(settings.billFooter);
    setSignatureLine(settings.signatureLine);
  }, [settings]);

  const nameTrimmed = name.trim();
  const billFooterTrimmed = billFooter.trim();
  const signatureTrimmed = signatureLine.trim();
  const phoneTrimmed = phone.trim();
  const whatsappTrimmed = whatsapp.trim();
  const emailTrimmed = email.trim();

  const requiredOk =
    nameTrimmed.length > 0 && billFooterTrimmed.length > 0 && signatureTrimmed.length > 0;
  const phoneOk = phoneTrimmed === '' || isValidIndianMobile(phoneTrimmed);
  const whatsappOk = whatsappTrimmed === '' || isValidIndianMobile(whatsappTrimmed);
  const emailOk = emailTrimmed === '' || EMAIL_RE.test(emailTrimmed);

  const canSubmit = requiredOk && phoneOk && whatsappOk && emailOk && !submitting;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const addressLines = addressText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      const patch: Partial<BusinessInfo> = {
        name: nameTrimmed,
        tagline: tagline.trim() || null,
        addressLines,
        gstLine: gstLine.trim() || null,
        phone: phoneTrimmed ? cleanPhone(phoneTrimmed) : null,
        whatsapp: whatsappTrimmed ? cleanPhone(whatsappTrimmed) : null,
        email: emailTrimmed || null,
        billFooter: billFooterTrimmed,
        signatureLine: signatureTrimmed,
      };

      await updateSettings(patch);
      await refresh();
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2000);
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    'mt-1 h-11 w-full rounded-input border border-ink-900/10 bg-paper-elevated px-3 text-body';
  const textareaClass =
    'mt-1 w-full rounded-input border border-ink-900/10 bg-paper-elevated px-3 py-2 text-body';
  const labelSpan = 'text-label uppercase text-ink-500';
  const sectionH = 'text-subtitle text-ink-900';

  return (
    <div>
      <header className="flex items-center gap-3">
        <Link
          to="/"
          aria-label="Back"
          className="-ml-1 flex h-9 w-9 items-center justify-center rounded-btn-sm text-ink-700"
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </Link>
        <h1 ref={h1Ref} tabIndex={-1} className="text-title text-ink-900 focus:outline-none">Settings</h1>
      </header>

      {loading && !settings && (
        <p className="mt-6 text-body-sm text-ink-500">Loading…</p>
      )}

      {ctxError && (
        <p className="mt-4 rounded-card bg-status-danger-bg p-3 text-body-sm text-status-danger-fg">
          Could not load settings: {ctxError.message}
        </p>
      )}

      {settings && (
        <form onSubmit={onSubmit} className="mt-6 space-y-8">
          {/* Identity ------------------------------------------------------ */}
          <section className="space-y-4">
            <h2 className={sectionH}>Identity</h2>

            <label className="block">
              <span className={labelSpan}>Business name</span>
              <input
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-required="true"
              />
            </label>

            <label className="block">
              <span className={labelSpan}>Tagline (optional)</span>
              <input
                className={inputClass}
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
              />
            </label>

            <label className="block">
              <span className={labelSpan}>Address (one line per row)</span>
              <textarea
                className={textareaClass}
                rows={3}
                value={addressText}
                onChange={(e) => setAddressText(e.target.value)}
              />
            </label>
          </section>

          {/* Bill ---------------------------------------------------------- */}
          <section className="space-y-4">
            <h2 className={sectionH}>Bill</h2>

            <label className="block">
              <span className={labelSpan}>GST number (optional)</span>
              <input
                className={inputClass}
                placeholder="GSTIN: 27ABCDE1234F1Z5"
                value={gstLine}
                onChange={(e) => setGstLine(e.target.value)}
              />
            </label>

            <label className="block">
              <span className={labelSpan}>Bill footer</span>
              <input
                className={inputClass}
                value={billFooter}
                onChange={(e) => setBillFooter(e.target.value)}
              />
            </label>

            <label className="block">
              <span className={labelSpan}>Signature line</span>
              <input
                className={inputClass}
                value={signatureLine}
                onChange={(e) => setSignatureLine(e.target.value)}
              />
            </label>
          </section>

          {/* Contact ------------------------------------------------------- */}
          <section className="space-y-4">
            <h2 className={sectionH}>Contact</h2>

            <label className="block">
              <span className={labelSpan}>Phone (optional)</span>
              <input
                className={inputClass}
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                aria-invalid={phoneTrimmed !== '' && !phoneOk}
              />
              {phoneTrimmed !== '' && !phoneOk && (
                <span className="mt-1 block text-body-sm text-status-danger-fg">
                  Enter a 10-digit Indian mobile number.
                </span>
              )}
            </label>

            <label className="block">
              <span className={labelSpan}>WhatsApp (optional)</span>
              <input
                className={inputClass}
                type="tel"
                inputMode="tel"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                aria-invalid={whatsappTrimmed !== '' && !whatsappOk}
              />
              {whatsappTrimmed !== '' && !whatsappOk && (
                <span className="mt-1 block text-body-sm text-status-danger-fg">
                  Enter a 10-digit Indian mobile number.
                </span>
              )}
            </label>

            <label className="block">
              <span className={labelSpan}>Email (optional)</span>
              <input
                className={inputClass}
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={emailTrimmed !== '' && !emailOk}
              />
              {emailTrimmed !== '' && !emailOk && (
                <span className="mt-1 block text-body-sm text-status-danger-fg">
                  Enter a valid email address.
                </span>
              )}
            </label>
          </section>

          {formError && (
            <p className="text-body-sm text-status-danger-fg">{formError}</p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={!canSubmit}
              className="h-11 flex-1 rounded-btn bg-brand-orange text-body font-semibold text-white disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Save changes'}
            </button>
            {savedToast && (
              <span className="text-body-sm text-status-success-fg" role="status">
                Saved.
              </span>
            )}
          </div>
        </form>
      )}

      <section className="mt-8 border-t border-rule pt-6">
        <h2 className={sectionH}>Account</h2>
        {user?.email && (
          <p className="mt-2 text-body-sm text-ink-500">{user.email}</p>
        )}
        <button
          type="button"
          onClick={signOut}
          className="mt-3 h-11 w-full rounded-btn border border-ink-900/10 bg-paper-elevated text-body text-ink-900"
        >
          Sign out
        </button>
      </section>
    </div>
  );
}
