# Handoff: Crunchies — small-business management app

> **⚠️ HISTORICAL — original pre-build handoff (Phase 0).** A point-in-time record of the design intent that *seeded* the build; **not** a current reference. The app is built, shipped, and feature-complete. In particular, the **design-token table in §4 is outdated** — its `brand.orange #D9591A` and `ink.500 #8A8079` predate the Sprint-10 WCAG-AA retune (`#B8450F` / `#6E655E`) and the 2026-06 polish-pass token layer. **For current design tokens + how to work, see `tailwind.config.ts`, `src/index.css`, and `CLAUDE.md`.** Kept for provenance — don't edit to "fix"; it documents what was true at handoff.

A development handoff for the Crunchies app — Archana Kothadiya's artisanal snacks business in Pune. This bundle contains the original design brief, the chosen wireframe variants from design review, a logo asset, and the engineering guidance needed to build production code.

## Contents

> **Note:** the original handoff bundle (`design_handoff_crunchies_app/`) has been restructured into the repo. Paths below reflect the **current repo layout**, not the bundle layout. Companion file: `ENGINEERING_NOTES.md` (chosen-variant summary, open tasks, out-of-scope items).

```
crunchies-management-app/
├── docs/
│   ├── DESIGN_HANDOFF.md                ← you are here
│   ├── PRODUCT_BRIEF.md                 ← founder's PRD, source of truth for behaviour
│   ├── ENGINEERING_NOTES.md             ← chosen-variant summary, open tasks, out-of-scope
│   └── design/
│       ├── brochure-original.jpg        ← brand reference for palette & sensibility
│       ├── wireframes/
│       │   ├── Crunchies Wireframes.html     ← v1: all variants on a pan-zoom canvas
│       │   ├── Crunchies Wireframes v2.html  ← v2: final chosen variants only
│       │   ├── design-canvas.jsx             ← canvas host (don't ship)
│       │   └── wireframes/*.jsx              ← React JSX of each screen (don't ship)
│       └── screenshots/                 ← one PNG per chosen artboard
│           └── 01-today-b.png … 18-bill-traditional.png
├── public/                              ← Vite static-serve root
│   ├── manifest.json                    ← production PWA manifest (was manifest.sample.json)
│   └── icons/
│       ├── icon.svg                     ← vector source, "any" purpose
│       ├── icon-maskable.svg            ← vector source, "maskable" purpose
│       ├── icon-192.png                 ← PWA 192×192
│       ├── icon-512.png                 ← PWA 512×512
│       ├── icon-192-maskable.png        ← Android adaptive 192×192
│       ├── icon-512-maskable.png        ← Android adaptive 512×512
│       ├── apple-touch-icon.png         ← iOS home-screen 180×180
│       ├── favicon-32.png               ← browser tab 32×32
│       ├── favicon-16.png               ← browser tab 16×16
│       └── head-snippet.html            ← <head> tags reference (paste into app shell)
└── src/
    └── assets/
        └── crunchies-logo.svg           ← wordmark, two-tone, path-based (no font dependency)
```

Open the two `.html` files in any modern browser to inspect the wireframes interactively (pan, zoom, fullscreen any artboard). The `docs/design/screenshots/` folder is a flat reference for embedding in tickets / Notion / PRDs without needing to fire up a browser.

The manifest's icon paths (`/icons/icon-192.png` etc.) and the head-snippet's references (`/manifest.json`, `/icons/...`) resolve correctly against Vite's `public/` convention — no path edits required.

---

## 1. Overview

A small artisanal snacks business in Pune, India. The founder ("mom" throughout — Archana, late 50s) runs production with 8–10 part-time women, sells through resellers, a personal network on WhatsApp, and exhibitions. Today she runs the business on WhatsApp + a paper notebook.

The app solves three pain points she experiences daily:
1. **Production planning** — she chronically underproduces because she has no method for estimating weekly quantities.
2. **Customer and order history** — exhibition contacts get lost; there's no structured record.
3. **Order tracking** — WhatsApp pings slip through; she forgets promised delivery dates.

Five-tab Android mobile app (PWA) for mom + one public exhibition order form for one-time customers + a bill PDF.

**Read `PRODUCT_BRIEF.md` end-to-end before writing code.** It is the source of truth for *what* the app does, the founder's profile, tone constraints, and the per-screen behavioural specs. The wireframes are the source of truth for *what each screen looks like* — they implement the brief's specs, picking one direction where the brief left structure open.

---

## 2. About the design files

The HTML files in `design/wireframes/` are **design references** — clickable lo-fi mockups built in React + Babel to communicate structure, flow, copy, and information hierarchy. They are **not production code to copy line-for-line**.

