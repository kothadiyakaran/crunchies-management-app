# Sprint 6 — Architecture Decisions

Locked-in calls made during Sprint 6 (Customer lens — directory, detail, add/edit, quiet-customer nudge). Builds on `2026-05-21-sprint-2-architecture-decisions.md` (ADR-1..7), `2026-05-21-sprint-3-4-architecture-decisions.md` (ADR-8..16), and `2026-05-22-sprint-5-architecture-decisions.md` (ADR-17..21). Numbering continues.

---

## ADR-22: `isQuiet` is a pure TS predicate, not a Postgres view

**Context:** Spec §8 defines "quiet" via the most-recent of three timestamps (`last_ordered_at`, `last_contacted_at`, `created_at`) compared against a channel-dependent threshold. Implementation options: (a) materialised view in Postgres, (b) computed column / generated check, (c) pure TS predicate applied client-side.

**Decision:** Option (c). `src/features/customers/quiet.ts` exports `isQuiet(input, today)` returning `{ isQuiet, daysSince, thresholdDays }` and a sibling `quietDurationDays(channelName, hasOrders)`. Both are pure — no DB calls, no React. Callable from Customers directory (per-row marker + Quiet filter), `listQuietCustomers` (Today block 2.5), and any future calibration audit. 12 invariants live in `quiet.test.ts`.

**Why:**
- Pure functions are testable in isolation; the thresholds + anchor logic are testable without a Supabase fixture.
- v1 scale (<1000 customers per fetch) makes the in-JS filter cheap. The query selects all active customers; the predicate runs in O(n) inside the same round-trip's response handler.
- A materialised view would need a refresh strategy on every order insert/edit/delete and on every `last_contacted_at` bump — too much DB plumbing for a v1 user count this small.
- Future scale can introduce a server-side `quiet_customers` view without changing the consumer surface; `isQuiet` becomes redundant rather than wrong.

**Implementation note (caught during Task 1):** boundary-exact day calculations require normalising the anchor timestamp to the Asia/Kolkata calendar day before subtracting `today` (which is `todayInTz()` — already calendar-day-aligned). Raw timestamp diff with `Math.floor` lands one day short for thresholds whose anchor was set mid-day. The fix is a 4-line normalization inside `isQuiet`; the spec's "22 days ago → quiet (over 21 threshold)" case exercises exactly this boundary.

**Cross-references:** `src/features/customers/quiet.ts`, `quiet.test.ts`, `api.ts:listCustomersFiltered`/`listQuietCustomers` (consumers), `CustomersPage.tsx` (per-row marker), `QuietCustomerNudge.tsx` (Today block).

---

## ADR-23: Quiet thresholds hardcoded for v1 in `quietDurationDays()`

**Context:** Spec §8 quiet thresholds: Reseller 21d, Personal 60d, Exhibition (no orders) 30d, Exhibition (with orders) 90d. Spec says "Hardcoded for v1. Move to Settings (§13) if mom finds them off after ~2 months of use." Custom channels were not spec'd (spec predates extensible channels — ADR-24).

**Decision:** Hardcoded constants in `quietDurationDays(channelName, hasOrders)`. Custom channels (anything not Reseller / Personal / Exhibition) default to Personal's 60d. Promoting to Settings is deferred to Sprint 9 + the post-launch tuning window.

**Why:**
- Mom hasn't given values yet for any Settings (per §13 open items). Building a settings UI for these thresholds before she has a baseline reaction would invert the order of operations.
- Custom channels behaving like Personal is the conservative default — over-quieting custom channels is worse than under-quieting them (false positives erode trust in the nudge).
- The constants are in one function, so a Settings swap is a one-find-replace in Sprint 9 if needed.

**Open carry:** If mom flags the thresholds as too aggressive after ~2 months of use, promote to a `quiet_thresholds` Settings row keyed by channel name.

**Cross-references:** `src/features/customers/quiet.ts:quietDurationDays`.

---

## ADR-24: Channels extensible via `createChannel`; system rows soft-hide-only

