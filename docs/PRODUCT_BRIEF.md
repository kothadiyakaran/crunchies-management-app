# Crunchies Management App — Design Brief

A design brief for Claude Design. Pair this document with the uploaded brochure (mom's existing artisanal-snacks brand collateral) — the brochure provides the visual brand cues (logo, palette, typography sensibility); this document provides the app structure, content, interactions, and tone.

This is a comprehensive working brief. Read the **Context** and **Design Philosophy** sections first — these explain *why* the design moves below matter. Specific visual decisions (spacing, sizing, exact colors, typography pairings) are left to Claude Design's judgment, informed by the brochure and the principles here.

---

## Table of contents

1. Context — who this app is for and why it exists
2. The three outcomes that drive every decision
3. Audiences
4. Design philosophy — principles behind every choice
5. Brand and tone
6. Information architecture
7. Cross-cutting UI patterns
8. Mom's app — screen-by-screen specs
   - 8.1 Today
   - 8.2 Orders (browse, batch, detail, add)
   - 8.3 Customers (directory, detail, add)
   - 8.4 Production (main, planning, product-detail)
   - 8.5 Events (list, detail/edit)
   - 8.6 Reports (Week, Month, Trends)
   - 8.7 Settings
9. Public exhibition order form (different audience, different tone)
10. Bill PDF
11. States — loading, empty, error, offline
12. Accessibility and responsive guidance

---

## 1. Context — who this app is for and why it exists

### The business

A small artisanal snacks business in Pune, India. Founder is a woman in her late 50s — for context here, called **"mom"** throughout this brief. She runs production with a team of 8–10 part-time women on fixed schedules. She sells through three channels:

- **8–10 shopkeeper/reseller accounts** who resell her products in their own shops.
- **A personal network** of friends, relatives, and acquaintances who place direct orders, mostly over WhatsApp.
- **Exhibitions and fairs**, where she both sells on the spot and acquires new customers.

Annual revenue is modest but the business is meaningful. She's been at it for several years. The team coordination is smooth and not a pain point.

### Mom's profile (critical context — every design choice should respect this)

- **Former stay-at-home mother** who built this business in her later years. Her **primary motivation is meaningful engagement, confidence-building, and staying active** — not profit maximisation. Treat this as a design constraint, not a nicety.
- **Android-savvy.** Comfortable with apps. Uses WhatsApp, YouTube, Google Maps, banking apps fluently.
- **Has never used Excel or any productivity software.** Spreadsheets, formulas, and bookkeeping metaphors are foreign to her.
- **Smart and competent.** She runs a real business with real money. Do not condescend in copy, do not over-instruct, do not assume she needs hand-holding.
- **Reads and types in English** (the agreed app language for v1). She is fluent enough; designs assume English-only UI.

### How she runs the business today

WhatsApp + a paper notebook. Orders come in as WhatsApp pings; she jots them in the notebook, makes the products that week, fulfils. Production quantities are pure intuition. Customer history lives in her memory and her phone's chat history. Exhibition contacts often get lost because they have no structured home.

### The three problems v1 must solve

All three matter equally. Phasing them apart causes mom to lose interest before payoff arrives, so the app must address all three at launch.

**Problem 1 — Production planning.** She chronically underproduces because she has no method for estimating quantities. Lost sales are the biggest leak in the business.

**Problem 2 — Customer and order history.** No structured record. Exhibition contacts especially are routinely lost.

**Problem 3 — Order tracking.** WhatsApp pings + notebook means orders slip through. She'll forget a Friday delivery promise to a customer who messaged on Tuesday.

The app is designed as **one data spine** (customers, products, orders, production logs, events) with **three lenses** (production / customer / order) layered on top.

### Mom's iteration tolerance — a hard constraint for visual quality

This matters for design: **mom will not tolerate seeing a rough or buggy app.** If v1 ships polished, she'll engage and the project succeeds. If v1 feels half-baked, she'll quietly disengage and the project fails. There is no third path here — design quality must be production-grade from launch.

Mom sees the app exactly twice in rough form:
1. Once, during Phase 0, in the clickable HTML mockup walkthrough.
2. Then at launch, in finished form.

She does not see intermediate builds. The design must therefore feel resolved, organized, and trustworthy from the first impression — there is no opportunity to iterate visual fidelity with her later.

---

## 2. The three outcomes that drive every decision

Throughout this brief, design choices are justified by which outcome they serve. Use these as your compass:

- **O1 — Production matches demand.** Mom stops underproducing. The app's biggest single job is to suggest weekly production quantities and teach her, over time, to eyeball them herself.
- **O2 — Zero lost customers or orders.** Every WhatsApp order captured. Every exhibition contact retained. Every promised delivery date remembered.
- **O3 — Mom feels mastery and clarity.** She opens the app daily because it makes her feel in control of her business. She trusts what she sees. She points at the dashboard with pride.

The "mastery + clarity" framing for O3 is opinionated. It is **not**:
- Pride/progress dashboards with achievement-style framing
- Gamified "level up" or streak mechanics
- Whimsical "customer memory book" aesthetics
- Cute illustrations or mascots
- Personalized encouragements ("Great week, mom!")

It **is**:
- A polished, organized, professional surface
- Clean dashboards, structured records, things in their right place
- A daily decision-support tool that surfaces "make X of Y, call Z, pack these orders" without ceremony
- Aesthetic rigor — typography hierarchy that helps her parse information at a glance, generous whitespace, considered colors

This distinction matters because the wrong tonal direction (cheerful gamified consumer app) would be a worse outcome than no app at all — she'd find it patronising. The right direction (quietly competent business tool) is what earns her daily trust.

---

## 3. Audiences

The app serves three distinct audiences with three distinct experiences:

| Audience | Authentication | What they see | Volume |
|---|---|---|---|
| **Mom** | Authenticated, primary user | The full app — five-tab navigation, every screen below | Daily, multiple sessions |
| **Karan (the builder)** | Authenticated, admin role | Same as mom + raw admin queries for data-fix | Occasional |
| **Exhibition walk-in customers** | Anonymous, no login | A single public order form, per-event URL only | One-time per customer |

Mom and Karan share the same app surface. The exhibition form is a separate, standalone surface with its own design treatment (cleaner, more business-card-like; see Section 9).

---

## 4. Design philosophy — principles behind every choice

These are non-negotiable. They emerge from mom's profile, the three outcomes, and the iteration-tolerance constraint. When a design decision is unclear, return to these.

### 4.1 Mobile-first, always

Mom uses the app on her Android phone, vertical orientation, often one-handed while she's also handling something else (talking on the other line, holding a notebook, walking to the kitchen). The app is installable as a PWA so it sits on her home screen with an icon. Tablet and desktop are not target form factors; if they render, that's a bonus, not a goal.

### 4.2 Thirty-second interaction budget

Every common action she takes must complete in roughly 30 seconds or less:
- Log a new order: ~30s
- Mark order fulfilled or paid: ~5s
- Log production: ~15s
- Generate a bill and share to WhatsApp: ~5s + share
- Add a new customer: ~30s

Designs that require typing-heavy data entry, multi-step wizards, or extensive scrolling fail this budget. Every form is optimized for tap-and-go.

### 4.3 Minimal typing, dropdown-heavy, big touch targets

She types only when she must (customer name on first add, product names during setup, free-text notes). Everywhere else: chip-based selection, search-as-you-type lookups, numeric keypads, date pickers.

Touch targets are generous throughout. Stacked, full-width primary buttons are normal. Tap zones for list rows extend to the row's full width.

### 4.4 Search-as-you-type beats long dropdowns

When picking from a list with more than ~5 items, use search-as-you-type. Type 2 letters → top 3 matches → tap. The customer picker, product picker, and event picker all follow this pattern.

### 4.5 Recently-used chips for high-frequency selections

For products (where 5–8 hero items dominate 80% of orders), show "recently used" chips above the full list. Mom can typically tap the chip without searching at all.

### 4.6 No icons-only buttons

Every actionable control has a text label. Icons may accompany text but never replace it. Mom may not recognize a generic icon set; text is unambiguous.

### 4.7 No gamification, badges, confetti, streaks, or progress-bars-as-decoration

The mastery feel comes from **quiet competence**, not from celebration. No "Great week!" banners. No achievement unlocks. No streaks. No pride-of-progress dashboards. No animated emoji reactions. No mascots.

A subtle checkmark next to a completed production target is acceptable; a confetti animation on logging an order is not.

The single deliberate exception: a once-a-week Monday banner on the Today screen ("Last week — planned X, made Y, demand Z. See details →"). This is informational, in service of the calibration learning loop (O1), and is explicitly not a celebration mechanic.

### 4.8 No nudges, push notifications, or attention-grabbing red dots in v1

V1 is "pull, not push." Mom checks the app on her own cadence; the app doesn't ping her unprompted. (PWA push notifications are explicitly deferred to v2.)

The only soft attention mechanism is the **quiet-customers nudge** block — see Section 8.1 (Today screen, Block 2.5). Even this is presented in neutral grey, no urgency styling, dismissible with a quiet `×`.

### 4.9 Respect mom's existing competence

She knows her customers, her products, her cadence. The app doesn't lecture her, doesn't second-guess her, doesn't pop confirmation modals for routine actions.

Copy is direct and operational: "Log new order", "Mark fulfilled", "Save plan". Not: "Great! Let's create your new order!" or "Are you sure you want to mark this as fulfilled?"

The one exception: destructive actions (deleting an order, archiving a customer, deleting an event) get a single confirmation modal. Routine state changes do not.

### 4.10 The app teaches, but quietly

The app proposes a production rhythm; it doesn't mirror an existing one (she doesn't have one). Over time, as her plans match reality more closely, the calibration trend visualizes her growth. But the teaching is silent — no "you're learning!" messaging. No labels distinguishing "seed-based" suggestions from "rolling-average" suggestions after the transition. The change in the underlying numbers, week by week, is the only signal.

