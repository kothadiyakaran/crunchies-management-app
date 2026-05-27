// TYPE-only import — erased at compile time, does NOT trigger the jspdf chunk
// to be bundled into modules that import this file. Runtime callers must
// obtain the jsPDF constructor via `loadJsPDF()` (dynamic import → its own
// chunk) and pass it as the third arg to `buildBillPdf`. See ADR-42 +
// Sprint 10 T10.3 — the goal is that jspdf only downloads when mom actually
// taps "Generate bill", not when she opens an order detail page.
import type { jsPDF } from 'jspdf';
import { orderTotal } from './discount';

/** Dynamically imports jspdf and returns the constructor. Use this at the
 *  call site (e.g. when the user taps "Generate bill") so Vite splits jspdf
 *  into its own chunk that is fetched on demand. */
export async function loadJsPDF(): Promise<typeof jsPDF> {
  const mod = await import('jspdf');
  return mod.jsPDF;
}

/** Business identity rendered on the bill. Sourced from the `business_settings`
 *  row (Sprint 9 T9.1) and consumed by `buildBillPdf` below. Also re-exported
 *  by `@/features/settings/api` so `useSettings().settings` and the bill
 *  generator share a single type definition. */
export type BusinessInfo = {
  name: string;
  tagline: string | null;
  addressLines: string[]; // each rendered as its own line under the name
  gstLine: string | null; // e.g. "GSTIN: 27ABCDE1234F1Z5" — null hides the line
  phone: string | null;
  whatsapp: string | null; // 10-digit IN number, no +91; null hides the line
  email: string | null;
  billFooter: string; // small line below signature, e.g. "Thank you"
  signatureLine: string; // shown above the rule, e.g. "— Archana"
};

export type BillItem = {
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
};

export type BillInput = {
  billNumber: number;
  orderedAt: string; // ISO timestamp from orders.ordered_at
  customerName: string;
  customerPhone: string | null;
  items: BillItem[];
  subtotal: number;
  /** Per-order snapshot (0–100). When > 0 the totals block shows Subtotal /
   *  Discount / Total; at 0 the bill is a single Total line as before. */
  discountPercent: number;
  paymentStatus: 'unpaid' | 'paid' | 'partial';
  /** `orders.paid_at` (Postgres `date`). Used only for the "Received on {date}"
   *  caption under the PAID stamp; ignored when payment_status != 'paid' or null. */
  paidAt?: string | null;
};

export type BuildBillOpts = {
  /** Base64-encoded NotoSans TTFs. When provided, the PDF uses ₹ and proper
   *  bold weight for headings/totals/stamps. When omitted (e.g. unit tests),
   *  falls back to "Rs." + Helvetica (no bold synthesis either). */
  fontBase64?: { regular: string; bold: string };
};

/** Lazy-loaded singleton — both font weights fetched in parallel on first bill render. */
let _notoCache: Promise<{ regular: string; bold: string }> | null = null;
export function loadNotoSansBase64(): Promise<{ regular: string; bold: string }> {
  if (!_notoCache) {
    _notoCache = Promise.all([fetchAsBase64('/fonts/NotoSans-Regular.ttf'), fetchAsBase64('/fonts/NotoSans-Bold.ttf')])
      .then(([regular, bold]) => ({ regular, bold }));
  }
  return _notoCache;
}

async function fetchAsBase64(url: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`font load failed: ${url} ${r.status}`);
  const buf = await r.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

/** Public helper, exported for unit tests. */
export function formatBillCurrency(n: number, fontHasRupee: boolean): string {
  const num = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n);
  return fontHasRupee ? `₹${num}` : `Rs. ${num}`;
}

// brand.orange from design tokens
const BRAND_ORANGE: [number, number, number] = [0xf2, 0x80, 0x0c];
const INK_900: [number, number, number] = [0x1a, 0x1a, 0x1a];
const INK_700: [number, number, number] = [0x4a, 0x4a, 0x4a];
const INK_500: [number, number, number] = [0x6b, 0x6b, 0x6b];

const PAGE_W = 210; // A4 portrait mm
const PAGE_H = 297;
const MARGIN = 12;
const INNER_PAD = 4;

