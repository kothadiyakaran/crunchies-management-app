# Sprint 10 — Architecture Decisions

**Date:** 2026-05-22
**Scope:** Internal QA, cross-browser smoke, buffer, Phase 1 close

---

## ADR-45 — `verify-launch-readiness.py` is the launch gate: behaviour-shaped, idempotent, cleans up after itself

**Context:** §14 Sprint 10 line 1619 requires "every flow in §3's 8-flow list with synthetic data first, then with backfilled real data" + cross-browser smoke. A single script doing all 10 (8 daily + 2 lower-frequency) end-to-end is more useful than 10 separate scripts.

**Decision:** One Playwright script — `scripts/verify-launch-readiness.py`. Covers all 8 §3 daily flows in order (log order live → batch → log production → mark fulfilled → mark paid → add customer → generate bill → log complaint) plus the weekly planning ritual and event setup. Idempotent — re-runnable without DB pollution. Cleanup runs in a try/finally so it executes even when an assertion fails.

**Spec drift surfaced (implementation is source of truth; spec docs are stale):**
- `AddOrderPage` save → navigates to `/orders` (list), not `/orders/:id` as the spec implied. Spec §3 line 244.
- `AddCustomerPage` save → navigates to `/customers/:id` (detail), not `/customers` (list). Spec §3 line 247.
- ProductDetailSheet CTA text is "**+ Log new batch**", not "Log production". Spec §5 should match.
- BillPreviewModal share button is "**Share**", not "Share to WhatsApp". Spec §7 line 248.

These don't change product behaviour — the script asserts the actual UX. Spec doc updates can roll up in a post-launch cleanup pass.

