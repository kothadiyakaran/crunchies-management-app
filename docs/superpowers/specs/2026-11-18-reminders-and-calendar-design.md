# Reminders (push notifications) + Calendar — design

Status: approved by Karan 2026-11-18 (brainstorm). Both features are mom-requested, so they clear the maintenance-only gate.

## Why

Mom asked for (1) push notifications about upcoming orders and (2) a calendar of orders. The brainstorm traced the push request to two causes: she preps production too late for orders due soon, and she does not open the app every day. The calendar is for seeing what is due when, planning production around it, and seeing exhibitions alongside orders.

Facts that shaped the design:
- `orders.target_fulfilment_date` is a `date` with no time, so "imminent" can only mean "due on day N". Mom sets real target dates (Karan confirmed), so a calendar has real content.
- The bottom nav is full at six tabs; a seventh does not fit at 360px.
- The app is a static Vite SPA on Vercel with no server code; Supabase holds all data.

## Discarded options (and why)

- **Subscribed ICS feed in Google Calendar.** Google refreshes subscribed feeds every 12–24h and drops VALARM reminders from URL subscriptions. It fails as an alert and lags as a calendar.
- **WhatsApp / email digests.** WhatsApp Business API costs money and needs template approval; mom does not read email.
- **Vercel Cron + Node `web-push`.** The Hobby plan allows one run per day with ±59 min timing. Workable for one alert, but Supabase pg_cron keeps scheduling next to the data with exact timing.
- **Notify only while the app is open.** Fails the "doesn't open the app" cause.
- **"Due today" alerts.** Too late for prep. Today's page already lists today's and overdue orders.
- **Restock hints from purchase patterns.** Deferred by Karan. A regression of ingredient purchases on production volume is not viable: there is no product→ingredient recipe data, only ~4.5 months of purchases (since 2026-07-07), optional `qty`/`unit`, and free-text `item_name` ("Ghee" vs "Amul ghee" are different items). If revisited after ~a year of data, the candidate is a median-interval heuristic (items with ≥4 purchases; hint when days since the last purchase pass ~85% of the median gap), optionally scaled by production since the last purchase.

## Notifications

### The three notifications

All run from one daily job at **10:00 IST, Monday–Saturday** (pg_cron `30 4 * * 1-6` UTC). Nothing runs on Sunday; Sunday is not a working day.

| Kind | Fires | Content | Tap opens |
|---|---|---|---|
| `orders` | Every run that has at least one pending order due in the window | See format below | `/calendar?date=<first day listed>` |
| `weekly_plan` | Monday's run | Title "Plan this week's production", body "Tap to set this week's targets." | `/production/plan-this-week` |
| `event_lead` | First run on or after the event's lead date, while the run date is before `starts_on` | Title "{event name} starts {Sat 6 Dec}", body "Time to plan production for it." | `/events/{id}` |

**Orders window:** every day after the run date up to and including the 2nd working day (working days are Mon–Sat). Sunday is not a working day, but 40 of 464 dated orders (to 2026-11-18) fall on one, so Sunday orders still need a reminder: a Friday run covers Sat+Sun+Mon and a Saturday run covers Sun+Mon+Tue. The advisor review found the gap; Karan's original rule ("1 and 2 working days ahead") was silent on Sunday orders, and this keeps his intent. Only pending orders count (`fulfilled_at is null`). Overdue orders and orders with no target date are excluded: they already lead Today's "Pending today" block, and a daily repeat would teach mom to ignore the alert. Each order is mentioned twice (two working days out, then one). If no order is due in the window, no `orders` notification is sent.

**Event lead date:** `starts_on − 7 × lead_weeks`; if that is a Sunday, use the Saturday before. Events with `lead_weeks = 0` or `active = false` never notify. Because the rule is "first run on or after the lead date", an event created after its lead date still gets one alert on the next run (catch-up).

