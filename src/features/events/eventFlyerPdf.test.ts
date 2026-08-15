import { describe, it, expect } from 'vitest';
import { jsPDF } from 'jspdf';
import { buildEventFlyerPdf, type EventFlyerInput } from './eventFlyerPdf';
import type { BusinessInfo } from '@/features/orders/billPdf';

const business: BusinessInfo = {
  name: 'Test Snacks',
  tagline: null,
  addressLines: [],
  gstLine: null,
  phone: null,
  whatsapp: null,
  email: null,
  billFooter: '',
  signatureLine: '',
};

// Smallest valid PNG (1x1, transparent) — addImage is given explicit w/h
// below so it doesn't need to trust this fixture's own pixel dimensions.
const QR_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const baseInput: EventFlyerInput = {
  eventName: 'Diwali Mela 2026',
  venueLine: 'Stall 14, Aundh Fair Ground',
  url: 'https://crunchies.app/order/diwali-mela-2026',
};

describe('buildEventFlyerPdf', () => {
  it('includes business name, event name and the plain URL as text', () => {
    const pdf = buildEventFlyerPdf(baseInput, business, jsPDF, QR_DATA_URL);
    const text = extractAllText(pdf);
    expect(text).toContain('Test Snacks');
    expect(text).toContain('Diwali Mela 2026');
    expect(text).toContain('crunchies.app/order/diwali-mela-2026');
  });

  it('includes the venue line when present', () => {
    const text = extractAllText(buildEventFlyerPdf(baseInput, business, jsPDF, QR_DATA_URL));
    expect(text).toContain('Aundh Fair Ground');
  });

  it('omits venue text when venueLine is null', () => {
    const text = extractAllText(
      buildEventFlyerPdf({ ...baseInput, venueLine: null }, business, jsPDF, QR_DATA_URL),
    );
    expect(text).not.toContain('Aundh');
  });

  it('renders the "Scan to order" instruction', () => {
    const text = extractAllText(buildEventFlyerPdf(baseInput, business, jsPDF, QR_DATA_URL));
    expect(text).toContain('Scan to order');
  });

  it('returns a Blob from .output("blob")', () => {
    const pdf = buildEventFlyerPdf(baseInput, business, jsPDF, QR_DATA_URL);
    const blob = pdf.output('blob');
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/pdf');
  });
});

// jsPDF exposes the rendered text command stream via internal.pages — see
// billPdf.test.ts's extractAllText for why this (stable, private) API is
// the right way to assert on rendered PDF content.
function extractAllText(pdf: import('jspdf').jsPDF): string {
  const pages = (pdf as unknown as { internal: { pages: string[][] } }).internal.pages;
  return pages.flat().join('\n');
}
