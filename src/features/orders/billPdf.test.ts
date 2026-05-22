import { describe, it, expect } from 'vitest';
import { buildBillPdf, formatBillCurrency, type BillInput, type BusinessInfo } from './billPdf';

const business: BusinessInfo = {
  name: 'Test Snacks',
  tagline: null,
  addressLines: ['Line A', 'Line B'],
  gstLine: 'GSTIN: 27XXXX',
  phone: '9999999999',
  whatsapp: null,
  email: null,
  billFooter: 'Thanks!',
  signatureLine: '-- Mom',
};

const baseInput: BillInput = {
  billNumber: 1042,
  orderedAt: '2026-05-22T10:00:00+05:30',
  customerName: 'Sunita Patil',
  customerPhone: '9876543210',
  items: [
    // Fixture names deliberately avoid parens: jsPDF text strings encode
    // `(` and `)` as `\(` / `\)` in the content stream, breaking the raw
    // substring check in extractAllText. Production has no such issue
    // because the iframe-rendered PDF un-escapes them visually.
    { name: 'Laddu box', qty: 2, unitPrice: 200, lineTotal: 400 },
    { name: 'Chivda kg', qty: 1, unitPrice: 180, lineTotal: 180 },
  ],
  subtotal: 580,
  paymentStatus: 'unpaid',
};

describe('buildBillPdf', () => {
  it('includes business name and bill number in the rendered text', () => {
    const pdf = buildBillPdf(baseInput, business);
    const text = extractAllText(pdf);
    expect(text).toContain('Test Snacks');
    expect(text).toContain('#1042');
  });

  it('renders every item with name, qty and line total', () => {
    const pdf = buildBillPdf(baseInput, business);
    const text = extractAllText(pdf);
    expect(text).toContain('Laddu box');
    expect(text).toContain('Chivda kg');
    expect(text).toContain('400');
    expect(text).toContain('180');
  });

  it('renders the subtotal as Total', () => {
    const pdf = buildBillPdf(baseInput, business);
    const text = extractAllText(pdf);
    expect(text).toContain('580');
  });

  it('falls back to "Rs." when no font is provided (test environment)', () => {
    const pdf = buildBillPdf(baseInput, business);
    expect(extractAllText(pdf)).toContain('Rs.');
  });

  it('does not throw when fontBase64 is a malformed stub', () => {
    // Real base64 would be ~700KB; a stub will fail addFont parsing internally.
    // The generator catches the failure and falls back to helvetica — verify
    // it still produces a valid PDF rather than throwing.
    const pdf = buildBillPdf(baseInput, business, { fontBase64: { regular: 'STUB', bold: 'STUB' } });
    expect(pdf.output('blob')).toBeInstanceOf(Blob);
  });

  it('formatBillCurrency returns ₹ when font is present, Rs. when not', () => {
    expect(formatBillCurrency(580, true)).toMatch(/^₹/);
    expect(formatBillCurrency(580, false)).toMatch(/^Rs\./);
  });

  it('renders PAID stamp when payment_status=paid; no UNPAID/PARTIAL stamp otherwise', () => {
    // PAID is a positive customer-facing receipt and keeps a prominent stamp.
    const paid = extractAllText(buildBillPdf({ ...baseInput, paymentStatus: 'paid' }, business));
    expect(paid).toContain('PAID');

    // UNPAID/PARTIAL get a small inline payment-status line under the Total
    // instead of the prominent stamp — see redesign rationale in billPdf.ts.
    // The literal strings "UNPAID" / "PARTIAL" must NOT appear in the rendered PDF.
    const unpaid = extractAllText(buildBillPdf({ ...baseInput, paymentStatus: 'unpaid' }, business));
    expect(unpaid).not.toContain('UNPAID');
    expect(unpaid).toContain('Payment due');

    const partial = extractAllText(buildBillPdf({ ...baseInput, paymentStatus: 'partial' }, business));
    expect(partial).not.toContain('PARTIAL');
    expect(partial).toContain('balance due');
  });

  it('renders "Received on {date}" under the PAID stamp when paidAt is set', () => {
    const text = extractAllText(
      buildBillPdf({ ...baseInput, paymentStatus: 'paid', paidAt: '2026-05-22' }, business),
    );
    expect(text).toMatch(/Received on/i);
    // The formatted date renderer produces "22 May 2026" in en-IN locale.
    expect(text).toContain('22 May 2026');
  });

  it('omits the "Received on" caption when paidAt is null', () => {
    const text = extractAllText(
      buildBillPdf({ ...baseInput, paymentStatus: 'paid', paidAt: null }, business),
    );
    expect(text).not.toMatch(/Received on/i);
    // The PAID stamp itself still renders.
    expect(text).toContain('PAID');
  });

  it('includes the signature line', () => {
    // ASCII fixture: Helvetica (test fallback) is WinAnsi-encoded and strips
    // U+2014 em-dash; production runs with NotoSans which handles it. The
    // invariant we want to verify is that signatureLine flows into the PDF
    // at all, not the exact glyph encoding.
    const pdf = buildBillPdf(baseInput, business);
    expect(extractAllText(pdf)).toContain('-- Mom');
  });

  it('omits the GST line when business.gstLine is null', () => {
    const pdf = buildBillPdf(baseInput, { ...business, gstLine: null });
    expect(extractAllText(pdf)).not.toContain('GSTIN');
  });

  it('returns a Blob from .output("blob")', () => {
    const pdf = buildBillPdf(baseInput, business);
    const blob = pdf.output('blob');
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/pdf');
  });
});

// jsPDF exposes the rendered text command stream via internal.pages — each page
// is an array of PDF content-stream lines. Joining gives a searchable string.
// (Private API but stable across jspdf 2.5.x — we tilde-pinned for this reason.)
function extractAllText(pdf: import('jspdf').jsPDF): string {
  const pages = (pdf as unknown as { internal: { pages: string[][] } }).internal.pages;
  return pages.flat().join('\n');
}
