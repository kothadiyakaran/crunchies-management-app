import { useEffect, useId, useRef, useState } from 'react';
import { buildEventFlyerPdf, loadQrCodeDataUrl } from './eventFlyerPdf';
import { loadJsPDF, type BusinessInfo } from '@/features/orders/billPdf';
import { renderPdfFirstPage } from '@/features/orders/pdfPreview';
import { useDialogA11y } from '@/lib/a11y';

type Props = {
  eventName: string;
  venueLine: string | null;
  url: string; // full https:// public order-form URL — encoded in the QR
  slug: string; // used for the shared/downloaded filename, qr-<slug>.pdf
  settings: BusinessInfo | null;
  onClose: () => void;
};

export function EventFlyerModal({ eventName, venueLine, url, slug, settings, onClose }: Props) {
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [rendered, setRendered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const titleId = useId();
  const { closeBtnRef } = useDialogA11y(onClose);

  // Effect 1: build the PDF blob once settings are available.
  useEffect(() => {
    // Wait until settings have loaded — buildEventFlyerPdf needs the business identity.
    if (!settings) return;
    let cancelled = false;
    setError(null);
    (async () => {
      try {
        // qrcode and jspdf are both dynamic chunks, fetched in parallel so
        // neither adds serial latency to the flyer's first render.
        const [qrDataUrl, jsPDFCtor] = await Promise.all([loadQrCodeDataUrl(url), loadJsPDF()]);
        if (cancelled) return;
        const pdf = buildEventFlyerPdf({ eventName, venueLine, url }, settings, jsPDFCtor, qrDataUrl);
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
  }, [settings, url]);

  // Effect 2: rasterise the first PDF page onto the canvas once both are ready.
  // Canvas instead of <iframe src={blob:}> — Android WebView can't render
  // blob: PDF URLs. AbortController cancels an in-progress pdfjs render when
  // the modal closes (same as BillPreviewModal's effect 2).
  useEffect(() => {
    if (!pdfBlob || !canvasRef.current) return;
    let cancelled = false;
    const controller = new AbortController();
    setError(null);
    const canvas = canvasRef.current;
    (async () => {
      try {
        const width = canvas.clientWidth || canvas.parentElement?.clientWidth || 0;
        if (width <= 0) {
          if (!cancelled) setError('Preview container has no width');
          return;
        }
        await renderPdfFirstPage(pdfBlob, canvas, width, controller.signal);
        if (!cancelled) setRendered(true);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [pdfBlob]);

  async function onShare() {
    if (!settings) return;
    setSharing(true);
    let dlUrl: string | null = null;
    try {
      // Both chunks already cached in the browser from the build effect —
      // these dynamic imports resolve instantly from module cache.
      const [qrDataUrl, jsPDFCtor] = await Promise.all([loadQrCodeDataUrl(url), loadJsPDF()]);
      const pdf = buildEventFlyerPdf({ eventName, venueLine, url }, settings, jsPDFCtor, qrDataUrl);
      const blob = pdf.output('blob');
      const file = new File([blob], `qr-${slug}.pdf`, { type: 'application/pdf' });
      const shareData: ShareData = {
        files: [file],
        title: `QR flyer — ${eventName}`,
        text: `Scan this QR to order from ${eventName}.`,
      };
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share(shareData);
      } else {
        const a = document.createElement('a');
        dlUrl = URL.createObjectURL(blob);
        a.href = dlUrl;
        a.download = `qr-${slug}.pdf`;
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
            QR flyer
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close QR flyer preview"
            className="text-body-sm text-ink-500"
          >
            Close
          </button>
        </header>
        {error && <p className="mt-2 text-body-sm text-status-danger-fg">{error}</p>}
        {settings ? (
          <div className="mt-3">
            {!rendered && <p className="text-body-sm text-ink-500">Generating…</p>}
            {/* Scroll wrapper caps the A4-tall canvas at 60vh so Close/Share
                stay reachable on small phones — same as BillPreviewModal.
                tabIndex + aria-label make the scrollable region keyboard-
                reachable (axe scrollable-region-focusable). */}
            <div
              className="max-h-[60vh] overflow-y-auto"
              role="region"
              aria-label="QR flyer preview"
              tabIndex={0}
            >
              <canvas
                ref={canvasRef}
                className="w-full rounded border border-ink-900/10"
                style={{ visibility: rendered ? 'visible' : 'hidden' }}
              />
            </div>
          </div>
        ) : (
          <p className="mt-3 text-body-sm text-ink-500">Loading business details…</p>
        )}
        <button
          type="button"
          onClick={onShare}
          disabled={!settings || sharing}
          className="mt-4 h-11 w-full rounded-btn bg-brand-orange text-body font-semibold text-white disabled:opacity-50"
        >
          {sharing ? 'Sharing…' : 'Share'}
        </button>
      </div>
    </>
  );
}