Your job is to **recreate these designs in the team's chosen app framework** — likely React Native or Flutter for a real Android PWA. Use the brief + wireframes together as input; produce idiomatic code in whatever stack the team picks.

### Fidelity: low-fi

The wireframes deliberately use:
- **Patrick Hand display lettering** (a hand-written-looking Google Font) — *not the production font*. This is purely the wireframe register.
- **Black & white with one orange accent** — *not the full brand palette*. Structure must read independent of color before color decisions get layered on.
- **Dashed borders and hatched placeholders** for affordances and imagery — *not the production border treatment*.

You should apply the actual brand system (§4 below) during the build. The wireframes commit to structure decisions only; visual polish is your job (with design review at mid-fi).

---

## 3. Chosen design variants

These were picked across two rounds of wireframe review. The variants are referenced by the labels printed on each artboard in `design/wireframes/Crunchies Wireframes.html` (v1 shows all options; v2 shows only the chosen revisions). The **Screenshot** column links each variant to its standalone PNG in `design/screenshots/` — drop these into PRs / tickets / Notion.

| Screen | Chosen variant | Screenshot | Notes |
|---|---|---|---|
| **Today** | **B — calendar-anchored (week strip)** | `design/screenshots/01-today-b.png` | Use the v2 compressed layout. The bottom `+ Log new order` CTA and the 5-tab bar must both stay visible without scrolling at 320×640. |
| **Production main** | **B — card + dial per product** | `design/screenshots/02-production-b.png` | Each product is a card with a progress dial (made/plan). Use the v2 layout: the **Upcoming events** card has explicit `All events →` link in its label AND a separate `See all (N)` button alongside `+ Add event`. Row-tap-into-detail alone is not discoverable enough. |
| **Plan this week** | as drawn in v1 | `design/screenshots/03-plan-this-week.png` | Suggested numbers pre-fill all in-house products; mom edits and saves. |
| **Product bottom sheet** | as drawn in v1 | `design/screenshots/04-product-sheet.png` | Bottom sheet keeps the production list visible behind it. Swipe-down or × to dismiss. |
| **Orders — browse** | **B — grouped by day** | `design/screenshots/05-orders-browse-b.png` | Day-headers separate today / yesterday / earlier days. Reverse-chrono within each group. |
| **Orders — batch entry** | as drawn in v1 | `design/screenshots/06-orders-batch.png` | Each `Save & next` commits immediately. `Done` exits to Browse mode. |
| **Add Order** | **B — accordion (progressive)** | `design/screenshots/07-add-order-b.png` | One step expanded at a time. Visual progress (numbered circles, checkmarks on completed). |
| **Order detail** | as drawn in v1 | `design/screenshots/08-order-detail.png` | Action buttons stacked full-width: Mark fulfilled → Mark paid → Generate bill → Log complaint. Edit/Delete are smaller secondary controls. |
| **Customers — directory** | as drawn in v1 | `design/screenshots/09-customers-directory.png` | Filter chips horizontally scrollable. Sort dropdown below chips. |
| **Customer detail** | as drawn in v1 | `design/screenshots/10-customer-detail.png` | Action buttons: `+ Log new order`, `Send WhatsApp`. Outstanding amount in deep red color (alarm color), customer count and last-order in neutral. |
| **Add Customer** | as drawn in v1 **+ custom-channel affordance** | `design/screenshots/11-add-customer.png` | See §6.1 below — the channel selector must allow adding a new custom channel inline. |
| **Events list** | as drawn in v1 | `design/screenshots/12-events-list.png` | Filter chips: Upcoming / Past / All. |
| **Event detail** | as drawn in v1 | `design/screenshots/13-event-detail.png` | Public URL block only renders when kind = Exhibition. |
| **Reports — Week calibration card** | **B — pip markers on a made-bar** | `design/screenshots/14-reports-week-b.png` | Single bar per product = made; dashed tick = plan; solid tick = demand. Legend printed once below the section. Denser than the three-bar alternative, easier to scan. |
| **Reports — Trends tab** | **redesigned in v2** | `design/screenshots/15-reports-trends.png` | Big headline accuracy %, simple rising line over 8 weeks (up = better), per-product sparklines with delta + biggest miss. The v1 variance-bar chart was unintuitive; use v2. |
| **Public exhibition form** | **B — 3-step wizard** | `design/screenshots/16-public-form-b-wizard.png` | Pick → Contact → Confirm. Progress bar at top. Order summary always visible in step 2 and 3. |
| **Order confirmation** | as drawn in v2 | `design/screenshots/17-order-confirmation.png` | After public-form submit. Big checkmark, order number, pickup card with date + window + venue, order summary, `Save to WhatsApp` CTA. |
| **Bill PDF** | **B — traditional invoice** | `design/screenshots/18-bill-traditional.png` | Double-border frame, orange header row in the items table, payment box at bottom, signature line "— Archana". |

