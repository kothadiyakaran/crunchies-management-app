# Reminders + Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline; the session that wrote this plan executes it). Steps use `- [ ]` tracking.

**Goal:** Ship Web Push reminders (orders due in the next 2 working days, Monday planning nudge, event lead-date alert) and a `/calendar` screen.

**Architecture:** One pure module (`supabase/functions/_shared/reminders.ts`) owns the date rules, grouping and notification text. The Deno Edge Function and the Vite app both import it. pg_cron calls the function daily, and the function pushes to subscriptions stored in Postgres. The service worker moves to `injectManifest` to handle `push`. The calendar is a lazy route built from a pure grid module plus one Supabase query per visible grid.

**Tech stack:** Vite/React/TS, vite-plugin-pwa (injectManifest) + workbox-precaching/routing, Supabase (pg_cron, pg_net, Vault, Edge Functions on Deno), `jsr:@negrel/webpush@0.5` (API verified from source 2026-11-18: `generateVapidKeys({extractable:true})`, `exportVapidKeys`, `importVapidKeys`, `exportApplicationServerKey`, `ApplicationServer.new({contactInformation, vapidKeys})`, `as.subscribe(sub).pushTextMessage(text, {ttl, urgency, topic})`, which throws `PushMessageError` with `.response.status`).

**Spec:** `docs/superpowers/specs/2026-11-18-reminders-and-calendar-design.md`. The executor reads the spec first. Notification copy and format rules are defined there and are not repeated here.

**On code in this plan:** this plan is executed inline by the session that designed it, so steps name interfaces and test cases instead of pasting full code. The spec is the source of truth for behaviour.

## Global constraints

- Date columns are Postgres `date`; compute today with `todayInTz()`, and do all date math on `YYYY-MM-DD` strings via UTC-noon `Date` objects (never local-time arithmetic).
- Typecheck with `npm run typecheck`; run unit tests with `npm run test:run`; run `npm run build` before declaring a task done (the incremental cache can hide breaks).
- Anon gets no new table access. New RPCs are SECURITY DEFINER with `set search_path = public` (or `''`) and explicit grants.
- No design-token changes. Use existing tokens (`brand`, `brand-muted`, `danger`, `mustard`, `ink-*`, `paper-*`) and the `.btn-primary`/`.input-shell` primitives.
- VAPID `contactInformation` = `https://www.crunchies.app` (no personal email sent to push services).
- Never print a secret. The cron secret and the VAPID private key live only in the DB.
- Commit after each task. Don't push `main`. Pushing `feature/reminders-calendar` for a preview is authorised.

---

### Task 1: Shared reminders module (pure, TDD)

**Files:** create `supabase/functions/_shared/reminders.ts`, `src/features/reminders/reminders.test.ts`; modify `tsconfig.app.json` (include `supabase/functions/_shared`), `vite.config.ts` + tsconfig `paths` (alias `@shared/*` → `supabase/functions/_shared/*`).

**Produces:**
```ts
export type DueOrder = { id: string; ordered_at: string; target_fulfilment_date: string; customer_name: string;
  items: { product_name: string; unit: string; qty: number }[] };
export type ReminderEvent = { id: string; name: string; starts_on: string; ends_on: string; lead_weeks: number; active: boolean };
export type PushPayload = { kind: 'orders' | 'weekly_plan' | 'event_lead'; ref: string; title: string; body: string; url: string };
export function addDays(ymd: string, n: number): string;
export function weekdayOf(ymd: string): number;            // 0=Sun..6=Sat
export function shortWeekday(ymd: string): string;          // 'Tue'
export function nextWorkingDays(ymd: string, n: number): string[]; // Mon–Sat, strictly after ymd
export function leadDate(ev: ReminderEvent): string | null; // null if lead_weeks<=0; Sunday → Saturday
export function productTotals(orders: DueOrder[]): { product_name: string; unit: string; qty: number }[]; // desc qty, then name
export function formatQty(n: number): string;               // 2.5, 500, 0.25 — no trailing zeros
export function buildOrdersPayload(runDate: string, orders: DueOrder[]): PushPayload | null;
export function buildWeeklyPlanPayload(runDate: string): PushPayload | null; // Monday only
export function eventLeadPayloads(runDate: string, events: ReminderEvent[]): PushPayload[]; // caller filters already-logged
export function buildRunPayloads(runDate: string, orders: DueOrder[], events: ReminderEvent[]): PushPayload[];
```
`buildOrdersPayload` filters `orders` itself to the window from `nextWorkingDays(runDate, 2)`. `ref` = runDate for orders/weekly and the event id for event_lead. `url` for orders = `/calendar?date=<first listed day>`.