**Context:** Sprint 0 already migrated the schema from a `customers.channel` enum to a `customers.channel_id` FK + `channels` table with three seed rows (`Personal`, `Reseller`, `Exhibition`, `is_system = true`). Sprint 6 adds the mom-facing inline-add affordance per `DESIGN_HANDOFF.md` §6.1.

**Decision:** `createChannel(name)` validates (trimmed 1-20 chars), inserts with `is_system = false, active = true`, and translates Postgres `23505` unique-violation to a friendly "Channel "X" already exists" message. The UI affordance is the dashed `+ Add channel…` chip in `ChannelChipPicker`, which expands inline to a name input + Save/Cancel — no navigation. New chips appear inline and are auto-selected.

System rows (`is_system = true`) can be soft-hidden via `active = false` (existing schema mechanism) but never hard-deleted. The hide/delete UI is deferred — admin via raw SQL is sufficient until v2 polish.

**Why:**
- Mom doesn't need rename/delete for v1. The likely usage is "she occasionally adds a new channel (Office colleagues, Building society)" rather than active channel maintenance.
- Soft-hide preserves historic attribution — archived customers referencing a hidden channel still resolve.
- Custom channels render identically to system chips per `DESIGN_HANDOFF.md` §6.1 — no "user-added" badge. Less visual noise; mom doesn't need to know the distinction.

**Cross-references:** `src/features/customers/api.ts:createChannel`, `ChannelChipPicker.tsx`, `AddCustomerPage.tsx`, `AddCustomerInlineModal.tsx`.

---

## ADR-25: Edit Customer reuses AddCustomerPage via `editingCustomerId` prop — no field-level locking

**Context:** Spec §8 customer edit allows every field to change. Implementation options: (a) duplicate the form into `EditCustomerPage`, (b) parametrise `AddCustomerPage` with an `editingCustomerId` prop and branch the save handler.

**Decision:** Option (b). Mirrors Sprint 5 ADR-20 (Edit Order = `AddOrderPage(editingOrderId)`). Hydration effect populates state from `getCustomerDetail`; save branches to `updateCustomer` when editing, `createCustomerFull` otherwise. `EditCustomerPage` is a 7-line wrapper that reads the route param and mounts `<AddCustomerPage editingCustomerId={id} />`.

**No locking** of any field per spec §8.2 footer secondary actions (Edit profile / Archive / Delete) — every accordion-equivalent field stays editable.

**One UX nuance:** the dup-on-phone modal is skipped in edit mode. If mom intentionally changes a phone number to match another customer's, surfacing the modal would imply she's adding a duplicate (she's not — she's correcting an existing record). v2 may add a merge-confirmation when the new phone hits an active row.

**Why:**
- Single form source-of-truth — no layout drift between add and edit flows.
- Hydration cost is one `getCustomerDetail` round-trip; trivial.
- Edge case mom needs is real: she logs a customer with the wrong channel, opens edit, switches channel chip, saves.

**Cross-references:** `src/features/customers/AddCustomerPage.tsx` (the `editingCustomerId` branch + hydration effect), `EditCustomerPage.tsx` (wrapper), `api.ts:updateCustomer`.

---

## ADR-26: Quiet "dismiss" advances `last_contacted_at = now()`

**Context:** Spec §8 lists three ways `last_contacted_at` advances: tapping `Send WhatsApp`, long-pressing the phone field link, or tapping the `×` dismiss on a quiet-customer row. All three are "mom acknowledged this customer."

**Decision:** Dismiss button on `QuietCustomerNudge` calls `bumpLastContacted(id)` (which writes `last_contacted_at = new Date().toISOString()` to the `timestamptz` column) and optimistically removes the row from the local state. No server-side sentinel for "dismissed" vs "contacted" — they're the same row-state from the schema's perspective.

**Why:**
- Reversibility is by design: doing nothing means the customer goes quiet again after the threshold elapses from the dismiss timestamp. Spec calls this out explicitly.
- No need to track dismiss vs contact separately for v1. If mom needs analytics on "what % of nudges resulted in actual outreach" that's a v2 question — and would need an event log, not a column.
- `last_contacted_at` is a `timestamptz` column, NOT a `date` (per `0001_init.sql:82`). Write `new Date().toISOString()`, not `todayInTz()`. This is the opposite gotcha from Sprint 5 ADR-15 (where `paid_at` / `fulfilled_at` ARE dates).