---

## 4. Design tokens

### Color palette

Pulled from the brochure. Use semantic names in your token system; don't hardcode hex everywhere.

| Token | Hex | Usage |
|---|---|---|
| `brand.orange` | `#D9591A` | Primary CTA fill, brand surfaces (public form header, bill header band), selected-state fills. |
| `brand.orangeSoft` | `#FDE2C8` | Accent backgrounds (selected chips, retrospective banners). |
| `brand.mustard` | `#F4C56F` | Logo face color, secondary brand accent. |
| `brand.brown` | `#4A2912` | Logo shadow, brand display text on light surfaces. |
| `ink.900` | `#2A241F` | Body text on light surfaces. |
| `ink.700` | `#5A5048` | Supporting text. |
| `ink.500` | `#8A8079` | Tertiary text, disabled, hints. |
| `paper.surface` | `#FBF8F1` | Default app background (warm white). |
| `paper.elevated` | `#FFFFFF` | Card backgrounds. |
| `paper.muted` | `#F1ECE1` | Inactive surfaces, day-group headers in Orders B. |
| `sticky.yellow` | `#FFF7C2` | Banners (Monday retro), draft / in-progress states. |
| `status.ok.bg` | `#EEF6EE` | Paid / fulfilled badge background. |
| `status.ok.border` | `#3E7A48` | — border. |
| `status.warn.bg` | `#FFF5E8` | Unpaid / pending badge background. |
| `status.warn.border` | `#A36A1D` | — border. |
| `status.danger.fg` | `#A04015` | Overdue marker, "Outstanding ₹X" amount in customer header, destructive button text. |
| `quiet.bg` | `#F0EEE9` | Quiet-customer rows. **No urgency color.** §4.8 of the brief is explicit. |

### Typography

Mobile-only (PWA on Android). **Use the platform system font** (Roboto on Android). Hierarchy comes from size + weight + color + spacing, not from font-family. Custom display fonts are explicitly deferred to v2 per §4.11 of the brief.

A suggested scale (refine in mid-fi):

| Role | Size | Weight | Notes |
|---|---|---|---|
| Display (rare — section heroes on Reports) | 32-36px | 700 | Used for the "84% accuracy" headline on Trends. |
| Title (screen titles, customer name on detail) | 18-20px | 700 | |
| Subtitle / row primary | 15-16px | 600-700 | Customer name in row, product name in production. |
| Body | 14px | 400 | Default. |
| Body small | 12px | 400 | Supporting row text, dates, "made 1 of 5". |
| Section label (all-caps mono) | 10-11px | 500 | Letter-spacing 1.2px, uppercase. JetBrains Mono or system mono. |
| Numerical (prices, qty) | use tabular figures | varies | Add `font-variant-numeric: tabular-nums` so columns align. |

### Spacing

Use a 4px base scale: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 48.

- Screen edge margin: **14px** (mom-app), **16px** (public form).
- Section vertical gap: **14-18px**.
- Card internal padding: **12px** horizontal, **10-14px** vertical.
- Row vertical padding: **8-10px** for compact lists, **12-14px** for primary rows.
- Touch targets: minimum **44px** tall (Android material recommendation). Full-width buttons should be ~52px tall.

### Borders & radii

- Card radius: **10-12px**.
- Input radius: **8px**.
- Button radius: **12px** primary, **8px** secondary/small.
- Chip / badge radius: **999px** (pill).
- Default border: **1px** at low contrast (e.g. `rgba(42,36,31,0.08)`). The wireframes use heavier 1.4px ink lines — *do not copy that thickness*; it is wireframe register only.

### Shadows

The wireframes use a stylized hard 2px-offset shadow (`2px 2px 0 rgba(42,36,31,0.12)`) — wireframe register only, **do not ship**. Use Material-3-style soft elevation in the real build (e.g. `0 1px 2px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)` for cards; slightly heavier for bottom sheets and modals).

---

## 5. Hard requirements from the design brief

Highest-priority engineering constraints. **Read the brief for the full justification of each.**