### 4.11 System font, no display typography flourishes

Use the system default sans-serif (Roboto on Android via the platform default). Custom display fonts are deferred to v2. Typography hierarchy comes from weight, size, color, and spacing — not from font-family changes.

### 4.12 Aesthetic of mastery: clean, structured, professional

Imagine the visual register of a well-made professional Indian small-business banking app or a doctor's clinic-management tool — competent, calm, organized. Not the register of a Silicon-Valley consumer SaaS marketing site. Not the register of a children's app. Not the register of a flashy e-commerce promo page.

Generous whitespace. Strong typographic hierarchy. A restrained palette derived from the brochure. Cards and containers that look considered, not decorated.

---

## 5. Brand and tone

### Visual brand: derived from the brochure

The brochure (uploaded alongside this brief) provides:
- **The logo** — extract and use as-is on the bill PDF and as the small mark on the public exhibition form's sticky header. Inside mom's app, the logo appears once on the Settings screen and once on first-launch; otherwise the navigation chrome stays clean.
- **The color palette** — derive the primary, secondary, and accent palette from the brochure. The brochure's tonal direction (likely warm artisanal — earthy, food-evoking, possibly with one accent that signals freshness or hand-craft) carries through the app.
- **The typography sensibility** — informs your font-pairing choice within the system-font constraint. The app stays on system sans-serif, but typographic hierarchy choices (weight scale, sizing scale, body copy character) should feel consonant with the brochure's voice.
- **The overall sensibility** — artisanal, warm, hand-made, but proudly professional. Not rustic-craftsy (no chalkboard fonts, no kraft-paper textures). Not corporate-cold either.

### Tone of voice in copy

Direct, operational, calm. Examples:

| Use | Don't use |
|---|---|
| "Log new order" | "Create a new order to record a customer's purchase" |
| "Mark fulfilled" | "Mark this order as fulfilled" |
| "All caught up." | "Great job! You've completed everything!" |
| "Add your first product" | "Let's get started by adding your first product!" |
| "Delete this order? This can't be undone." | "Are you sure you want to delete this order? Please confirm." |
| "No customers match this filter." | "Oh no! It looks like there are no customers matching your filter." |
| "Week in progress — figures will settle Sunday." | "Don't worry, this week isn't done yet!" |

Numbers and totals are presented matter-of-factly. No celebratory framing on increases ("Up 12% from April" — not "Great month, 12% growth!").

### Indian-English locale

- Currency: Indian rupee (₹), Indian numbering convention (`₹1,20,500.00`, not `₹120,500.00`), two decimal places by default.
- Dates: human-readable, day-first ("Mon, 20 May 2026", "20 May", "Mon 20 – Sun 26 May").
- Times: 12-hour with am/pm where used; mostly the app shows dates only (day-granular).
- Phone numbers: 10-digit Indian mobile format. `wa.me/91XXXXXXXXXX` for WhatsApp links.

---

## 6. Information architecture

### Mom's app — bottom navigation, five tabs

```
[ Today ]  [ Orders ]  [ Customers ]  [ Production ]  [ Reports ]
```

Five tabs is the upper bound for thumb-reach mobile nav. Each tab maps to a different mental mode. Tabs persist on every screen of the mom-app.

| Tab | Mental mode | Primary verb |
|---|---|---|
| Today | "What do I do today?" | scan & decide |
| Orders | "Log, find, fulfil, bill" | act |
| Customers | "Who is this person?" | look up |
| Production | "What should I make? Log batches." | plan & log |
| Reports | "How did the week/month go?" | reflect |

### Sub-routes (not tabs)

- **Order detail** — sub-route under Orders
- **Add/edit order** — modal-like sheet from Orders or Today CTA
- **Customer detail** — sub-route under Customers
- **Add/edit customer** — modal-like sheet
- **Product detail / planning view / product-week drilldown** — bottom sheets from Production
- **Event list and detail** — sub-route under Production
- **Settings** — typically accessed from a header gear icon on Today, or from a Settings link on Reports; not a sixth tab

