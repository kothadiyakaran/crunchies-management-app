# Cowork brief — Crunchies usage dashboard

**Audience:** Karan (one user, not shared). Purpose is to see how Archana (Karan's mother) is actually using the app I built for her, in private. Post-launch monitoring.

**Build target:** a live artifact in Claude Cowork — a single-page React-ish dashboard, hosted by Cowork (or optionally Vercel — see questions). Data source is the same Supabase project the app already writes to. No changes to the app itself; the dashboard is read-only.

**Why this exists:** v1 was built with the discipline of "mom won't tolerate rough iteration on the live app." After launch, I need a calm, private way to see whether she's actually opening it, what features she's using, where she's getting stuck — so I can guide her or improve the app without bugging her with surveys.

---

## What "usage" means here

Everything mom does in the app writes a row to a Postgres table. The dashboard reads those rows. **No client-side analytics, no page-view tracking, no event log** — just inferring usage from data changes. The app already captures this implicitly:

| Mom does this | Trace in the data |
|---|---|
| Logs in | New row in `auth.sessions` (Supabase auth schema) |
| Adds a customer | `customers.created_at` |
| Logs an order | `orders.created_at` + `order_items` rows |
| Marks order fulfilled / paid | `orders.fulfilled_at` / `orders.paid_at` populated |
| Logs production | `production_logs.created_at` |
| Saves a weekly plan | `production_plans.entered_at` |
| Generates a bill | `orders.bill_number` becomes non-null |
| Logs a complaint | `complaints.id` row |
| Edits a customer's notes | `customers` row's row-version changes (no `updated_at` column though — see questions) |
| Adds an event | `events.created_at` |
| Edits business identity | `business_settings.updated_at` |

What this **cannot** tell me without instrumentation:
- Page-view depth (how many tabs she navigated through in a session)
- "She opened the app but didn't do anything"
- Time spent per screen

That's fine for v1 of this dashboard. If signal is missing later, I'll instrument and re-build.

---

## Data sources

### Supabase project

I'll provide the URL + anon key + service_role key via Cowork's Supabase connector.

**Schemas to query:**
- `public` — all the app's tables (see below).
- `auth` — Supabase's auth schema. `auth.users` and `auth.sessions` need service_role to read; anon can't see them. (See questions on which key to use.)

### `public` schema — relevant tables

```
customers       id, name, phone, channel_id, source_event_id, notes, active,
                last_contacted_at, last_ordered_at, created_at
orders          id, customer_id, ordered_at, target_fulfilment_date, source,
                fulfilled_at, payment_status, paid_at, bill_number,
                public_order_number, notes, created_at
order_items     id, order_id, product_id, qty, unit_price
products        id, name, unit, default_price, is_seasonal, is_aggregated,
                source_maker_name, active, created_at
production_logs id, product_id, made_on, qty, notes, created_at
production_plans (product_id, week_start) PK, planned_qty,
                original_planned_qty, entered_at, notes
seed_demand     product_id PK, weekly_avg_qty, entered_at
events          id, name, kind {festival|exhibition|other}, starts_on,
                ends_on, lead_weeks, slug, active, pickup_window_start,
                pickup_window_end, venue_line, created_at
event_demand    (event_id, product_id) PK, expected_qty,
                committed_expected_qty, notes
complaints      id, order_id, reported_at, kind, description,
                resolution, resolved_at
channels        id, name, is_system, active, created_at
business_settings (single row) id, name, tagline, address_lines,
                gst_line, phone, whatsapp, email, bill_footer,
                signature_line, updated_at
```

**Key thing for date math:** several columns are Postgres `date` (not `timestamptz`): `fulfilled_at`, `paid_at`, `made_on`, `week_start`, `target_fulfilment_date`, `reported_at`, `resolved_at`. The app writes them in Asia/Kolkata local-day form. For "did she do anything today?" queries, anchor on `created_at` (timestamptz) and cast to Asia/Kolkata.

### `auth` schema (needs service_role)

```
auth.users      id, email, last_sign_in_at, created_at
auth.sessions   id, user_id, created_at, updated_at, factor_id, aal,
                not_after, refreshed_at, user_agent, ip
```

Mom is a single user — there are only 2 users total (mom + admin). Filter on her email or user_id.

---

## Suggested sections

These are suggestions — Cowork should feel free to combine, reorder, or drop. The hierarchy of importance is roughly:

### 1. "Is she using it at all?" — the daily heartbeat

The single biggest question. A **calendar heat-map** of the last 60-90 days, one cell per Asia/Kolkata day, color-intensity by activity count (rows created across all relevant tables). Empty cells = no opens / no actions. Hover/tap → counts breakdown for that day.

Also useful: a **last-activity stamp** — "Last seen 2 hours ago" / "Last action 3 days ago" with a soft warning color past 2 days.

### 2. Counts at-a-glance

A row of 4-6 large numbers:
- Customers (total · this month · this week)
- Orders (total · this week)
- Production logs (this week)
- Bills generated (total · this month)
- Events upcoming (active count)

Each tile shows current value + delta vs prior period.

### 3. Ritual adherence

Boolean / small-checklist style. Check whether mom is doing the things the app encourages:
- Has she saved a plan for the **current week**? (one row in `production_plans` with `week_start = monday_of_this_week`)
- Has she generated any bills this week?
- Has she opened Settings ever? (`business_settings.updated_at > business_settings.created_at`)
- Has she added an event in the last 30 days?
- Has she marked yesterday's pending orders as fulfilled?

Each row: green check / yellow warning / red miss, with the underlying number.

### 4. Daily timeline

Last 7-14 days as a chronological feed. Each entry: `Mon 13 Aug 14:22 · Logged order for Sunita Patil (₹420)`. Helps me see the texture of her day, not just totals. Group by day, scroll back.

### 5. Feature adoption milestones

A simple "first-time-only" checklist of every meaningful feature:
- First customer added
- First order logged
- First production batch logged
- First weekly plan saved
- First bill generated
- First complaint logged
- First event created
- First Settings edit
- First exhibition public-form order received (`orders.source = 'exhibition_form'`)
- First batch-mode session (heuristic: 3+ orders with `created_at` within a 10-min window)

Each: timestamp of first occurrence or `pending`.

### 6. Growth trends

Small sparklines for: orders / week, customers / week, total active customer base over time. Not central — just decorative context for the counts above.

### 7. Anomalies / things to ask her about

A small "Notes for next conversation" section. Heuristics:
- Orders stuck pending > 5 days (`fulfilled_at IS NULL AND target_fulfilment_date < today - 5`)
- Orders unpaid > 14 days
- Customers marked quiet but never reactivated
- Complaints with `resolved_at IS NULL`

These are conversation starters, not alerts.

---

## Visual tone

Match the app's brand so it feels of a piece. Tokens (from `tailwind.config.ts`):

```
brand.orange     #B8450F   (primary accents, key numbers)
brand.orangeSoft #FDE2C8   (hovers, soft fills)
brand.mustard    #F4C56F
brand.brown      #4A2912
ink.900          #2A241F   (primary text)
ink.700          #5A5048   (secondary text)
ink.500          #6E655E   (labels, captions)
paper.surface    #FBF8F1   (page background)
paper.elevated   #FFFFFF   (card background)
paper.muted      #F1ECE1   (dividers)
```

System font (Roboto on Android, system-ui everywhere else). Card-based layout with the soft shadow Tailwind class `shadow-card` (`0 1px 2px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)`). No icon-only buttons — every action has a text label.

The dashboard does **not** need to look like a mobile app — it's for desktop / laptop viewing. But the brand palette and typography should carry across.

---

## Questions for Karan — please ask before building

### A. Auth
1. **Who can view this dashboard?** Options:
   - Only me (auth required — Cowork's built-in auth, or a Supabase auth login reusing the admin account).
   - Anyone with the URL (no auth, but unlisted).
2. If auth: should I sign in with the same admin Supabase user I use for the app, or set up a separate Cowork login?

### B. Data access
3. **Which Supabase key should the dashboard use?**
   - `anon` (public key) — limited by RLS; can only read what RLS lets `authenticated` see, and the dashboard would need to log in as my admin user to get past anon RLS. Cannot read `auth.sessions` or `auth.users` at all.
   - `service_role` (secret key) — full bypass-RLS access, including `auth` schema for login history. Must be kept server-side; Cowork would need to keep it in a secure env var, never in client bundle.
   
   Recommended: **service_role**, since I want to see auth-session history (the "last logged in" / "logins per week" signal) and that requires it. If service_role isn't safe in Cowork artifacts, fall back to anon + skip the auth-schema parts.

### C. Refresh model
4. **How fresh does the data need to be?** Options:
   - **On page load** (simplest — refreshes each time I open it).
   - **Polling every N minutes** (e.g., 5 min auto-refresh).
   - **Realtime** via Supabase realtime subscriptions (instant — but most complex; probably overkill for a once-a-day check).

### D. Alerts (optional)
5. **Do I want pings, or is this purely "look when curious"?**
   - No alerts — I open it when I want.
   - Email me if mom hasn't opened the app in 3 days.
   - Email me if an order has been pending > 5 days.

### E. Hosting
6. **Cowork artifact only, or also deploy to Vercel?**
   - Cowork artifact: simplest, works inside the desktop app.
   - Vercel deployment: persistent URL I can open from anywhere, including my phone.
   - Both: build in Cowork, then deploy the same code to Vercel.

### F. Scope cut
7. **If you have to pick the smallest useful v1, which sections matter most?**
   - Suggested minimum: §1 (heat-map), §2 (counts), §3 (ritual adherence). Everything else can be a follow-up.
   - Or: tell me the order to build sections in.

### G. Mom's identity
8. **Filter by user — what's the right identifier?** Mom's email or user_id?  Karan will paste the email when setting up the connector. The dashboard should treat any non-mom auth-session as "Karan logged in for debug" and exclude from mom-usage counts.

### H. Time zone
9. Confirm: **Asia/Kolkata** for all date displays and "this week" / "today" boundaries. (Defaulting yes — flag if otherwise.)

---

## Out of scope for this build

- Modifying the Crunchies app itself (the dashboard is purely read-side).
- Capturing client-side events / page views (not without an instrumentation pass, which is a separate decision).
- Multi-user usage tracking (only mom matters).
- Charts that need data we don't have (e.g., per-screen dwell time).

---

## Useful context if Cowork wants to dig deeper

- App repo: `https://github.com/kothadiyakaran/crunchies-management-app`
- Live app: `https://www.crunchies.app`
- Feature spec: `docs/v1-spec.md`
- Architecture: `CLAUDE.md`
- Sprint-by-sprint history: `docs/BUILD_HISTORY.md`
- ADRs: `docs/decisions/`

The integration thesis (worth knowing for queries): the whole app is **one data spine** (`customers`, `orders`, `order_items`, `products`, `production_*`, `events`, `event_demand`, `complaints`, `business_settings`, `channels`) with three lenses on top (production / orders / customers). Reports use client-side aggregation against the same tables — no separate analytics warehouse, no materialised views.
