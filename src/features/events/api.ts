import { supabase } from '@/lib/supabase';
import { todayInTz } from '@/lib/utils';
import { slugify, bumpSlug, nextYearName } from './eventLogic';

export type EventRow = {
  id: string;
  name: string;
  kind: 'festival' | 'exhibition' | 'other';
  starts_on: string; // YYYY-MM-DD
  ends_on: string; // YYYY-MM-DD
  lead_weeks: number;
  slug: string | null;
  active: boolean;
  pickup_window_start: string | null; // ISO timestamptz
  pickup_window_end: string | null;
  venue_line: string | null;
  created_at: string;
};

export type EventDemandRow = {
  event_id: string;
  product_id: string;
  expected_qty: number;
  committed_expected_qty: number | null;
  notes: string | null;
};

export type EventListItem = EventRow & {
  product_demand_count: number; // count of event_demand rows where expected_qty > 0
};

export type EventFilter = 'upcoming' | 'past' | 'all';

const EVENT_COLS =
  'id, name, kind, starts_on, ends_on, lead_weeks, slug, active, pickup_window_start, pickup_window_end, venue_line, created_at';

type RawEventWithDemand = EventRow & {
  event_demand: { expected_qty: number }[] | null;
};

function toListItem(r: RawEventWithDemand): EventListItem {
  const demand = r.event_demand ?? [];
  const product_demand_count = demand.filter((d) => Number(d.expected_qty) > 0).length;
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    starts_on: r.starts_on,
    ends_on: r.ends_on,
    lead_weeks: r.lead_weeks,
    slug: r.slug,
    active: r.active,
    pickup_window_start: r.pickup_window_start,
    pickup_window_end: r.pickup_window_end,
    venue_line: r.venue_line,
    created_at: r.created_at,
    product_demand_count,
  };
}

/** List events scoped by filter and sorted per spec. */
export async function listEvents(filter: EventFilter): Promise<EventListItem[]> {
  const today = todayInTz();
  let q = supabase.from('events').select(`${EVENT_COLS}, event_demand(expected_qty)`);

  if (filter === 'upcoming') {
    q = q.gte('ends_on', today).order('starts_on', { ascending: true });
  } else if (filter === 'past') {
    q = q.lt('ends_on', today).order('ends_on', { ascending: false });
  } else {
    q = q.order('starts_on', { ascending: false });
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data as unknown as RawEventWithDemand[]).map(toListItem);
}

/** Single event + its demand rows. */
export async function getEventDetail(
  id: string,
): Promise<{ event: EventRow; demand: EventDemandRow[] } | null> {
  const { data: evData, error: evErr } = await supabase
    .from('events')
    .select(EVENT_COLS)
    .eq('id', id)
    .maybeSingle();
  if (evErr) throw new Error(evErr.message);
  if (!evData) return null;

  const { data: dmData, error: dmErr } = await supabase
    .from('event_demand')
    .select('event_id, product_id, expected_qty, committed_expected_qty, notes')
    .eq('event_id', id);
  if (dmErr) throw new Error(dmErr.message);

  return {
    event: evData as unknown as EventRow,
    demand: (dmData ?? []) as unknown as EventDemandRow[],
  };
}

/** Insert; for exhibition with no slug, derive slugify(name, year-of-starts_on) and
 *  retry up to 5 times on 23505 (unique violation) by appending bumpSlug(base, attempt).
 *  After insert, call maybeSnapshotEvent(newId). Returns the new event id. */
