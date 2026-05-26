import { useEffect, useId, useRef, useState } from 'react';
import { buildBillPdf, loadJsPDF, loadNotoSansBase64, type BillInput } from './billPdf';
import { renderPdfFirstPage } from './pdfPreview';
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
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [rendered, setRendered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const titleId = useId();
  const { closeBtnRef } = useDialogA11y(onClose);

  // Effect 1: build the PDF blob once settings are available.
  useEffect(() => {
    // Wait until settings have loaded — buildBillPdf needs the business identity.
    if (!settings) return;
    let cancelled = false;
    (async () => {
      try {
        // jspdf is a dynamic chunk (Sprint 10 T10.3) — fetched in parallel
        // with the bill-number allocation + font load to avoid adding latency.
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
        if (!cancelled) setPdfBlob(blob);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  // Effect 2: rasterise the first PDF page onto the canvas once both are ready.
  // Canvas element must already be mounted (settings truthy) before this runs.
  // Using canvas instead of <iframe src={blob:}> because Android WebView can't
  // render blob: PDF URLs — it shows a dead "PDF + Open" placeholder.
  useEffect(() => {
    if (!pdfBlob || !canvasRef.current) return;
    let cancelled = false;
    const canvas = canvasRef.current;
    (async () => {
      try {
        const width = canvas.clientWidth || canvas.parentElement?.clientWidth || 0;
        if (width <= 0) {
          if (!cancelled) setError('Preview container has no width');
          return;
        }
        await renderPdfFirstPage(pdfBlob, canvas, width);
        if (!cancelled) setRendered(true);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfBlob]);

  async function onShare() {
    if (!billNumber || !settings) return;
    setSharing(true);
    let dlUrl: string | null = null;
    try {
      // jspdf chunk already in browser cache from the build effect — second
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
        {settings ? (
          <div className="mt-3">
            {!rendered && (
              <p className="text-body-sm text-ink-500">Generating…</p>
            )}
            {/* Canvas stays mounted once settings load so the ref is available
                when pdfBlob arrives. visibility:hidden (not display:none) keeps
                the canvas in layout so clientWidth is non-zero when pdfjs sizes
                the viewport. */}
            <canvas
              ref={canvasRef}
              className="w-full rounded border border-ink-900/10"
              style={{ visibility: rendered ? 'visible' : 'hidden' }}
            />
          </div>
        ) : (
          <p className="mt-3 text-body-sm text-ink-500">Loading business details…</p>
        )}
        <button
          type="button"
          onClick={onShare}
          disabled={!billNumber || !settings || sharing}
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
