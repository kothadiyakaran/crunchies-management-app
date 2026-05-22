# Sprint 5 — Order lens part 2 (bill / complaint / edit / batch)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Karan (the orchestrator) reviews after each task.

**Goal:** Close out the Order lens with the four remaining capabilities from §7 of `docs/v1-spec.md` — bill generation (jsPDF + OS share sheet, traditional variant B), complaint logging, edit order, and batch entry mode — so the order surface is feature-complete for v1.

**Architecture:** Stays on the established pattern. Bill PDF is a pure generator function returning a `jsPDF` instance, kept separate from the React preview/share modal that consumes it (testable without a DOM). Bill numbers are allocated via a Postgres RPC backed by the existing `bill_number_seq` sequence to make first-allocation atomic. Complaints get their own thin API module and a bottom-sheet component (reusing the Sprint 3 portal-less Tailwind overlay pattern from `ProductDetailSheet`). Edit Order reuses the §7 accordion by parametrising `AddOrderPage` with an optional `editingOrderId` prop; Batch Entry is a new flat-form page reached via the Browse/Batch toggle on `/orders`. Business-name / address / GST / contact / footer come from a new `src/lib/business.ts` constants file (Sprint 9 will swap the reads to a real Settings table — single find-replace).

**Tech Stack:** Vite + React 18 + TypeScript strict + Tailwind + Supabase JS + Vitest/RTL. New runtime dep: `jspdf` (~80kb gzipped, mature, MIT). No animation library, no Radix/Headless UI. Web Share API (`navigator.share` with files) for the OS share-sheet hand-off; download-fallback when the Level-2 file-share isn't supported (desktop browsers).

---

## File map (created or modified)

**Created:**
- `src/lib/business.ts` — business-identity constants for the bill (Sprint 9 swap-out point).
- `src/features/orders/complaintsApi.ts` — `listComplaintsForOrder`, `createComplaint`, `updateComplaint`, types.
- `src/features/orders/ComplaintSheet.tsx` — bottom-sheet form for `Log complaint` / `Edit complaint`.
- `src/features/orders/billPdf.ts` — pure `buildBillPdf(detail, businessInfo, billNumber): jsPDF` generator.
- `src/features/orders/billPdf.test.ts` — text/layout invariants on the generated PDF.
- `src/features/orders/BillPreviewModal.tsx` — preview + Share/Download buttons.
- `src/features/orders/EditOrderPage.tsx` — thin wrapper that mounts `<AddOrderPage editingOrderId={id} />`.
- `src/features/orders/BatchEntryPage.tsx` — `/orders/batch`, flat always-visible form + running list.
- `supabase/migrations/0004_bill_number_rpc.sql` — `allocate_bill_number(order_id uuid) returns int`.

**Modified:**
- `src/features/orders/api.ts` — add `allocateBillNumber`, `updateOrderItems`, extend `OrderRow` with `bill_number`.
- `src/features/orders/AddOrderPage.tsx` — add optional `editingOrderId` prop; in edit mode, hydrate state from `getOrderDetail`, call `updateOrder` + `updateOrderItems` instead of `createOrderWithItems`.
- `src/features/orders/OrderDetailPage.tsx` — activate `Generate bill`, `Log complaint`, `Edit order`; render complaints sub-section; show `bill_number` when set.
- `src/features/orders/OrdersPage.tsx` — add `Browse | Batch entry` mode toggle that routes to `/orders/batch`.
- `src/App.tsx` — add `/orders/batch` and `/orders/:id/edit` routes.
- `package.json`, `package-lock.json` — `jspdf` dependency.
- `CLAUDE.md` — Sprint 5 status line at the end of this plan.
- `docs/decisions/2026-05-22-sprint-5-architecture-decisions.md` — ADR-17..21 (created).

---

## Task 1: Install jsPDF + create business constants

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `src/lib/business.ts`

- [ ] **Step 1: Install jspdf**

```powershell
npm install jspdf@^2.5.1
```

Expected: `package.json` and `package-lock.json` updated; no peer-dep warnings.

- [ ] **Step 2: Verify typecheck still passes**

```powershell
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Create `src/lib/business.ts`**

```ts
// Business identity used on the bill PDF. Sprint 9 will replace these reads with
// a Settings table lookup; until then this file is the single source of truth.
// Mom-provided values are pending — defaults are placeholders Karan will edit
// in this file before showing mom her first generated bill.

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

export const BUSINESS_INFO: BusinessInfo = {
  name: 'Crunchies by Archana',
  tagline: 'Homemade traditional snacks',
  addressLines: ['Aundh, Pune 411007'],
  gstLine: null,
  phone: null,
  whatsapp: null,
  email: null,
  billFooter: 'Thank you',
  signatureLine: '— Archana',
};
```

- [ ] **Step 4: Commit**

```powershell
git add package.json package-lock.json src/lib/business.ts
git commit -m "Sprint 5 Task 1: jspdf + BUSINESS_INFO constants"
```

---

## Task 2: Bill PDF pure generator (TDD)

**Files:**
- Create: `src/features/orders/billPdf.ts`
- Test: `src/features/orders/billPdf.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/features/orders/billPdf.test.ts
import { describe, it, expect } from 'vitest';
import { buildBillPdf, type BillInput } from './billPdf';
import type { BusinessInfo } from '@/lib/business';

const business: BusinessInfo = {
  name: 'Test Snacks',
  tagline: null,
  addressLines: ['Line A', 'Line B'],
  gstLine: 'GSTIN: 27XXXX',
  phone: '9999999999',
  whatsapp: null,
  email: null,
  billFooter: 'Thanks!',
  signatureLine: '— Mom',
};

