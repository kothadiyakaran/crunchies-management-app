// TYPE-only import — erased at compile time. Runtime callers obtain the
// jsPDF constructor via `loadJsPDF()` in orders/billPdf.ts (dynamic import →
// its own chunk) and pass it as the third arg to `buildEventFlyerPdf`, the
// same lazy-loading contract that keeps jspdf out of the main bundle.
import type { jsPDF } from 'jspdf';
import type { BusinessInfo } from '@/features/orders/billPdf';

/** Dynamically imports `qrcode` so it lands in its own chunk, fetched only
 *  when mom taps "Share QR" — never part of the main bundle. `margin: 2`
 *  gives the QR a real quiet zone; `width: 800` is print-sharp at the
 *  ~100mm size it's placed on the flyer. */
export async function loadQrCodeDataUrl(url: string): Promise<string> {
  const QRCode = await import('qrcode');
  return QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 2, width: 800 });
}

export type EventFlyerInput = {
  eventName: string;
  venueLine: string | null;
  /** Full public order-form URL, e.g. "https://crunchies.app/order/diwali-2026" —
   *  encoded in the QR and also printed as a plain-text manual-entry fallback. */
  url: string;
};

const INK_900: [number, number, number] = [0x1a, 0x1a, 0x1a];
const INK_700: [number, number, number] = [0x4a, 0x4a, 0x4a];
const BRAND_DEEP: [number, number, number] = [0xa6, 0x42, 0x0e];
const TAGLINE_ON_BAND: [number, number, number] = [0xed, 0xd9, 0xcf];

const PAGE_W = 210; // A4 portrait mm
const MARGIN = 12;

export function buildEventFlyerPdf(
  input: EventFlyerInput,
  business: BusinessInfo,
  jsPDFCtor: typeof jsPDF,
  qrDataUrl: string,
): jsPDF {
  const pdf = new jsPDFCtor({ unit: 'mm', format: 'a4' });
  pdf.setFont('helvetica');

  const contentWidth = PAGE_W - 2 * MARGIN;

  // Header band — same brand-deep band + business name as the bill PDF, so
  // everything mom prints from the app reads as one family.
  const bandTop = MARGIN + 6;
  const bandHeight = 26;
  pdf.setFillColor(...BRAND_DEEP);
  pdf.rect(MARGIN, bandTop, contentWidth, bandHeight, 'F');

  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(26);
  pdf.setFont('helvetica', 'bold');
  pdf.text(business.name, PAGE_W / 2, bandTop + 12, { align: 'center' });

  if (business.tagline) {
    pdf.setTextColor(...TAGLINE_ON_BAND);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(business.tagline.toUpperCase(), PAGE_W / 2, bandTop + 20, { align: 'center' });
  }

  let cursor = bandTop + bandHeight + 16;

  pdf.setTextColor(...INK_900);
  pdf.setFontSize(20);
  pdf.setFont('helvetica', 'bold');
  pdf.text(input.eventName, PAGE_W / 2, cursor, { align: 'center' });

  if (input.venueLine) {
    cursor += 8;
    pdf.setTextColor(...INK_700);
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'normal');
    pdf.text(input.venueLine, PAGE_W / 2, cursor, { align: 'center' });
  }

  cursor += 16;
  pdf.setTextColor(...INK_900);
  pdf.setFontSize(15);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Scan to order', PAGE_W / 2, cursor, { align: 'center' });

  // Large, centered, high-contrast QR — this is the thing a phone camera
  // needs to lock onto from across a stall table.
  cursor += 10;
  const qrSize = 110;
  const qrX = (PAGE_W - qrSize) / 2;
  pdf.addImage(qrDataUrl, 'PNG', qrX, cursor, qrSize, qrSize);
  cursor += qrSize + 14;

  // Plain-text URL fallback for phones that can't scan — wrapped defensively
  // in case a long slug would otherwise overflow the page margins.
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...INK_700);
  const urlLines: string[] = pdf.splitTextToSize(input.url, contentWidth - 20);
  urlLines.forEach((line) => {
    pdf.text(line, PAGE_W / 2, cursor, { align: 'center' });
    cursor += 6;
  });

  return pdf;
}