export async function createEvent(input: {
  name: string;
  kind: 'festival' | 'exhibition' | 'other';
  starts_on: string;
  ends_on: string;
  lead_weeks: number;
  slug: string | null;
  active: boolean;
  pickup_window_start: string | null;
  pickup_window_end: string | null;
  venue_line: string | null;
}): Promise<string> {
  const shouldDerive =
    input.kind === 'exhibition' && input.slug == null && !!input.name && !!input.starts_on;

  if (!shouldDerive) {
    // Festivals must always store slug=null (schema constraint). Other kinds
    // and exhibition-with-explicit-slug fall through here unchanged.
    const slug = input.kind === 'festival' ? null : input.slug;
    const { data, error } = await supabase
      .from('events')
      .insert({ ...input, slug })
      .select('id')
      .single();
    if (error || !data) throw new Error(error?.message ?? 'event insert failed');
    await maybeSnapshotEvent(data.id);
    return data.id;
  }

  const base = slugify(input.name, new Date(input.starts_on).getUTCFullYear());
  // attempt = 1 uses base; attempts 2..5 use bumpSlug(base, attempt).
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const candidate = attempt === 1 ? base : bumpSlug(base, attempt);
    const { data, error } = await supabase
      .from('events')
      .insert({ ...input, slug: candidate })
      .select('id')
      .single();
    if (error) {
      if (error.code === '23505') continue;
      throw new Error(error.message);
    }
    if (!data) throw new Error('event insert returned no row');
    await maybeSnapshotEvent(data.id);
    return data.id;
  }
  throw new Error(`Could not allocate a unique slug for "${input.name}" after 5 attempts`);
}

/** Patch event; after update, call maybeSnapshotEvent(id) then maybeUnfreezeEvent(id). */
export async function updateEvent(
  id: string,
  patch: Partial<Omit<EventRow, 'id' | 'created_at'>>,
): Promise<void> {
  const { error } = await supabase.from('events').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
  await maybeSnapshotEvent(id);
  await maybeUnfreezeEvent(id);
}