const baseInput: BillInput = {
  billNumber: 1042,
  orderedAt: '2026-05-22T10:00:00+05:30',
  customerName: 'Sunita Patil',
  customerPhone: '9876543210',
  items: [
    { name: 'Laddu (box)', qty: 2, unitPrice: 200, lineTotal: 400 },
    { name: 'Chivda (kg)', qty: 1, unitPrice: 180, lineTotal: 180 },
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
    expect(text).toContain('Laddu (box)');
    expect(text).toContain('Chivda (kg)');
    expect(text).toContain('400');
    expect(text).toContain('180');
  });

  it('renders the subtotal as Total', () => {
    const pdf = buildBillPdf(baseInput, business);
    const text = extractAllText(pdf);
    expect(text).toContain('580');
  });

  it('stamps PAID / UNPAID / PARTIAL based on payment_status', () => {
    expect(extractAllText(buildBillPdf({ ...baseInput, paymentStatus: 'paid' }, business))).toContain('PAID');
    expect(extractAllText(buildBillPdf({ ...baseInput, paymentStatus: 'unpaid' }, business))).toContain('UNPAID');
    expect(extractAllText(buildBillPdf({ ...baseInput, paymentStatus: 'partial' }, business))).toContain('PARTIAL');
  });

  it('includes the signature line', () => {
    const pdf = buildBillPdf(baseInput, business);
    expect(extractAllText(pdf)).toContain('— Mom');
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

// jsPDF stores rendered text in internal `pages` arrays; the simplest text
// extraction is the doc's internal cmd buffer. We use a minimal probe: serialise
// to data-url and decode looking for our search strings. For unit testing
// invariants this is enough.
function extractAllText(pdf: import('jspdf').jsPDF): string {
  // jsPDF exposes the underlying text commands via internal.pages — each page
  // is an array of PDF content stream lines. Joining gives a searchable string.
  // (jsPDF private API but stable across 2.x.)
  const pages = (pdf as unknown as { internal: { pages: string[][] } }).internal.pages;
  return pages.flat().join('\n');
}
```

- [ ] **Step 2: Run tests to verify they fail**

```powershell
npm test -- src/features/orders/billPdf.test.ts
```

Expected: FAIL with "Cannot find module './billPdf'".

- [ ] **Step 3: Implement `buildBillPdf`**

```ts
// src/features/orders/billPdf.ts
import { jsPDF } from 'jspdf';
import type { BusinessInfo } from '@/lib/business';

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
  paymentStatus: 'unpaid' | 'paid' | 'partial';
};

// brand.orange from design tokens
const BRAND_ORANGE: [number, number, number] = [0xf2, 0x80, 0x0c];
const INK_900: [number, number, number] = [0x1a, 0x1a, 0x1a];
const INK_500: [number, number, number] = [0x6b, 0x6b, 0x6b];

const PAGE_W = 210; // A4 portrait mm
const PAGE_H = 297;
const MARGIN = 12;
const INNER_PAD = 4;

export function buildBillPdf(input: BillInput, business: BusinessInfo): jsPDF {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  pdf.setFont('helvetica');

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
  pdf.setFont('helvetica', 'bold');
  pdf.text(business.name, PAGE_W / 2, bandTop + 8, { align: 'center' });
  if (business.tagline) {
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(business.tagline, PAGE_W / 2, bandTop + 14, { align: 'center' });
  }

  // Address + GST + contact (below the band)
  let cursor = bandTop + 24;
  pdf.setTextColor(...INK_700_FROM_500());
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
  pdf.setFont('helvetica', 'bold');
  pdf.text(`#${input.billNumber}`, contentRight, cursor, { align: 'right' });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text(formatDate(input.orderedAt), contentRight, cursor + 5, { align: 'right' });

  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.text(input.customerName, contentLeft, cursor);
  if (input.customerPhone) {
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.text(input.customerPhone, contentLeft, cursor + 5);
  }
  cursor += 12;

  // Items table
  const colX = [contentLeft, contentLeft + contentWidth * 0.55, contentLeft + contentWidth * 0.72, contentRight];
  pdf.setFillColor(...BRAND_ORANGE);
  pdf.rect(contentLeft - 1, cursor - 4, contentWidth + 2, 7, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Product', colX[0]!, cursor);
  pdf.text('Qty', colX[1]!, cursor, { align: 'right' });
  pdf.text('Unit', colX[2]!, cursor, { align: 'right' });
  pdf.text('Total', colX[3]!, cursor, { align: 'right' });
  cursor += 7;

  pdf.setTextColor(...INK_900);
  pdf.setFont('helvetica', 'normal');
  input.items.forEach((it) => {
    pdf.text(it.name, colX[0]!, cursor);
    pdf.text(String(it.qty), colX[1]!, cursor, { align: 'right' });
    pdf.text(formatINRPlain(it.unitPrice), colX[2]!, cursor, { align: 'right' });
    pdf.text(formatINRPlain(it.lineTotal), colX[3]!, cursor, { align: 'right' });
    cursor += 6;
  });

  // Totals
  cursor += 2;
  pdf.setDrawColor(...INK_900);
  pdf.setLineWidth(0.3);
  pdf.line(contentLeft + contentWidth * 0.55, cursor, contentRight, cursor);
  cursor += 5;
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Total', colX[2]!, cursor, { align: 'right' });
  pdf.text(formatINRPlain(input.subtotal), colX[3]!, cursor, { align: 'right' });
  cursor += 14;

  // Payment stamp box
  const stampLabel = input.paymentStatus.toUpperCase(); // PAID / UNPAID / PARTIAL
  const stampW = 38;
  const stampH = 12;
  const stampX = (PAGE_W - stampW) / 2;
  const stampColor: [number, number, number] = input.paymentStatus === 'paid' ? [0x15, 0x80, 0x3d] : [0xb4, 0x53, 0x09];
  pdf.setDrawColor(...stampColor);
  pdf.setLineWidth(0.7);
  pdf.rect(stampX, cursor, stampW, stampH);
  pdf.setTextColor(...stampColor);
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.text(stampLabel, PAGE_W / 2, cursor + 8, { align: 'center' });
  cursor += stampH + 18;

  // Signature line
  const sigW = 60;
  const sigX = PAGE_W - MARGIN - INNER_PAD - 4 - sigW;
  pdf.setDrawColor(...INK_900);
  pdf.setLineWidth(0.2);
  pdf.line(sigX, cursor, sigX + sigW, cursor);
  pdf.setTextColor(...INK_500);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.text(business.signatureLine, sigX + sigW / 2, cursor + 5, { align: 'center' });
  cursor += 14;

  // Footer note
  pdf.setFontSize(9);
  pdf.text(business.billFooter, PAGE_W / 2, cursor, { align: 'center' });

  return pdf;
}

function INK_700_FROM_500(): [number, number, number] {
  return [0x4a, 0x4a, 0x4a];
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatINRPlain(n: number): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```powershell
npm test -- src/features/orders/billPdf.test.ts
```

Expected: all 7 tests pass.

- [ ] **Step 5: Typecheck**

```powershell
npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```powershell
git add src/features/orders/billPdf.ts src/features/orders/billPdf.test.ts
git commit -m "Sprint 5 Task 2: pure bill PDF generator + invariant tests"
```

---

## Task 3: Bill number allocation (Postgres RPC + JS wrapper)

**Files:**
- Create: `supabase/migrations/0004_bill_number_rpc.sql`
- Modify: `src/features/orders/api.ts`
- Test: `src/features/orders/api.billNumber.test.ts`

- [ ] **Step 1: Apply the migration via Supabase MCP**

Use `mcp__supabase__apply_migration` with name `bill_number_rpc` and this SQL:

```sql
-- Allocates a bill number for an order. If the order already has one (e.g. mom
-- regenerates the bill), returns the existing number — the sequence is not
-- advanced. Otherwise pulls nextval from bill_number_seq, persists it on the
-- order row, and returns it. Atomic within the function body.
create or replace function public.allocate_bill_number(p_order_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing int;
  v_new int;
begin
  select bill_number into v_existing from orders where id = p_order_id;
  if v_existing is not null then
    return v_existing;
  end if;
  v_new := nextval('bill_number_seq');
  update orders set bill_number = v_new where id = p_order_id;
  return v_new;
end;
$$;

grant execute on function public.allocate_bill_number(uuid) to authenticated;
```

- [ ] **Step 2: Verify the function exists**

Use `mcp__supabase__execute_sql` to run:

```sql
select proname, prorettype::regtype from pg_proc where proname = 'allocate_bill_number';
```

Expected: one row, returntype `integer`.

- [ ] **Step 3: Add `allocateBillNumber` to `src/features/orders/api.ts`**

Append to `api.ts`:

```ts
export async function allocateBillNumber(orderId: string): Promise<number> {
  const { data, error } = await supabase.rpc('allocate_bill_number', { p_order_id: orderId });
  if (error) throw new Error(error.message);
  if (typeof data !== 'number') throw new Error('allocate_bill_number returned non-numeric');
  return data;
}
```

Also extend `OrderRow` and `OrderDetailRow` (modify their type declarations) to include `bill_number: number | null`, and add `bill_number` to the SELECT lists in `listOrders`, `listOrdersFiltered`, `listTodayPendingOrders`, and `getOrderDetail`.

- [ ] **Step 4: Write integration test for `allocateBillNumber` idempotency**

```ts
// src/features/orders/api.billNumber.test.ts
import { describe, it, expect, vi } from 'vitest';

// Mock the supabase client at the module boundary
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

import { supabase } from '@/lib/supabase';
import { allocateBillNumber } from './api';

describe('allocateBillNumber', () => {
  it('returns the number from the RPC', async () => {
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: 1042, error: null });
    const n = await allocateBillNumber('00000000-0000-0000-0000-000000000001');
    expect(n).toBe(1042);
    expect(supabase.rpc).toHaveBeenCalledWith('allocate_bill_number', {
      p_order_id: '00000000-0000-0000-0000-000000000001',
    });
  });

  it('throws when RPC returns an error', async () => {
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    await expect(allocateBillNumber('x')).rejects.toThrow('boom');
  });

  it('throws when RPC returns a non-numeric payload', async () => {
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: 'oops', error: null });
    await expect(allocateBillNumber('x')).rejects.toThrow('non-numeric');
  });
});
```

- [ ] **Step 5: Run tests + typecheck**

```powershell
npm test -- src/features/orders/api.billNumber.test.ts
npm run typecheck
```

Expected: 3 passing tests; no type errors.

- [ ] **Step 6: Commit**

```powershell
git add supabase/migrations/0004_bill_number_rpc.sql src/features/orders/api.ts src/features/orders/api.billNumber.test.ts
git commit -m "Sprint 5 Task 3: bill_number allocation RPC + JS wrapper"
```

---

## Task 4: Bill preview modal + Generate-bill wiring on OrderDetail

**Files:**
- Create: `src/features/orders/BillPreviewModal.tsx`
- Modify: `src/features/orders/OrderDetailPage.tsx`

- [ ] **Step 1: Create the BillPreviewModal**

```tsx
// src/features/orders/BillPreviewModal.tsx
import { useEffect, useState } from 'react';
import { buildBillPdf, type BillInput } from './billPdf';
import { BUSINESS_INFO } from '@/lib/business';
import type { OrderDetailRow } from './api';
import { allocateBillNumber } from './api';

