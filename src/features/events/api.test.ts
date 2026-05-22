import { describe, it, expect, vi, beforeEach } from 'vitest';

const fromMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
}));

// Pin "today" so starts_on comparisons are deterministic. The api uses
// todayInTz() which derives from `new Date()`; freezing system time gives
// us a stable Asia/Kolkata day regardless of when the suite runs.
vi.mock('@/lib/utils', () => ({
  todayInTz: () => '2026-05-22',
  cn: (...args: unknown[]) => args.join(' '),
}));

import {
  createEvent,
  maybeSnapshotEvent,
  maybeUnfreezeEvent,
  duplicateEvent,
} from './api';

beforeEach(() => fromMock.mockReset());

// ---------------------------------------------------------------------------
// Helpers to build the chained-builder mocks the supabase client returns.
// ---------------------------------------------------------------------------

/** A `from('events').insert(...).select('id').single()` chain that resolves
 *  to the given { data, error }. Records the insert payload via insertSpy. */
function mockInsertSingle(
  insertSpy: ReturnType<typeof vi.fn>,
  result: { data: { id: string } | null; error: { code?: string; message: string } | null },
) {
  const single = vi.fn().mockResolvedValueOnce(result);
  const select = vi.fn(() => ({ single }));
  insertSpy.mockImplementationOnce((payload: unknown) => {
    // Side-channel record so the test can assert on the payload.
    (insertSpy as unknown as { calls: unknown[] }).calls = [
      ...(((insertSpy as unknown as { calls?: unknown[] }).calls) ?? []),
      payload,
    ];
    return { select };
  });
  return { single, select };
}

// ---------------------------------------------------------------------------
// 1. createEvent (exhibition, no slug) derives slugify(name, year).
// ---------------------------------------------------------------------------

describe('createEvent', () => {
  it('derives slug for exhibition with null slug from name + year(starts_on)', async () => {
    const insertSpy = vi.fn();
    mockInsertSingle(insertSpy, { data: { id: 'ev1' }, error: null });
    // After insert, maybeSnapshotEvent fetches the event's starts_on.
    // Return a future date so it returns early (no demand work).
    const evMaybeSingle = vi.fn().mockResolvedValueOnce({
      data: { starts_on: '2026-11-04' },
      error: null,
    });
    const evEq = vi.fn(() => ({ maybeSingle: evMaybeSingle }));
    const evSelect = vi.fn(() => ({ eq: evEq }));

    fromMock
      .mockReturnValueOnce({ insert: insertSpy }) // initial insert
      .mockReturnValueOnce({ select: evSelect }); // maybeSnapshotEvent SELECT

    const id = await createEvent({
      name: 'Diwali Fair Aundh',
      kind: 'exhibition',
      starts_on: '2026-11-04',
      ends_on: '2026-11-06',
      lead_weeks: 1,
      slug: null,
      active: true,
      pickup_window_start: null,
      pickup_window_end: null,
      venue_line: null,
    });

    expect(id).toBe('ev1');
    const payloads = (insertSpy as unknown as { calls: { slug: string }[] }).calls;
    expect(payloads[0]?.slug).toBe('diwali-fair-aundh-2026');
  });

  it('keeps slug null for festivals regardless of name', async () => {
    const insertSpy = vi.fn();
    mockInsertSingle(insertSpy, { data: { id: 'ev2' }, error: null });
    const evMaybeSingle = vi.fn().mockResolvedValueOnce({
      data: { starts_on: '2026-11-04' },
      error: null,
    });
    const evEq = vi.fn(() => ({ maybeSingle: evMaybeSingle }));
    const evSelect = vi.fn(() => ({ eq: evEq }));

    fromMock
      .mockReturnValueOnce({ insert: insertSpy })
      .mockReturnValueOnce({ select: evSelect });

    await createEvent({
      name: 'Diwali 2026',
      kind: 'festival',
      starts_on: '2026-11-04',
      ends_on: '2026-11-04',
      lead_weeks: 3,
      slug: null,
      active: true,
      pickup_window_start: null,
      pickup_window_end: null,
      venue_line: null,
    });

    const payloads = (insertSpy as unknown as { calls: { slug: string | null }[] }).calls;
    expect(payloads[0]?.slug).toBeNull();
  });

  it('retries with bumpSlug(base, 2) on 23505 unique-violation and succeeds', async () => {
    const insertSpy = vi.fn();
    // First attempt: 23505.
    mockInsertSingle(insertSpy, {
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });
    // Second attempt: success.
    mockInsertSingle(insertSpy, { data: { id: 'ev3' }, error: null });
    // maybeSnapshotEvent — future date so it short-circuits.
    const evMaybeSingle = vi.fn().mockResolvedValueOnce({
      data: { starts_on: '2026-11-04' },
      error: null,
    });
    const evEq = vi.fn(() => ({ maybeSingle: evMaybeSingle }));
    const evSelect = vi.fn(() => ({ eq: evEq }));

    fromMock
      .mockReturnValueOnce({ insert: insertSpy }) // attempt 1 (fails 23505)
      .mockReturnValueOnce({ insert: insertSpy }) // attempt 2 (succeeds)
      .mockReturnValueOnce({ select: evSelect }); // maybeSnapshotEvent SELECT

    const id = await createEvent({
      name: 'Diwali Fair Aundh',
      kind: 'exhibition',
      starts_on: '2026-11-04',
      ends_on: '2026-11-06',
      lead_weeks: 1,
      slug: null,
      active: true,
      pickup_window_start: null,
      pickup_window_end: null,
      venue_line: null,
    });

    expect(id).toBe('ev3');
    const payloads = (insertSpy as unknown as { calls: { slug: string }[] }).calls;
    expect(payloads).toHaveLength(2);
    expect(payloads[0]?.slug).toBe('diwali-fair-aundh-2026');
    expect(payloads[1]?.slug).toBe('diwali-fair-aundh-2026-2');
  });
});

