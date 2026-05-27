# Session State — Maintenance Fixes & Features

**Updated:** 2026-05-27 (work spans 2026-05-26 → 05-27)
**Read this first on resume**, alongside the plan `docs/superpowers/plans/2026-05-26-maintenance-fixes-and-features.md` and the two specs in `docs/superpowers/specs/`.

## Shipped & live on crunchies.app
- **Part A — Bug 1** (inline add-customer: nested `<form>` → `createPortal`). Merge `58a51ca`. Live-verified (`verify-inline-add-customer.py` PASS against live).
- **Part B — Bug 3** (bill preview: dead iframe → canvas via lazy `pdfjs-dist`; canvas bounded `max-h-[60vh] overflow-y-auto` so Close/Share reachable on phones; pdfjs render cancelled on close). Merge `a150ad8`. **Live-verified** on crunchies.app at 360×640 (canvas renders, Close + Share reachable, pdfjs lazy-loaded).
- **Part C — Improvement #2 + complaint deletion** (reversibility). Merge `d81bbfd` (commits `723f1b4` API, `914df11` UI, `68d393f` smoke). Persistent secondary revert buttons ("Mark as not fulfilled" / "Mark as unpaid") in the order-detail action slot + a "Delete complaint" action in the complaint sheet, each native-`confirm()`-guarded; forward actions stay one-tap. No schema change. New `verify-revert-flow.py` (self-cleaning, creates+tears down its own throwaway data via authed REST). **Live-verified** on crunchies.app (full revert-fulfilled / revert-paid / delete-complaint flow green, exit 0).

## Pending — NOT started
- **Part D — Improvement #4** (discounts). Spec: `docs/superpowers/specs/2026-05-26-discounts-design.md`. Plan: "Part D". **Needs a Supabase migration `0008_discounts.sql`** — `apply_migration` PROMPTS (gated to `ask`); applies to the single live prod DB (additive/non-breaking).
- **Part E — spec-doc drift cleanup**, including fixing CLAUDE.md's wrong `npm run test` claim (see below).

## How to work (carry forward — confirmed with Karan)
- **`npm run test:run` for one-shot tests.** `npm run test` is **vitest WATCH mode** (never exits — it hung the session for ~2h once). ⚠️ CLAUDE.md currently *wrongly* documents `npm run test` as the one-shot suite — fix that in Part E. Until then, ignore CLAUDE.md on this point.
- **Subagents: `model: "opus"`** (not sonnet unless absolutely trivial).
- **Smokes: chromium while iterating; full chromium+firefox+webkit matrix only at each part's pre-push gate.** Always against the PROD build (`npm run build` + `npm run preview` on :4173), never `npm run dev`.
- **Branch per part → `git merge --no-ff` to `main` → push when green** (auto-deploys to live via Vercel). Then live-verify with the relevant `verify-*.py --url https://www.crunchies.app`.
- **Trust but verify:** independently re-verify before each push; do NOT ship on a subagent's self-reported "green." When two verifications disagree, **captured evidence (error text/stack/timing) beats code-reasoning.** (This session: a subagent claimed a Firefox `InvalidStateError` from reasoning; an evidence-capturing run proved 0 — the only Firefox error is the pre-existing, already-whitelisted dynamic-import retry: `error loading dynamically imported module` / bare `^Error$` in `verify-launch-readiness.py` allowlist.)
- Advisor + behaviour-shaped browser verify before declaring any part done (CLAUDE.md hard constraint).

## OPEN LOOP — tracked as task #6; sequenced BEFORE Part E (spec-doc cleanup, #5 is blocked by #6)
**`verify-events-flow.py` — status now UNCERTAIN (the prior "deterministic failure" did NOT reproduce).** During the Part C pre-push gate (2026-05-27, prod build), `verify-events-flow.py` **PASSED end-to-end**: it reached the Step-3 confirm screen, navigated to `/confirmed`, and rendered the confirmation page (`order_number=#2026-0010`), exit 0. So the earlier "reproduced 0/3" claim is no longer reliable — the failure is at most **environment/data/timing-dependent**, not a stable repro. Task #6 should START by re-running it a few times to establish whether it fails at all anymore before any deeper debugging.
- If it does fail again: it reaches the **Step-3 confirm screen** then times out waiting for the **"Order placed." heading** (`src/features/public/OrderConfirmationPage.tsx:104`). Flow: `PublicOrderFormPage` → `public_create_exhibition_order` RPC → `navigate('/order/:slug/confirmed?ref=<order_id>')` → `OrderConfirmationPage` loads via `public_get_order_by_ref`. Suspects: RPC reject, navigate not firing, or confirmation-load failing.
- This path is mom's exhibition revenue path, so keep it on the list even though it passed once.

## Pre-existing cross-browser console-gate NOISE (NOT a regression — confirmed at Part C gate)
`verify-launch-readiness.py` **fails the post-run console-error gate on firefox + webkit** while ALL 11 functional flows PASS on all three engines. Confirmed PRE-EXISTING at the Part C gate by running an identical `main`-baseline build:
- **firefox:** `InvalidStateError: An attempt was made to use an object that is not, or is no longer, usable` — reproduces on plain `main` too; count varies (2↔1) ⇒ a flaky browser-teardown race, not a code path.
- **webkit:** `PAGEERROR ... /rest/v1/orders?select=id&source=eq.exhibition_form&created_at=gt... due to access control checks` — originates in `src/features/orders/newOrderBadge.ts` (a request aborted at context-teardown); appearance correlates with exhibition orders existing in the live DB. Flaky.
- **chromium is clean** (0 console errors) — and chromium is mom's ONLY runtime (Android Chromium PWA), so this noise never affects her.
- **Karan's call (2026-05-27): ship despite the red matrix** since it's pre-existing, in unchanged code, and absent in chromium. Two un-actioned follow-up OPTIONS remain his choice: (a) add `InvalidStateError` + the `exhibition_form` PAGEERROR to the launch-readiness console allowlist (precedent: the existing `error loading dynamically imported module` / `^Error$` entries) so the matrix is literally green; or (b) fix the teardown races (e.g. abort the `newOrderBadge` fetch on unmount). Neither done yet.

## To resume Part D (next)
Send **"resume Part D"**. Branch `feat/discounts` from `main`, then work Tasks D1–D7 from the plan via Opus subagents, chromium-while-iterating, full matrix + live-verify before the push. **D1 applies migration `0008_discounts.sql` to the single live prod DB — `apply_migration` PROMPTS (gated to `ask`); confirm with Karan before running.** Discount field naming: snake_case (`discount_percent`) for DB-row types, camelCase (`discountPercent`) for derived/UI/PDF types. Resolution order order > customer > channel-default > 0; nearest-rupee rounding. (Task #6 events-flow debug is sequenced before Part E per Karan; Part D vs #6 order is Karan's call on resume.)