| # | Constraint | Brief section |
|---|---|---|
| 1 | **Mobile-first PWA, Android only.** Tablet/desktop are bonus, not required. Installable to home screen. | §4.1 |
| 2 | **30-second interaction budget** for common actions (log order, mark fulfilled, log production, generate bill, add customer). Design forms for tap-and-go. | §4.2 |
| 3 | **Search-as-you-type** beats long dropdowns. Used for customer picker, product picker, event picker. Debounce ~200ms. | §4.4 |
| 4 | **Recently-used chips** for products in the order form — 5–8 hero items dominate 80% of orders. | §4.5 |
| 5 | **No icons-only buttons.** Every actionable control has a text label. | §4.6 |
| 6 | **No gamification, badges, confetti, streaks.** No "Great week!" framing. The one exception is the Monday retrospective banner on Today — informational, dismissible, no celebration. | §4.7 |
| 7 | **No nudges / no push notifications in v1.** Pull-not-push. PWA push deferred to v2. | §4.8 |
| 8 | **Indian-English locale.** Currency: ₹, Indian numbering (`₹1,20,500.00`). Dates day-first ("Mon, 20 May 2026"). Phone: 10-digit Indian mobile, `wa.me/91XXXXXXXXXX` for WhatsApp links. | §5 |
| 9 | **Weeks are Monday → Sunday**, local time. Used everywhere — production cadence, reports period selector, retrospective banner. | §7.17 |
| 10 | **Five bottom tabs** persist on every screen of mom-app: Today / Orders / Customers / Production / Reports. Settings is a header gear icon on Today, not a sixth tab. | §6 |
| 11 | **Refetch on tab focus.** No realtime subscriptions in v1. Pull-to-refresh optional. | §7.16 |
| 12 | **Confirmation modals only for destructive actions** (delete order/customer, archive customer, delete event). No confirms on routine state changes. | §4.9, §7.13 |
| 13 | **Tone of copy is direct and operational.** "Log new order" — not "Create a new order to record a customer's purchase". See the table at the bottom of §5. | §5 |
| 14 | **Quiet customers stay grey.** Never red/orange. Label is "Quiet" — never "Overdue", "At risk", "Lapsed". | §4.8, §8.3.4 |
| 15 | **Production B → Events**: explicit `All events →` link AND `See all (N)` button. Row-tap to detail alone is insufficient. | this handoff |

---

## 6. Open development tasks (from review)

### 6.1 · Add-customer: support custom channels

The Add Customer screen currently shows three fixed channel chips: **Personal / Reseller / Exhibition**.

**Requirement:** add an affordance to create a new custom channel inline.

- A dashed `+ Add channel…` chip at the end of the channel row.
- Tapping it expands an inline input ("Channel name") → save → the new chip appears selected.
- New channels become available everywhere channel is referenced: Customers directory filter chips, Reports channel breakdown, Add Customer chip row.

**Why:** mom's three current channels match her business today, but she may add a corporate-gifting line, a second exhibition circuit, a hostel/canteen reseller, etc. Hardcoding three would force a code change each time.

**Data model:**
- `channels` is a referenced table (or enum-with-extensions), not a hardcoded literal in code.
- Channel rows are soft-deletable (`active: false`). Historic customers referencing a hidden channel keep that channel attribution.
- Default channels (Personal / Reseller / Exhibition) cannot be deleted, only hidden.

**UI rules:**
- Channel name max 20 chars; trim whitespace; case-insensitive uniqueness.
- Custom channel chips render identical to default ones — no "user-added" visual differentiation.
- Inline creation should not navigate away from the in-progress Add Customer form.

### 6.2 · Order confirmation route (public form)

After `Place order →` on the public exhibition form, route to:
```
/order/<event-slug>/confirmed?ref=<order-id>
```

The confirmation screen (designed in v2 — see `Crunchies Wireframes v2.html` → `confirm` artboard) shows:
- Big checkmark + "Order placed."
- Personalized thank-you ("Thank you, {first name}").
- Order number `#YYYY-NNNN`.
- Pickup card: event name + date + time window + stall/venue line.
- Order summary table (products × qty + total).
- **"Total · pay at pickup"** explicit copy (no online payment in v1).
- Primary CTA: `Save to WhatsApp` — shares a copy of the order to the customer's own WhatsApp via `wa.me` deeplink with a pre-filled message. Not a merchant notification.
- Secondary link: `Place another order →` — returns to a fresh form with name + phone auto-filled.
- Footer: WhatsApp Archana on the registered business number.

---

## 7. Brand assets

### Logo

`src/assets/crunchies-logo.svg`

