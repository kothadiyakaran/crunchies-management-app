import { useEffect, useState } from 'react';
import { buildBillPdf, loadNotoSansBase64, type BillInput } from './billPdf';
import { useSettings } from '@/features/settings/SettingsContext';
import type { OrderDetailRow } from './api';
import { allocateBillNumber } from './api';

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
        const [n, fontBase64] = await Promise.all([
          billNumber ?? allocateBillNumber(order.id),
          loadNotoSansBase64().catch(() => undefined), // ₹ degrades to "Rs." if font load fails
        ]);
        if (cancelled) return;
        if (n !== billNumber) {
          setBillNumber(n);
          onAllocated(n);
        }
        const pdf = buildBillPdf(toBillInput(order, n), settings, { fontBase64 });
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
      const fontBase64 = await loadNotoSansBase64().catch(() => undefined);
      const pdf = buildBillPdf(toBillInput(order, billNumber), settings, { fontBase64 });
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
      <div className="fixed inset-0 z-40 bg-ink-900/40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-paper-elevated p-4 shadow-xl">
        <header className="flex items-baseline justify-between">
          <h2 className="text-subtitle text-ink-900">
            Bill {billNumber ? `#${billNumber}` : '…'}
          </h2>
          <button onClick={onClose} className="text-body-sm text-ink-500">
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