- [ ] Write failing tests:
  - `nextWorkingDays`: Mon→[Tue,Wed], Fri→[Sat,Mon], Sat→[Mon,Tue], Sun→[Mon,Tue].
  - `leadDate`: plain case; a Sunday lead date shifts to Saturday; `lead_weeks 0` → null.
  - Orders payload: two-day title/body exactly as in the spec example; a day with no orders is omitted; singular "1 order"; same customer twice on a day appears once, ordered by earliest `ordered_at`; >8 customers → `+N more`; >5 products on a day → `+N more`; orders outside the window are ignored; no orders → null; quantities summed across orders.
  - Weekly payload is non-null only on Monday.
  - Event lead: fires when runDate ≥ leadDate and < starts_on; never for inactive events or `lead_weeks 0`; catch-up after the lead date; title `{name} starts Sat 6 Dec`.
- [ ] Run `npx vitest run src/features/reminders` → FAIL.
- [ ] Implement with zero imports (both Deno and Vite must load it).
- [ ] Tests pass; typecheck. Commit `feat(reminders): shared date rules + notification text`.

### Task 2: Calendar grid module (pure, TDD)

**Files:** create `src/features/calendar/calendarGrid.ts` + `.test.ts`.

**Consumes:** `addDays`, `weekdayOf` from `@shared/reminders`.
**Produces:**
```ts
export function monthOf(ymd: string): string;               // 'YYYY-MM'
export function addMonths(month: string, n: number): string;
export function monthGrid(month: string): string[];          // 42 dates, Monday-first, starting on/before day 1
export function monthLabel(month: string): string;           // 'November 2026'
export type DaySummary = { pending: number; total: number; overdue: boolean; allFulfilled: boolean };
export function summariseDay<T extends { fulfilled_at: string | null }>(orders: T[], day: string, today: string): DaySummary;
export function eventsOnDay<E extends { starts_on: string; ends_on: string }>(events: E[], day: string): E[];
export function eventDayIndex(ev: { starts_on: string; ends_on: string }, day: string): { n: number; of: number };
```
- [ ] Tests: Nov 2026 grid starts Mon 26 Oct and has 42 cells; a month starting on Monday (Jun 2026) starts on day 1; `addMonths` across a year boundary; summary flags (overdue only when day < today and pending > 0; allFulfilled when total > 0 and pending = 0); `eventsOnDay` inclusive bounds; "day 2 of 3".
- [ ] Implement; tests pass; commit `feat(calendar): pure month grid + day summaries`.

### Task 3: Calendar data + page + Today entry

**Files:** create `src/features/calendar/api.ts`, `CalendarPage.tsx`, `CalendarPage.test.tsx`; modify `src/App.tsx` (lazy route `/calendar`), `src/features/today/TodayPage.tsx` (calendar icon link, `aria-label="Calendar"`, beside Settings).

**api.ts:** `listCalendarOrders(from, to)` selects `id, ordered_at, target_fulfilment_date, fulfilled_at, payment_status, discount_percent, customers(name), order_items(qty, unit_price, products(name, unit))` with target date between from and to, ordered by `ordered_at`, and maps to `CalendarOrder = DueOrder & { fulfilled_at; item_summary }`. Coerce numerics with `Number()`. `listCalendarEvents(from, to)` returns active events overlapping the span.