type Props = {
  order: OrderDetailRow;
  onClose: () => void;
  onAllocated: (billNumber: number) => void; // parent reloads to refresh badge
};

export function BillPreviewModal({ order, onClose, onAllocated }: Props) {
  const [billNumber, setBillNumber] = useState<number | null>(order.bill_number);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const n = billNumber ?? (await allocateBillNumber(order.id));
        if (n !== billNumber) {
          setBillNumber(n);
          onAllocated(n);
        }
        const pdf = buildBillPdf(toBillInput(order, n), BUSINESS_INFO);
        const blob = pdf.output('blob');
        setPdfUrl(URL.createObjectURL(blob));
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onShare() {
    if (!billNumber) return;
    setSharing(true);
    try {
      const pdf = buildBillPdf(toBillInput(order, billNumber), BUSINESS_INFO);
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
        // Fallback: trigger download
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `bill-${billNumber}.pdf`;
        a.click();
        URL.revokeObjectURL(a.href);
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    } finally {
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
          <p className="mt-3 text-body-sm text-ink-500">Generating…</p>
        )}
        <button
          type="button"
          onClick={onShare}
          disabled={!pdfUrl || sharing}
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
  };
}
```

- [ ] **Step 2: Wire `Generate bill` in `OrderDetailPage.tsx`**

In `OrderDetailPage.tsx`:

1. Add `import { BillPreviewModal } from './BillPreviewModal';`.
2. Add `const [billOpen, setBillOpen] = useState(false);` near other state.
3. Replace the disabled `Generate bill (Sprint 5)` button with:
   ```tsx
   <button
     type="button"
     onClick={() => setBillOpen(true)}
     className="h-11 w-full rounded-btn-sm border border-ink-900/10 bg-paper-elevated text-body text-ink-900"
   >
     Generate bill{order.bill_number ? ` (#${order.bill_number})` : ''}
   </button>
   ```
4. At the bottom of the returned JSX, before the `</div>` close:
   ```tsx
   {billOpen && (
     <BillPreviewModal
       order={order}
       onClose={() => setBillOpen(false)}
       onAllocated={() => load()}
     />
   )}
   ```

- [ ] **Step 3: Typecheck + tests**

```powershell
npm run typecheck
npm test -- src/features/orders
```

Expected: no type errors; all order-feature tests still pass.

- [ ] **Step 4: Manually verify the bill flow in the browser**

Launch the app via the `webapp-testing` skill, log in, navigate to an existing order, tap `Generate bill`. Verify:
- Modal opens, PDF iframe renders.
- Bill number shows in the header (`#1001` for the first ever bill).
- Closing and re-opening shows the same bill number (idempotency).
- `Share` triggers the OS share sheet on supported environments (Karan will verify on his Android post-deploy); on desktop browsers it falls back to download.