### Public exhibition order form

Completely separate app surface, no navigation chrome, single-page form. Lives at `crunchies.in/order/<event-slug>` (the domain is illustrative).

---

## 7. Cross-cutting UI patterns

### 7.1 Buttons

- **Primary button** — full-width on most screens, prominent. Used for the single "main action" on a screen (e.g., "+ Log new order" on Today, "Save" on a form). Stack vertically when multiple primary-grade actions exist (e.g., on Order detail: "Mark fulfilled" + "Mark paid" + "Generate bill" + "Log complaint" each stacked).
- **Secondary button** — outlined or text-style, for "Edit" or non-primary actions.
- **Destructive button** — distinct color treatment (likely red-tinted), used only for delete/archive. Always paired with a confirmation modal.
- **Icon + text affordances** — small inline buttons like `+ Add another item` or `+ New customer` for compact contexts.

### 7.2 Inputs

- **Text input** — standard, single-line by default; multi-line for notes fields.
- **Numeric input** — invokes the numeric keypad on mobile (`inputmode="decimal"`). Qty and price fields use this universally.
- **Date picker** — native mobile date picker. Used for `target_fulfilment_date` and event start/end.
- **Search input** — at top of list screens (Orders, Customers). Debounced ~200ms. Search-as-you-type result list appears below.
- **Dropdown / picker** — for closed-set selections (channel, source, kind, etc.). Use a native-feeling picker, not a desktop-style select element.

### 7.3 Pickers

- **Customer picker** — search-as-you-type. Type 2 letters → top matches → tap. `+ New customer` affordance at the bottom of the result list to inline-create.
- **Product picker** — chips of recently-used products on top, full alphabetized list below. Selected chips highlighted.
- **Event picker** (in Add Customer for source_event) — dropdown listing active events.

### 7.4 Badges and status indicators

Used to convey state at a glance. Examples:
- **Order status:** `Pending` / `Fulfilled` (pair of badges, only one visible per order)
- **Payment status:** `Unpaid` / `Paid` / `Partial`
- **Source:** `WhatsApp` / `Exhibition form` / `In person` / `Phone`
- **Channel:** `Reseller` / `Personal` / `Exhibition`
- **Size tier:** `Small` / `Large` / `—` (unset)
- **Quiet marker:** `quiet 8w` (compact, neutral grey)
- **New marker:** small `NEW` badge on the Orders tab when unread exhibition-form orders arrive (cleared on tab visit)

Color treatment is subtle. Pending = neutral. Unpaid = subtle warning color. Paid = subtle confirmation color. Don't bombard the eye.

### 7.5 Filter chips (horizontally scrollable)

Used at the top of list screens (Orders, Customers). Single-select. Visually distinct selected state. Examples on Customers: `All` · `Resellers` · `Personal` · `Exhibition` · `Large` · `Small` · `Unsorted` · `Quiet`.

### 7.6 Sort selectors

Small dropdown below filter chips when applicable. E.g., on Customers: `Recent order` · `A–Z` · `Most ordered`.

### 7.7 Empty states

Every screen has explicit empty states. Tone is matter-of-fact, with a clear next-action affordance.

| Pattern | Use |
|---|---|
| "No customers yet. Add your first → [+ Add customer]" | First-run states |
| "No orders match this filter." | Filtered-empty |
| "All caught up." with a small checkmark | Pending-empty |
| "No upcoming events. Add the next one →" | Pending-empty with action |
| "Reports become useful after a week of orders. Check back Monday." | Insufficient-data |

### 7.8 Cards and containers

Sections on Today, Production, and Reports use card-style containers — subtle borders or backgrounds, generous internal padding, clear typographic hierarchy. Cards group related content but don't over-decorate.

### 7.9 Bottom sheets

Used for product-detail-from-Production-row, complaint-logging from order detail, and similar focused tasks where the underlying screen should stay visible behind. Bottom sheets slide up from the bottom edge, dismissible by swipe-down or `×`.

### 7.10 Modals

Used for full-screen forms (Add Order, Add Customer, Edit Event) and confirmation dialogs. Confirmation dialogs are small, centered, with two buttons (cancel + confirm).

### 7.11 Numeric keypad

Qty and price fields universally invoke the numeric keypad. Decimal-friendly. Currency fields show ₹ as a prefix label, not inside the input field.

### 7.12 Toasts / snackbars

Small confirmation messages after a save ("Order saved", "Production logged"). Auto-dismiss after a few seconds. No persistent toast queues.

### 7.13 Confirmation dialogs

For destructive actions only. Simple two-button modals.

```
Delete this order?
This can't be undone.

   [ Cancel ]   [ Delete ]
```

### 7.14 The plus button "+ Log new order"

Used on Today (full-width primary CTA at the bottom of the screen) and on Orders (compact button in the top-right of the screen). Mom's most-frequent action; consistent placement matters.

### 7.15 Loading and error states

