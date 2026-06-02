# Crunchies Management App

A mobile PWA that runs **Crunchies** — Archana Kothadiya's artisanal-snacks business in Pune. It replaces a WhatsApp-and-paper-notebook workflow with structure for production planning, customer + order history, and pending-order tracking, plus a public order form for exhibition customers and a shareable bill PDF.

Live at **https://www.crunchies.app** (PWA on Archana's Android).

## Status — feature-complete & in maintenance-only mode (2026-06)

Phase 1 (11 build sprints) + Phase 2 maintenance + a full UI polish pass are all shipped and live. **The app is considered done.** Make changes only when Archana ("mom") requests one or a bug requires a fix — no unsolicited features or redesigns. Any mom-visible change gets full review + the relevant behaviour smoke before it's pushed (push to `main` auto-deploys to the live site via Vercel).

## Who uses it

- **Archana (mom)** — the primary authenticated user; runs the business day-to-day.
- **Karan** — product/design partner and the only authenticated builder; reviews everything before push.
- **Exhibition customers** — fill an anonymous per-event public form (no login).

## Stack

Vite + React 18 + TypeScript (strict) · Tailwind 3 (tokens in `tailwind.config.ts`) · react-router-dom · jsPDF (lazy-loaded bill) · Supabase (Postgres + Auth + RLS, SECURITY DEFINER RPCs for the anon public form) · PWA service worker · Vercel deploy from `main`. Tests: Vitest + RTL; Playwright behaviour smokes in `scripts/verify-*.py`.

## Run it

```bash
npm install
npm run dev          # Vite dev server on :5173
npm run build        # production build → dist/
npm run preview      # serve dist/ on :4173 (use this for prod-build smokes)
npm run typecheck    # tsc -b --noEmit  (ALWAYS this — never bare tsc)
npm run test:run     # one-shot Vitest suite  (NOT `npm run test`, which is watch mode)
```

Playwright smokes (`scripts/verify-*.py`) read `SMOKE_EMAIL` / `SMOKE_PASSWORD` from `.env.local`, accept `--url`, and run against the prod build (`build` + `preview`). They're idempotent and self-cleaning. `verify-launch-readiness.py` is the broad regression; `verify-a11y.py` is the WCAG-AA (axe) gate; `verify-bill-flow.py` covers the bill PDF/canvas.

## Documentation map

**Current / living (read these):**
- **`CLAUDE.md`** — authoritative context for any coding session: current state, how to work, invariants, architecture pointers, hard constraints. **Start here.**
- `docs/v1-spec.md` — the locked behavioural feature spec (§1–§14) with implementation pointers.
- `docs/superpowers/SESSION_STATE.md` — the maintenance-session log (most recent work first).
- `tailwind.config.ts` + `src/index.css` — the design-system source of truth (token set + `.input-shell` / `.btn-primary` primitives).

**Historical / build-time artifacts (point-in-time records — do not treat as current):**
- `docs/BUILD_HISTORY.md` — sprint-by-sprint Phase 0/1 narrative.
- `docs/decisions/*-architecture-decisions.md` — per-sprint ADRs ("why is X this way").
- `docs/superpowers/plans/` — sprint + maintenance + the 2026-06 UI-polish plans.
- `docs/superpowers/specs/` — Phase 2 design records (reversibility, discounts, exhibition order↔event).
- `docs/PRODUCT_BRIEF.md`, `docs/DESIGN_HANDOFF.md`, `docs/design/` — the original pre-build PRD + design handoff (⚠️ their token tables predate the Sprint-10 AA retune — see `tailwind.config.ts` for current values).

## Repo shape

`src/features/<lens>/` per-feature code (today, orders, customers, production, events, reports, settings, public) · `src/components/` AppShell + BottomNav + shared primitives · `src/lib/` cross-cutting helpers · `supabase/migrations/` sequential SQL (0001–0009: schema + RLS + RPCs) · `scripts/` Playwright smokes.