If the iframe preview shows correctly, take a screenshot and attach it to the commit.

- [ ] **Step 5: Commit**

```powershell
git add src/features/orders/BillPreviewModal.tsx src/features/orders/OrderDetailPage.tsx
git commit -m "Sprint 5 Task 4: Bill preview modal + OS share sheet hand-off"
```

---

## Task 5: Complaints API surface (TDD)

**Files:**
- Create: `src/features/orders/complaintsApi.ts`
- Test: `src/features/orders/complaintsApi.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/features/orders/complaintsApi.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fromMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
}));

import { createComplaint, listComplaintsForOrder, updateComplaint } from './complaintsApi';

beforeEach(() => fromMock.mockReset());

describe('complaints API', () => {
  it('listComplaintsForOrder queries by order_id and orders by reported_at desc', async () => {
    const order = vi.fn().mockResolvedValueOnce({ data: [], error: null });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    fromMock.mockReturnValueOnce({ select });

    await listComplaintsForOrder('order-1');
    expect(fromMock).toHaveBeenCalledWith('complaints');
    expect(eq).toHaveBeenCalledWith('order_id', 'order-1');
    expect(order).toHaveBeenCalledWith('reported_at', { ascending: false });
  });

  it('createComplaint inserts kind + description + today date', async () => {
    const single = vi.fn().mockResolvedValueOnce({ data: { id: 'c1' }, error: null });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    fromMock.mockReturnValueOnce({ insert });

    const id = await createComplaint({ order_id: 'o', kind: 'quality', description: 'salty' });
    expect(id).toBe('c1');
    const insertedPayload = insert.mock.calls[0]![0]!;
    expect(insertedPayload).toMatchObject({
      order_id: 'o',
      kind: 'quality',
      description: 'salty',
    });
    expect(insertedPayload.reported_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('updateComplaint patches resolution + sets resolved_at when resolved=true', async () => {
    const eq = vi.fn().mockResolvedValueOnce({ error: null });
    const update = vi.fn(() => ({ eq }));
    fromMock.mockReturnValueOnce({ update });

    await updateComplaint('c1', { resolution: 'refunded', resolved: true });
    const patch = update.mock.calls[0]![0]!;
    expect(patch.resolution).toBe('refunded');
    expect(patch.resolved_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('updateComplaint clears resolved_at when resolved=false', async () => {
    const eq = vi.fn().mockResolvedValueOnce({ error: null });
    const update = vi.fn(() => ({ eq }));
    fromMock.mockReturnValueOnce({ update });

    await updateComplaint('c1', { resolution: null, resolved: false });
    const patch = update.mock.calls[0]![0]!;
    expect(patch.resolved_at).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```powershell
npm test -- src/features/orders/complaintsApi.test.ts
```

Expected: FAIL with "Cannot find module './complaintsApi'".

- [ ] **Step 3: Implement `complaintsApi.ts`**

```ts
// src/features/orders/complaintsApi.ts
import { supabase } from '@/lib/supabase';
import { todayInTz } from '@/lib/utils';

export type ComplaintKind = 'quality' | 'delivery' | 'wrong_item' | 'other';

export type ComplaintRow = {
  id: string;
  order_id: string;
  reported_at: string; // date YYYY-MM-DD
  kind: ComplaintKind;
  description: string;
  resolution: string | null;
  resolved_at: string | null; // date or null
};

