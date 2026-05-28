# Crunchies — UI Critique Brief

A cover-sheet for a **design critique of a shipped, in-use app**. The screenshots in `screenshots/` are the subject; this document is orientation so the critique lands on the right things. It is deliberately short — the original behavioural PRD (`../PRODUCT_BRIEF.md`, ~1,250 lines) has every screen spec if you want depth, but you shouldn't need it to critique the visuals.

The app is live at `crunchies.app`, on the primary user's phone, and she's happy with it. This is a *polish* pass, not a redesign.

---

## What we want from you

**Be exhaustive.** Surface every UI improvement you'd make across the app — don't self-censor to a handful. But **order everything by priority** and tag each finding with a severity, so we can act top-down and stop wherever we run out of appetite without missing the long tail.

We're after concrete, visual, implementable notes: hierarchy, spacing, typographic emphasis, colour application within the existing palette, alignment, density, affordance clarity, empty-state quality. Not architecture, not features, not copy rewrites unless a label is actively confusing.

Use this severity vocabulary so the prioritisation is consistent:

- **P0** — looks broken / undermines trust on sight (the user won't tolerate "rough"; these are the ones that matter most).
- **P1** — clear improvement to clarity, hierarchy, or polish; low risk.
- **P2** — refinement / nice-to-have / taste call.

### How to deliver it

Return a single **markdown report** structured as:

1. **Master prioritised list** (app-wide) — every finding in one table, sorted P0 → P2: severity · screen · the change in one line · why it matters (tie to the persona/outcomes below) · effort/risk read (low/med/high). This is the triage view.
2. **Per-screen notes** — grouped by screen, in the screenshot order, covering all findings (not just the top ones). For each: **which screenshot** (filename), **what** to change, **why**, and **before → after** in concrete visual terms (e.g. "promote the total to `title` weight; drop the row dividers to a single hairline; tighten vertical rhythm to 8px"). Reference the existing tokens/scale by name where you can — see the constraints section.
3. **"Bigger swings"** — anything higher-impact but higher-risk to her trust, kept separate so we can weigh it deliberately.

### Reference artifacts to include (high fidelity)

Words alone are hard to act on for visual changes. For every **P0 and P1** finding (and any P2 where a picture is clearer than a sentence), please include a **high-fidelity visual reference** — pick whichever communicates fastest:

- **Annotated screenshots** — mark up the actual PNGs in this pack with callouts/redlines pointing at the specific issue. Best for "this spacing/this alignment/this emphasis."
- **Before → after mockups** at **390 px width** — a redrawn version of the screen (or the relevant component) showing the proposed state next to the current one. Best for layout/hierarchy reworks.
- **Component redlines** — exact spacing/size/weight/colour values for a reworked element, expressed in the existing token vocabulary (e.g. `text-title`, `paper-elevated`, `spacing.edge`, `radius.card`) so it drops straight into Tailwind.

Deliver any image assets in an `output/` folder alongside the report, referenced inline by filename. Don't propose values outside the approved palette/type-scale (below); express everything in those terms.

---

## Hard constraints — please critique *within* these, not against them

- **Mobile-only runtime.** The user runs this as an Android PWA, portrait, one-handed. Desktop and tablet are explicit non-goals. All screenshots are at **390 px** width. Don't suggest desktop layouts.
- **Palette is approved and fixed.** Brand orange `#B8450F`, ink/secondary-text `#6E655E`, paper surface `#FBF8F1`, plus soft-orange/mustard/brown accents and subtle status tints. These were **retuned for WCAG AA contrast** at launch. Suggest *better application* of this palette, not a new one.
- **System font (Roboto).** Custom display fonts are deferred. Hierarchy must come from weight/size/colour/spacing, not new typefaces.
- **Brand sensibility comes from the brochure** — included at `brand/brochure-original.jpg` (the founder's existing print collateral) and the logo at `brand/crunchies-logo.svg`. Judge brand consonance against these.
- **No gamification, no celebration, no nudge-y urgency.** The intended register is "quietly competent business tool," not consumer-app cheer. Confetti, streaks, badges, "Great week!" framing are all explicitly out. A subtle checkmark is fine.
- **The user will not tolerate a "rough" app.** She sees changes only when finished. So please bias toward suggestions that are **high-impact and low-risk to her trust** — flag anything that's a bigger swing separately.

---

## Off the table — engineering constraints

These are settled implementation realities. Please **don't spend critique on changing them** — but UI suggestions *within* them are very welcome. (If something here is genuinely the root cause of a UI problem, note it once, briefly, and move on.)

- **Charts are hand-rolled SVG** — no charting library (no Recharts/D3/Chart.js). Suggest better *visual design* of the existing SVG charts (labels, axes, density, the calibration line/bars), not a new charting stack.
- **The bill is a generated PDF** (jsPDF), previewed as a rendered **canvas** image — it is not HTML/CSS we can freely restyle, and the canvas approach is a deliberate fix for Android WebView. Critique the **bill's own layout/typography/brand** (header band, table, payment stamp), not the fact that it's a PDF or how it's rendered.
- **No realtime / no live updates.** Data refreshes when a tab regains focus. Don't propose live-updating dashboards, websockets, or optimistic-sync UI.
- **No new heavy dependencies.** The app is bundle-size-conscious and lazy-loads aggressively. Avoid suggestions that imply a component kit, animation library, icon font, or similar. Animation, if any, should be light CSS.
- **Tailwind 3 with the fixed token set** (palette + type scale + spacing/radius below). Express proposals in those tokens; don't introduce arbitrary one-off values.
- **WCAG AA is already met** across the authed routes and public form — don't propose anything that regresses contrast or relies on colour alone for meaning.
- **Out of scope entirely:** the data model, auth/RLS/RPC security design, routing/lazy-loading architecture, test infrastructure, and any backend/schema change. This is a *visual/interaction* critique of the front end only.

## Who it's for (persona)

**Archana**, the founder — a woman in her late 50s running a small artisanal-snacks business in Pune, India. She built it in her later years; her real motivation is **meaningful engagement and confidence**, not profit-maximising. Treat that as a design constraint.

- **Android-fluent** (WhatsApp, YouTube, Maps, banking apps) but has **never used Excel or any productivity software** — spreadsheet/bookkeeping metaphors are foreign.
- **Smart and competent** — runs a real business with real money. Copy and UI must not condescend or over-instruct.
- Reads/types **English** (the v1 app language).
- Previously ran everything on **WhatsApp + a paper notebook**; the app replaces the notebook.

She sells across three channels, which is why the data has three shapes: **reseller shopkeepers**, a **personal network** of friends/relatives, and **exhibition/fair stalls** (which also feed a public order form filled by strangers on their own phones).

## The three outcomes the app exists to serve

- **O1 — Production matches demand.** She chronically under-produced; the app suggests weekly quantities and, over time, teaches her to eyeball them. (This is the calibration story on Production + Reports → Trends.)
- **O2 — Zero lost customers or orders.** Every WhatsApp order captured, every exhibition contact kept, every promised date remembered.
- **O3 — Mastery and clarity.** She opens it daily because it makes her feel in control. The feeling should come from *order and legibility*, not encouragement.

## Design philosophy (condensed — full version in PRODUCT_BRIEF §4)

Mobile-first; ~30-second interaction budget for common actions; minimal typing (chips, search-as-you-type, numeric keypads); generous touch targets; **text labels on every control** (never icon-only); empty states are matter-of-fact with a clear next action; reversible actions are quiet, destructive ones get one confirm. Aesthetic target: a calm, considered Indian small-business tool — warm artisanal but professional. Avoid generic Material/admin-dashboard/AI-startup blandness.

**Tone of copy:** direct and operational — "Log new order", "Mark fulfilled", "All caught up." Never celebratory or apologetic.

## Information architecture

One data spine (customers · products · orders · production · events) viewed through a **5-tab bottom nav**:

`Today · Orders · Customers · Production · Reports`

Settings is a gear on the Today header (not a tab). Order/customer/event detail and the add/edit forms are sub-routes. The **public exhibition order form** (`/order/<event-slug>`) is a separate, brand-forward surface for customers — different audience, deliberately different treatment from the founder-facing app.

---

## Reading the screenshots — three artifacts to not mistake for bugs

1. **The bottom nav appears *inline, mid-image* on long pages.** These are full-page scroll captures; in the running app the nav is **fixed to the bottom of the viewport**. Wherever you see the nav floating in the middle of a tall screenshot, that's the capture method, not the layout.
2. **`20-bill-pdf-preview.png` is the bill modal over a dimmed order-detail backdrop.** The greyed content behind the white sheet is intentional (the modal scrim), not a rendering glitch.
3. **All data is seeded/illustrative.** Names, totals, dates, order sizes are synthetic fixtures for this pack — not the founder's real customers. Don't read meaning into specific values; critique the *presentation* of them.

---

## Screenshot index

### `screenshots/populated/` — real-use density
| File | Screen | Worth a look for |
|---|---|---|
| 01-today | **Today** | The daily home: "This week, make" production targets + "Pending today" + bottom CTA. The O3 clarity screen. |
| 02-orders-list | Orders list | Two-line rows, status badges, totals. |
| 03-order-new | Add order (single) | The most-used data-entry form. |
| 04-order-batch | Batch entry | End-of-day multi-order logging mode. |
| 05-customers-list | Customers directory | Filter chips, channel/size badges, quiet markers. |
| 06-customer-new | Add customer | |
| 07-events-list | Events list | Festivals + exhibitions. |
| 08-event-new | Add event | |
| 09-production | **Production** | Plan vs suggested vs made; event ramp-up; the O1 surface. |
| 10-plan-week | Plan this week | Editable per-product plan. |
| 11-production-log-new | Log production | |
| 12-reports-week | **Reports → Week** | Calibration bars + order summary + top products/customers. |
| 23-reports-month | **Reports → Month** | Calibration table, MoM comparison tiles, channel breakdown, customer health. |
| 24-reports-trends | **Reports → Trends** | Plan-accuracy line chart, per-product sparklines, channel-mix bars. The calibration story. |
| 13-products | Products catalogue | |
| 14-settings | Settings | Business identity that feeds the bill. |
| 15-order-detail | **Order detail** | Items, **discount breakdown**, stacked action hierarchy. |
| 16-order-detail-complaint | Order detail w/ complaint | Complaint sub-section. |
| 17-customer-detail | **Customer detail** | Outstanding, order history, actions. |
| 18-event-detail | Event detail | Demand per product; public-URL block for exhibitions. |
| 19-production-log-edit | Edit production log | |
| 20-bill-pdf-preview | **Bill PDF preview** | The most-distributed brand surface (shared to WhatsApp). |
| 21-public-order-form | **Public order form** | Customer-facing exhibition surface. |
| 22-public-confirmation | Public order confirmation | Post-submit screen. |

### `screenshots/empty/` — first-run / zero-data states
First-run states for **Today, Orders, Customers, Events, Production, Reports, Settings**, plus the add forms with no catalogue yet (01–14, same numbering as above). Empty-state quality matters a lot here — it's the founder's first impression before any data exists. Worth critiquing as carefully as the populated screens.

### `brand/`
`brochure-original.jpg` (visual brand source) and `crunchies-logo.svg`.

---

*Deeper reference if needed:* `../PRODUCT_BRIEF.md` (full behavioural spec), `../v1-spec.md` (feature spec), `../DESIGN_HANDOFF.md` (chosen design variants + tokens).