**Separate notifications** (Karan's choice, over bundling): on a Monday, `orders` and `weekly_plan` both fire at 10:00. Each uses a distinct notification `tag` so Android shows both rather than replacing one with the other. Event alerts are tagged per event (`event_lead:<id>`), so two exhibitions reaching their lead date on the same run don't replace each other.

### `orders` notification format

Karan chose this format; the reasoning matters for edits. A web notification has one `title` and one `body`. Android's collapsed view shows the title plus the first body line; expanding shows the full body. Mom cares most about *who* has ordered, so the first body line lists customers; the product totals for prep follow on separate lines, per day (she preps for the nearer day first).

```
title: Tue: 2 orders · Wed: 1 order
body:  Tue — Sharma Stores, Meena · Wed — Joshi Kirana
       Tue: Chakli 3 × 250 gm, Chivda 1 × 200 gm
       Wed: Shankarpali 5 × 125 gm
```

Rules:
- Days are always short weekday names (`Tue`), never "Tomorrow", never dates.
- A day with no pending orders is omitted entirely (title becomes `Wed: 1 order`).
- "1 order" / "N orders" pluralisation.
- Customers within a day are unique, ordered by their earliest `ordered_at`. Across both days the customer line caps at 8 names, then `+N more`.
- `products.unit` is a hand-typed pack size ("250 gm", "200gm", "125"), and `order_items.qty` counts packs; live data checked 2026-11-18. The same product name exists in several pack sizes (Chakli 250 gm and 500 gm), so totals group by name **and** normalised pack size (`packSize`: bare numbers and "200gm" become "200 gm"; anything else is trimmed and kept). A total prints as `Chakli 4 × 250 gm`; quantities print without trailing zeros. Products within a day sort by descending qty, then name. Each day line caps at 5 products, then `+N more`. The calendar's "To make" line uses the same grouping and format.

### Architecture

```
pg_cron (10:00 IST Mon–Sat) ──pg_net POST + x-cron-secret──▶ Edge Function send-reminders
                                                              │ reads orders/events (service role)
                                                              │ builds payloads (_shared/reminders.ts)
                                                              │ claims send-log rows (idempotency)
                                                              ▼
                                         Web Push (VAPID) ──▶ each row in push_subscriptions
                                                              ▼
                                         src/sw.ts push handler → showNotification
                                         notificationclick → focus/open app at payload URL
```

**Migration `0011_reminders.sql`** (additive; apply via Supabase MCP `apply_migration`):
- `push_subscriptions(id, endpoint unique, p256dh, auth, user_agent, created_at, last_seen_at)`. RLS: authenticated users have full access; anon none.
- `notification_log(id, kind, ref, sent_at, unique(kind, ref))`. `ref` is the run date for `orders`/`weekly_plan` and the event id for `event_lead`. RLS on with no policies (service role only).
- `private` schema (not exposed by PostgREST) with `private.vapid_keys` (singleton row: `public_key` text, `private_jwk` jsonb).
- RPCs, all SECURITY DEFINER with `search_path` pinned:
  - `get_vapid_public_key()` → text; granted to `authenticated`.
  - `reminders_get_vapid()` / `reminders_store_vapid(public_key, private_jwk)`; granted to `service_role` only. Store uses insert-on-conflict-do-nothing then reselects, so two concurrent first runs agree on one key pair.
  - `reminders_cron_secret()` → text from Vault; `service_role` only.
- Enables `pg_cron` and `pg_net`; creates a Vault secret `reminders_cron_secret` from `gen_random_bytes(32)` inside SQL, so the value never leaves the database; schedules the cron job, which reads the project URL and secret and POSTs to the function.

**Why keys are self-generated in the DB (Karan's choice):** no credential ever passes through a terminal, a file, a commit or a dashboard paste. Rotation means deleting the `private.vapid_keys` row; every phone re-subscribes on its next app open, because the client compares the stored subscription's key with the current public key.

**Edge Function `supabase/functions/send-reminders/index.ts`** (Deno, deployed with `verify_jwt = false`; auth is done in-function):
- `POST {action:"run", date?, dryRun?}`, where the `x-cron-secret` header must equal `reminders_cron_secret()`. It computes the three kinds for `date` (default: today in Asia/Kolkata). For each payload it inserts the `notification_log` row first and sends only if that insert claimed the row, so a retried or duplicated cron call cannot double-send. If a payload reaches no device (every push failed with something other than 404/410), the function deletes its claim row, so a re-run, or the next day for an event alert, can retry it; otherwise an event's one-off alert would be lost for good. The run only reads the stored VAPID pair and fails loudly if it's missing; generating one during a run would make every existing subscription fail with 403. `dryRun` returns the payloads without logging or sending; verification uses this.
- `POST {action:"ensure-keys"}` with a user's `Authorization: Bearer <access token>`, validated via `auth.getUser`. It generates and stores the VAPID pair if absent and returns the public key. The client calls it only when `get_vapid_public_key()` returns null (the first subscribe ever).
- On push, a 404/410 response deletes that subscription. Other errors are logged and skipped.
- Push library: a Web-Crypto-based Deno library (`jsr:@negrel/webpush` first choice), because Node's `web-push` relies on Node crypto and is unreliable in Deno. Confirm it delivers to a real Android phone before treating the feature as done.

**Shared pure module `supabase/functions/_shared/reminders.ts`:** working-day math, lead-date math, per-day grouping, product totals, and notification text. It has no imports, so both Deno and the Vite app import it (the app via a path alias) and Vitest tests it. The calendar's "To make" totals use the same function, so the app and the notification cannot disagree.

### Service worker

Push needs custom service-worker code, so vite-plugin-pwa moves from `generateSW` to `injectManifest` with `src/sw.ts`. The new worker must reproduce current behaviour exactly: precache the same globs, SPA navigation fallback to `index.html` with `/^\/order\//` denylisted, `skipWaiting` + `clientsClaim` (the current `registerType: 'autoUpdate'`), `cleanupOutdatedCaches`. It adds `push` (show notification: title, body, `tag` = kind, icon from `public/icons`, no badge (Android draws badges from the alpha channel and the full-colour favicon would render as a white disc), `data.url`) and `notificationclick` (focus an open app window first, then navigate it; Chrome only allows `focus()` shortly after the tap, so navigating first risks a second window on a slow connection; `openWindow` only if focusing fails).

This is the riskiest change in the set: a broken worker can break the installed app on mom's phone. It therefore needs the full smoke set plus the 3-browser matrix, and a real-Android check on a Vercel preview before main.

### Client

- `src/features/reminders/pushClient.ts`: support check, permission state, `enableReminders()` (permission request → public key, via RPC or the `ensure-keys` fallback → `pushManager.subscribe` → upsert `push_subscriptions`), `disableReminders()` (unsubscribe + delete row), and `refreshSubscription()` on app open (re-subscribe if the key changed; bump `last_seen_at`).
- Settings: a "Reminders on this phone" card showing On / Off / Blocked (with how to unblock in Android site settings) / Not supported, plus the toggle.
- Today: a one-time card ("Get a reminder for orders due in the next two working days") with Turn on / Not now. It is hidden once enabled, dismissed (localStorage), blocked or unsupported. Android only shows the permission prompt after a tap, so the prompt cannot be automatic.

## Calendar

**Entry:** a calendar icon in Today's header, next to Settings, opens `/calendar` (lazy route, inside `Protected`). The `orders` notification deep-links to `/calendar?date=YYYY-MM-DD`. The selected day lives in the URL (`replace` navigation), so Back from an order detail returns to the same day. The bottom nav is unchanged.

**Layout (360px):** h1 "Calendar"; month header `‹ November 2026 ›` plus a "Today" button; a Monday-first 7-column grid (Sunday muted); then the panel for the selected day.

Day cell:
- the date number;
- a count of pending orders due, in brand tint. Past days with pending orders use the danger tint, which flags them as overdue;
- ✓ when the day has orders and all are fulfilled;
- a mustard band along the bottom when any active event (every kind, not only exhibitions) runs that day;
- a ring for today and a filled cell for the selected day.

Day panel, in order:
- the events running ("Diwali Mela · day 2 of 3");
- "To make": per-product totals of that day's *pending* orders;
- "Orders": every order due that day (customer, item summary, status chip), each linking to `/orders/:id`;
- "Nothing due" when the day is empty.

Not shown, on purpose: lead-date markers, production logs and purchases (noise in small cells), and orders without a target date (they stay on Today).

**Data:** one fetch per visible grid (the 6-week span) — orders with `target_fulfilment_date` in the span (with customer name, items and product name/unit), plus events overlapping the span. It refetches on tab focus, matching the app's refresh model.

**Code:** `src/features/calendar/` contains `CalendarPage.tsx`, `api.ts`, and the pure `calendarGrid.ts` (month grid of `YYYY-MM-DD` strings, Monday-first, month add/subtract, day grouping) with tests. Everything works on date strings; no `Date` arithmetic in local time (week-boundary date bugs bit this app before). Cells are buttons labelled e.g. "Tue 24 November, 2 orders due"; arrow keys move between days.

## Verification

- Unit: `_shared/reminders.ts` (working-day windows incl. Fri/Sat runs and Sunday orders, Sunday lead-date shift, `lead_weeks = 0`, catch-up, formatting caps/pluralisation/omitted days), `calendarGrid.ts`, the calendar's stale-fetch guard and invalid `?date=` fallback, the pushClient state logic with mocked browser APIs, and the Settings card and Today nudge.
- Smokes: a new `verify-calendar-flow.py` (a future-dated order appears on its day, the panel shows totals, tapping through to the order works, the `?date=` deep link selects the day; self-cleaning); `/calendar` added to `verify-a11y.py`. Because the service worker changes, the full smoke set runs plus the 3-browser matrix for launch-readiness.
- Live: after the migration and deploy, a `dryRun` invocation for a few dates checks the payloads against real data; then Karan subscribes his own phone on the Vercel preview and a forced run delivers a real notification.
- Headless Chromium cannot receive real pushes, so real-phone delivery is the only end-to-end proof.

## Rollout

1. Apply migration 0011 and deploy the function. Mom sees nothing: no phone is subscribed, so the daily job sends nothing.
2. Push the feature branch for a Vercel preview, then run Karan's phone test.
3. Karan reviews and pushes `main`. Mom gets the calendar icon and the Today nudge, and then has to tap "Turn on" once.
