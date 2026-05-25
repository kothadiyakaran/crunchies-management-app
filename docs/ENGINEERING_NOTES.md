# Engineering Notes — Crunchies v1

**Status (2026-05-22):** Phase 1 build complete. This doc is now a maintenance-phase reference for the design-handoff snapshot — chosen variants, do-not-ship reminders, and pointers to where build-time decisions were captured.

For current state and how to work, see `CLAUDE.md`. For the sprint-by-sprint Phase 1 narrative, see `docs/BUILD_HISTORY.md`. For locked feature specs, see `docs/v1-spec.md`. For decisions, see `docs/decisions/`.

---

## 1. Chosen variants (from Claude Design handoff)

From `DESIGN_HANDOFF.md` §3. PNG paths are relative to `docs/`.

| Screen | Variant | Why this variant |
|---|---|---|
| Today (`design/screenshots/01-today-b.png`) | **B — calendar-anchored (week strip)** + v2 compressed layout | CTA + 5-tab bar must stay visible at 320×640 without scrolling |
| Production main (`02-production-b.png`) | **B — card + dial per product** + v2 layout | Progress dial reads in one glance; v2 adds the explicit `All events →` + `See all (N)` for nav |
| Plan this week (`03-plan-this-week.png`) | as drawn in v1 | Single column of suggestion-prefilled numeric inputs |
| Product bottom sheet (`04-product-sheet.png`) | as drawn in v1 | Standard bottom sheet pattern, keeps the production list visible behind |
| Orders browse (`05-orders-browse-b.png`) | **B — grouped by day** | Day-headers (today / yesterday / older) outperform a flat chronological list when mom is scanning |
| Orders batch entry (`06-orders-batch.png`) | as drawn in v1 | Always-visible form + running list; matches the brief's batch-mode spec exactly |
| Add Order (`07-add-order-b.png`) | **B — accordion (progressive)** | One step expanded at a time + visual progress (numbered circles, checkmarks) beats a long single form |
| Order detail (`08-order-detail.png`) | as drawn in v1 | Stacked action buttons (Fulfilled → Paid → Bill → Complaint), Edit/Delete secondary |
| Customers directory (`09-customers-directory.png`) | as drawn in v1 | Search + filter chips + sort dropdown |
| Customer detail (`10-customer-detail.png`) | as drawn in v1 | Header → stats → actions → notes → order history; outstanding ₹ in `status.danger.fg` |
| Add Customer (`11-add-customer.png`) | as drawn in v1 **+ custom-channel affordance** | Inline-creatable channel chip |
| Events list (`12-events-list.png`) | as drawn in v1 | Filter chips + two-line rows |
| Event detail (`13-event-detail.png`) | as drawn in v1 | Public URL block conditional on `kind = exhibition` |
| Reports — Week calibration (`14-reports-week-b.png`) | **B — pip markers on a made-bar** | Single bar (made) with dashed tick (plan) + solid tick (demand) is denser and easier to scan |
| Reports — Trends (`15-reports-trends.png`) | **redesigned in v2** | Big accuracy %, rising line (up = better), per-product sparklines with delta + biggest miss |
| Public exhibition form (`16-public-form-b-wizard.png`) | **B — 3-step wizard** | Pick → Contact → Confirm, with progress bar. Better for untrained users |
| Order confirmation (`17-order-confirmation.png`) | v2 redesign | Order number `#YYYY-NNNN` + pickup card + save-to-WhatsApp |
| Bill PDF (`18-bill-traditional.png`) | **B — traditional invoice** | Double-border frame, orange header row, payment stamp, "— Archana" signature line |

## 2. Design tokens — current, post-retune (Sprint 10 close)

Authoritative source: `tailwind.config.ts`. Values noted here for quick reference; do not edit this doc to change tokens — edit `tailwind.config.ts`.

| Token | Hex | Where used |
|---|---|---|
| `brand-orange` | `#B8450F` | Primary CTAs, focus rings, bill header band, reseller channel chart |
| `brand-orangeSoft` | `#FDE2C8` | Hover/active states |
| `brand-mustard` | `#F4C56F` | Personal channel chart |
| `brand-brown` | `#4A2912` | Exhibition channel chart |
| `ink-900` | `#2A241F` | Primary text |
| `ink-700` | `#5A5048` | Secondary text |
| `ink-500` | `#6E655E` | Labels / captions (clears WCAG AA 4.5:1 on paper-surface + white) |
| `paper-surface` | `#FBF8F1` | Page background |
| `paper-elevated` | `#FFFFFF` | Card background |
| `paper-muted` | `#F1ECE1` | Subtle dividers |

The retune from `ink-500 #8A8079` → `#6E655E` and `brand-orange #D9591A` → `#B8450F` happened at Sprint 10 close. See ADR-48. Pre-retune values failed WCAG AA across 108 nodes; post-retune `verify-a11y.py` reports 0 violations.

The bill PDF uses a separate print palette (`#F2800C` orange, neutral inks) — different context, intentionally diverged from web tokens.

## 3. Do-not-ship reminder

Per the handoff §2:
- `docs/design/wireframes/*.html` and `docs/design/wireframes/wireframes/*.jsx` are **design references only**. They use Patrick Hand display fonts, dashed borders, 2px hard shadows, and the lo-fi B&W + orange palette — all wireframe register only.
- None of the JSX from the bundle ships to production. The app is built fresh in the chosen stack (React + Vite + TypeScript + PWA, per `v1-spec.md` §1) using the design tokens from `DESIGN_HANDOFF.md` §4.
- The wireframes remain in-repo as visual + behavioural references.

## 4. Build-time history (archived)

This document previously tracked open development tasks, design-spec divergences, and sprint sequencing. All of that has been resolved and is preserved in:
- `docs/BUILD_HISTORY.md` — sprint-by-sprint narrative
- `docs/decisions/*-architecture-decisions.md` — per-sprint ADRs
- Git log for commit-level trace

If you need to understand a specific build-time decision that isn't in CLAUDE.md or v1-spec.md, start with the ADR for the relevant sprint.