export async function deleteEvent(id: string): Promise<void> {
  // Hard delete; event_demand cascades on FK delete (already configured in schema).
  const { error } = await supabase.from('events').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function upsertEventDemand(
  eventId: string,
  productId: string,
  expectedQty: number,
  notes: string | null = null,
): Promise<void> {
  const { data: existing, error: selErr } = await supabase
    .from('event_demand')
    .select('event_id')
    .eq('event_id', eventId)
    .eq('product_id', productId)
    .maybeSingle();
  if (selErr) throw new Error(selErr.message);

  if (existing) {
    // Never touch committed_expected_qty on UPDATE.
    const { error } = await supabase
      .from('event_demand')
      .update({ expected_qty: expectedQty, notes })
      .eq('event_id', eventId)
      .eq('product_id', productId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('event_demand').insert({
      event_id: eventId,
      product_id: productId,
      expected_qty: expectedQty,
      notes,
    });
    if (error) throw new Error(error.message);
  }
}

export async function deleteEventDemand(eventId: string, productId: string): Promise<void> {
  const { error } = await supabase
    .from('event_demand')
    .delete()
    .eq('event_id', eventId)
    .eq('product_id', productId);
  if (error) throw new Error(error.message);
}

/** If starts_on <= today AND any event_demand row has committed_expected_qty IS NULL,
 *  copy each row's expected_qty -> committed_expected_qty. App-level write inside
 *  one logical save; trigger backstops immutability. */
export async function maybeSnapshotEvent(eventId: string): Promise<void> {
  const { data: ev, error: evErr } = await supabase
    .from('events')
    .select('starts_on')
    .eq('id', eventId)
    .maybeSingle();
  if (evErr) throw new Error(evErr.message);
  if (!ev) return;
  if (ev.starts_on > todayInTz()) return;

  const { data: rows, error: dmErr } = await supabase
    .from('event_demand')
    .select('product_id, expected_qty')
    .eq('event_id', eventId)
    .is('committed_expected_qty', null);
  if (dmErr) throw new Error(dmErr.message);

  for (const r of rows ?? []) {
    const { error } = await supabase
      .from('event_demand')
      .update({ committed_expected_qty: Number(r.expected_qty) })
      .eq('event_id', eventId)
      .eq('product_id', r.product_id);
    if (error) throw new Error(error.message);
  }
}

/** If starts_on > today AND any row has committed_expected_qty IS NOT NULL,
 *  reset committed_expected_qty = NULL on those rows. 0006 migration allows this. */
export async function maybeUnfreezeEvent(eventId: string): Promise<void> {
  const { data: ev, error: evErr } = await supabase
    .from('events')
    .select('starts_on')
    .eq('id', eventId)
    .maybeSingle();
  if (evErr) throw new Error(evErr.message);
  if (!ev) return;
  if (ev.starts_on <= todayInTz()) return;

  const { error } = await supabase
    .from('event_demand')
    .update({ committed_expected_qty: null })
    .eq('event_id', eventId)
    .not('committed_expected_qty', 'is', null);
  if (error) throw new Error(error.message);
}

/** Duplicate event: insert new event with nextYearName(old.name), same kind/lead_weeks,
 *  starts_on = ends_on = today+1 (placeholder; mom edits), slug = null (re-derived on next save),
 *  active = true, pickup/venue copied. Then copy event_demand rows (expected_qty,
 *  notes) for the new event. committed_expected_qty stays NULL on the new rows.
 *  Returns the new event id. */
export async function duplicateEvent(id: string): Promise<string> {
  const { data: old, error: oldErr } = await supabase
    .from('events')
    .select(EVENT_COLS)
    .eq('id', id)
    .maybeSingle();
  if (oldErr) throw new Error(oldErr.message);
  if (!old) throw new Error('event not found');
  const oldRow = old as unknown as EventRow;

  const today = todayInTz();
  const tomorrowMs = new Date(`${today}T00:00:00Z`).getTime() + 86400000;
  const tomorrow = new Date(tomorrowMs).toISOString().slice(0, 10);

  const { data: created, error: insErr } = await supabase
    .from('events')
    .insert({
      name: nextYearName(oldRow.name),
      kind: oldRow.kind,
      starts_on: tomorrow,
      ends_on: tomorrow,
      lead_weeks: oldRow.lead_weeks,
      slug: null,
      active: true,
      pickup_window_start: oldRow.pickup_window_start,
      pickup_window_end: oldRow.pickup_window_end,
      venue_line: oldRow.venue_line,
    })
    .select('id')
    .single();
  if (insErr || !created) throw new Error(insErr?.message ?? 'duplicate event insert failed');
  const newId = created.id;

  const { data: oldDemand, error: dmErr } = await supabase
    .from('event_demand')
    .select('product_id, expected_qty, notes')
    .eq('event_id', id);
  if (dmErr) throw new Error(dmErr.message);

  const rows = (oldDemand ?? []).map((d) => ({
    event_id: newId,
    product_id: d.product_id,
    expected_qty: Number(d.expected_qty),
    notes: d.notes,
  }));
  if (rows.length > 0) {
    const { error: insDmErr } = await supabase.from('event_demand').insert(rows);
    if (insDmErr) throw new Error(insDmErr.message);
  }
  return newId;
}

/** For Production screen's UpcomingEventsSection. starts_on >= todayInTz(),
 *  sorted ASC. Includes product_demand_count like listEvents. */
export async function listUpcomingEvents(): Promise<EventListItem[]> {
  const today = todayInTz();
  const { data, error } = await supabase
    .from('events')
    .select(`${EVENT_COLS}, event_demand(expected_qty)`)
    .gte('starts_on', today)
    .order('starts_on', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as unknown as RawEventWithDemand[]).map(toListItem);
}

/** For AddCustomerPage's source_event_id dropdown when channel=Exhibition.
 *  kind=exhibition AND active AND today in [starts_on, ends_on]. */
export async function listInProgressExhibitions(): Promise<EventRow[]> {
  const today = todayInTz();
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_COLS)
    .eq('kind', 'exhibition')
    .eq('active', true)
    .lte('starts_on', today)
    .gte('ends_on', today)
    .order('starts_on', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as EventRow[];
}

/** For the expected-demand grid on EventDetailPage.
 *  Active in-house products only (active=true, is_aggregated=false). */
export async function listActiveInHouseProducts(): Promise<
  { id: string; name: string; unit: string }[]
> {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, unit')
    .eq('active', true)
    .eq('is_aggregated', false)
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; name: string; unit: string }[];
}