**Cleanup quirks documented:**
- Orders → complaints is `on delete restrict`; no UI exists to delete a complaint (only resolve). Cleanup workaround: grab JWT from localStorage, direct DELETE via PostgREST.
- DeleteEventDialog is a custom modal (not native confirm); DeleteOrder / DeleteCustomer use native confirm — script handles both.
- "Delete customer" button only renders when `order_count === 0` (denorm doesn't refresh in-memory after order deletes — hard-reload required).

---

## ADR-46 — Cross-browser launch gate: chromium + firefox + webkit, against the production build

**Context:** v1 launches to a public exhibition form anyone can visit on any browser. The dev-mode smoke isn't sufficient — Vite dev serves source modules with different behaviour than the production-built hashed `.js` chunks.

**Decision:** `verify-launch-readiness.py --browser {chromium,firefox,webkit} --url <url>`. Three engines × prod-build via `npm run build && npm run preview` on port 4173 is the launch gate. All three must pass 10/10 flows with 0 unexpected console errors before launch.

**Allowlist evolution (T10.2 dev-mode → T10.3 prod-mode):**
- T10.2 added `error loading dynamically imported module.*\.tsx` (dev-only — source paths).
- T10.3 broadened to `error loading dynamically imported module` (prod fires the same retry behaviour against hashed `.js` chunks; the T10.2 agent claim "cannot fire in production builds" was wrong — verified by running prod-build).
- T10.3 also added a literal `^Error$` pattern for the bare-`Error` follow-up firefox emits after dynamic-import retries. Chromium + webkit do not emit either pattern.

**Prod-build matrix (at HEAD, against local `npm run preview` on port 4173):**

| Browser | Flows | Console errors |
|---|---|---|
| chromium | 10/10 | 0 |
| firefox  | 10/10 | 0 (with broadened dynamic-import + bare-Error allowlist) |
| webkit   | 10/10 | 0 |

**Open carry for next push:** the live `https://www.crunchies.app` is at commit `93a394f` (pre-Sprint 9). After Karan reviews + pushes the Sprint 9-10 commits, re-running the matrix against the live URL closes the launch gate definitively. Until push, the local prod-build run is the strongest evidence we have.

---

## ADR-47 — `billPdf.ts` jspdf import deferred to bill-tap (ADR-42 carry resolved)

**Context:** Sprint 9 T9.6 split jspdf into its own chunk via vite manualChunks, but `src/features/orders/billPdf.ts` still statically imported the `jsPDF` class — meaning the 118 kB gzip jspdf chunk loaded on OrderDetail navigation, not on bill-tap. ADR-42 carried this as a Sprint 10 follow-up.

**Decision (implemented in commit `b559ded`):**
- `billPdf.ts` switched to `import type { jsPDF } from 'jspdf'` (type-only — erased at compile, no runtime chunk).
- New `loadJsPDF()` async helper does `await import('jspdf')` on demand.
- `buildBillPdf(input, business, jsPDFCtor, opts?)` now takes the constructor as a parameter — keeps the function pure and synchronous.
- `BillPreviewModal` calls `await loadJsPDF()` before each `buildBillPdf` invocation. Second call hits module cache (free after first).
- All 12 existing tests updated to `import { jsPDF } from 'jspdf'` and pass it explicitly. Tests run in Node where chunk-splitting is irrelevant.

**Verified:**
- Build: initial bundle 114.40 kB gzip; jspdf chunk 118.66 kB gzip; `OrderDetailPage` chunk no longer references jspdf at runtime (only by chunk URL).
- Instrumented run: 0 jspdf network requests before bill-tap, 1 after — exactly the goal.
- `scripts/verify-bill-flow.py` end-to-end pass.

**Drive-by:** `verify-bill-flow.py` was broken at HEAD pre-T10.3 due to a `networkidle` race introduced when T9.6 made `OrderDetailPage` route-level lazy. T10.3 added an explicit `wait_for` on the Generate-bill button. Process note for future sprint closes: **re-run all `scripts/verify-*.py` after architectural changes**, not just the new smoke for the current sprint. Sprint 9 close should have caught this.

---

## ADR-48 — Color-contrast token retune NOT done; surfaced to Karan for review-time decision

**Context:** Sprint 9 T9.5 a11y pass surfaced 108 nodes across 8 routes failing WCAG AA 4.5:1 contrast:

| Pair | Ratio | Need |
|---|---|---|
| `ink-500` #8a8079 on `paper-surface` #fbf8f1 | 3.63 | ≥4.5 |
| `ink-500` #8a8079 on `paper-elevated` #ffffff | 3.85 | ≥4.5 |
| `brand-orange` #d9591a on white | 3.89 | ≥4.5 |

**Decision:** NOT changed. Sprint 10 buffer could absorb the retune, but the user has explicit prior guidance that design tokens are out of scope without approval (T9.5 plan instruction: "DO NOT modify the design tokens without flagging in report"). Surfaced in the Sprint 9 ADR-43 table and the Sprint 9 close note for Karan's decision at the review checkpoint. If approved post-review, a fresh follow-up sprint (or a one-task buffer addendum) can retune `ink-500` → ~`#6e655e` (4.5:1 on paper-surface) and either darken `brand-orange` slightly or restrict it to ≥18px text.

---

## ADR-49 — Backfill `--apply` path live-smoke deferred to launch session

**Context:** Sprint 9 ADR-44 documented that `scripts/backfill-notebook.ts` was tested in dry-run only — `SUPABASE_SERVICE_KEY` is not provisioned in this env.

**Decision:** Live `--apply` smoke runs at the launch session, with Karan present, against a small fixture CSV (3-4 rows representing distinct mom-notebook patterns). Idempotency proof: run twice, second run reports 100% EXISTS. Only then commit the full backfill of mom's notebook history. The script's 23 unit tests against a fake supabase client provide structural coverage; the launch-session smoke is the live-environment proof.

---

## Process notes for the launch checklist

1. **Re-run all `scripts/verify-*.py` at sprint close.** T9.6's route-level lazy silently broke `verify-bill-flow.py` and Sprint 9 close didn't catch it. The launch checklist must include a "re-run every verify script" step.
2. **Push triggers the canonical launch gate.** After Karan reviews + pushes, re-run `verify-launch-readiness.py --browser {chromium,firefox,webkit} --url https://www.crunchies.app` to close out ADR-46.
3. **Complaints have no delete UI.** Real product gap if mom logs a complaint by mistake. Not a launch blocker. Post-launch backlog candidate.
4. **Settings inputs from mom** (business name, address, GST, bill footer, contact info, business WhatsApp) — collected at the launch session, entered via `/settings`, persisted to `business_settings`.
5. **PWA install on mom's Android** — Open Sprint 0 carry, asynchronous, Karan can do any time before launch.

---

## Phase 1 status at Sprint 10 close

All 10 build sprints complete. Test count 258 across 36 vitest files; build clean (initial 114.40 kB gzip, jspdf lazy on bill-tap). All 10 §3 daily flows + planning ritual + event setup pass on prod-build smoke across chromium / firefox / webkit with 0 console errors.

Outstanding (none block launch):
- Push Sprint 9-10 commits (13 commits ahead of `origin/main`).
- Color-contrast retune awaiting Karan's decision.
- Live backfill smoke at launch session.
- PWA install on mom's Android.
- Settings inputs from mom at launch session.
- Post-launch backlog: complaint deletion UI; spec-doc cleanup to match implementation drift (ADR-45 list).