export function buildBillPdf(
  input: BillInput,
  business: BusinessInfo,
  jsPDFCtor: typeof jsPDF,
  opts: BuildBillOpts = {},
): jsPDF {
  const pdf = new jsPDFCtor({ unit: 'mm', format: 'a4' });
  // Font: when fontBase64 supplied (runtime), embed NotoSans and use ₹.
  // Otherwise (tests / no font available) fall back to Helvetica + "Rs.".
  //
  // Gotcha: jsPDF 2.5.x publishes addFont parse errors via its internal PubSub
  // system rather than throwing — a plain try/catch is insufficient. We sanity-
  // check the payload size up-front (real NotoSans base64 is ~830KB; stubs and
  // truncated downloads are orders of magnitude smaller) so obvious garbage
  // never reaches addFont. Anything that slips through and produces a half-
  // registered font would later fail inside pdf.text() — the runtime BillPreview
  // modal still degrades gracefully because it wraps loadNotoSansBase64() in
  // .catch(() => undefined).
  let fontHasRupee = false;
  const both = opts.fontBase64;
  if (both && both.regular.length >= 1000 && both.bold.length >= 1000) {
    try {
      pdf.addFileToVFS('NotoSans-Regular.ttf', both.regular);
      pdf.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
      pdf.addFileToVFS('NotoSans-Bold.ttf', both.bold);
      pdf.addFont('NotoSans-Bold.ttf', 'NotoSans', 'bold');
      pdf.setFont('NotoSans', 'normal');
      fontHasRupee = true;
    } catch {
      pdf.setFont('helvetica');
    }
  } else {
    pdf.setFont('helvetica');
  }
  const fontFamily = fontHasRupee ? 'NotoSans' : 'helvetica';
  const setBold = () => pdf.setFont(fontFamily, 'bold');
  const setNormal = () => pdf.setFont(fontFamily, 'normal');
  const money = (n: number) => formatBillCurrency(n, fontHasRupee);

  // Double-border frame (outer + inner)
  pdf.setDrawColor(...INK_900);
  pdf.setLineWidth(0.6);
  pdf.rect(MARGIN, MARGIN, PAGE_W - 2 * MARGIN, PAGE_H - 2 * MARGIN);
  pdf.setLineWidth(0.2);
  pdf.rect(MARGIN + INNER_PAD, MARGIN + INNER_PAD, PAGE_W - 2 * (MARGIN + INNER_PAD), PAGE_H - 2 * (MARGIN + INNER_PAD));

  const contentLeft = MARGIN + INNER_PAD + 4;
  const contentRight = PAGE_W - MARGIN - INNER_PAD - 4;
  const contentWidth = contentRight - contentLeft;

  // Header band — brand orange
  const bandTop = MARGIN + INNER_PAD + 4;
  pdf.setFillColor(...BRAND_ORANGE);
  pdf.rect(MARGIN + INNER_PAD, bandTop, PAGE_W - 2 * (MARGIN + INNER_PAD), 18, 'F');

  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(18);
  setBold();
  pdf.text(business.name, PAGE_W / 2, bandTop + 8, { align: 'center' });
  if (business.tagline) {
    pdf.setFontSize(10);
    setNormal();
    pdf.text(business.tagline, PAGE_W / 2, bandTop + 14, { align: 'center' });
  }

  // Address + GST + contact (below the band)
  let cursor = bandTop + 24;
  pdf.setTextColor(...INK_700);
  pdf.setFontSize(9);
  business.addressLines.forEach((line) => {
    pdf.text(line, PAGE_W / 2, cursor, { align: 'center' });
    cursor += 4;
  });
  if (business.gstLine) {
    pdf.text(business.gstLine, PAGE_W / 2, cursor, { align: 'center' });
    cursor += 4;
  }
  const contactBits = [business.phone, business.whatsapp ? `WA: ${business.whatsapp}` : null, business.email]
    .filter((x): x is string => !!x)
    .join(' · ');
  if (contactBits) {
    pdf.text(contactBits, PAGE_W / 2, cursor, { align: 'center' });
    cursor += 4;
  }

  // Bill identifier block + customer
  cursor += 4;
  pdf.setFontSize(11);
  pdf.setTextColor(...INK_900);
  setBold();
  pdf.text(`#${input.billNumber}`, contentRight, cursor, { align: 'right' });
  setNormal();
  pdf.setFontSize(9);
  pdf.text(formatDate(input.orderedAt), contentRight, cursor + 5, { align: 'right' });

  pdf.setFontSize(11);
  setBold();
  pdf.text(input.customerName, contentLeft, cursor);
  if (input.customerPhone) {
    pdf.setFontSize(9);
    setNormal();
    pdf.text(input.customerPhone, contentLeft, cursor + 5);
  }
  cursor += 12;

  // Items table
  const colX = [contentLeft, contentLeft + contentWidth * 0.55, contentLeft + contentWidth * 0.72, contentRight];
  pdf.setFillColor(...BRAND_ORANGE);
  pdf.rect(contentLeft - 1, cursor - 4, contentWidth + 2, 7, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(9);
  setBold();
  pdf.text('Product', colX[0]!, cursor);
  pdf.text('Qty', colX[1]!, cursor, { align: 'right' });
  pdf.text('Unit', colX[2]!, cursor, { align: 'right' });
  pdf.text('Total', colX[3]!, cursor, { align: 'right' });
  cursor += 7;

  pdf.setTextColor(...INK_900);
  setNormal();
  input.items.forEach((it) => {
    pdf.text(it.name, colX[0]!, cursor);
    pdf.text(String(it.qty), colX[1]!, cursor, { align: 'right' });
    pdf.text(money(it.unitPrice), colX[2]!, cursor, { align: 'right' });
    pdf.text(money(it.lineTotal), colX[3]!, cursor, { align: 'right' });
    cursor += 6;
  });

  // Totals — when a discount applies, show Subtotal / Discount / Total;
  // otherwise a single Total line (unchanged from a no-discount bill).
  const { discount, total } = orderTotal(input.subtotal, input.discountPercent);
  cursor += 2;
  pdf.setDrawColor(...INK_900);
  pdf.setLineWidth(0.3);
  pdf.line(contentLeft + contentWidth * 0.55, cursor, contentRight, cursor);
  cursor += 5;
  pdf.setFontSize(11);
  if (input.discountPercent > 0) {
    setNormal();
    pdf.text('Subtotal', colX[2]!, cursor, { align: 'right' });
    pdf.text(money(input.subtotal), colX[3]!, cursor, { align: 'right' });
    cursor += 6;
    pdf.text(`Discount (${input.discountPercent}%)`, colX[2]!, cursor, { align: 'right' });
    pdf.text(`-${money(discount)}`, colX[3]!, cursor, { align: 'right' });
    cursor += 6;
  }
  setBold();
  pdf.text('Total', colX[2]!, cursor, { align: 'right' });
  pdf.text(money(total), colX[3]!, cursor, { align: 'right' });
  cursor += 14;

  // Payment status — asymmetric treatment by design.
  //
  // PAID gets a green stamp box — a positive receipt acknowledgment mom WANTS
  // her customer to see (and the customer wants for their own records).
  //
  // UNPAID / PARTIAL get a small inline line under the Total, not a stamp.
  // The customer already knows they haven't paid; stamping UNPAID across the
  // bottom of the bill she hands them feels accusatory. This line is neutral
  // ink-700 typography in the same column as the Total — informational, not
  // a warning. See docs/decisions/2026-05-22-sprint-8-architecture-decisions.md
  // for the design rationale.
  if (input.paymentStatus === 'paid') {
    const stampW = 32;
    const stampH = 10;
    const stampX = (PAGE_W - stampW) / 2;
    const stampColor: [number, number, number] = [0x15, 0x80, 0x3d]; // status.ok.border
    pdf.setDrawColor(...stampColor);
    pdf.setLineWidth(0.6);
    pdf.rect(stampX, cursor, stampW, stampH);
    pdf.setTextColor(...stampColor);
    pdf.setFontSize(12);
    setBold();
    pdf.text('PAID', PAGE_W / 2, cursor + 7, { align: 'center' });
    cursor += stampH;
    if (input.paidAt) {
      pdf.setTextColor(...INK_500);
      pdf.setFontSize(9);
      setNormal();
      pdf.text(`Received on ${formatDate(input.paidAt)}`, PAGE_W / 2, cursor + 5, { align: 'center' });
      cursor += 5;
    }
    cursor += 14;
  } else {
    // Right-aligned to match the Total column; neutral typography.
    const msg = input.paymentStatus === 'partial'
      ? 'Partial payment received · balance due on collection'
      : 'Payment due on collection';
    pdf.setTextColor(...INK_700);
    pdf.setFontSize(10);
    setNormal();
    pdf.text(msg, contentRight, cursor, { align: 'right' });
    cursor += 18;
  }

  // Signature line
  const sigW = 60;
  const sigX = PAGE_W - MARGIN - INNER_PAD - 4 - sigW;
  pdf.setDrawColor(...INK_900);
  pdf.setLineWidth(0.2);
  pdf.line(sigX, cursor, sigX + sigW, cursor);
  pdf.setTextColor(...INK_500);
  pdf.setFontSize(9);
  setNormal();
  pdf.text(business.signatureLine, sigX + sigW / 2, cursor + 5, { align: 'center' });
  cursor += 14;

  // Footer note
  pdf.setFontSize(9);
  pdf.text(business.billFooter, PAGE_W / 2, cursor, { align: 'center' });

  return pdf;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
