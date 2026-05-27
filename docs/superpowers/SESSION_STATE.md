# Session State — Maintenance Fixes & Features

**Updated:** 2026-05-27 (work spans 2026-05-26 → 05-27)
**Read this first on resume**, alongside the plan `docs/superpowers/plans/2026-05-26-maintenance-fixes-and-features.md` and the two specs in `docs/superpowers/specs/`.

## Shipped & live on crunchies.app
- **Part A — Bug 1** (inline add-customer: nested `<form>` → `createPortal`). Merge `58a51ca`. Live-verified (`verify-inline-add-customer.py` PASS against live).
- **Part B — Bug 3** (bill preview: dead iframe → canvas via lazy `pdfjs-dist`; canvas bounded `max-h-[60vh] overflow-y-auto` so Close/Share reachable on phones; pdfjs render cancelled on close). Merge `a150ad8`. **Live-verified** on crunchies.app at 360×640 (canvas renders, Close + Share reachable, pdfjs lazy-loaded).
- **Part C — Improvement #2 + complaint deletion** (reversibility). Merge `d81bbfd` (commits `723f1b4` API, `914df11` UI, `68d393f` smoke). Persistent secondary revert buttons ("Mark as not fulfilled" / "Mark as unpaid") in the order-detail action slot + a "Delete complaint" action in the complaint sheet, each native-`confirm()`-guarded; forward actions stay one-tap. No schema change. New `verify-revert-flow.py` (self-cleaning, creates+tears down its own throwaway data via authed REST). **Live-verified** on crunchies.app (full revert-fulfilled / revert-paid / delete-complaint flow green, exit 0).
- **Part D — Improvement #4 (discounts).** Merge `fc7a34b`. Migration `0008_discounts.sql` applied LIVE (additive: `channels.default_discount_percent` Reseller=20; `customers.discount_percent` nullable=inherit; `orders.discount_percent` snapshot default 0; existing 9 orders all 0). Pure `orderTotal`/`resolveDiscount` (`src/features/orders/discount.ts`) feed order list/detail, customer outstanding, reports (per-order net; per-product proportional), and the bill PDF discount line. Order form prefills resolved % (editable; snapshot on save); customer form has an optional discount field. New `verify-discounts-flow.py` (self-cleaning). **Live-verified** on crunchies.app (prefill 20/10, per-order override→30 persisted, discounted detail + bill, exit 0). Full 3-browser matrix green.
  - **KNOWN GAP (deliberate, Karan-flagged):** batch-entry orders default to **0%** — `createOrderWithItems.discount_percent` is optional and `BatchEntryPage` omits it, so a reseller logged via batch does NOT auto-get 20% (only the single-order form prefills). Revisit if mom logs resellers via batch.
  - Minor: order-detail now labels the amount **"Total"** (was "Subtotal") for 0% orders, matching the bill.

## Pending — NOT started
- **Part E — spec-doc drift cleanup**, including fixing CLAUDE.md's wrong `npm run test` claim (see below). Add discounts + reversibility + canvas-bill-preview to `docs/v1-spec.md`. Sequenced AFTER task #6.

## How to work (carry forward — confirmed with Karan)
- **`npm run test:run` for one-shot tests.** `npm run test` is **vitest WATCH mode** (never exits — it hung the session for ~2h once). ⚠️ CLAUDE.md currently *wrongly* documents `npm run test` as the one-shot suite — fix that in Part E. Until then, ignore CLAUDE.md on this point.
- **Subagents: `model: "opus"`** (not sonnet unless absolutely trivial).
- **Smokes: chromium while iterating; full chromium+firefox+webkit matrix only at each part's pre-push gate.** Always against the PROD build (`npm run build` + `npm run preview` on :4173), never `npm run dev`.
- **Branch per part → `git merge --no-ff` to `main` → push when green** (auto-deploys to live via Vercel). Then live-verify with the relevant `verify-*.py --url https://www.crunchies.app`.
- **Trust but verify:** independently re-verify before each push; do NOT ship on a subagent's self-reported "green." When two verifications disagree, **captured evidence (error text/stack/timing) beats code-reasoning.** (This session: a subagent claimed a Firefox `InvalidStateError` from reasoning; an evidence-capturing run proved 0 — the only Firefox error is the pre-existing, already-whitelisted dynamic-import retry: `error loading dynamically imported module` / bare `^Error$` in `verify-launch-readiness.py` allowlist.)
- Advisor + behaviour-shaped browser verify before declaring any part done (CLAUDE.md hard constraint).

