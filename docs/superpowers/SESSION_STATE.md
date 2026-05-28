# Session State — Maintenance Fixes & Features

**Updated:** 2026-05-28 (latest session: UI design-critique pack — see below)
**Read this first on resume.** Most recent work is the design-critique pack (next section). The maintenance pass (Parts A–E, tasks #6/#7) is closed — that history is further down, alongside the plan `docs/superpowers/plans/2026-05-26-maintenance-fixes-and-features.md` and the specs in `docs/superpowers/specs/`.

---

## 2026-05-28 — UI design-critique pack (latest; awaiting critique)

**What this was:** Mom is happy with the shipped app; Karan wants Claude Design to critique the UI. This session assembled the pack to send.

**Delivered — `docs/design-critique/`** (also zipped at repo root as `crunchies-design-critique-pack.zip`):
- `CRITIQUE_BRIEF.md` — cover sheet: persona, the 3 outcomes, condensed philosophy, brand/tone, IA, **fixed constraints** (palette/Roboto/mobile-only), an **"Off the table — engineering constraints"** section (hand-rolled SVG charts, jsPDF/canvas bill, no realtime, no heavy deps, data/auth/routing/tests out of scope), and the **delivery spec** (exhaustive + priority-ordered P0/P1/P2; master table + per-screen notes; high-fidelity before→after mockups for P0/P1, in the existing tokens).
- `screenshots/populated/` (23 @390px: every lens, all 3 Reports tabs, order/customer/event detail incl. discount + complaint, bill PDF, public form + confirmation) and `screenshots/empty/` (14 first-run states).
- `brand/` — brochure + logo.

**How it was built (not repeatable as-is — the env is gone):** a throwaway **free** Supabase project was created via MCP, migrations 0001–0009 applied, a confirmed test login user inserted via SQL, realistic data seeded (incl. 8 weeks of plans/logs so Reports→Trends had signal), screenshots captured with Playwright at 390px against a local prod build pointed at the temp project, then `.env.local` restored + rebuilt. The temp project (`mtwuiffxewzmcoebkjis`) has been **deleted by Karan**. The capture scripts were throwaway (dead hardcoded IDs) and have been removed.

**What comes next (pick up here after the critique lands):**
1. Triage Claude Design's findings by its P0/P1/P2 ranking. P0 = trust-undermining-on-sight; do these first.
2. Treat each as a normal maintenance change: **work within the approved tokens** (no palette/font change without Karan's approval — CLAUDE.md hard constraint), keep WCAG AA, no new heavy deps.
3. **Every change mom will see gets full review + the relevant blast-radius smoke before push** (her low iteration tolerance is the hard product constraint). Branch-per-change → `--no-ff` merge → push (auto-deploys via Vercel) → live-verify.
4. Likely touch points by area: shared UI primitives/AppShell (architectural → full smoke set + 3-browser matrix), per-lens pages (that feature's smoke + launch-readiness chromium), the bill (`billPdf.ts` + `verify-bill-flow.py`, cross-browser-sensitive).

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

## Task #6 — RESOLVED (`verify-events-flow.py` fixed, merge-free push `3e5b495`)
Root cause (via systematic-debugging) was NOT a timeout flake. The smoke used a **FIXED phone** (`9876543210`) with **no cleanup**, so `public_create_exhibition_order`'s dedup-on-phone reused a prior run's customer, whose `source_event_id` stays pinned to its FIRST event (provenance, by design — `0005_public_rpcs.sql:147`). `public_get_order_by_ref`'s anti-leak requires `customer.source_event_id == this event`, so the read-back returned null → confirmation rendered **"Order not found."** (the pass↔fail flip was fresh-customer vs reused-stale-customer, not timing). Evidence: REST diag showed the RPCs 100% reliable (20/20, ~0.1s); a browser diag showed the page renders fine; the better page-text capture I added exposed the real "Order not found.".
Fix shipped to the smoke: **unique phone per run** (fresh customer → `source_event_id` = this event) + heading wait 5s→20s (cold lazy-route load ~5.4s) + page-text/screenshot diagnostic on miss + `--url` arg + **self-cleaning REST teardown** (it used to leak an event+order+customer every run — historical leaks swept). Verified 3× green + self-clean against live.

## Task #7 — SHIPPED & live (merge-free push `226048f` + `1423c27`)
The repeat-customer cross-event "Order not found." bug is FIXED. Migration `0009_order_event_id.sql` (applied live): added `orders.event_id` (FK, `on delete set null`), backfilled existing exhibition orders from `customer.source_event_id`; `public_create_exhibition_order` stamps `event_id = v_event.id`; `public_get_order_by_ref`'s anti-leak now matches `v_order.event_id = v_event.id` (still requires `source='exhibition_form'`). Spec: `docs/superpowers/specs/2026-05-27-exhibition-order-event-id.md`. New `verify-exhibition-repeat.py` (REST, self-cleaning) proves same-phone orders at events A+B both resolve AND the anti-leak invariant holds (an order does NOT resolve under another event's slug). database.types.ts regenerated (types-only; no app bundle change). Verified: 279 unit tests, build, events-flow + a11y + launch-readiness(chromium) green against live; repeat smoke green ×2. No frontend code changed, so live was fixed the moment the migration applied.

## Pre-existing cross-browser console-gate NOISE (NOT a regression — confirmed at Part C gate)
`verify-launch-readiness.py` **fails the post-run console-error gate on firefox + webkit** while ALL 11 functional flows PASS on all three engines. Confirmed PRE-EXISTING at the Part C gate by running an identical `main`-baseline build:
- **firefox:** `InvalidStateError: An attempt was made to use an object that is not, or is no longer, usable` — reproduces on plain `main` too; count varies (2↔1) ⇒ a flaky browser-teardown race, not a code path.
- **webkit:** `PAGEERROR ... /rest/v1/orders?select=id&source=eq.exhibition_form&created_at=gt... due to access control checks` — originates in `src/features/orders/newOrderBadge.ts` (a request aborted at context-teardown); appearance correlates with exhibition orders existing in the live DB. Flaky.
- **chromium is clean** (0 console errors) — and chromium is mom's ONLY runtime (Android Chromium PWA), so this noise never affects her.
- **Karan's call (2026-05-27): ship despite the red matrix** since it's pre-existing, in unchanged code, and absent in chromium.
- **DONE (`da2e459`):** added a `CONSOLE_KNOWN_FLAKY_PATTERNS` bucket in `verify-launch-readiness.py` — the two patterns are tolerated (do NOT fail the gate) but printed as a visible `WARN` every run, so a new/changed error still fails and their disappearance stays noticeable. Matrix now green on all three engines. Regexes verified to match the real captured strings while an unrelated error still fails.
- **Still optional (not done):** fix the underlying teardown races (e.g. abort the `newOrderBadge` fetch on unmount). Lower priority now that the gate is honest + green.

## ALL COMPLETE — session closed 2026-05-28
Everything in this maintenance pass is shipped, live, and verified: **Parts A–D + tasks #6, #7 + Part E (doc cleanup).** Nothing pending.
- Part E shipped the doc reconciliation: CLAUDE.md (`npm run test:run` correction; blast-radius smoke cadence — chromium-default, firefox+webkit only for cross-browser-sensitive diffs, full set + matrix only for architectural changes; migration range 0001-0009; data-model + architecture pointers for discounts / reversibility / canvas-bill / event_id), `docs/v1-spec.md` (§2 new columns + §14 Phase 2 "Shipped" list + header), `.gitignore` (`__pycache__`).
- Open follow-ups (none blocking; Karan's call if/when): batch-entry orders default to 0% discount (deliberate — see `[[project_discounts_batch_gap]]`); optional teardown-race fix for the firefox/webkit console noise (already tolerated + green).
- Next maintenance session: this file + `docs/v1-spec.md` §14 + `docs/superpowers/specs/` are the current record. Working rules (`npm run test:run`, Opus subagents, blast-radius smoke cadence, live-verify after push) are now in CLAUDE.md.

Send **"resume task 7"** / **"resume Part E"** / a decision on the app bug. Working rules above still apply (`npm run test:run`, Opus subagents, chromium-while-iterating + matrix at the gate, live-verify after push).