- Loading: lightweight skeleton placeholders for list rows (don't show a full-screen spinner for tab navigation; this app should feel snappy).
- Network error: inline message with a `Retry →` link, never a full-screen blocker.
- Save errors: small inline message near the offending control.

### 7.16 Refresh model

The app refetches data on tab focus (when a tab becomes active). It does not use realtime subscriptions in v1. There is no pull-to-refresh gesture required, though it may be implemented if it feels natural.

### 7.17 Week boundary

Weeks are Monday → Sunday. Mom thinks in weekly production cadences and the app reinforces this. Week boundaries are local time. The week selector on Production and Reports shows ranges like `Mon 20 – Sun 26 May`.

---

## 8. Mom's app — screen-by-screen specs

Each screen describes purpose, layout structure (top-to-bottom), block content, interactions, and empty states. Visual specifics are left to Claude Design.

### 8.1 Today screen

**Purpose:** mom opens the app, gets clarity on what to do today and this week. Read in 5 seconds, act in another 5. The "clarity" outcome (O3) lives here. This is the screen she'll see most often.

**Layout, top to bottom:**

**Header — minimal, in a top corner**
- Today's date, e.g., "Mon, 20 May 2026"
- Small, calm. Orientation only, not a focal point.
- No greeting ("Good morning!"), no app name in the chrome.
- Optional: small gear icon (top right) → Settings.

**Block 0 — Last week retrospective (Mondays only)**

Shown only on Mondays, hidden Tuesday–Sunday and on the first-ever Monday before any week of data exists.

- A single horizontal banner with one line: *"Last week — planned X, made Y, demand Z. See details →"*
- Numbers are weekly totals summed across all in-house products.
- The whole banner is tappable → opens Reports → Week tab → last completed week.
- An `×` on the right dismisses for the current week. The banner auto-clears at the next Monday 00:00 regardless.
- Visual treatment: muted, informational, not decorated. Distinct from action blocks below.
- This is the one deliberate exception to "no nudges" — it serves the calibration learning loop (O1).

**Block 1 — This week, make**

The production target block. Mom makes products weekly, not daily.

- Section header: "THIS WEEK, MAKE" (small, all-caps section label).
- A list of products. Each row:
  - Product name (prominent)
  - Target qty (her plan if set, else the algorithm's suggestion) — large
  - Made-so-far this week (small, muted) — formatted like "Made 1 of 5"
  - The whole row is tappable → opens "Log production" with the product pre-filled.
- Sort: by remaining gap (target − made), biggest first.
- Products that have met or exceeded their target collapse into a compact expandable strip at the bottom of the block: "Done this week (3) ▾". Tap to expand.
- Hidden entirely: products where target = 0 and made = 0.
- Aggregated products (made by other small producers, resold by mom) are not shown on Today — they appear on the Production screen only.
- When she's set a plan for the week, the row shows her plan number directly. When she hasn't, the algorithm's suggested number is shown silently — no badge, no label distinguishing them.

**Block 2 — Pending today**

- Section header: "PENDING TODAY (N)" — the count is the number of pending orders due today or overdue.
- Up to 5 rows shown. Then a "see all →" link to the filtered Orders view.
- Each row (two lines):
  - Line 1: Customer name (prominent), product summary
  - Line 2: small "due today" or "overdue 2 days" relative-time label
- Sort: overdue first, then by target date ascending.
- Tap row → Order detail.

**Block 2.5 — Quiet customers (when N > 0)**

Soft re-engagement nudge. Shown only when at least one customer crosses a "quiet" threshold (see Section 8.3 for the definition).

- Section header: "QUIET CUSTOMERS (N)"
- Up to 3 rows. Each:
  - Customer name (prominent)
  - Channel · weeks-since-last-touch (e.g., "Personal · quiet 8w")
  - An `×` button on the right to dismiss this row (records a "mom acknowledged this customer" action)
- Sort: most overdue first (days past threshold descending).
- Tap row → customer detail.
- Tap `×` → row removed (sets `last_contacted_at = now()` server-side).
- Block hidden entirely when N = 0.
- **Critical tonal direction:** neutral grey styling, NO red/orange, NO urgency. This is "quiet," not "overdue" or "at risk." Soft, calm, dismissible. No badges. No emotional pressure.

**Block 3 — Primary CTA**

- Full-width prominent button at the bottom of the screen: `+ Log new order`
- This is mom's single most-frequent action; the button is always present and always thumb-reachable.
- No secondary CTA on Today — production logging is one-tap from Block 1.

**Empty states (Today):**

| State | Display |
|---|---|
| No products seeded yet | Block 1 shows: *"Add products and seed averages to see your weekly plan."* with a link to Products setup. |
| Products seeded, no orders yet | Block 1 shows seed-based suggestions with a small footnote: *"Based on your initial estimates. Will refine as real orders accumulate."* |
| No pending orders | Block 2 collapses to a single line: *"All caught up."* with a small checkmark. |
| First day ever | Header date only; all blocks in empty states; one onboarding affordance to Products setup. |

---

### 8.2 Orders screen

**Purpose:** the most-used mom-side screen. Every WhatsApp order flows through it. Includes two interaction modes (live single-entry and end-of-day batch), full order management, bill generation, complaint logging.

#### 8.2.1 Browse mode (default)

**Top bar**
- Search input (search-as-you-type by customer name; debounced ~200ms)
- A `+ Log new order` button (right side, compact)

**Filter chips** (horizontally scrollable, single-select)
- `All` (default) · `Pending fulfilment` · `Unpaid` · `This week` · `This month`

**Mode toggle (small, top-right)**
- `Browse` (default) · `Batch entry`

**List rows** (two-line)

```
Sunita Patil                              today  ·  ₹420
2 boxes laddu, 1 kg chivda   [pending] [unpaid]    →
```

- Line 1: customer name (prominent), relative date ("today" / "yesterday" / "3 days ago" / "12 May"), total ₹.
- Line 2: product summary, status badges (pending/fulfilled, paid/unpaid/partial), tap arrow.
- Sort: default reverse chronological by order date. When `Pending fulfilment` filter is active, sort by target fulfilment date ascending.
- Infinite scroll; default page size ~50 rows.

#### 8.2.2 Batch entry mode

End-of-day catch-up for when mom queues several WhatsApp orders to log together. Optimized for minimal transition cost between entries.

**Header**
- "Batch entry — N saved so far" counter
- `Done` button (right) to dismiss batch mode and return to Browse

**Always-visible form** (the entry surface)
- Customer (search-as-you-type, with `+ New customer` inline)
- Products + quantities (chips of recently-used + `+ Add another item`)
- Payment status (defaults to `Unpaid`)
- Notes (optional)
- Primary button: `Save & next`

**Running list at the bottom**
- Collapsed one-line rows of orders saved this batch session
- Tap any → inline expanded edit/remove

**Persistence semantics**
- Each `Save & next` commits to the database immediately (crash-resilient).
- `Done` dismisses the mode without re-committing.
- Closing the app without saving the in-progress form loses only that current form, not the prior entries.

#### 8.2.3 Order detail screen

A full-screen sub-route opened by tapping any order row.

**Top section**
- Customer name (large; tap → customer detail)
- Order date (full date with time if today; just date otherwise)
- Source badge (WhatsApp / Exhibition form / In person / Phone)
- Status badges (Pending / Fulfilled; Unpaid / Paid / Partial)

**Dates section**
- "Due by Fri 24 May" — when target fulfilment date is set
- "Fulfilled on Wed 22 May" — when fulfilled_at is set
- "Paid on Thu 23 May" — when paid_at is set

**Items list**
- Each row: product, qty, unit price, line total
- Subtotal at the bottom

**Notes block** (if any) — read-only display

**Action buttons (full-width, stacked, in this priority order):**
1. `Mark fulfilled` (only when not yet fulfilled)
2. `Mark paid` (only when not yet fully paid)
3. `Generate bill`
4. `Log complaint` (or `Edit complaint` if one exists)
5. `Edit order` / `Delete order` — secondary treatment, smaller

**Complaints sub-section** (visible when complaints exist on this order)
- Each complaint row: kind, date, brief description, open/resolved badge.
- Tap to edit/resolve.

#### 8.2.4 Add Order flow (live, single)

Full-screen form launched by tapping `+ Log new order` anywhere.

Fields in this order:

1. **Customer** — search-as-you-type. `+ New customer` inline opens a mini-form (name, phone, channel) without leaving the order form.
2. **Source** — defaults to `WhatsApp`; tap to change.
3. **Date** — defaults to today; date picker for backdating.
4. **Target fulfilment date** — **required.** Date picker, defaults to today. One tap to change for future-dated orders.
5. **Items** — at least one required. Product chips (recently used) + qty + unit price (pre-filled from product default). `+ Add another item` link to add a second product.
6. **Payment status** — defaults to `Unpaid`.
7. **Notes** — optional, multi-line.
8. Primary button: `Save`.

Validation: at least one item with qty > 0; customer selected; target fulfilment date set. Inline error messages near offending fields.

#### 8.2.5 Bill generation

Triggered from Order detail → `Generate bill`.

1. **Preview modal** displays the bill (rendered client-side as a PDF).
2. Mom taps `Share` → the OS share sheet opens.
3. She picks WhatsApp → bill PDF attaches with a pre-filled message: *"Hi {customer name}, please find your bill attached."* (editable before sending).

See Section 10 for the bill PDF layout.

#### 8.2.6 Complaint logging

From Order detail → `Log complaint`. Bottom sheet form:
- Kind dropdown: Quality / Delivery / Wrong item / Other
- Description (multi-line text, required)
- `Save` button

Editing an existing complaint: tap → form pre-filled, with two extra controls: Resolution (multi-line text) and a Resolved toggle.

**Empty states (Orders):**

| State | Display |
|---|---|
| No orders ever | "No orders logged yet. Tap + to start." |
| Filter returns empty | "No orders match this filter." with "Clear filter →" |
| Customer picker has no matches | "No customer found. + Add as new?" |
| Batch mode, no saves yet | Form visible normally; counter shows "0 saved" |

---

### 8.3 Customers screen

**Purpose:** O2's main surface. Every customer (especially exhibition walk-ins) is retrievable, with full history. Also home for the soft re-engagement nudge ("quiet customers").

#### 8.3.1 Directory (default)

**Top bar**
- Search input (searches name AND phone, debounced ~200ms)
- `+ Add customer` button (right side, compact)

**Filter chips** (horizontally scrollable, single-select)
- `All` (default) · `Resellers` · `Personal` · `Exhibition` · `Large` · `Small` · `Unsorted` (no size tier) · `Quiet`

**Sort selector** (small dropdown below chips)
- `Recent order` (default) · `A–Z` · `Most ordered`

**List rows** (two-line)

```
Sunita Patil                              ordered 3 days ago
Personal · Large · 12 orders · quiet 8w                  →
```

- Line 1: name (prominent), last-order relative date ("never ordered" if zero orders).
- Line 2: channel badge · size tier (or `—`) · order count · `quiet Nw` marker when applicable.
- Exhibition-sourced rows include a small `from <event name>` chip.
- Archived customers (active=false) are hidden from the directory.

#### 8.3.2 Customer detail

A full-screen sub-route.

**Header**
- Name (large)
- Phone (tap to copy; long-press opens a WhatsApp link via `wa.me/<phone>`)
- Channel · size tier · "Customer since {month year}"
- If sourced from an exhibition: a small line "Met at: Diwali Fair 2025" (tap → event detail).

**Stats row (compact, single line)**
```
12 orders   ·   ₹420 outstanding   ·   last 3 days ago
```

**Action buttons (stacked, full-width)**
- `+ Log new order` (pre-fills this customer)
- `Send WhatsApp` (opens `wa.me/<phone>`; updates the "last contacted" timestamp). No pre-fill message in v1.

**Notes block** — inline edit: tap to expand to multi-line input → save.

**Order history**
- All orders for this customer, reverse chronological.
- Same row format as Orders screen but without the customer name column.
- Tap → Order detail.

**Open complaints section** (only when unresolved complaints exist)
- Aggregated across this customer's orders.
- Each row: order date · kind · brief description · tap → order detail.

**Footer secondary actions**
- `Edit profile` (small, opens a form: name, phone, channel, size tier, source event, notes)
- `Archive customer` (with confirmation: *"Archive {name}? They'll be hidden from pickers but their order history stays."*)
- `Delete customer` (only available when zero orders; with confirmation)

#### 8.3.3 Add Customer flow

A modal form. Fields:

1. Name (required)
2. Phone (required for personal/reseller; optional for exhibition)
3. Channel (required)
4. Size tier (optional)
5. Source event (optional; auto-set if channel = exhibition and an active event exists)
6. Notes (optional)

**Duplicate detection on save:** if the phone matches an existing customer, show a modal: *"Sunita Patil already exists — use existing?"* with two buttons: `Use existing` / `Save as new`.

#### 8.3.4 Quiet customers — visual notes

The "Quiet" filter chip shows all customers currently meeting the quiet threshold. Per-row markers (`quiet 8w`) appear inline in the directory.

The thresholds (mom doesn't see these numbers; she sees the consequence):
- Reseller: 21 days
- Personal: 60 days
- Exhibition (zero orders): 30 days after first contact
- Exhibition (with orders): 90 days

**Tone for the quiet-customers surface (critical):**
- The label is "Quiet" — never "Overdue," "Lost," "At risk," "Lapsed," or any other emotionally-charged framing.
- Visual styling is neutral grey, no warning colors.
- Dismissing an entry is reversible — doing nothing means the customer goes quiet again after the threshold elapses.

**Empty states (Customers):**

| State | Display |
|---|---|
| No customers ever | "No customers yet. Add your first → [+ Add customer]" |
| Filter returns empty | "No customers match this filter. Clear filter →" |
| `Quiet` filter with none quiet | "No quiet customers — you're in touch with everyone." |
| Customer detail with zero orders | Stats row reads "No orders yet · last contact {date}" |

---

### 8.4 Production screen

**Purpose:** mom's home for production planning (O1). The full calibration loop lives here — her plan, the algorithm's suggestion, what she's made, plus upcoming events that drive future demand.

#### 8.4.1 Main view

**Section A — Week selector (top)**
- Default: `This week (Mon 20 – Sun 26 May)` — the range is shown explicitly.
- Toggle to `Next week` — for planning ahead or logging pre-made batches.
- No "Last week" toggle; past-week retrospective lives in Reports.

**Section B — Upcoming events (when any future events exist)**
- Section header: "UPCOMING EVENTS (N)"
- Up to 3 rows. If more, "see all →".
- Each row: event name (prominent) · time-to-event ("in 2 weeks") · tap arrow.
- `+ Add event` affordance below the rows.
- Tap any event row → Events screen detail view.

```
UPCOMING EVENTS (3)
  Rakhi          in 2 weeks    →
  Ganpati        in 5 weeks    →
  Diwali         in 14 weeks   →
  [ + Add event ]
```

**Section C — In-house products, this week (the hero)**

Section header: "THIS WEEK"

Each row shows a product's planning state:

```
Laddu     Plan: 5    Suggested: 4    Made: 1
          (small subtitle: "includes ramp-up for Rakhi (+1)")
```

- **Plan** — mom's number for this week. When unset, shows "—" with a subtle affordance: "Plan this week →".
- **Suggested** — the algorithm's number. When current orders or event uplift drive it above the rolling-average baseline, a small subtitle on the row explains why ("includes pending orders" or "includes ramp-up for Rakhi").
- **Made** — sum of what she's logged this week.
- **State indicator** — checkmark when made ≥ plan (or ≥ suggested when no plan exists).

Sort: by remaining gap (plan − made, or suggested − made if no plan), descending — biggest urgency first. Products that have met or exceeded their target collapse into "Done this week (N) ▾" at the bottom. Products with target=0 and made=0 are hidden.

**Planning entry point:**
- When the current week has no plan rows: a full-width affordance at the top of Section C — `Plan this week →`. Unmissable but quiet.
- When a plan exists: each row shows the plan number directly; a small `edit plan` affordance per row to revise.

**Section D — Sourced from others (read-only)**

Section header: "FROM OTHER MAKERS"

A read-only sub-section listing aggregated products (products mom resells, made by other small producers).

| Product | Source | This week's demand |
|---|---|---|
| Til Chikki | Made by Sunita Kaki | 3 packs |
| Anarse | Made by Smita Tai | 1 dozen |

- Source-maker disclosure is always present and explicit.
- No procurement workflow in v1 — this section is awareness only.
- Hidden entirely when no aggregated products have demand this week.

**Section E — Bottom CTA**
- Full-width `+ Log production` button (opens the log form with no product pre-fill — has a product picker).
- The primary log-production path is still tapping an in-house row in Section C, which opens the log form with that product pre-filled.

#### 8.4.2 Planning view (full-screen, entered via "Plan this week →")

```
Plan production for week of Mon 20 May

Laddu     [ 4 ] boxes   (suggested: 4)
Chivda    [ 2 ] kg      (suggested: 2)
Mathri    [ 0 ] kg      (suggested: 1)   ← she chose to skip
Chakli    [ 1 ] kg      (suggested: 1)

[ Save plan ]
```

- Pre-filled from the algorithm's suggestion (or seed_demand for products with no history yet).
- All in-house products listed. Aggregated products excluded.
- Editable per product, then `Save plan`.
- Returns to Production screen with plan numbers populated.
- Editable mid-week from the same view (revise plan).

#### 8.4.3 Product-detail bottom sheet

Opened by tapping any in-house product row on the main Production view. A bottom sheet that keeps the list visible behind it.

```
Laddu — this week
  Plan: 5 boxes
  Suggested: 4 boxes
  Made so far: 1 box

  [ + LOG NEW BATCH ]

  This week's logs:
    Mon 20 May    1 box     ⋯ (tap to edit/delete)
```

- `+ Log new batch` opens a small form: qty, date (defaults today), optional notes. Save → returns to product panel with updated total.
- "This week's logs" lists every batch she's logged for this product this week. Tap any row → edit qty/date/notes or delete.

**Empty states (Production):**

| State | Display |
|---|---|
| No products in catalogue | "Add products to start planning." with link to Products setup |
| Products exist but no seed estimates and no order history | Each row shows "Add a seed estimate →" instead of a suggested number |
| No upcoming events | Section B hidden entirely |
| No aggregated products with demand | Section D hidden entirely |

---

### 8.5 Events screen

**Purpose:** mom manages festivals and exhibitions that drive future production demand. Festivals (Diwali, Rakhi, Ganpati) and exhibitions are both modeled here. Exhibitions additionally generate a public customer-facing order form (Section 9).

**Access:** sub-route from the Production screen's "Upcoming events" section, or its `+ Add event` affordance. Full-screen.

#### 8.5.1 Events list

**Header**
- Title: "Events"
- Right side: `+ Add event` button (prominent)

**Filter chips**
- `Upcoming` (default) · `Past` · `All`

**List rows (two-line)**

```
Diwali 2026                          in 14 weeks  →
Festival · Fri 6 Nov – Sun 8 Nov · 3 weeks lead · 4 products set
```

- Line 1: name, time-to-event ("in 2 weeks" / "5 days ago"), tap arrow.
- Line 2: kind badge · date range · lead weeks · count of products with demand set.
- Inactive events display a small "inactive" badge but stay in the list.

Sort:
- Upcoming: ascending by start date (soonest first).
- Past: descending by end date (most recent first).

#### 8.5.2 Event detail / edit view

Used for both viewing and editing. Past events default to read-only with an "Edit" toggle. Used as the "Add event" form too, in empty state.

**Past event retrospective summary card** (only when end date is in the past)

A compact card at the top of the detail view, above the editable fields:

```
RETROSPECTIVE (Diwali 2025 — closed)

  Total: Expected 245 units → Actual 277 units (+13%)
  Top variance: Mathri (−40%, expected 20, actual 12)

  → View full breakdown in Reports
```

- Inline summary + link to Reports for the full per-product breakdown.
- Footnote on the actual figure: *"Actual includes all demand in the event window, not just festival-driven."* — be honest about the limitation.

**Header section (always)**
- Event name (text input)
- Kind picker: Festival / Exhibition / Other
- Date range pickers: start, end
- Lead-time stepper: lead weeks (range 0–12; default depends on kind: festival → 3, exhibition → 1, other → 2)
- Active toggle (default on)

**Public URL section** (only when kind = exhibition)

```
Public URL
  crunchies.in/order/diwali-fair-aundh-2026

  [ Copy link ]    [ Share via WhatsApp ]
```

- Slug auto-suggested from name on first save (lowercased, hyphenated, year-suffix appended).
- Editable; must be unique and URL-safe.
- Hidden for festivals.
- The WhatsApp share pre-fills a message: *"Hi! Place your order for {event name} here: crunchies.in/order/{slug}"* (editable before sending).

**Expected demand per product**

A list of all active in-house products, each with a numeric input for expected event-driven demand:

```
EXPECTED DEMAND
  Laddu              [ 200 ] boxes
  Chivda             [  50 ] kg
  Mathri             [  20 ] kg
  Chakli             [   0 ] kg
  Karanji            [  80 ] dozen
```

- Aggregated products excluded (no procurement workflow in v1).
- Empty/zero = no extra demand expected (no uplift contribution from this event for that product).

**Notes (optional, free text)** — for context like "based on 2025 Diwali — bumped 10%"

**Footer**
- `Save` button (full-width, prominent)
- `Duplicate to next year` (visible on existing events; opens a new event pre-filled with same kind, lead weeks, expected demand; dates blanked; name suffix bumped)
- `Delete` (with confirmation modal)

---

### 8.6 Reports screen

**Purpose:** retrospective + calibration + loop-closure. The only surface in v1 that looks backward. Reports' unique contributions:
- The plan-vs-demand calibration retrospective (O1's central teaching tool).
- Period summaries that aggregate data not available elsewhere (O3 mastery).
- Loop-closure metrics on retention investments (O2).

**Tabs** (top-level, within the Reports screen):

```
[ Week ]  [ Month ]  [ Trends ]
```

#### 8.6.1 Week tab

**Defaults to the LAST COMPLETED week.** When viewing the current in-progress week, a small footnote appears on the calibration card: *"Week in progress — figures will settle Sunday."*

**Period selector at top:** `Mon 13 – Sun 19 May (last week)` with prev/next arrows. Browsable to any week.

**Section 1 — Calibration card (hero)**

Per-product rows, sorted by absolute variance descending. Aggregated products excluded.

Each row shows:
- Product name + unit
- A three-bar mini-chart: **plan** (outline style) / **made** (filled, one color) / **demand** (filled, different color)
- Numeric labels under or next to bars: `Plan 5 · Made 4 · Demand 6`
- Variance pill on the right: `+2 (+33%)` for under-made vs demand, `−1 (−20%)` for over-made.
- Tap row → product-week drilldown (a bottom sheet listing that product's batches and orders for the week).

Rows where the product had no plan, no production, and no orders are hidden. Rows where mom set a plan retroactively show a small "plan set retrospectively" footnote.

**Section 2 — Order summary**

A 4-tile compact grid:
- Total orders: `N`
- Total value: `₹X`
- Fulfilment rate: `Y / N (Z%)`
- Outstanding: `₹W (P orders unpaid)`

No tap-through actions — Reports is read-only.

**Section 3 — New customers this week**

Single line: `4 new this week — 1 personal, 3 exhibition` (per-channel breakdown). Tap → filtered Customers list scoped to last 7 days.

**Section 4 — Top products this week**

Top 5 by qty sold. Compact rows: product name (left), `qty · ₹value` (right).

**Section 5 — Top customers this week**

Top 5 by spend. Compact rows: name, channel badge, `N orders · ₹X`. Tap → customer detail.

**Section 6 — Complaints this week** (hidden when 0)

List of complaints filed this week. Each row: customer name, kind, brief description, open/resolved badge. Tap → order detail.

#### 8.6.2 Month tab

**Defaults to the CURRENT month.** Mid-month, a small footnote on the calibration summary: *"Month in progress — figures update daily."*

**Period selector at top:** `May 2026` with prev/next arrows.

**Section 1 — Calibration summary (hero)**

Headline: `Plan vs demand variance: ±X% this month` (volume-weighted average of absolute per-week-per-product variance).

Below it, a per-product monthly aggregate table:
- Product · Plan (sum) · Made (sum) · Demand (sum) · Variance
- Sort by absolute variance descending.

**Section 2 — Order summary with comparison**

4-tile grid with previous-month comparisons:

```
Total orders     Total value       Fulfilment        Outstanding
   84               ₹52,400         77 / 84 (92%)     ₹4,800
   ↑ 12% vs Apr     ↑ 8% vs Apr     ↓ 3pp vs Apr      ↓ 22% vs Apr
```

- Comparison lines are factual ("Up 12% vs April"), never celebratory ("Great month!").
- Comparison lines are hidden when there's no prior month available.

**Section 3 — Channel breakdown**

A horizontal stacked bar of orders by channel (reseller / personal / exhibition), with absolute counts and ₹ values labelled.

**Section 4 — Customer base health**

Three numbers in a row:
- **New this month:** N (with per-channel breakdown beneath, small)
- **Currently quiet:** M (tap → Customers screen with `Quiet` filter)
- **Reactivated this month:** R (customers who were quiet in the prior 30 days and placed an order this month)

**Section 5 — Exhibition→repeat conversion**

A single-line summary: `Of N exhibition customers acquired in last 90 days, X (Y%) placed a second order.`

Hidden when the 90-day window has fewer than 5 exhibition customers (sample too small).

**Section 6 — Top products this month** (top 10)

**Section 7 — Top customers this month** (top 10)

**Section 8 — Complaints summary**

`P filed this month · Q resolved · R open` and `Average resolution time: D days`. Followed by a list of all complaints filed this month.

#### 8.6.3 Trends tab

Answers *"am I getting better at this?"* No period selector — trends are inherently cross-period.

**Section 1 — Plan accuracy trend (hero)**

A bar chart: weekly variance % over the last 8 completed weeks (current in-progress week excluded). One bar per week, Y-axis is signed variance % (over-made above zero, under-made below).

- Weeks where mom never saved a plan are **skipped** (gap in the chart), not zeroed.
- Weeks where plans were set retroactively are also skipped.
- Context line under the chart: `5 of last 8 weeks planned.`
- Tap a bar → jumps to that week in the Week tab.

This is the central calibration story — the single chart that tells mom whether her demand-eyeballing is sharpening over time.

**Section 2 — Per-product calibration trend**

For each of mom's top 5 products by lifetime volume: a grouped bar chart, last 8 weeks, with plan/made/demand triplets per week.

- `see all →` expands to all in-house products.
- Same week-skipping rules as Section 1.
- Tap product → drills into a per-product detail view (full history, not just 8 weeks).

**Section 3 — Channel mix trend**

A stacked bar by month, last 6 months. Each bar shows order counts by channel (reseller / personal / exhibition). Above each bar: total ₹.

**Section 4 — Past event retrospectives**

A list of past events (any kind), descending by end date. Each row:
- Event name + date range
- Expected total · Actual total · Variance (±qty, ±%)
- Tap → Events screen detail view (with its retrospective card)

Link only — no per-event detail rendered here.

**Empty states (Reports):**

| State | Display |
|---|---|
| First-ever week with no data | "Reports become useful after a week of orders. Check back Monday." |
| Selected week with no activity | "No activity this week." |
| Trends, <2 weeks of plan data | "Trends become useful after a few weeks of planning. Keep going." |
| Trends, plan-accuracy chart all gaps | "No plans saved in the last 8 weeks yet." with link to the planning view |
| Past events list empty | section hidden |

---

### 8.7 Settings

**Purpose:** business-identity inputs that appear on the bill PDF and on the public exhibition form's sticky header. Accessed from a small gear icon on the Today screen header.

A simple vertical form with these fields (all editable, all save inline):

- **Business name** (bill header, public form sticky header)
- **Bill footer note** (footer line on PDFs)
- **Logo** — image upload, used on bill PDF
- **Business address** (multi-line; appears on bill PDF if set)
- **GST number** (single line; appears on bill PDF if set)
- **Contact info on bills** — phone number, WhatsApp number, email (each optional; appear on bill PDF where set)

That's the entire Settings surface. No tabs, no sub-screens. Specific input values are mom-provided post-launch.

---

## 9. Public exhibition order form

**Purpose:** capture exhibition walk-ins as structured customers + orders (O2). The only non-mom-facing surface in v1. Designed for **untrained users on their own phone at a fair**, completing in under 60 seconds.

**URL:** `crunchies.in/order/<event-slug>` (the domain is illustrative; the slug is per-event).

**Audience profile (very different from mom):**
- A stranger at a fair or exhibition who picked up a brochure or saw a QR code at the stall.
- Filling on their own phone, often standing, possibly distracted.
- Will not invest more than ~60 seconds in this form.
- Their trust in the business is being established right now, through this form's professionalism.

**Visual treatment** — different from the mom-app:
- Clean, business-card-like, brand-forward.
- A sticky header at the top with the business logo and name (extracted from the brochure).
- Single column, mobile-first.
- High contrast, generous tap targets.
- System font.
- Tonally: closer to a polished e-commerce "place your order" page than a productivity tool. Warm artisanal brand colors front-and-center.

**Page layout:**

**Sticky header (top)**
- Logo (left or centered)
- Business name (large)
- Event name + dates underneath (small): "Diwali Fair Aundh · 6–8 Nov 2026"

**Greeting line**
- *"Place your order — we'll be in touch to confirm."*

**Product list (body)**

A scrollable list. Each row:
- Product name + unit
- Price in ₹
- Quantity stepper: `−` `0` `+`
- For aggregated products, a small source-maker line beneath the name: *"made by Sunita Kaki"*

All active products (in-house and aggregated) appear. No photos in v1.

**Contact section (below product list)**
- Name (required, free text input)
- Phone (required; numeric keypad; 10-digit Indian mobile required, validation on submit with inline error)
- Notes (optional, multi-line, placeholder text: "Anything we should know? (delivery preference, etc.)")

**Submit**
- Full-width primary button: `Place order`
- Button is disabled until name + valid phone + at least one quantity > 0.

**Confirmation screen (after submit)**
- A confirmation page replaces the form.
- Top: a checkmark icon, "Order received."
- An order summary: products and quantities, with total.
- A reassurance line: *"{business name} will reach out soon."*
- No order number / reference is shown (avoids exposing internal sequence numbers).

**Fail-state landing pages (when the form URL is reached outside its window):**

| State | Page |
|---|---|
| Slug not found | Standard 404 |
| Event hasn't started yet | *"This event opens {date}."* with the business name + logo |
| Event has ended | *"This event has ended. Thank you!"* |
| Event is inactive within its window | *"Not currently accepting orders."* |

All four pages should retain the brand styling — same header, same colors. They're brand impressions even when the form isn't available.

**Error states on the form itself:**

| State | Display |
|---|---|
| Invalid phone number | Inline red error under the phone field: "Please enter a 10-digit Indian mobile number." |
| Network failure on submit | Inline retry message: "Couldn't submit. Try again →" |
| No products available (all inactive) | "No items available right now." with form disabled |

---

## 10. Bill PDF

**Purpose:** mom generates a bill from an order, shares it to WhatsApp. Customers see this PDF on their phone. It is one of the most-distributed brand surfaces of the business.

**Format requirements:**
- Rendered client-side (jsPDF) from the order data and the Settings inputs.
- Single page, portrait orientation, mobile-friendly (narrow column suitable for viewing on a phone without zooming).
- Standard receipt layout, clean and unfussy.
- Includes the logo extracted from the brochure.

**Layout, top to bottom:**

1. **Header**
   - Logo
   - Business name (large)
   - Business address (small, multi-line, only if set in Settings)
   - GST number (small, only if set in Settings)
   - Contact info (small, phone / WhatsApp / email — whichever are set)

2. **Bill identifier**
   - Bill number, formatted `#1001`, `#1002`, etc. (app-wide sequential, starting at 1001)
   - Order date (full date)
   - Customer name
   - Customer phone

3. **Items table**
   - Columns: Product · Qty · Unit price · Line total
   - One row per order item.
   - Right-aligned numeric columns.

4. **Totals**
   - Subtotal
   - Total
   - (No tax breakdown in v1.)

5. **Payment status stamp**
   - A clear `PAID` / `UNPAID` / `PARTIAL` indicator. Strong visual treatment — likely a stamped-style label.

6. **Footer**
   - Footer note from Settings (default: "Thank you")
   - Optional: small line "Generated by Crunchies Management App" or similar (mom decides; tied to Settings if desired)

**Visual tone:**
- Aligned with mom's brand from the brochure.
- Restrained color use — likely the brand primary color for the header band and one accent for the payment stamp.
- Clear typographic hierarchy.
- Looks like a legitimate Indian small-business invoice.

---

## 11. States — loading, empty, error, offline

### Loading states
- Tab navigation should feel instant. Use lightweight skeleton rows on list views when data is fetching, never a full-screen spinner blocking the tab.
- On Reports tabs, loading indicators may appear per-section while charts/aggregates compute.

### Empty states
- Every list-rendering surface has an explicit empty state with a clear next-action affordance.
- Tone: matter-of-fact. Never overly cheerful, never apologetic.

### Error states
- Network errors during a save: inline message near the form with a `Retry →` link. Form values persist locally so retry is one tap.
- Network errors during a fetch: inline message at the top of the affected section with `Retry →`. The rest of the screen remains functional where possible.
- Validation errors: inline red text beneath the offending control, no modal interruptions.

### Offline (PWA)
- The app should feel functional offline for read operations on already-cached data.
- Writes (logging an order, marking fulfilled) should clearly indicate "saved" only after the server confirms. If offline, display an unobtrusive indicator: "Offline — will sync when connected." Don't block her from continuing to log orders; queue them.

(v1 may ship without full offline write queueing — but the design language should accommodate it for a future iteration.)

---

## 12. Accessibility and responsive guidance

### Accessibility
- Body text and labels should hit WCAG AA contrast against backgrounds.
- Tappable elements should be large enough for thumb-reach without precision (target zones, not just visual marks).
- All form controls should have associated labels.
- Status badges should not rely on color alone — pair color with shape, text, or position so the meaning survives colorblindness.
- Focus order for keyboard navigation should be logical (top to bottom, left to right within rows).
- ARIA labels on icon-bearing controls where text labels are abbreviated.

### Responsive
- **Mobile portrait** is the primary target. Design for this first and fully.
- **Mobile landscape** should remain usable (no broken layouts), even if not optimized.
- **Tablet portrait** should render gracefully — possibly with wider cards, but the same single-column logic. No need for tablet-specific layouts.
- **Desktop** is not a target. If the app is loaded in a desktop browser, it should render in a constrained mobile-shaped column rather than expanding to fill the viewport. (Karan may use desktop for admin debugging, but mom won't.)

### The PWA experience
- Installable to mom's Android home screen with a clean icon (logo-derived from the brochure).
- Splash screen on launch (brand color background, logo centered).
- App name on home screen: "Crunchies" (or as decided in Settings).
- Standalone display mode (no browser chrome visible when launched from the home screen).

---

## Closing note for Claude Design

This brief is the structural and tonal contract. The brochure is the visual contract. Where this brief leaves visual decisions open (spacing, exact sizes, color application, typographic scale), use the brochure's sensibility as the guide and exercise your judgment.

The single most important thing to get right is **mom's first impression**. She sees the app twice in rough form (Phase 0 mockup, then launch); the second of those two has to feel finished, organized, and trustworthy. Every screen should pass the "does this look like a tool I can rely on every day?" test from the moment it loads.

Avoid: the default Material Design look, generic admin-dashboard aesthetics, AI-startup blandness, anything that reads as "templated."

Aim for: warm artisanal brand, quietly professional, considered, calm. The kind of app a thoughtful small-business founder would commission for herself, made by people who understood her work.