## OPEN LOOP — tracked as task #6; sequenced BEFORE Part E (spec-doc cleanup, #5 is blocked by #6)
**`verify-events-flow.py` — INTERMITTENT (confirmed flaky across two gates).** Part C gate (prod build): **PASSED** end-to-end (`order_number=#2026-0010`, exit 0). Part D gate (prod build): **FAILED** the same known way — `wait_for_selector` timeout on `h2:has-text("Order placed.")`. So it genuinely flickers pass↔fail. Unrelated to discounts (Part D never touches the public exhibition form). Task #6 should START by re-running a few times to characterise the flake, then instrument the RPC→navigate→confirmation-load chain to find the race.
- If it does fail again: it reaches the **Step-3 confirm screen** then times out waiting for the **"Order placed." heading** (`src/features/public/OrderConfirmationPage.tsx:104`). Flow: `PublicOrderFormPage` → `public_create_exhibition_order` RPC → `navigate('/order/:slug/confirmed?ref=<order_id>')` → `OrderConfirmationPage` loads via `public_get_order_by_ref`. Suspects: RPC reject, navigate not firing, or confirmation-load failing.
- This path is mom's exhibition revenue path, so keep it on the list even though it passed once.

## Pre-existing cross-browser console-gate NOISE (NOT a regression — confirmed at Part C gate)
`verify-launch-readiness.py` **fails the post-run console-error gate on firefox + webkit** while ALL 11 functional flows PASS on all three engines. Confirmed PRE-EXISTING at the Part C gate by running an identical `main`-baseline build:
- **firefox:** `InvalidStateError: An attempt was made to use an object that is not, or is no longer, usable` — reproduces on plain `main` too; count varies (2↔1) ⇒ a flaky browser-teardown race, not a code path.
- **webkit:** `PAGEERROR ... /rest/v1/orders?select=id&source=eq.exhibition_form&created_at=gt... due to access control checks` — originates in `src/features/orders/newOrderBadge.ts` (a request aborted at context-teardown); appearance correlates with exhibition orders existing in the live DB. Flaky.
- **chromium is clean** (0 console errors) — and chromium is mom's ONLY runtime (Android Chromium PWA), so this noise never affects her.
- **Karan's call (2026-05-27): ship despite the red matrix** since it's pre-existing, in unchanged code, and absent in chromium.
- **DONE (`da2e459`):** added a `CONSOLE_KNOWN_FLAKY_PATTERNS` bucket in `verify-launch-readiness.py` — the two patterns are tolerated (do NOT fail the gate) but printed as a visible `WARN` every run, so a new/changed error still fails and their disappearance stays noticeable. Matrix now green on all three engines. Regexes verified to match the real captured strings while an unrelated error still fails.
- **Still optional (not done):** fix the underlying teardown races (e.g. abort the `newOrderBadge` fetch on unmount). Lower priority now that the gate is honest + green.

## To resume (next) — Parts A–D all SHIPPED & live
Two items remain, in order:
1. **Task #6 — debug `verify-events-flow.py`** (intermittent public-exhibition-confirmation flake; see OPEN LOOP above). Use `systematic-debugging`: re-run to characterise, then instrument the RPC→navigate→confirmation-load chain. Sequenced BEFORE Part E.
2. **Part E — spec-doc drift cleanup** (`#5`, blocked by `#6`): fix CLAUDE.md's wrong `npm run test` claim; reconcile `docs/v1-spec.md` per ADR-45 drift + add discounts / reversibility / canvas-bill-preview.

Send **"resume task 6"** or **"resume Part E"**. Working rules above still apply (`npm run test:run`, Opus subagents, chromium-while-iterating + full matrix at the gate, live-verify after push).
