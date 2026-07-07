# Purchases ("Buy") — design

**Date:** 2026-07-07 · **Requested by:** mom (via Karan) · **Status:** approved direction, Karan reviews pre-push
**Branch:** `feature/purchases`

## Request

Mom wants to record what she procures, from whom, at what cost, and when. Karan's scope
decisions (2026-07-07): receipt model (trips *and* items both matter), quantity *and* money,
no credit/khata tracking, categories (including "Made products" for goods bought from other
makers), reports thought through holistically, and a navigation redesign — mom is comfortable
adapting; Purchases gets a standalone place.

## Decisions

### D1. Navigation: six tabs, one row

`Today · Orders · Customers · Make · Buy · Reports`

- `BottomNav` goes `grid-cols-5` → `grid-cols-6`. **Make** = existing `/production`
  (Factory icon, position 4 unchanged). **Buy** = new `/purchases`
  (`ReceiptIndianRupee` icon — visually distinct from Orders' ShoppingBag; fall back to
  `ReceiptText` if unavailable in lucide 0.469).
- Tab labels are short verbs so six columns fit a 360 px viewport; the current `text-label`
  (10px / 0.1em tracking) makes "CUSTOMERS" ≈ 65 px in a 60 px slot, so nav labels move to a
  slightly tighter arbitrary value (≈9px / 0.06em — implementer verifies no wrap at 360 px).
  No design-token changes; arbitrary values stay local to `BottomNav`.
- Page `h1`s keep the fuller nouns — "Production", "Purchases". Tabs are wayfinding;
  headings are naming. Existing smoke selectors on `h1:has-text("Production")` stay valid.
- Orders unseen-badge mechanism untouched.

**Rejected:** two-row nav (permanently spends ~56 px of a 640 px viewport — ~9% of mom's
screen — on chrome); floating side menu (hides destinations behind a tap, non-standard on
Android); **Events tab** (seasonal feature; already surfaced by `UpcomingEventsSection` on the
Production page, which is where events actually drive decisions — revisit only if mom asks);
**Planning tab** (the weekly plan is future-facing, the purchase log is past-facing; merging
them muddles both. The real tie-in is D5.)

### D2. Receipt model (schema, migration `0010_purchases.sql`)

Four tables, following the `0001` DDL + `0002` RLS patterns exactly
(`set search_path = public, extensions;` · `authed_all … for all to authenticated using (true)
with check (true)` · **no anon access, no RPCs** — this feature has zero public surface).

```
vendors             id · name (1–60, unique on lower(name)) · created_at
purchase_categories id · name (1–20, unique on lower(name)) · is_system · active · created_at
purchases           id · vendor_id FK · purchased_on DATE · note? · created_at
purchase_items      id · purchase_id FK (on delete cascade) · item_name (1–60) ·
                    category_id FK · qty numeric(12,3)? (>0) · unit text? ·
                    amount numeric(10,2) (>=0) · created_at
```

- Seed system categories: **Ingredients, Packaging, Made products, Fuel, Other.** Custom
  categories chip-added at point of use (exact `ChannelChipPicker`/`createChannel` pattern,
  including the 23505 duplicate-name handling).
- `purchased_on` is a Postgres **`date`** — written with `todayInTz()`, never an ISO
  timestamp (standing invariant).
- Trip total is **computed** (`Σ item.amount`), never stored. Amount/qty columns arrive from
  PostgREST as strings → `Number(...)` at read sites (standing invariant).
- Indexes: `purchases(purchased_on desc)`, `purchases(vendor_id)`,
  `purchase_items(purchase_id)`, `purchase_items(lower(item_name))`.

### D3. The Buy screen (`/purchases`)

**Header:** `h1` "Purchases" + month period selector (‹ July ›, local state, default current
month) + the month's total spend in the `amount` type token.

**Two sub-views** (segmented control, Receipts default):

- **Receipts** — receipt cards grouped under day headings, newest first: vendor name,
  item count + first item names (truncated), trip total right-aligned. Tap →
  `/purchases/:id` detail: vendor, date, note, line items (name · qty unit · category badge ·
  amount), computed total, **Edit** → `/purchases/:id/edit`, **Delete**
  (native-`confirm()`-guarded, cascade removes items) → back to list. Matches the
  order-detail reversibility idiom.
- **Items** — the price-memory view, **all-time** (month selector hides here): distinct items
  grouped case-insensitively — display name, last price (`₹450 · 5 kg`), derived unit price
  when qty present, times bought, last vendor + date. Tap a row → inline expand showing the
  recent history for that item (date · vendor · qty · amount · unit price). No new route.