// ---------------------------------------------------------------------------
// 4. maybeSnapshotEvent — past/in-progress + NULL committed -> UPDATE per row.
// ---------------------------------------------------------------------------

describe('maybeSnapshotEvent', () => {
  it('copies expected_qty -> committed_expected_qty for each NULL-committed row when starts_on <= today', async () => {
    // SELECT events
    const evMaybeSingle = vi.fn().mockResolvedValueOnce({
      data: { starts_on: '2026-05-20' }, // past relative to mocked today=2026-05-22
      error: null,
    });
    const evEq = vi.fn(() => ({ maybeSingle: evMaybeSingle }));
    const evSelect = vi.fn(() => ({ eq: evEq }));

    // SELECT event_demand WHERE committed_expected_qty IS NULL
    const demandIs = vi.fn().mockResolvedValueOnce({
      data: [
        { product_id: 'p1', expected_qty: 5 },
        { product_id: 'p2', expected_qty: 8 },
      ],
      error: null,
    });
    const demandEq = vi.fn(() => ({ is: demandIs }));
    const demandSelect = vi.fn(() => ({ eq: demandEq }));

    // Two UPDATEs (one per row).
    const updateSpies: ReturnType<typeof vi.fn>[] = [];
    function makeUpdateChain() {
      const updateSpy = vi.fn();
      const eq2 = vi.fn().mockResolvedValueOnce({ error: null });
      const eq1 = vi.fn(() => ({ eq: eq2 }));
      updateSpy.mockReturnValueOnce({ eq: eq1 });
      updateSpies.push(updateSpy);
      return { update: updateSpy };
    }

    fromMock
      .mockReturnValueOnce({ select: evSelect }) // events SELECT
      .mockReturnValueOnce({ select: demandSelect }) // event_demand SELECT
      .mockReturnValueOnce(makeUpdateChain()) // UPDATE row 1
      .mockReturnValueOnce(makeUpdateChain()); // UPDATE row 2

    await maybeSnapshotEvent('ev1');

    expect(updateSpies).toHaveLength(2);
    expect(updateSpies[0]).toHaveBeenCalledWith({ committed_expected_qty: 5 });
    expect(updateSpies[1]).toHaveBeenCalledWith({ committed_expected_qty: 8 });
  });
});

// ---------------------------------------------------------------------------
// 5. maybeUnfreezeEvent — future starts_on + non-null committed -> bulk NULL update.
// ---------------------------------------------------------------------------

