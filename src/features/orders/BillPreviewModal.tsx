import { useEffect, useId, useState } from 'react';
import { buildBillPdf, loadJsPDF, loadNotoSansBase64, type BillInput } from './billPdf';
import { useSettings } from '@/features/settings/SettingsContext';
import type { OrderDetailRow } from './api';
import { allocateBillNumber } from './api';
import { useDialogA11y } from '@/lib/a11y';

type Props = {
  order: OrderDetailRow;
  onClose: () => void;
  onAllocated: (billNumber: number) => void; // parent reloads to refresh badge
};

export function BillPreviewModal({ order, onClose, onAllocated }: Props) {
  const { settings } = useSettings();
  const [billNumber, setBillNumber] = useState<number | null>(order.bill_number);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const titleId = useId();
  const { closeBtnRef } = useDialogA11y(onClose);

  useEffect(() => {
    // Wait until settings have loaded — buildBillPdf needs the business identity.
    if (!settings) return;
    // Capture the URL in a closure-local var so the cleanup can revoke whatever
    // we created (the `pdfUrl` state setter is async — depending on it in the
    // cleanup would close over the initial null value and leak every preview).
    let createdUrl: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        // jspdf is now a dynamic chunk (Sprint 10 T10.3) — fetched in parallel
        // with the bill-number allocation + font load so we don't add latency.
        const [n, fontBase64, jsPDFCtor] = await Promise.all([
          billNumber ?? allocateBillNumber(order.id),
          loadNotoSansBase64().catch(() => undefined), // ₹ degrades to "Rs." if font load fails
          loadJsPDF(),
        ]);
        if (cancelled) return;
        if (n !== billNumber) {
          setBillNumber(n);
          onAllocated(n);
        }
        const pdf = buildBillPdf(toBillInput(order, n), settings, jsPDFCtor, { fontBase64 });
        const blob = pdf.output('blob');
        createdUrl = URL.createObjectURL(blob);
        setPdfUrl(createdUrl);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  async function onShare() {
    if (!billNumber || !settings) return;
    setSharing(true);
    let dlUrl: string | null = null;
    try {
      // jspdf chunk already in browser cache from the preview effect — second
      // dynamic import resolves instantly from module cache, no extra fetch.
      const [fontBase64, jsPDFCtor] = await Promise.all([
        loadNotoSansBase64().catch(() => undefined),
        loadJsPDF(),
      ]);
      const pdf = buildBillPdf(toBillInput(order, billNumber), settings, jsPDFCtor, { fontBase64 });
      const blob = pdf.output('blob');
      const file = new File([blob], `bill-${billNumber}.pdf`, { type: 'application/pdf' });
      const shareData: ShareData = {
        files: [file],
        title: `Bill #${billNumber}`,
        text: `Hi ${order.customer_name}, please find your bill attached.`,
      };
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share(shareData);
      } else {
        const a = document.createElement('a');
        dlUrl = URL.createObjectURL(blob);
        a.href = dlUrl;
        a.download = `bill-${billNumber}.pdf`;
        a.click();
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    } finally {
      if (dlUrl) URL.revokeObjectURL(dlUrl);
      setSharing(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-ink-900/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-paper-elevated p-4 shadow-xl"
      >
        <header className="flex items-baseline justify-between">
          <h2 id={titleId} className="text-subtitle text-ink-900">
            Bill {billNumber ? `#${billNumber}` : '…'}
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close bill preview"
            className="text-body-sm text-ink-500"
          >
            Close
          </button>
        </header>
        {error && <p className="mt-2 text-body-sm text-status-danger-fg">{error}</p>}
        {pdfUrl ? (
          <iframe
            title="bill preview"
            src={pdfUrl}
            className="mt-3 h-[60vh] w-full rounded border border-ink-900/10"
          />
        ) : (
          <p className="mt-3 text-body-sm text-ink-500">
            {settings ? 'Generating…' : 'Loading business details…'}
          </p>
        )}
        <button
          type="button"
          onClick={onShare}
          disabled={!pdfUrl || !settings || sharing}
          className="mt-4 h-11 w-full rounded-btn bg-brand-orange text-body font-semibold text-white disabled:opacity-50"
        >
          {sharing ? 'Sharing…' : 'Share'}
        </button>
      </div>
    </>
  );
}

function toBillInput(o: OrderDetailRow, billNumber: number): BillInput {
  return {
    billNumber,
    orderedAt: o.ordered_at,
    customerName: o.customer_name,
    customerPhone: o.customer_phone,
    items: o.items.map((it) => ({
      name: it.product_name,
      qty: it.qty,
      unitPrice: it.unit_price,
      lineTotal: it.line_total,
    })),
    subtotal: o.subtotal,
    paymentStatus: o.payment_status,
    paidAt: o.paid_at,
  };
}