**Page behaviour (spec §Calendar):** `?date=` drives the selected day (default today) and its month; ‹ › change month and select day 1 of the new month (or today, if it falls in that month); "Today" resets. The grid is a `role="grid"` of buttons with `aria-label` "Tue 24 November, 2 orders due" / "no orders"; arrow keys move ±1/±7 days. The panel shows events, "To make" (`productTotals` of the day's pending orders), and the order list linking to `/orders/:id` with a status chip using the existing tints. Refetch on `visibilitychange`.

- [ ] Component test (mock api): renders month label, selected-day panel, totals, an order link; arrow key moves selection; `?date=` selects that day.
- [ ] Implement; typecheck + tests + build. Commit `feat(calendar): month view with day panel, linked from Today`.

### Task 4: Migration 0011

**Files:** create `supabase/migrations/0011_reminders.sql` (the spec §Architecture lists the contents). Details:
- `create extension if not exists pg_cron; create extension if not exists pg_net;`
- Tables plus RLS as in the spec. `push_subscriptions` gets a policy `for all to authenticated using (true) with check (true)`.
- `create schema if not exists private; revoke all on schema private from public, anon, authenticated;`
- `select vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'), 'reminders_cron_secret')`, guarded so it doesn't run if the secret already exists.
- The cron job is unscheduled first if it exists, then `cron.schedule('send-reminders', '30 4 * * 1-6', $$ select net.http_post(url := 'https://dhcookulkkundlibivgg.supabase.co/functions/v1/send-reminders', headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='reminders_cron_secret')), body := '{"action":"run"}'::jsonb, timeout_milliseconds := 30000) $$)`.
- [ ] Write the migration; apply it via MCP `apply_migration` (authorised). Verify: the tables exist; anon REST on `push_subscriptions` returns 401/empty; `cron.job` has the row; `get_vapid_public_key()` returns null for an authed user.
- [ ] Regenerate `src/lib/database.types.ts`. Commit `feat(db): 0011 reminders — subscriptions, send log, vapid store, cron`.

### Task 5: Edge Function `send-reminders`

**Files:** create `supabase/functions/send-reminders/index.ts` and `supabase/functions/send-reminders/deno.json` (none needed if the import uses the `jsr:` specifier inline).

**Behaviour:** as in spec §Architecture. Uses `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)` (both env vars are injected automatically). The orders query takes the window from `nextWorkingDays(today, 2)` and requires pending status. Events: active only. Event-lead payloads are filtered against existing `notification_log` rows. For each payload, it claims the log row (`insert … on conflict do nothing`, returning id) and sends only if claimed. `pushTextMessage(JSON.stringify({title, body, url, tag: kind}), {ttl: 86400, urgency: Urgency.High, topic: kind})`. A 404/410 response deletes the subscription. Response JSON: `{date, payloads, sent, removed, errors}`. `dryRun` skips the claim and the send.
- [ ] Type-check locally if possible (`npx deno check`, if deno is installable via npm; otherwise rely on the deploy-time check).
- [ ] Deploy via MCP `deploy_edge_function` with files `index.ts` + `../_shared/reminders.ts`, `verify_jwt: false`.
- [ ] Verify: a POST without the secret → 401; a dryRun via SQL `net.http_post` (reading the secret from the vault inside SQL) for 3 dates → inspect `net._http_response` payloads against live data. Commit `feat(reminders): send-reminders edge function`.

### Task 6: Service worker → injectManifest + push handlers

**Files:** create `src/sw.ts`; modify `vite.config.ts` (`strategies: 'injectManifest', srcDir: 'src', filename: 'sw.ts', injectManifest: { globPatterns: [...] }`, keep `registerType: 'autoUpdate'`, `manifest: false`, `includeAssets`); add devDeps `workbox-precaching`, `workbox-routing`, `workbox-core` matching the installed workbox major. Add a `tsconfig` entry for the SW (`lib: WebWorker`), excluding `src/sw.ts` from the app project.

**sw.ts:** `self.skipWaiting(); clientsClaim(); cleanupOutdatedCaches(); precacheAndRoute(self.__WB_MANIFEST); registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/order\//] }));` plus `push` → `showNotification(title, {body, tag, icon:'/icons/icon-192.png', badge:'/icons/favicon-32.png', data:{url}})` and `notificationclick` → focus a same-origin client and `navigate(url)`, else `clients.openWindow(url)`.
- [ ] Before the change: record the current `dist/sw.js` precache count. After the change: build, then confirm `dist/sw.js` exists with a precache list of the same size, and that `/order/x` is not served `index.html` by the SW (the launch-readiness/events smokes cover the public form).
- [ ] Commit `feat(pwa): custom service worker with push + notification click`.

### Task 7: Push client, Settings card, Today nudge

**Files:** create `src/features/reminders/pushClient.ts` (+ test), `RemindersCard.tsx` (+ test), `RemindersNudge.tsx`; modify `SettingsPage.tsx` (render the card), `TodayPage.tsx` (render the nudge under the header), `src/App.tsx` or `AppShell` (call `refreshSubscription()` once when authed).

**pushClient produces:**
```ts
export type ReminderState = 'unsupported' | 'blocked' | 'off' | 'on';
export function urlBase64ToUint8Array(s: string): Uint8Array;
export async function getReminderState(): Promise<ReminderState>;
export async function enableReminders(): Promise<ReminderState>;
export async function disableReminders(): Promise<void>;
export async function refreshSubscription(): Promise<void>;
```
The public key comes from `rpc('get_vapid_public_key')`, falling back to `functions.invoke('send-reminders', {body:{action:'ensure-keys'}})`. Subscription rows are upserted with `onConflict: 'endpoint'`. `refreshSubscription` re-subscribes when `subscription.options.applicationServerKey` differs from the current key.

- [ ] Tests: `urlBase64ToUint8Array`; state mapping for (no PushManager → unsupported; permission denied → blocked; no subscription → off; subscription → on), with mocked `navigator`/`Notification`.
- [ ] RemindersCard test: renders each state's copy; tapping Turn on calls `enableReminders`.
- [ ] Nudge: hidden when state is not `off` or the localStorage key `crunchies.remindersNudgeDismissed` is set (wrap in try/catch).
- [ ] Typecheck, tests, build. Commit `feat(reminders): enable on this phone — settings card + Today nudge`.

### Task 8: Smokes + verification

**Files:** create `scripts/verify-calendar-flow.py`; modify `scripts/verify-a11y.py` (add `/calendar`).
- [ ] Calendar smoke (same structure as `verify-purchases-flow.py`): log in, create a customer and an order with a target date 3 days out via the UI or REST, open `/calendar?date=<that day>`, assert the panel lists the customer and the "To make" line, tap the order → `/orders/:id`, go back → same day selected; teardown in `finally`.
- [ ] Run `npm run build && npm run preview`, then: calendar smoke, a11y, launch-readiness on chromium, firefox and webkit (SW change), events-flow, bill-flow, and the full smoke list from CLAUDE.md.
- [ ] Advisor review (`fable-advisor`) of the full diff, then fix the findings.
- [ ] Commit `test(smokes): calendar flow + a11y route`.

### Task 9: Preview + docs

- [ ] Push `feature/reminders-calendar`; get the Vercel preview URL.
- [ ] Hand Karan the phone-test steps: open the preview on Android → Settings → Turn on reminders; then I trigger a forced run (an SQL `net.http_post` with `{"action":"run","date":"<a date with orders>","force":true}`). `force` bypasses the send log so testing doesn't consume real log rows; it is accepted only alongside the cron secret.
- [ ] Update `CLAUDE.md` (status, migrations 0001–0011, architecture pointers, smoke table), `docs/v1-spec.md` §14, and `docs/superpowers/SESSION_STATE.md`. Commit.
