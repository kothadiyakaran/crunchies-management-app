# UI Critique Polish Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the `design_handoff_crunchies_polish_pass/` critique (34 findings — all P0+P1+P2 except dropped P2-12) as a single, coherent, visual-only polish pass, deployed to mom's live app in one push.

**Architecture:** Additive token layer (new Tailwind/CSS tokens, **zero redefinition** of existing tokens → zero regression on untouched elements) + a shared input-shell / button-primitive so the focus-ring and disabled-state fixes are one source of truth instead of a 16-file copy-paste. All other findings are per-screen className / SVG / jsPDF edits matching the mockups in `critique-reference.html`. Commit per finding on branch `polish/ui-critique-pass`; **one** deploy at the very end.

**Tech Stack:** Vite + React 18 + TS (strict), Tailwind 3, jsPDF (bill), hand-rolled SVG (charts), Playwright smokes (`scripts/verify-*.py`), Vitest + RTL.

---

## Conventions (apply to every task)

- **Visual-only.** No behaviour/route/data-model change except P0-03's sign-out relocation (companion add to Settings) and the dropped-P2-12 note.
- **Tokens only.** Use only tokens from Phase 0 (which mirror `02-TOKENS.md`). No arbitrary hexes. If a finding seems to need a new value → stop and ask.
- **Verify each finding** against its mockup slice in `scripts/_critique_shots/slice_NN.png` (re-render with the snippet in Appendix A if cleared) at 390 px, AND re-render the live screen at 390 px for correspondence (not literal pixel-diff — the mockups are hand-built approximations).
- **Commit message:** `polish: <screen> — <finding-id> <title>`. One finding per commit. Never `git push` (gated; deploy is Karan's manual step).
- **Don't regress AA.** `verify-a11y.py` (axe, 0 violations) is the contrast safety net for the token work — run it after Phase 0 and after any chip/text-colour finding.
- **`tnum` is already global** (`index.css` `font-feature-settings:'tnum'`) — for tabular-num findings, verify it's effective; only add `tabular-nums` where a local override defeats it.

## Verification map (finding → file(s) → mockup slice → smoke)

| Finding | Target file(s) | Slice | Smoke after |
|---|---|---|---|
| P0-01 focus ring | `index.css` + shared `.input-shell` across all form inputs | 11,13 | a11y, launch-readiness |
| P0-02 disabled btn | shared `.btn-primary`; sweep `disabled:opacity-*` | 11 | launch-readiness |
| P0-03 account chrome | `today/TodayPage.tsx`, `settings/SettingsPage.tsx` | 5 | launch-readiness, settings-flow |
| P0-04 Active toggle | `events/EventDetailPage.tsx` (add/edit event form) | 13 | events-flow |
| P0-05 checklist quiet | `orders/AddOrderPage.tsx` | 11 | launch-readiness |
| P0-06 peer pills | `orders/OrdersPage.tsx` | 6,10 | launch-readiness |
| P0-07 total+delete | `orders/OrderDetailPage.tsx` | 16,17 | launch-readiness |
| P1-01/02/03 Today rows | `today/TodayPage.tsx` | 5 | launch-readiness |
| P1-04 empty next-steps | `today/TodayPage.tsx` | 5 | launch-readiness |
| P1-05 calibration bars | `reports/WeekTab.tsx`, `reports/PipMarkerBar.tsx` | 16 | reports-flow, a11y |
| P1-06 action stack | `orders/OrderDetailPage.tsx` | 17 | launch-readiness |
| P1-07 discount chip | `orders/OrderDetailPage.tsx` | 17 | discounts-flow |
| P1-08 bill header | `orders/billPdf.ts` | 18 | bill-flow (3-browser) |
| P1-09 bill table | `orders/billPdf.ts` | 18 | bill-flow (3-browser) |
| P1-10 PAID stamp | `orders/billPdf.ts` | 18 | bill-flow (3-browser) |
| P1-11 trend chip | `reports/TrendsTab.tsx` + `reports/trend.ts` (new helper, TDD) | 2/3 | reports-flow |
| P1-12 plan-accuracy labels | `reports/charts/LineChart.tsx`, `reports/TrendsTab.tsx` | — | reports-flow |
| P1-13 collapse zero months | `reports/charts/StackedBar.tsx`, `reports/TrendsTab.tsx` + helper (TDD) | — | reports-flow |
| P1-14 sort inline | `customers/CustomersPage.tsx` | 12 | customer-flow |
| P1-15 timestamps column | `customers/CustomersPage.tsx` + `customers/lastOrder.ts` (helper, TDD) | 12 | customer-flow |
| P1-16 size-tier chips | `customers/AddCustomerPage.tsx` | 12 | customer-flow |
| P1-17 production grid | `production/ProductionPage.tsx` | 14 | launch-readiness |
| P1-18 other-makers cards | `production/AggregatedSection.tsx` | 14 | launch-readiness |
| P1-19 back-link pattern | all form pages + `settings/SettingsPage.tsx` | 11,13 | launch-readiness, settings-flow |
| P1-20 order-detail chips | `orders/OrderDetailPage.tsx` | 17 | launch-readiness |
| P1-21 wrap filter chips | `orders/OrdersPage.tsx`, `customers/CustomersPage.tsx` | 10,12 | launch-readiness, customer-flow |
| P1-22 date input shells | `events/EventDetailPage.tsx`, `production/EditLogProductionPage.tsx` | 13 | events-flow |
| P1-23 orders list chips+days | `orders/OrdersPage.tsx` | 7,10 | launch-readiness |
| P2-01 date subhead | `today/TodayPage.tsx` | 5 | — |
| P2-02 ramp-up chip | `production/ProductionPage.tsx` | 14 | — |
| P2-03 rename Manage products | `production/ProductionPage.tsx` | 14 | — |
| P2-04 events time chip | `events/EventsPage.tsx` | — | events-flow |
| P2-05 event URL mono field | `events/EventDetailPage.tsx` | 13 | events-flow |
| P2-06 settings eyebrows | `settings/SettingsPage.tsx` | — | settings-flow |
| P2-07 customers chips 1 row | `customers/CustomersPage.tsx` | 12 | customer-flow |
| P2-08 bill ₹ glyph | `orders/billPdf.ts` | 18 | bill-flow (3-browser) |
| P2-09 public disabled | `public/ContactStep.tsx`, `public/ConfirmStep.tsx` | — | events-flow |
| P2-10 public confirm pill | `public/OrderConfirmationPage.tsx` | 18 | events-flow |
| P2-11 month variance chip | `reports/MonthTab.tsx` | — | reports-flow |
| ~~P2-12 ghost values~~ | **DROPPED** (Karan, 2026-06-01) | — | — |

---

## Phase 0 — Token + primitive foundation (do first; everything depends on it)

### Task 0.1: Add additive tokens to `tailwind.config.ts`

**Files:** Modify `tailwind.config.ts` (`theme.extend.colors`).

- [ ] **Step 1:** Add the new tokens. Redefine nothing existing — only add keys. Append inside `colors.extend`:

```ts
// --- design-critique polish pass (additive; existing tokens unchanged) ---
brand: {
  orange: '#B8450F',
  orangeSoft: '#FDE2C8',
  mustard: '#F4C56F',
  brown: '#4A2912',
  DEFAULT: '#B8450F',   // bg-brand  → primary CTA / active nav (== orange)
  soft: '#EFD9C6',      // bg-brand-soft  → discount chips, focus ring
  muted: '#F6E8DC',     // bg-brand-muted → Pending/Unpaid chip bg
  deep: '#A6420E',      // bill header band ONLY
},
ink: {
  900: '#2A241F',
  700: '#5A5048',
  500: '#6E655E',
  DEFAULT: '#2A211B',   // text-ink   → primary text (pack `ink`)
  2: '#6E655E',         // text-ink-2 → secondary (== ink-500, alias)
  3: '#A29A92',         // text-ink-3 → tertiary/placeholder/stale (NEW)
},
paper: {
  surface: '#FBF8F1',
  elevated: '#FFFFFF',
  muted: '#F1ECE1',
  2: '#F1ECE1',         // bg-paper-2 → wells/disabled fill/eyebrows (alias of muted; 3-unit delta from spec #F4EFE3 is invisible)
},
card: '#FFFFFF',        // bg-card (== paper.elevated)
rule: '#E8E0D1',        // border-rule → all hairlines/borders (NEW)
mustard: '#C99B3B',     // bg-mustard → over-target bar fill (NEW; distinct from brand.mustard)
brown: '#6E3A1B',       // text-brown → chip text on mustard/soft tints (NEW)
ok: { soft: '#E1F0E5', stamp: '#3C6B45' },  // Fulfilled/Paid chip bg; bill PAID stamp
warn: '#C46A1A',        // complaint sub-card left rule
danger: '#A8331A',      // destructive label (Delete order)
'mustard-tint': '#F2E4C9', // Partial chip bg
```

- [ ] **Step 2:** `npm run typecheck` → expect pass (config is typed `Config`).
- [ ] **Step 3:** `npm run build` → expect clean build (Tailwind picks up new classes).
- [ ] **Step 4:** Commit: `polish: foundation — additive design-critique tokens (no redefinitions)`.

### Task 0.2: Focus-ring + input-shell + button primitives in `index.css`

**Files:** Modify `src/index.css`.

- [ ] **Step 1:** Scope the existing global `:focus-visible` orange outline OFF form inputs (it's the second half of P0-01's "double-orange ring"). Keep it for buttons/links/tabs. Change the selector list to exclude `input, select, textarea`, and add the new input focus treatment + primitives in `@layer components`:

```css
@layer components {
  /* P0-01: resting 1px rule; focus 1.5px brand border + 2px brand-soft ring, no inner glow */
  .input-shell {
    @apply w-full rounded-input border border-rule bg-card px-3 text-body text-ink;
  }
  .input-shell::placeholder { @apply text-ink-3; }
  .input-shell:focus {
    outline: none;
    border-color: #B8450F;          /* brand */
    box-shadow: 0 0 0 1.5px #B8450F, 0 0 0 3.5px #EFD9C6; /* 1.5px brand + 2px brand-soft ring */
  }

  /* P0-02: disabled = paper-2 fill, ink-3 label, no shadow/border (NOT desaturated brand) */
  .btn-primary {
    @apply h-11 w-full rounded-btn bg-brand text-body font-semibold text-white;
  }
  .btn-primary:disabled {
    @apply bg-paper-2 text-ink-3 shadow-none border-0;
  }
}
```

- [ ] **Step 2:** In the `@layer base` `:focus-visible` block, change the selector group so `input, select, textarea` are removed (they now use `.input-shell:focus`). Leave `a, button, [role='button'], [role='tab'], [tabindex]`.
- [ ] **Step 3:** `npm run build`; re-render Login + one form at 390 px (Appendix A) → confirm focused empty input shows the soft ring, not a heavy error-looking double ring.
- [ ] **Step 4:** Commit: `polish: foundation — input-shell + button primitives, focus-ring retune (P0-01/P0-02 base)`.

> P0-01 and P0-02 are *completed* per-screen by migrating each form's inputs to `.input-shell` and each primary button to `.btn-primary` (or applying the disabled classes). Those edits live in the P0 tasks below, screen by screen, so each screen is independently verifiable & revertable.

---

## Phase P0 — looks-broken / trust (7 findings) — PAUSE & report to Karan after this batch

Group by file; serialize within a file.

- [ ] **P0-03 · Today account chrome** — `today/TodayPage.tsx`: remove "SIGNED IN" label, email, Sign-out button. `settings/SettingsPage.tsx`: add an account section (email line `text-small text-ink-2` + a Sign out button calling `useAuth().signOut`, styled as secondary). Verify Settings sign-out works (settings-flow smoke). Slice 5.
- [ ] **P0-05 · Add-order checklist** — `orders/AddOrderPage.tsx`: completed rows → 20px `ink-3`-outlined check, label `text-small ink-2`, summary `ink-3`; next-incomplete row keeps filled `brand` circle + numbered glyph + full-weight label + 1.5px `brand` card border. Slice 11.
- [ ] **P0-06 · Peer pills** — `orders/OrdersPage.tsx:54`: Browse + Batch entry become two equal pills. Active `bg-brand text-white font-medium`; inactive `bg-paper-2 text-ink`. No underline. Slice 6/10.
- [ ] **P0-07 · Total + Delete** — `orders/OrderDetailPage.tsx`: Total label+value → `text-amount` (22/700 ink); Subtotal/Discount stay 14/400 `ink-2`; 1px `rule` separator above Total. Delete order → 24px gap + 1px `rule` top border, label `danger` on transparent (no fill/border). Slice 16/17. (Pairs with P1-06.)
- [ ] **P0-04 · Active toggle** — `events/EventDetailPage.tsx`: replace native checkbox with 48×28 pill toggle (`brand` on / `rule`-bordered `card` off, 22×22 white knob + 1px shadow, ≥44px target). Add sub-label "Visible in upcoming events & production" `text-meta`. Slice 13.
- [ ] **P0-01 finish** — migrate every form's text/select/date inputs to `.input-shell`: Login, AddOrder, BatchEntry, AddCustomer, AddCustomerInline, CustomerSearchPicker, EventDetail(add/edit), Settings, PlanWeek, LogProduction, EditLogProduction, AddProduct, EditProduct, SeedEstimateModal, public PickStep/ContactStep. Commit per screen-cluster. Verify a11y. Slice 11/13.
- [ ] **P0-02 finish** — migrate every founder-side primary Save/Continue button to `.btn-primary` (or apply disabled classes): AddOrder:411, AddCustomer save, PlanWeek save, LogProduction:80, EditLogProduction:128, Settings:264, BatchEntry:172, AddProduct:134, EditProduct:193, EventDetail:597, AddCustomerInline:97. (Public Continue handled by P2-09.) Slice 11.

**P0 gate:** `npm run typecheck && npm run test:run && npm run build`; smokes: launch-readiness(chromium), a11y, settings-flow, events-flow. Render Today/AddOrder/Orders/OrderDetail/Event at 390 px vs slices 5,6,11,13,16,17. **Report to Karan; wait for OK before P1.**

---

## Phase P1 — clarity / hierarchy (23 findings)

### Helpers first (TDD) — `reports/trend.ts`, `customers/lastOrder.ts`

- [ ] **P1-11 helper** — Create `src/features/reports/trend.ts`. Test `src/features/reports/trend.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { trendChip } from './trend';

describe('trendChip', () => {
  it('returns up direction + rounded % when last > first', () => {
    expect(trendChip([10, 11, 12, 14])).toEqual({ dir: 'up', pct: 40 });
  });
  it('returns down direction when last < first', () => {
    expect(trendChip([20, 18, 16, 12])).toEqual({ dir: 'down', pct: 40 });
  });
  it('returns dash when fewer than 4 weeks of data', () => {
    expect(trendChip([5, 6, 7])).toEqual({ dir: 'none', pct: null });
  });
  it('treats first===0 as no-baseline → dash', () => {
    expect(trendChip([0, 0, 4, 8])).toEqual({ dir: 'none', pct: null });
  });
});
```

Implement: `pct = round(abs(last-first)/first*100)`; `dir = last>first?'up':last<first?'down':'none'`; `<4 points` or `first===0` → `{dir:'none',pct:null}`. Wire into `TrendsTab.tsx`: render `▲ N%` / `▼ N%` chip in `ink`/`text-small` after each sparkline; `—` only when `dir==='none'`.

- [ ] **P1-15 helper** — Create `src/features/customers/lastOrder.ts`. Test it:

```ts
import { describe, it, expect } from 'vitest';
import { lastOrderLabel } from './lastOrder';
// today fixed via injected `today` arg (Asia/Kolkata YYYY-MM-DD)
describe('lastOrderLabel', () => {
  it('today', () => expect(lastOrderLabel('2026-06-01','2026-06-01')).toEqual({ text:'today', stale:false }));
  it('yesterday', () => expect(lastOrderLabel('2026-05-31','2026-06-01')).toEqual({ text:'yesterday', stale:false }));
  it('N days', () => expect(lastOrderLabel('2026-05-29','2026-06-01')).toEqual({ text:'3d ago', stale:false }));
  it('months + stale >30d', () => expect(lastOrderLabel('2026-04-01','2026-06-01')).toEqual({ text:'2mo ago', stale:true }));
  it('never', () => expect(lastOrderLabel(null,'2026-06-01')).toEqual({ text:'never', stale:true }));
});
```

Implement day-diff on Asia/Kolkata dates; `stale = diff>30`. Wire into `CustomersPage.tsx` rows: fixed-width 90px right column; `stale` → `ink-3`, else `ink-2`.

- [ ] **P1-13 helper** — In `reports/charts/StackedBar.tsx` (or a small `reports/channelMix.ts`), add a pure `leadingZeroRun(months)` returning the count of leading zero-volume months; test up/edge (all-zero, none-zero). Render the collapsed `Dec → Feb · no sales` `text-meta ink-3` prefix; first bar = first non-zero month.

### Per-screen P1 (group by file)

- [ ] **Today** (`today/TodayPage.tsx`): P1-01 ratio + 4px micro-bar; P1-02 over-target → `mustard` 100% bar + "N above target" `text-meta`; P1-03 bold quantities (`ink` 700) + name `ink-2` 400 + `+N more` `ink-3` + " · " separator; P1-04 two empty-state next-step cards (`/products`, `/customers/new`). Slice 5.
- [ ] **Order detail** (`orders/OrderDetailPage.tsx`): P1-06 action stack (2 primary `.btn-primary` Mark fulfilled/paid; 3-up secondary row Generate bill[1.5px brand]/Log complaint/Edit; Delete isolated per P0-07); P1-07 discount chip (`[20% off]` 11/700 `brown` on `brand-soft` `radius-badge`); P1-20 status chips use status palette (source neutral `paper-2/ink-2`; Pending/Unpaid `brand-muted/brand`; Fulfilled/Paid `ok-soft/ok-stamp`; Partial `mustard-tint/brown`). Slice 17.
- [ ] **Orders list** (`orders/OrdersPage.tsx`): P1-23 day-eyebrow grouping (`Tue 26 May` `text-eyebrow-tight ink-3`) + right status-chip column (₹total 700 ink + chip row); P1-21 `flex-wrap` filter chips (6px gaps, 12px h-pad). Slice 7/10.
- [ ] **Reports Week** (`reports/WeekTab.tsx` + `PipMarkerBar.tsx`): P1-05 single 8px `paper-2` track, `brand` made-fill, dashed `ink-2` plan tick, solid `ink` demand tick, 3-value label row `text-eyebrow-tight` + variance arrow (▲ `brand` / ▼ `brown`), drop legend. Slice 16.
- [ ] **Reports Trends** (`reports/TrendsTab.tsx`, `charts/LineChart.tsx`): P1-11 chip (helper above); P1-12 dashed target rule at y=100% `ink-3` + "target" label + first/last point inline `%` labels `text-eyebrow-tight ink`; P1-13 zero-month collapse (helper above).
- [ ] **Customers** (`customers/CustomersPage.tsx` + `AddCustomerPage.tsx`): P1-14 sort inline on chip row (`margin-left:auto`, `Sort: Recent ▾`); P1-15 timestamp column (helper above); P1-16 size-tier 3 peer chips `None·Small·Large` (None default `brand`/white, others `card`/`rule`/`ink`, no minus glyph); P1-21 wrap chips. Slice 12.
- [ ] **Production** (`production/ProductionPage.tsx` + `AggregatedSection.tsx`): P1-17 3-col grid `1fr 56px 70px 56px` + header eyebrows + 4px `brand` micro-bar (made/plan); P1-18 other-makers rows become normal cards with `by {maker}` 11px `brown`-on-`paper-2` chip, drop pseudo-table headers. Slice 14.
- [ ] **Bill PDF** (`orders/billPdf.ts`) — serialize, one file: P1-08 header band `brand-deep`, business name 22pt/700 white, tagline 10pt small-caps white@80%, watermark "**homemade · tasty · good quality**" ~10% `brand` (Karan edit 2026-06-01: "sweet"→"good quality"); P1-09 column heads on `brand-muted` band w/ `brown` 9pt small-caps, numerics right-aligned tabular, Total row single 1pt `ink` rule + 14pt/700; P1-10 PAID stamp 2pt outlined `ok-stamp` rect, 14pt/700, −6° rotation, bottom-left. **Render watermark sample → show Karan before committing P1-08.** Slice 18. Smoke: bill-flow (3-browser).
- [ ] **Date inputs** (`events/EventDetailPage.tsx`, `production/EditLogProductionPage.tsx`): P1-22 wrap native date in input-shell, placeholder `ink-3`, `appearance:none` + custom calendar SVG 12px from right. Slice 13.
- [ ] **Back-links** (all forms + `settings/SettingsPage.tsx`): P1-19 bottom-left `← Back to X` `ink-2` everywhere; remove Settings' top-left arrow, add bottom back-link.

**P1 gate:** typecheck + test:run + build; smokes: launch-readiness(chromium), reports-flow, customer-flow, discounts-flow, events-flow, a11y, bill-flow(3-browser). Render vs slices.

---

## Phase P2 — refinement (11 findings; P2-12 dropped)

- [ ] **Today** `today/TodayPage.tsx`: P2-01 date subhead `Thu, 28 May` `text-small ink-2` under H1.
- [ ] **Production** `production/ProductionPage.tsx`: P2-02 ramp-up → 11px `brown`-on-`mustard-tint` `radius-badge` chip beside name; P2-03 rename top-right link "Edit catalogue" (or move to Products section bottom).
- [ ] **Events** `events/EventsPage.tsx`: P2-04 relative time → right-aligned `brown`-on-`mustard-tint` `radius-badge` chip on row 1.
- [ ] **Event detail** `events/EventDetailPage.tsx`: P2-05 public URL as tappable `paper-2` mono field w/ inner copy icon.
- [ ] **Settings** `settings/SettingsPage.tsx`: P2-06 Identity/Bill/Contact headers → `text-eyebrow` (11px uppercase `ink-2` 0.14em).
- [ ] **Customers** `customers/CustomersPage.tsx`: P2-07 tighten chip h-pad 14→12px so 7 channel chips fit one row (after P1-21).
- [ ] **Bill** `orders/billPdf.ts`: P2-08 ₹ glyph fixed-left in currency cells, number right-aligned. Smoke: bill-flow(3-browser).
- [ ] **Public** `public/ContactStep.tsx` + `public/ConfirmStep.tsx`: P2-09 Continue disabled → `brand-soft` fill + `brown` label (warmer than founder side). `public/OrderConfirmationPage.tsx`: P2-10 tick-circle down 24px, order# → `rule`-bordered mono pill on `paper-2`. Slice 18.
- [ ] **Reports Month** `reports/MonthTab.tsx`: P2-11 variance → labelled chip "Variance: **54%** over plan" (tabular %, `brown` direction word, `brand-muted` bg, `radius-badge`).

**P2 gate + FINAL gate:** typecheck + test:run (expect 279+new) + build + **full smoke matrix** (chromium for all; 3-browser for bill-flow + a re-run of launch-readiness given AppShell/shared-primitive touch) + a11y. Render all 14 mockup screens at 390 px for correspondence. Tidy `scripts/_critique_shots/` + temp artifacts out of the commit set.

---

## Deploy (Karan's manual step)

Present diff + before/after 390px screenshots. On Karan's approval: merge `polish/ui-critique-pass` → `main`; Karan pushes → Vercel single deploy → mom sees one coherent update. One-line note to mom: sign-out now lives in Settings (gear icon).

---

## Self-review — spec coverage

All 38 findings accounted for: P0-01…07 ✓, P1-01…23 ✓, P2-01…11 ✓, P2-12 **dropped (recorded)**. Token deltas resolved additively (Phase 0). Behaviour-touching items isolated: P0-03 (sign-out relocation, companion add), P1-08 watermark (render-first). Structural reflows flagged for Karan: P1-01/02/03, P1-05, P1-06, P1-15, P1-17/18, P1-23.

## Appendix A — re-render a mockup slice / a live screen at 390 px

Mockups: load `design_handoff_crunchies_polish_pass/critique-reference.html` (file:// URI) in headless chromium at viewport 1240-wide, scroll-screenshot in 1600px slices → `scripts/_critique_shots/`. Live screens: `npm run build && npm run preview` then Playwright at 390×844, log in with `.env.local` `SMOKE_EMAIL`/`SMOKE_PASSWORD`, screenshot the route.