**Cross-references:** `src/features/customers/api.ts:bumpLastContacted`, `QuietCustomerNudge.tsx`, `CustomerDetailPage.tsx:onWhatsApp`.

---

## Browser verification (sprint close, commit ~Sprint-6-9)

`scripts/verify-customer-flow.py` runs headless Playwright against the local dev server:

1. Login
2. `/customers` directory loads with header, search input, filter chips, `+ Add customer` link
3. Search input accepts text (no crash on rapid typing)
4. Tap first customer row → `/customers/:id` renders stats card + `Edit profile` link
5. `/customers/new` renders the `ChannelChipPicker` including the dashed `+ Add channel…` affordance
6. `/today` either shows the Quiet customers heading (if any) or correctly omits the section (component returns null)
7. Zero console errors during the flow

Captures `scripts/screenshots/sprint6-{customers-list,customer-detail,add-customer,today}.png` for visual review.

---

## Post-implementation fixes (commit `4b5f84c`)

The advisor reviewing the closed sprint flagged two spec deviations that landed as a follow-up commit before declaring Sprint 6 truly done:

1. **`+ Log new order` did not pre-fill the customer.** Spec §8.2 explicitly writes the action as *"+ Log new order (pre-fills customer)"*. The original implementation dropped mom on `/orders/new` with an empty customer picker — exactly the friction the spec phrase forbids. Fix: added `getCustomerLite(id)` to `customers/api.ts`; `AddOrderPage` reads `?customer_id=` via `useSearchParams` and hydrates the customer slot (auto-advancing the accordion past the customer step); `CustomerDetailPage`'s Link became `/orders/new?customer_id=${id}`.

2. **Archived customers bypassed dup-on-phone detection.** `findCustomerByPhone` filtered `.eq('active', true)`, so adding a customer with a phone number she had previously archived silently inserted a duplicate row instead of surfacing the modal. Spec §10 (exhibition form) explicitly auto-reactivates archived matches; §8's standalone-add flow should follow the same logic for the same reason — the system heals the state automatically rather than surfacing a "this was archived" UI. Fix: dropped the `active = true` filter from the query (so archived rows surface in the dup modal), extended the return type to include `active`, widened `AddCustomerPage`'s dup state, and made `onUseExisting` reactivate the matched row via `updateCustomer(id, { active: true })` before navigating. `updateCustomer`'s patch type was extended with `active?: boolean` to support this. Two new unit tests cover the archived-match path and the updated single-`.eq` query chain.

The browser smoke (`scripts/verify-customer-flow.py`) re-ran clean against the fixed code; full suite 90 tests across 17 files.

## Open items carrying into Sprint 7+

- **Source-event dropdown on AddCustomerPage.** Sprint 7 wires the events table; until then `source_event_id: null` on every new customer. Auto-set when channel is `Exhibition` and an active event exists is a Sprint 7 step.
- **`+ Log new order` deep-link with `?customer_id=`.** `CustomerDetailPage` just navigates to `/orders/new` — Sprint 9 polish can wire AddOrderPage to read `customer_id` from URL params and pre-select.
- **Channel hide / delete UI.** System rows can be soft-hidden (`active=false`); v1 has no UI for this. Admin tool (raw SQL via supabase MCP) suffices. v2 polish.
- **Customer merge UI.** Spec §8 explicitly defers to v2. The dup-on-phone modal in Sprint 6 is the only safety net.
- **Quiet thresholds in Settings.** Promote `quietDurationDays` constants to a Settings table read once mom has ~2 months of usage feedback. ADR-23.
- **`listCustomersFiltered` performance at scale.** Fetching all active customers and filtering for `quiet` in JS is fine at v1 scale (~100s). If the directory ever feels slow, materialise a `quiet_customers` view.
- **Phone validation (10-digit IN format).** Spec §10 (public exhibition form) has strict 10-digit validation. Spec §8 doesn't require it for mom's standalone entry — she may type with `+91` or spaces. v2 polish.