A path-based wordmark recreated from Archana's brochure. Each glyph is drawn as SVG geometry — no `<text>` elements, no external font dependencies — so the file renders identically in every renderer (inline, `<img>`, Figma, Illustrator, PDF). Two-tone effect: deep-brown shadow behind a warm-mustard face, with each letter rotated a few degrees off-axis for the hand-painted feel. A few stylised splash marks float around the wordmark.

The current SVG is a structural placeholder while the team commissions a proper professional wordmark — treat it as the closest hand-buildable approximation of the brochure's spirit, not the final brand mark.

### App icons (PWA)

Full icon set under `public/icons/`. The base mark is a circular orange badge with a stylised "C" monogram, drawn from the same two-tone palette as the wordmark.

**Two SVG sources** are provided so the dev can re-rasterize at any size:
- `icon.svg` — `any` purpose, transparent outside the disc.
- `icon-maskable.svg` — `maskable` purpose, full-bleed orange square with all critical content inside the centre 80% safe zone.

**Pre-rasterized PNGs** cover the platforms that need raster:
- `icon-192.png`, `icon-512.png` — required PWA sizes (Android Chrome).
- `icon-192-maskable.png`, `icon-512-maskable.png` — Android adaptive icon.
- `apple-touch-icon.png` (180×180) — iOS home screen.
- `favicon-32.png`, `favicon-16.png` — browser tab.

**Wiring it up:**
- `public/manifest.json` — already at the production location (Vite serves `public/` from `/`). Adjust the `start_url` / `scope` only if the app lives under a subpath.
- `public/icons/head-snippet.html` — paste contents into the app shell's `<head>`. All paths assume icons are served from `/icons/` — which is the case under `public/icons/`.

### Brochure

`docs/design/brochure-original.jpg`

The original brand collateral. Use it for color picking and to gauge the brand's visual register (artisanal-warm, hand-painted, proudly professional — *not* rustic-craftsy, *not* corporate-cold). The product photos in the brochure are real product shots from Archana's kitchen.

---

## 8. Out of scope for this handoff

These screens/states are mentioned in the brief but were **not designed** in the wireframe rounds. Flag with the design team early if any are sprint-blocking:

1. **Onboarding / first-launch** — initial business identity setup, products seed, channel seed, seed-demand entry for the algorithm to bootstrap from.
2. **Products setup** — add/edit/archive product, price tiers, default qty unit.
3. **Settings detail** — business identity (name, phone, UPI), bill template config, channel management UI, archived customer view.
4. **Empty / loading / error states gallery** — each screen has empty states sketched inline; you'll need consolidated treatments for first-run, network failure, save failure.
5. **Complaint logging** — bottom sheet form mentioned in §8.2.6 of the brief.
6. **Bill share-flow** — preview modal + native OS share-sheet behaviour for the WhatsApp handoff.
7. **PWA install prompt** — the app-shell prompts when criteria are met; copy + visuals undesigned.
8. **Accessibility pass** — touch-target audit, color contrast verification, screen-reader labels, focus states.

---

## 9. Recommended implementation order

A pragmatic sequence — front-load the schema + the daily-use screens, defer reports until there's real data.

1. **Data model + auth** — customers, products, orders, order_items, production_batches, events, channels (extensible).
2. **Today screen** + **Orders browse** + **Add Order** + **Order detail** — captures the daily workflow first.
3. **Customers directory + detail + add (with custom-channel)** — second-most-used.
4. **Production main + Plan this week + product sheet** — the planning loop. Needs at least one full week of orders to be useful.
5. **Events list + detail** + public exhibition form + confirmation screen.
6. **Reports (Week + Trends)** — last; depends on accumulated data.
7. **Bill PDF generation** — can ship after step 3; uses the order detail as the data source.
8. **Settings** + onboarding + empty states polish.

---

## 10. Questions to surface back to design

Before sprint kickoff, get clarity on these — they came up during wireframe review but weren't fully resolved:

1. **Bill numbering** — sequential per business or per-customer? Year prefix vs. monthly prefix?
2. **Outstanding balance display** — is it computed live (sum of unpaid orders) or stored on the customer? If live, performance for top-customer queries?
3. **Public form spam protection** — captcha, rate-limit by IP, or trust the slug-as-secret? (The slug is "secret" but discoverable if shared publicly.)
4. **Quiet thresholds** — hardcoded in the brief (21d/60d/30d/90d) or settings-tunable? The brief implies hardcoded but a manager might want to tune.
5. **Production "made" granularity** — log per batch (qty + date + notes) or per session (qty only, dated to today)? The wireframes show per-batch with edit/delete.
6. **Exhibition form auto-create-customer flow** — when an exhibition order comes in with a phone matching an existing customer, do we create a new customer record, attach to existing, or prompt mom?