export async function listComplaintsForOrder(orderId: string): Promise<ComplaintRow[]> {
  const { data, error } = await supabase
    .from('complaints')
    .select('id, order_id, reported_at, kind, description, resolution, resolved_at')
    .eq('order_id', orderId)
    .order('reported_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ComplaintRow[];
}

export async function createComplaint(input: {
  order_id: string;
  kind: ComplaintKind;
  description: string;
}): Promise<string> {
  const { data, error } = await supabase
    .from('complaints')
    .insert({
      order_id: input.order_id,
      kind: input.kind,
      description: input.description,
      reported_at: todayInTz(), // `date` column — see project_date_columns memory
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'create complaint failed');
  return data.id;
}

export async function updateComplaint(
  id: string,
  patch: { resolution: string | null; resolved: boolean },
): Promise<void> {
  const { error } = await supabase
    .from('complaints')
    .update({
      resolution: patch.resolution,
      resolved_at: patch.resolved ? todayInTz() : null,
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 4: Run tests + typecheck**

```powershell
npm test -- src/features/orders/complaintsApi.test.ts
npm run typecheck
```

Expected: all 4 tests pass; no type errors.

- [ ] **Step 5: Commit**

```powershell
git add src/features/orders/complaintsApi.ts src/features/orders/complaintsApi.test.ts
git commit -m "Sprint 5 Task 5: complaints API + tests"
```

---

## Task 6: ComplaintSheet + Log/Edit complaint wiring

**Files:**
- Create: `src/features/orders/ComplaintSheet.tsx`
- Modify: `src/features/orders/OrderDetailPage.tsx`

- [ ] **Step 1: Create the ComplaintSheet**

```tsx
// src/features/orders/ComplaintSheet.tsx
import { useState } from 'react';
import {
  createComplaint,
  updateComplaint,
  type ComplaintKind,
  type ComplaintRow,
} from './complaintsApi';

type Props = {
  orderId: string;
  existing: ComplaintRow | null;
  onClose: () => void;
  onSaved: () => void;
};

const KINDS: { value: ComplaintKind; label: string }[] = [
  { value: 'quality', label: 'Quality' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'wrong_item', label: 'Wrong item' },
  { value: 'other', label: 'Other' },
];

export function ComplaintSheet({ orderId, existing, onClose, onSaved }: Props) {
  const [kind, setKind] = useState<ComplaintKind>(existing?.kind ?? 'quality');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [resolution, setResolution] = useState(existing?.resolution ?? '');
  const [resolved, setResolved] = useState(existing?.resolved_at !== null && existing?.resolved_at !== undefined);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSave() {
    if (!description.trim()) {
      setError('Description is required.');
      return;
    }
    setSaving(true);
    try {
      if (existing) {
        await updateComplaint(existing.id, {
          resolution: resolution.trim() || null,
          resolved,
        });
      } else {
        await createComplaint({ order_id: orderId, kind, description: description.trim() });
      }
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-ink-900/40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-paper-elevated p-4 shadow-xl">
        <header className="flex items-baseline justify-between">
          <h2 className="text-subtitle text-ink-900">
            {existing ? 'Edit complaint' : 'Log complaint'}
          </h2>
          <button onClick={onClose} className="text-body-sm text-ink-500">
            Close
          </button>
        </header>

        <label className="mt-4 block text-body-sm text-ink-700">Kind</label>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as ComplaintKind)}
          disabled={!!existing}
          className="mt-1 h-11 w-full rounded-btn-sm border border-ink-900/10 bg-paper px-3 text-body text-ink-900 disabled:opacity-50"
        >
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>{k.label}</option>
          ))}
        </select>

        <label className="mt-4 block text-body-sm text-ink-700">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={!!existing}
          rows={4}
          className="mt-1 w-full rounded-btn-sm border border-ink-900/10 bg-paper px-3 py-2 text-body text-ink-900 disabled:opacity-50"
        />

        {existing && (
          <>
            <label className="mt-4 block text-body-sm text-ink-700">Resolution</label>
            <textarea
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-btn-sm border border-ink-900/10 bg-paper px-3 py-2 text-body text-ink-900"
            />
            <label className="mt-3 flex items-center gap-2 text-body-sm text-ink-700">
              <input
                type="checkbox"
                checked={resolved}
                onChange={(e) => setResolved(e.target.checked)}
              />
              Resolved
            </label>
          </>
        )}

        {error && <p className="mt-3 text-body-sm text-status-danger-fg">{error}</p>}

        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="mt-4 h-11 w-full rounded-btn bg-brand-orange text-body font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Wire complaints into `OrderDetailPage.tsx`**

In `OrderDetailPage.tsx`:

1. Add imports:
   ```ts
   import { ComplaintSheet } from './ComplaintSheet';
   import { listComplaintsForOrder, type ComplaintRow } from './complaintsApi';
   ```
2. Add state:
   ```ts
   const [complaints, setComplaints] = useState<ComplaintRow[]>([]);
   const [complaintSheet, setComplaintSheet] = useState<{ existing: ComplaintRow | null } | null>(null);
   ```
3. In `load()`, after `setOrder(o)`, append:
   ```ts
   setComplaints(await listComplaintsForOrder(id));
   ```
4. Replace the disabled `Log complaint (Sprint 5)` button with:
   ```tsx
   <button
     type="button"
     onClick={() => setComplaintSheet({ existing: null })}
     className="h-11 w-full rounded-btn-sm border border-ink-900/10 bg-paper-elevated text-body text-ink-900"
   >
     Log complaint
   </button>
   ```
5. Above the action buttons section (before the "Action buttons" `<section>`), add a complaints sub-section:
   ```tsx
   {complaints.length > 0 && (
     <section className="mt-6">
       <h2 className="text-subtitle text-ink-900">Complaints</h2>
       <ul className="mt-2 space-y-2">
         {complaints.map((c) => (
           <li key={c.id}>
             <button
               type="button"
               onClick={() => setComplaintSheet({ existing: c })}
               className="block w-full rounded-card bg-paper-elevated p-3 text-left"
             >
               <div className="flex items-baseline justify-between">
                 <span className="text-body font-semibold text-ink-900">{c.kind.replace('_', ' ')}</span>
                 <span className="text-body-sm text-ink-500">
                   {c.reported_at}{c.resolved_at ? ' · resolved' : ' · open'}
                 </span>
               </div>
               <p className="mt-1 text-body-sm text-ink-700">{c.description}</p>
             </button>
           </li>
         ))}
       </ul>
     </section>
   )}
   ```
6. Render the sheet at the bottom of the JSX:
   ```tsx
   {complaintSheet && (
     <ComplaintSheet
       orderId={id}
       existing={complaintSheet.existing}
       onClose={() => setComplaintSheet(null)}
       onSaved={() => load()}
     />
   )}
   ```

- [ ] **Step 3: Typecheck + tests**

```powershell
npm run typecheck
npm test -- src/features/orders
```

Expected: no errors; existing order tests still pass.

- [ ] **Step 4: Commit**

```powershell
git add src/features/orders/ComplaintSheet.tsx src/features/orders/OrderDetailPage.tsx
git commit -m "Sprint 5 Task 6: ComplaintSheet + OrderDetail complaints sub-section"
```

---

## Task 7: Edit order page (reuses AddOrderPage accordion)

**Files:**
- Modify: `src/features/orders/AddOrderPage.tsx` — accept optional `editingOrderId` prop
- Modify: `src/features/orders/api.ts` — add `updateOrderItems`
- Create: `src/features/orders/EditOrderPage.tsx` — thin wrapper
- Modify: `src/App.tsx` — add `/orders/:id/edit` route
- Modify: `src/features/orders/OrderDetailPage.tsx` — activate Edit button

- [ ] **Step 1: Add `updateOrderItems` to `api.ts`**

Append to `api.ts`:

```ts
/**
 * Replaces all order_items for an order. Simple delete-then-insert. Single-tenant
 * so race-free; v1 scale (~5 items per order). Atomicity: on insert failure the
 * original rows are gone — acceptable trade-off because (a) mom is the sole writer
 * and (b) the Edit form keeps the original items in component state, so she can
 * retry by re-tapping Save. Hardening (RPC transaction) deferred until needed.
 */
export async function updateOrderItems(
  orderId: string,
  items: OrderItemInput[],
): Promise<void> {
  if (items.length === 0) throw new Error('At least one item is required.');
  const { error: dErr } = await supabase.from('order_items').delete().eq('order_id', orderId);
  if (dErr) throw new Error(dErr.message);
  const rows = items.map((it) => ({
    order_id: orderId,
    product_id: it.product_id,
    qty: it.qty,
    unit_price: it.unit_price,
  }));
  const { error: iErr } = await supabase.from('order_items').insert(rows);
  if (iErr) throw new Error(iErr.message);
}
```

- [ ] **Step 2: Parametrise `AddOrderPage` with `editingOrderId`**

In `AddOrderPage.tsx`, change the export to accept an optional prop and hydrate state when present.

Add at the top of the file:
```ts
import { getOrderDetail, updateOrder, updateOrderItems, ... } from './api';
```

Change the function signature:
```ts
export function AddOrderPage({ editingOrderId }: { editingOrderId?: string } = {}) {
```

Right after the existing `useState` declarations (and after the existing products-loading effect), add a hydration effect. The state shape is: `customer: Customer | null`, `items: DraftItem[]` where `DraftItem = { product_id: string; qty: string; unit_price: string }` (string-typed for the form inputs). Hydrate accordingly:

```ts
useEffect(() => {
  if (!editingOrderId) return;
  (async () => {
    try {
      const o = await getOrderDetail(editingOrderId);
      if (!o) {
        setError('Order not found.');
        return;
      }
      setCustomer({ id: o.customer_id, name: o.customer_name, phone: o.customer_phone });
      setSource(o.source);
      setOrderedAt(o.ordered_at.slice(0, 10));
      setTargetDate(o.target_fulfilment_date ?? todayInTz());
      setItems(
        o.items.map((it) => ({
          product_id: it.product_id,
          qty: String(it.qty),
          unit_price: String(it.unit_price),
        })),
      );
      setPaymentStatus(o.payment_status);
      setNotes(o.notes ?? '');
      setExpandedStep('items'); // skip past pre-filled steps
    } catch (e) {
      setError((e as Error).message);
    }
  })();
}, [editingOrderId]);
```

Replace the save handler's `createOrderWithItems` block with a branch (note `itemsValid` already converts DraftItem strings → numbers):

```ts
if (editingOrderId) {
  await updateOrder(editingOrderId, {
    target_fulfilment_date: targetDate,
    notes: notes.trim() || null,
    payment_status: paymentStatus,
  });
  await updateOrderItems(editingOrderId, itemsValid);
  navigate(`/orders/${editingOrderId}`);
} else {
  await createOrderWithItems({
    customer_id: customer.id,
    source,
    ordered_at: `${orderedAt}T12:00:00+05:30`,
    target_fulfilment_date: targetDate,
    payment_status: paymentStatus,
    notes: notes.trim() || null,
    items: itemsValid,
  });
  navigate('/orders');
}
```

Update the page title and Save-button copy to vary by mode:
- Title: `<h1>{editingOrderId ? 'Edit order' : 'Log new order'}</h1>`
- Save button label: `editingOrderId ? 'Save changes' : 'Save order'`

Customer/source/ordered-at locking: in edit mode, render those accordion bodies read-only (disable the inputs / show plain text) rather than removing the steps. Simplest gate is a `const locked = !!editingOrderId;` flag, used to set `disabled` on the customer picker, source buttons, and ordered-at date input. This preserves visual continuity with the create flow.

- [ ] **Step 3: Create `EditOrderPage.tsx`**

```tsx
// src/features/orders/EditOrderPage.tsx
import { useParams } from 'react-router-dom';
import { AddOrderPage } from './AddOrderPage';

export function EditOrderPage() {
  const { id = '' } = useParams<{ id: string }>();
  return <AddOrderPage editingOrderId={id} />;
}
```

- [ ] **Step 4: Add the route in `src/App.tsx`**

Inside the routes block, add:
```tsx
import { EditOrderPage } from './features/orders/EditOrderPage';

<Route path="/orders/:id/edit" element={<EditOrderPage />} />
```

(Slot it next to the existing `/orders/:id` route.)

- [ ] **Step 5: Activate Edit on `OrderDetailPage.tsx`**

Replace the disabled `Edit order (Sprint 5)` button with a `<Link>`:

```tsx
<Link
  to={`/orders/${id}/edit`}
  className="block h-11 w-full rounded-btn-sm border border-ink-900/10 bg-paper-elevated text-body text-ink-900 text-center leading-[44px]"
>
  Edit order
</Link>
```

- [ ] **Step 6: Add a test for hydration**

```tsx
// src/features/orders/AddOrderPage.test.tsx (append a new describe block)
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ... existing imports ...

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return {
    ...actual,
    getOrderDetail: vi.fn().mockResolvedValue({
      id: 'o1',
      customer_id: 'c1',
      customer_name: 'Sunita',
      customer_phone: '9999',
      ordered_at: '2026-05-20T10:00:00+05:30',
      source: 'whatsapp',
      target_fulfilment_date: '2026-05-22',
      payment_status: 'unpaid',
      notes: 'leave at door',
      bill_number: null,
      fulfilled_at: null,
      items: [
        { id: 'i1', product_id: 'p1', product_name: 'Laddu', qty: 2, unit_price: 200, line_total: 400 },
      ],
      subtotal: 400,
    }),
    updateOrder: vi.fn(),
    updateOrderItems: vi.fn(),
  };
});

describe('AddOrderPage in edit mode', () => {
  it('hydrates from getOrderDetail', async () => {
    render(
      <MemoryRouter>
        <AddOrderPage editingOrderId="o1" />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/Sunita/)).toBeInTheDocument());
    expect(screen.getByDisplayValue('2026-05-22')).toBeInTheDocument();
    expect(screen.getByDisplayValue('leave at door')).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Typecheck + tests**

```powershell
npm run typecheck
npm test -- src/features/orders
```

Expected: all order tests pass including the new hydration test.

- [ ] **Step 8: Commit**

```powershell
git add src/features/orders/AddOrderPage.tsx src/features/orders/EditOrderPage.tsx src/features/orders/OrderDetailPage.tsx src/features/orders/api.ts src/features/orders/AddOrderPage.test.tsx src/App.tsx
git commit -m "Sprint 5 Task 7: Edit order via AddOrderPage in edit mode"
```

---

## Task 8: Batch entry mode

**Files:**
- Create: `src/features/orders/BatchEntryPage.tsx`
- Modify: `src/features/orders/OrdersPage.tsx` (Browse / Batch toggle)
- Modify: `src/App.tsx` (route)

- [ ] **Step 1: Create `BatchEntryPage.tsx`**

```tsx
// src/features/orders/BatchEntryPage.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CustomerSearchPicker } from './CustomerSearchPicker';
import { createOrderWithItems, type OrderItemInput, type OrderRow } from './api';
import { listActiveProducts, type ProductRow } from '@/features/products/api';
import { useEffect } from 'react';
import { todayInTz } from '@/lib/utils';
import { formatINR } from './orderFormatters';

type SavedRow = {
  id: string;
  customer_name: string;
  total: number;
};

export function BatchEntryPage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [customer, setCustomer] = useState<{ id: string; name: string; phone: string | null } | null>(null);
  const [items, setItems] = useState<OrderItemInput[]>([]);
  const [paymentStatus, setPaymentStatus] = useState<OrderRow['payment_status']>('unpaid');
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState<SavedRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setProducts(await listActiveProducts());
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  function addItem(product_id: string) {
    const p = products.find((x) => x.id === product_id);
    if (!p) return;
    setItems((arr) => [...arr, { product_id, qty: 1, unit_price: p.default_price }]);
  }
  function setQty(idx: number, qty: number) {
    setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, qty } : it)));
  }
  function removeItem(idx: number) {
    setItems((arr) => arr.filter((_, i) => i !== idx));
  }

  async function onSaveAndNext() {
    if (!customer) { setError('Pick a customer.'); return; }
    if (items.length === 0) { setError('Add at least one item.'); return; }
    setSaving(true);
    setError(null);
    try {
      const id = await createOrderWithItems({
        customer_id: customer.id,
        source: 'whatsapp',
        target_fulfilment_date: todayInTz(),
        payment_status: paymentStatus,
        notes: notes.trim() || null,
        items,
      });
      const total = items.reduce((s, it) => s + it.qty * it.unit_price, 0);
      setSaved((arr) => [{ id, customer_name: customer.name, total }, ...arr]);
      // reset for next
      setCustomer(null);
      setItems([]);
      setPaymentStatus('unpaid');
      setNotes('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <header className="flex items-baseline justify-between">
        <h1 className="text-title text-ink-900">
          Batch entry — {saved.length} saved
        </h1>
        <button
          type="button"
          onClick={() => navigate('/orders')}
          className="text-body-sm text-ink-500 underline"
        >
          Done
        </button>
      </header>

      <section className="mt-4 space-y-4 rounded-card bg-paper-elevated p-4">
        <CustomerSearchPicker
          selected={customer}
          onSelect={(c) => setCustomer(c)}
        />

        <div>
          <label className="block text-body-sm text-ink-700">Add item</label>
          <select
            onChange={(e) => { if (e.target.value) { addItem(e.target.value); e.target.value = ''; } }}
            className="mt-1 h-11 w-full rounded-btn-sm border border-ink-900/10 bg-paper px-3 text-body text-ink-900"
            defaultValue=""
          >
            <option value="">Pick a product…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {items.length > 0 && (
            <ul className="mt-2 space-y-2">
              {items.map((it, idx) => {
                const p = products.find((x) => x.id === it.product_id);
                return (
                  <li key={idx} className="flex items-center gap-2">
                    <span className="flex-1 text-body text-ink-900">{p?.name ?? '?'}</span>
                    <input
                      type="number"
                      min={1}
                      value={it.qty}
                      onChange={(e) => setQty(idx, Number(e.target.value))}
                      className="h-9 w-16 rounded border border-ink-900/10 bg-paper px-2 text-right text-body text-ink-900"
                    />
                    <span className="w-20 text-right text-body-sm text-ink-500">
                      {formatINR(it.qty * it.unit_price)}
                    </span>
                    <button type="button" onClick={() => removeItem(idx)} className="text-body-sm text-status-danger-fg">
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          <label className="block text-body-sm text-ink-700">Payment</label>
          <div className="mt-1 flex gap-2">
            {(['unpaid', 'paid', 'partial'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setPaymentStatus(s)}
                className={`h-9 rounded-btn-sm border px-3 text-body-sm ${
                  paymentStatus === s
                    ? 'border-brand-orange bg-brand-orange text-white'
                    : 'border-ink-900/10 bg-paper text-ink-700'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-body-sm text-ink-700">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-btn-sm border border-ink-900/10 bg-paper px-3 py-2 text-body text-ink-900"
          />
        </div>

        {error && <p className="text-body-sm text-status-danger-fg">{error}</p>}

        <button
          type="button"
          onClick={onSaveAndNext}
          disabled={saving}
          className="h-11 w-full rounded-btn bg-brand-orange text-body font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save & next'}
        </button>
      </section>

      {saved.length > 0 && (
        <section className="mt-6">
          <h2 className="text-subtitle text-ink-900">Saved this batch</h2>
          <ul className="mt-2 space-y-2">
            {saved.map((s) => (
              <li key={s.id} className="rounded-card bg-paper-elevated p-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-body font-semibold text-ink-900">{s.customer_name}</span>
                  <span className="text-body-sm text-ink-700">{formatINR(s.total)}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
```

`listActiveProducts` already exists in `src/features/products/api.ts` from Sprint 2 — import path matches `AddOrderPage.tsx`.

- [ ] **Step 2: Add the Browse / Batch toggle on `OrdersPage.tsx`**

In `OrdersPage.tsx`, just under the title row, add:

```tsx
<div className="mt-2 flex gap-2 text-body-sm">
  <span className="rounded-pill bg-paper-muted px-3 py-1 text-ink-900">Browse</span>
  <Link
    to="/orders/batch"
    className="rounded-pill px-3 py-1 text-ink-500 underline"
  >
    Batch entry
  </Link>
</div>
```

(Add `import { Link } from 'react-router-dom';` if not already imported.)

- [ ] **Step 3: Add the `/orders/batch` route in `src/App.tsx`**

```tsx
import { BatchEntryPage } from './features/orders/BatchEntryPage';
<Route path="/orders/batch" element={<BatchEntryPage />} />
```

- [ ] **Step 4: Typecheck + tests**

```powershell
npm run typecheck
npm test
```

Expected: full suite passes.

- [ ] **Step 5: Manually verify in the browser**

Launch the dev server. Navigate `/orders → Batch entry`. Save two orders for the same customer. Verify:
- Counter increments.
- Running list shows both orders.
- Form resets between saves.
- `Done` returns to `/orders` and both new orders appear in the day-grouped browse list.

- [ ] **Step 6: Commit**

```powershell
git add src/features/orders/BatchEntryPage.tsx src/features/orders/OrdersPage.tsx src/App.tsx
git commit -m "Sprint 5 Task 8: Batch entry mode + mode toggle"
```

---

## Task 9: Sprint close — smoke test, docs, ADRs

**Files:**
- Modify: `CLAUDE.md` — Sprint 5 status line under "Phase 1 status"
- Create: `docs/decisions/2026-05-22-sprint-5-architecture-decisions.md`
- Run: `scripts/smoke-test-walking-skeleton.py`

- [ ] **Step 1: Run the smoke test**

```powershell
python scripts/smoke-test-walking-skeleton.py
```

Expected: all pre-existing smoke assertions pass; if smoke covers order creation, the new code paths don't regress it.

- [ ] **Step 2: Write the Sprint 5 ADR file**

Create `docs/decisions/2026-05-22-sprint-5-architecture-decisions.md` with ADRs 17-21:

- **ADR-17: Bill PDF is a pure generator function, separate from the React modal.** `buildBillPdf` takes a serialisable input + business info and returns a `jsPDF` instance. Reasoning: testable without DOM (invariants on rendered text); modal can be regenerated/re-shared cheaply.
- **ADR-18: Bill number allocation via Postgres RPC, not client `nextval`.** First-time allocation goes through `allocate_bill_number(uuid)` which selects-or-nextval-and-updates atomically inside one function call. Single-tenant context makes the race theoretical, but the RPC also encapsulates the idempotency rule (regenerate returns the existing number) in one place.
- **ADR-19: Web Share API with file-share level-2 + download fallback.** `navigator.canShare({ files })` gate + fallback to a download link when unsupported. Acceptable for v1 (mom uses Android Chrome where it's supported); Karan verifies on real device post-deploy.
- **ADR-20: Edit Order reuses AddOrderPage via `editingOrderId` prop.** Avoids two divergent accordion implementations; hydration effect populates state from `getOrderDetail`; save branches on the prop. Customer/source/ordered-at are locked in edit mode.
- **ADR-21: `updateOrderItems` uses delete-then-insert, not RPC transaction.** Mirrors ADR-13's reasoning (single-tenant, low item-count). On insert failure mom can re-save from form state; orphan-row risk is bounded.

Plus an "Open items" section listing what carries into Sprint 6+ (Settings table replacement for `BUSINESS_INFO`, complaint surfacing on Customer detail).

- [ ] **Step 3: Update `CLAUDE.md`**

Find the "Phase 1 status:" block and add a Sprint 5 line:
```
- **Sprint 5** (Order lens part 2) — Bill PDF generation (jsPDF + OS share sheet, traditional variant B per `DESIGN_HANDOFF.md` §3) with atomic `allocate_bill_number` RPC and `BUSINESS_INFO` constants (Sprint 9 will swap to a real Settings table); ComplaintSheet bottom-sheet for log/edit on OrderDetail with reported_at via `todayInTz()`; Edit Order at `/orders/:id/edit` reusing AddOrderPage in edit mode; Batch entry mode at `/orders/batch` with flat form + running list and Browse/Batch toggle on OrdersPage.
```

Also bump the test-count line.

- [ ] **Step 4: Commit + push**

```powershell
git add CLAUDE.md docs/decisions/2026-05-22-sprint-5-architecture-decisions.md
git commit -m "docs: Sprint 5 close — ADRs 17-21 + CLAUDE.md status"
git push
```

- [ ] **Step 5: Final advisor checkpoint**

Call `advisor()` to review the full Sprint 5 delivery before declaring complete. Particular concerns to flag:
- Bill PDF visual quality (advisor sees the buildBillPdf code; Karan visually reviews the screenshot).
- The web-share fallback path on desktop.
- Edit-mode hydration completeness (did any field get missed?).

---

## Spec coverage check (orchestrator pre-execution)

| §7 spec item | Task | Notes |
|---|---|---|
| Bill generation flow (preview + share) | 4 | jsPDF + Web Share API |
| Bill content (double border, orange band, items table, payment stamp, signature, footer) | 2 | All visual elements in `buildBillPdf` |
| Bill number lifecycle (allocated on first generate, persisted, reused) | 3 | RPC handles select-or-allocate |
| Complaint logging (form: kind + description) | 5, 6 | API + sheet |
| Edit complaint (adds resolution + resolved toggle) | 6 | Sheet branches on `existing` |
| Complaints sub-section on OrderDetail | 6 | List above action buttons |
| Edit order (no locks, any field editable) | 7 | Reuses accordion |
| Delete order | (already shipped Sprint 4) | — |
| Batch entry mode (header counter, flat form, Save & next, running list, Done dismisses) | 8 | New page |
| Browse / Batch toggle | 8 | OrdersPage header |
| Currency en-IN | (already in `formatINR`) | — |