A search input filters both views (vendor or item name match, client-side — mom-scale data).

### D4. Log purchase form (`/purchases/new`, `/purchases/:id/edit`)

Mirrors `AddOrderPage` structure (string-draft rows + `Number()` validation on save):

1. **From** — vendor autosuggest (debounced, `CustomerSearchPicker` pattern). No match →
   one-tap "Use '<typed>' as new vendor" (vendor is just a name; no modal). Vendor row
   created on save; 23505 race falls back to selecting the existing vendor.
2. **Date** — default `todayInTz()`, editable (backdating/backfill supported by design).
3. **Item rows** — name (autosuggest over past `purchase_items` names), qty (optional,
   numeric), unit (optional, free text), amount ₹ (required), category chips (default:
   the item's last-used category, else Other). **When the name matches a known item, a quiet
   hint renders under the row:** `Last: ₹450 · 5 kg · Ram Kirana · 12 Jun` — and unit
   auto-fills from that entry. `+ Add another item` / per-row `✕` (disabled at one row).
4. Optional note · live trip total · `.btn-primary` Save.

Writes are sequential PostgREST inserts (vendor → purchase → items), same as orders — single
writer, acceptable. **Edit strategy: update the purchase row, delete-and-reinsert its items**
(cascade-safe, nothing references `purchase_items`).

### D5. Planning ↔ purchases tie-in (the careful bit)

The "From other makers" section on Production is already the week's to-buy list. Each
`AggregatedSection` row gains a small **Log purchase →** action that navigates to
`/purchases/new` with router-state prefill: vendor = `source_maker_name` (blank if null),
item = product name, qty = `committed_qty`, unit = product unit, category = Made products.
Missing state (deep-link refresh) degrades to a blank form.

**Rejected:** shopping-list generation from the production plan (requires per-product
bill-of-materials — heavy admin surface, low value at mom's scale); purchases data appearing
inside planning views (the plan answers "what to make", not "what did I spend").

### D6. Reports, holistically

- **Month tab** gains one new `ReportSection title="Spending"` inserted after **Order
  summary** and before **Channel breakdown** (money-in and money-out adjacent):
  - Total spend this month + vs-prior-month comparison (existing `fmtPct` idiom, two months
    fetched in parallel like `getOrderSummary`).
  - **Category breakdown** reusing the existing `StackedBar` + list rows (zero new chart code).
  - A **"Left over"** line: `order summary total_value − spend`, labelled
    *"Left over = sales − purchases. Before gas, transport, and time."* — deliberately not
    called profit.
  - Data via new `getSpendingSummary(start, endExclusive)` in `src/features/reports/api.ts`,
    shaped like `getOrderSummary` (nested select `purchases → purchase_items → categories`).
- **Week tab / Trends tab: untouched.** Purchases are lumpy week-to-week; month is the honest
  grain. Category trends over months → parking lot.
- Vendor-wise totals live on the Buy screen (Items view / vendor filter), not in Reports.

### D7. Copy

Direct-operational tone: "Log purchase", "From", "Last: …", "+ Add another item",
"Left over". Tab labels "Make"/"Buy".

## Out of scope (unchanged from the approved brief)

No stock/inventory, no per-product costing or true profit, no receipt photos, no vendor
credit/khata ledger, no BOM/shopping lists, no anon/public surface, no link from purchases
back into production planning.

## Verification plan

- Unit tests for the pure helpers: `receiptTotal`, day grouping, `aggregateItems`
  (case-insensitive grouping, last-price pick), unit price derivation, category breakdown,
  month totals.
- New smoke `scripts/verify-purchases-flow.py`: login → create receipt (2 items: one with
  qty+unit+category, one bare) → list shows receipt + month total → re-open form, type same
  item name → last-price hint asserted → edit (change an amount) → detail reflects → delete →
  gone. Self-cleaning with uniquely-named throwaway vendor/items.
- `verify-a11y.py`: add `("/purchases", "purchases", 'h1:has-text("Purchases")')`.
- `smoke-test-walking-skeleton.py`: TABS → 6 labels with Make/Buy.
- Nav + routing changes are **architectural** → full smoke set + 3-browser matrix before
  declaring done (CLAUDE.md rule), plus advisor review against this spec.

## Blast radius

New: migration `0010`, `src/features/purchases/*`, spending section + `getSpendingSummary`,
one smoke. Modified: `BottomNav` (6 cols, labels), `App.tsx` (4 lazy routes),
`AggregatedSection` (shortcut link), `MonthTab` (one section), 2–3 smoke scripts' fixtures.
Untouched: all existing tables, RPCs, public surface, design tokens, bill PDF, discounts.