describe('maybeUnfreezeEvent', () => {
  it('resets committed_expected_qty to null when starts_on > today', async () => {
    const evMaybeSingle = vi.fn().mockResolvedValueOnce({
      data: { starts_on: '2026-12-01' }, // future relative to mocked today=2026-05-22
      error: null,
    });
    const evEq = vi.fn(() => ({ maybeSingle: evMaybeSingle }));
    const evSelect = vi.fn(() => ({ eq: evEq }));

    // UPDATE event_demand SET committed_expected_qty = null WHERE event_id = ? AND committed IS NOT NULL
    const updateSpy = vi.fn();
    const updNot = vi.fn().mockResolvedValueOnce({ error: null });
    const updEq = vi.fn(() => ({ not: updNot }));
    updateSpy.mockReturnValueOnce({ eq: updEq });

    fromMock
      .mockReturnValueOnce({ select: evSelect }) // events SELECT
      .mockReturnValueOnce({ update: updateSpy }); // event_demand UPDATE

    await maybeUnfreezeEvent('ev1');

    expect(updateSpy).toHaveBeenCalledWith({ committed_expected_qty: null });
    expect(updEq).toHaveBeenCalledWith('event_id', 'ev1');
    expect(updNot).toHaveBeenCalledWith('committed_expected_qty', 'is', null);
  });
});

// ---------------------------------------------------------------------------
// 6. duplicateEvent — nextYearName, copy demand rows with NULL committed.
// ---------------------------------------------------------------------------

describe('duplicateEvent', () => {
  it('bumps year in name and copies demand rows (expected_qty, notes) without committed_expected_qty', async () => {
    // SELECT old event
    const oldMaybeSingle = vi.fn().mockResolvedValueOnce({
      data: {
        id: 'ev1',
        name: 'Diwali 2026',
        kind: 'exhibition',
        starts_on: '2026-11-04',
        ends_on: '2026-11-06',
        lead_weeks: 1,
        slug: 'diwali-2026',
        active: true,
        pickup_window_start: null,
        pickup_window_end: null,
        venue_line: '12 Aundh Rd',
        created_at: '2026-05-01T00:00:00Z',
      },
      error: null,
    });
    const oldEq = vi.fn(() => ({ maybeSingle: oldMaybeSingle }));
    const oldSelect = vi.fn(() => ({ eq: oldEq }));

    // INSERT new event
    const newInsertSpy = vi.fn();
    const newSingle = vi.fn().mockResolvedValueOnce({ data: { id: 'ev2' }, error: null });
    const newSelectAfterInsert = vi.fn(() => ({ single: newSingle }));
    newInsertSpy.mockImplementationOnce((payload: unknown) => {
      (newInsertSpy as unknown as { payload: unknown }).payload = payload;
      return { select: newSelectAfterInsert };
    });

    // SELECT old event_demand
    const dmEq = vi.fn().mockResolvedValueOnce({
      data: [
        { product_id: 'p1', expected_qty: 10, notes: 'box of 12' },
        { product_id: 'p2', expected_qty: 4, notes: null },
      ],
      error: null,
    });
    const dmSelect = vi.fn(() => ({ eq: dmEq }));

    // INSERT new event_demand rows
    const dmInsertSpy = vi.fn().mockResolvedValueOnce({ error: null });

    fromMock
      .mockReturnValueOnce({ select: oldSelect }) // events SELECT
      .mockReturnValueOnce({ insert: newInsertSpy }) // events INSERT new
      .mockReturnValueOnce({ select: dmSelect }) // event_demand SELECT old
      .mockReturnValueOnce({ insert: dmInsertSpy }); // event_demand INSERT new

    const newId = await duplicateEvent('ev1');

    expect(newId).toBe('ev2');
    const newEventPayload = (newInsertSpy as unknown as {
      payload: { name: string; slug: string | null; starts_on: string; ends_on: string };
    }).payload;
    expect(newEventPayload.name).toBe('Diwali 2027');
    expect(newEventPayload.slug).toBeNull();
    // tomorrow relative to mocked today=2026-05-22
    expect(newEventPayload.starts_on).toBe('2026-05-23');
    expect(newEventPayload.ends_on).toBe('2026-05-23');

    // Demand rows copied with notes; no committed_expected_qty field present
    // so it defaults to NULL in the DB.
    expect(dmInsertSpy).toHaveBeenCalledWith([
      { event_id: 'ev2', product_id: 'p1', expected_qty: 10, notes: 'box of 12' },
      { event_id: 'ev2', product_id: 'p2', expected_qty: 4, notes: null },
    ]);
    const dmCallArg = dmInsertSpy.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
    for (const row of dmCallArg) {
      expect(row).not.toHaveProperty('committed_expected_qty');
    }
  });
});
