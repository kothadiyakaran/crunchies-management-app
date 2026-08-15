# Printable QR flyer for exhibition order links (2026-08-15)

Mom-requested. Shipped in maintenance mode as a contained addition — no backend, RPC, migration, or data-model change.

## Problem

Exhibition events already produce a public order-form URL (`crunchies.app/order/<slug>`), surfaced on `EventDetailPage` with Copy link and Share via WhatsApp. Both require mom to hand the link to each visitor herself. At a physical stall she wants visitors to order without her mediating every interaction, so she needs something printed that they can scan off the table.

## Decision

Generate an A4 flyer PDF client-side containing a QR that encodes the same public URL, preview it in-app, and hand it to Android's share sheet. Mom prints it once per event and props it on the stall table.

The feature reuses the bill-PDF pipeline rather than introducing a second way to make a PDF:

| Bill feature | QR flyer equivalent |
|---|---|
| `orders/billPdf.ts` (pure builder, `loadJsPDF()`) | `events/eventFlyerPdf.ts` (pure builder, `loadQrCodeDataUrl()`) |
| `orders/pdfPreview.ts` `renderPdfFirstPage` | reused unchanged |
| `orders/BillPreviewModal.tsx` | `events/EventFlyerModal.tsx` |

`BusinessInfo` is imported from `billPdf.ts`, not redeclared. The flyer repeats the bill's brand-deep header band and colour constants so everything mom prints from the app reads as one family.

## Flyer layout

A4 portrait: brand-deep header band with business name and tagline, event name, venue line when the event has one, "Scan to order", a 110mm centered QR, then the plain URL beneath it. The plain URL is the manual-entry fallback for a phone that will not scan, and it wraps via `splitTextToSize` so a long slug cannot overflow the margins.

QR parameters: `errorCorrectionLevel: 'M'`, `margin: 2`, `width: 800`. The margin buys a real quiet zone, which is what makes the code scan reliably off paper under uneven stall lighting; 800px keeps it sharp at 110mm print size.

## Entry point

`EventDetailPage`'s Public URL card gains a "Share QR" button beside "Share via WhatsApp" — same `disabled={!publicUrl}` gating and identical classes. The page already calls `useSettings()`; it passes `settings` down as a prop rather than having the modal call the hook a second time. The modal receives `https://${publicUrl}`, matching how the existing copy-link action builds the absolute URL.

## Dependency

`qrcode` + `@types/qrcode`, imported dynamically so it lands in its own chunk. The build confirms it: `browser-*.js` at 25.78 kB (10.13 kB gzip), reached only via `import()` from the `EventDetailPage` chunk, with zero `qrcode` references in the main bundle and no modulepreload entry.

## Gotcha worth keeping

No unit test can cover `qrcode`'s CommonJS/ESM interop under Vite — `await import('qrcode')` then `QRCode.toDataURL(...)` works because Vite's `_mergeNamespaces` interop copies the CJS module's own properties onto the namespace object, not only onto `.default`. The only guard against that resolving wrong is the Playwright canvas assertion in `verify-events-flow.py`. If the interop ever breaks, effect 1 throws, `pdfBlob` never gets set, and the canvas stays at the browser default 300x150 while the modal shows its error paragraph — which is exactly what that assertion checks for.

## Verification added

- `eventFlyerPdf.test.ts` — 5 unit tests using `billPdf.test.ts`'s `extractAllText` pattern (business name, event name, URL present; venue line present and absent; "Scan to order"; valid Blob).
- `verify-events-flow.py` — taps "Share QR", waits for the dialog, polls the preview canvas for non-zero dimensions, and fails explicitly rather than hanging on timeout.
- `verify-a11y.py` — creates a throwaway exhibition event, opens the dialog, and scans while it is in the DOM, then deletes the event through the app's own delete flow. This scan alone is scoped to `[role="dialog"]`; every pre-existing route scan still runs against the full document, so the suite's existing guarantee is unchanged.

## Defect the new a11y check caught

`EventFlyerModal`'s `max-h-[60vh] overflow-y-auto` preview wrapper was not keyboard-focusable (axe `scrollable-region-focusable`). Fixed with `role="region"`, `aria-label="QR flyer preview"`, `tabIndex={0}`. An `aria-label` without the role trips `aria-prohibited-attr`, so both are needed.

`BillPreviewModal` has the identical scroll-wrapper pattern and therefore very likely the same latent defect. No a11y scan has ever opened that dialog either. Not fixed here — out of scope for a mom-requested QR feature under maintenance-only mode.

## Pre-existing violation found, deliberately not fixed

Opening `/events/<id>` to axe for the first time surfaced axe rule `label` (impact critical), 21 nodes, all on `EventDetailPage`: the Lead weeks stepper `input[type=number]` and each Expected demand per-product quantity input. Both sit beside a sibling `<span>` rather than an associated `<label>`, with no `aria-label`. It predates this change and no route in `verify-a11y.py` previously visited `/events/<id>` — only the `/events` list. Left for Karan to decide, since maintenance-only mode means unrelated fixes do not ride along on a feature branch.

## Gate

typecheck clean · 307 tests across 43 files (baseline 302/42) · build clean · `verify-events-flow.py`, `verify-a11y.py` (0 violations across 8 authed routes + the dialog), `verify-launch-readiness.py --browser chromium` (8/8 daily flows + 2/2 lower-frequency, 0 unexpected console errors) — all three against one identical prod build on :4173. Chromium only, per the blast-radius rule: mom's runtime is the Android Chromium PWA and this change touches neither PDF-canvas rendering behaviour nor the service worker in a cross-browser-sensitive way.

Not automatable, still open: print the flyer and scan it with a phone camera to confirm it opens the live public order page.
