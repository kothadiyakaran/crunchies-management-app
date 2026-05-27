# Session State — Maintenance Fixes & Features

**Updated:** 2026-05-27 (work spans 2026-05-26 → 05-27)
**Read this first on resume**, alongside the plan `docs/superpowers/plans/2026-05-26-maintenance-fixes-and-features.md` and the two specs in `docs/superpowers/specs/`.

## Shipped & live on crunchies.app
- **Part A — Bug 1** (inline add-customer: nested `<form>` → `createPortal`). Merge `58a51ca`. Live-verified (`verify-inline-add-customer.py` PASS against live).
- **Part B — Bug 3** (bill preview: dead iframe → canvas via lazy `pdfjs-dist`; canvas bounded `max-h-[60vh] overflow-y-auto` so Close/Share reachable on phones; pdfjs render cancelled on close). Merge `a150ad8`. **Live-verified** on crunchies.app at 360×640 (canvas renders, Close + Share reachable, pdfjs lazy-loaded).

## Pending — NOT started
- **Part C — Improvement #2 + complaint deletion** (reversibility). Spec: `docs/superpowers/specs/2026-05-26-reversibility-design.md`. Plan: "Part C" in the plan file. No migration. Files: `orders/api.ts` (`revertFulfilled`/`revertPaid`), `complaintsApi.ts` (`deleteComplaint`), `OrderDetailPage.tsx`, `ComplaintSheet.tsx`.
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
**`verify-events-flow.py` fails deterministically** (the anon public *exhibition* order form). **Untouched by Parts A/B; reproduced 0/3 by two independent runs.** It reaches the form's **Step-3 confirm screen**, then times out waiting for the **"Order placed." heading** on the confirmation page.
- The heading text DOES exist in code: `src/features/public/OrderConfirmationPage.tsx:104`.
- Flow: `PublicOrderFormPage` submits via the `public_create_exhibition_order` RPC, then `navigate('/order/:slug/confirmed?ref=<order_id>')`; `OrderConfirmationPage` loads the order via `public_get_order_by_ref`.
- **Suspects:** the public RPC failing/rejecting, the navigate not firing, or `OrderConfirmationPage`'s load failing → fail-landing instead of success.
- **Could affect mom's exhibition customers (real revenue path).** NOT confirmed to be a real app bug vs. a smoke setup/timing issue — needs a `systematic-debugging` session: first capture whether the RPC + navigate + confirmation-load actually succeed in a real browser against the live/prod build.

## To resume Part C
Compact the conversation, then send **"resume Part C"**. The implementer should branch `fix/reversibility` from `main`, then work Tasks C1–C5 from the plan via Opus subagents, chromium-while-iterating, full matrix + live-verify before the Part C push.
