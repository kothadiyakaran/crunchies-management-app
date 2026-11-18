// Shared by the Vite app and the send-reminders Edge Function (Deno), so it
// must stay import-free. Dates are YYYY-MM-DD strings; arithmetic goes through
// UTC noon so no timezone can shift the calendar day.

export type DueOrder = {
  id: string;
  ordered_at: string;
  target_fulfilment_date: string;
  customer_name: string;
  items: { product_name: string; unit: string; qty: number }[];
};

export type ReminderEvent = {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  lead_weeks: number;
  active: boolean;
};

export type PushPayload = {
  kind: 'orders' | 'weekly_plan' | 'event_lead';
  ref: string;
  title: string;
  body: string;
  url: string;
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const MAX_CUSTOMERS = 8;
const MAX_PRODUCTS_PER_DAY = 5;

function noon(ymd: string): Date {
  return new Date(`${ymd}T12:00:00Z`);
}

export function addDays(ymd: string, n: number): string {
  const d = noon(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function weekdayOf(ymd: string): number {
  return noon(ymd).getUTCDay();
}

export function shortWeekday(ymd: string): string {
  return WEEKDAYS[weekdayOf(ymd)] ?? '';
}

function shortDate(ymd: string): string {
  const d = noon(ymd);
  return `${shortWeekday(ymd)} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ''}`;
}

export function formatQty(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

/** The next `n` working days (Mon–Sat) strictly after `ymd`. */
export function nextWorkingDays(ymd: string, n: number): string[] {
  const days: string[] = [];
  let d = ymd;
  while (days.length < n) {
    d = addDays(d, 1);
    if (weekdayOf(d) !== 0) days.push(d);
  }
  return days;
}

/** Day the event's prep reminder becomes due; Sundays move to the Saturday before. */
export function leadDate(ev: ReminderEvent): string | null {
  if (ev.lead_weeks <= 0) return null;
  const d = addDays(ev.starts_on, -7 * ev.lead_weeks);
  return weekdayOf(d) === 0 ? addDays(d, -1) : d;
}

export function productTotals(orders: DueOrder[]): { product_name: string; unit: string; qty: number }[] {
  const byName = new Map<string, { product_name: string; unit: string; qty: number }>();
  for (const o of orders) {
    for (const it of o.items) {
      const cur = byName.get(it.product_name);
      if (cur) cur.qty += Number(it.qty);
      else byName.set(it.product_name, { product_name: it.product_name, unit: it.unit, qty: Number(it.qty) });
    }
  }
  return [...byName.values()].sort((a, b) => b.qty - a.qty || a.product_name.localeCompare(b.product_name));
}

function customersInOrder(orders: DueOrder[]): string[] {
  const sorted = [...orders].sort((a, b) => a.ordered_at.localeCompare(b.ordered_at));
  return [...new Set(sorted.map((o) => o.customer_name))];
}

function plural(n: number): string {
  return `${n} order${n === 1 ? '' : 's'}`;
}

export function buildOrdersPayload(runDate: string, orders: DueOrder[]): PushPayload | null {
  const days = nextWorkingDays(runDate, 2)
    .map((day) => ({ day, orders: orders.filter((o) => o.target_fulfilment_date === day) }))
    .filter((d) => d.orders.length > 0);
  const first = days[0];
  if (!first) return null;

  const title = days.map((d) => `${shortWeekday(d.day)}: ${plural(d.orders.length)}`).join(' · ');

  let budget = MAX_CUSTOMERS;
  let hidden = 0;
  const customerParts: string[] = [];
  for (const d of days) {
    const names = customersInOrder(d.orders);
    const shown = names.slice(0, Math.max(budget, 0));
    hidden += names.length - shown.length;
    budget -= shown.length;
    if (shown.length > 0) customerParts.push(`${shortWeekday(d.day)} — ${shown.join(', ')}`);
  }
  const customerLine = customerParts.join(' · ') + (hidden > 0 ? ` +${hidden} more` : '');

  const productLines = days.map((d) => {
    const totals = productTotals(d.orders);
    const shown = totals.slice(0, MAX_PRODUCTS_PER_DAY).map((t) => `${t.product_name} ${formatQty(t.qty)} ${t.unit}`);
    const more = totals.length - shown.length;
    return `${shortWeekday(d.day)}: ${shown.join(', ')}${more > 0 ? ` +${more} more` : ''}`;
  });

  return {
    kind: 'orders',
    ref: runDate,
    title,
    body: [customerLine, ...productLines].join('\n'),
    url: `/calendar?date=${first.day}`,
  };
}

export function buildWeeklyPlanPayload(runDate: string): PushPayload | null {
  if (weekdayOf(runDate) !== 1) return null;
  return {
    kind: 'weekly_plan',
    ref: runDate,
    title: "Plan this week's production",
    body: "Tap to set this week's targets.",
    url: '/production/plan-this-week',
  };
}

/** Events whose lead date has arrived and which haven't started. Callers drop already-sent ones. */
export function eventLeadPayloads(runDate: string, events: ReminderEvent[]): PushPayload[] {
  return events
    .filter((ev) => {
      if (!ev.active) return false;
      const lead = leadDate(ev);
      return lead !== null && runDate >= lead && runDate < ev.starts_on;
    })
    .map((ev) => ({
      kind: 'event_lead' as const,
      ref: ev.id,
      title: `${ev.name} starts ${shortDate(ev.starts_on)}`,
      body: 'Time to plan production for it.',
      url: `/events/${ev.id}`,
    }));
}

export function buildRunPayloads(runDate: string, orders: DueOrder[], events: ReminderEvent[]): PushPayload[] {
  const out: PushPayload[] = [];
  const o = buildOrdersPayload(runDate, orders);
  if (o) out.push(o);
  const w = buildWeeklyPlanPayload(runDate);
  if (w) out.push(w);
  out.push(...eventLeadPayloads(runDate, events));
  return out;
}
