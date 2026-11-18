import {
  addDays,
  buildOrdersPayload,
  buildRunPayloads,
  buildWeeklyPlanPayload,
  eventLeadPayloads,
  formatQty,
  formatTotal,
  leadDate,
  nextWorkingDays,
  packSize,
  reminderWindow,
  productTotals,
  shortWeekday,
  type DueOrder,
  type ReminderEvent,
} from '@shared/reminders';

function order(
  id: string,
  day: string,
  customer: string,
  items: [string, number, string?][],
  ordered_at = `2026-11-01T0${id.length}:00:00Z`,
): DueOrder {
  return {
    id,
    ordered_at,
    target_fulfilment_date: day,
    customer_name: customer,
    items: items.map(([product_name, qty, unit]) => ({ product_name, qty, unit: unit ?? '250 gm' })),
  };
}

function event(over: Partial<ReminderEvent> = {}): ReminderEvent {
  return {
    id: 'ev1',
    name: 'Diwali Mela',
    starts_on: '2026-12-05',
    ends_on: '2026-12-07',
    lead_weeks: 2,
    active: true,
    ...over,
  };
}

describe('date helpers', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('names weekdays', () => {
    expect(shortWeekday('2026-11-24')).toBe('Tue');
    expect(shortWeekday('2026-11-29')).toBe('Sun');
  });

  it('formats quantities without trailing zeros', () => {
    expect(formatQty(2.5)).toBe('2.5');
    expect(formatQty(500)).toBe('500');
    expect(formatQty(0.25)).toBe('0.25');
    expect(formatQty(1.0)).toBe('1');
    expect(formatQty(0.1 + 0.2)).toBe('0.3');
  });
});

describe('nextWorkingDays (Mon–Sat)', () => {
  it('Mon → Tue, Wed', () => expect(nextWorkingDays('2026-11-23', 2)).toEqual(['2026-11-24', '2026-11-25']));
  it('Fri → Sat, Mon', () => expect(nextWorkingDays('2026-11-27', 2)).toEqual(['2026-11-28', '2026-11-30']));
  it('Sat → Mon, Tue', () => expect(nextWorkingDays('2026-11-28', 2)).toEqual(['2026-11-30', '2026-12-01']));
  it('Sun → Mon, Tue', () => expect(nextWorkingDays('2026-11-29', 2)).toEqual(['2026-11-30', '2026-12-01']));
});

describe('reminderWindow (through the 2nd working day, Sundays included)', () => {
  it('Mon → Tue, Wed', () => expect(reminderWindow('2026-11-23')).toEqual(['2026-11-24', '2026-11-25']));
  it('Thu → Fri, Sat', () => expect(reminderWindow('2026-11-26')).toEqual(['2026-11-27', '2026-11-28']));
  it('Fri → Sat, Sun, Mon', () =>
    expect(reminderWindow('2026-11-27')).toEqual(['2026-11-28', '2026-11-29', '2026-11-30']));
  it('Sat → Sun, Mon, Tue', () =>
    expect(reminderWindow('2026-11-28')).toEqual(['2026-11-29', '2026-11-30', '2026-12-01']));
});

describe('leadDate', () => {
  it('is starts_on minus lead weeks', () => {
    // 2026-12-05 is a Saturday; minus 14 days = Sat 2026-11-21
    expect(leadDate(event())).toBe('2026-11-21');
  });
  it('shifts a Sunday lead date to the Saturday before', () => {
    // starts Sun 2026-12-06, 1 week lead → Sun 2026-11-29 → Sat 2026-11-28
    expect(leadDate(event({ starts_on: '2026-12-06', ends_on: '2026-12-06', lead_weeks: 1 }))).toBe('2026-11-28');
  });
  it('is null when lead_weeks is 0', () => {
    expect(leadDate(event({ lead_weeks: 0 }))).toBeNull();
  });
});

describe('packSize', () => {
  it('normalises hand-typed gram sizes and passes others through', () => {
    expect(packSize('250 gm')).toBe('250 gm');
    expect(packSize('200gm')).toBe('200 gm');
    expect(packSize('125')).toBe('125 gm');
    expect(packSize(' 500 g ')).toBe('500 gm');
    expect(packSize('1 kg')).toBe('1 kg');
    expect(packSize('box')).toBe('box');
  });
});

describe('productTotals', () => {
  it('sums packs per product and pack size, sorts by qty desc then name', () => {
    const totals = productTotals([
      order('a', '2026-11-24', 'A', [['Chakli', 2], ['Chivda', 1, '200 gm']]),
      order('b', '2026-11-24', 'B', [['Chakli', 1], ['Bhakarwadi', 1], ['Chakli', 1, '500 gm']]),
    ]);
    expect(totals).toEqual([
      { product_name: 'Chakli', unit: '250 gm', qty: 3 },
      { product_name: 'Bhakarwadi', unit: '250 gm', qty: 1 },
      { product_name: 'Chakli', unit: '500 gm', qty: 1 },
      { product_name: 'Chivda', unit: '200 gm', qty: 1 },
    ]);
  });

  it('treats "125" and "125 gm" as the same pack', () => {
    const totals = productTotals([
      order('a', '2026-11-24', 'A', [['Chirote', 2, '125']]),
      order('b', '2026-11-24', 'B', [['Chirote', 1, '125 gm']]),
    ]);
    expect(totals).toEqual([{ product_name: 'Chirote', unit: '125 gm', qty: 3 }]);
  });

  it('formats a total as packs × size', () => {
    expect(formatTotal({ product_name: 'Chakli', unit: '250 gm', qty: 4 })).toBe('Chakli 4 × 250 gm');
    expect(formatTotal({ product_name: 'Chakli', unit: '', qty: 4 })).toBe('Chakli 4');
  });
});

describe('buildOrdersPayload', () => {
  // Run on Mon 2026-11-23 → window Tue 24, Wed 25
  const run = '2026-11-23';

  it('matches the spec example', () => {
    const p = buildOrdersPayload(run, [
      order('1', '2026-11-24', 'Sharma Stores', [['Chakli', 2], ['Chivda', 1, '200 gm']], '2026-11-20T04:00:00Z'),
      order('2', '2026-11-24', 'Meena', [['Chakli', 1]], '2026-11-21T04:00:00Z'),
      order('3', '2026-11-25', 'Joshi Kirana', [['Shankarpali', 5, '125 gm']], '2026-11-21T05:00:00Z'),
    ]);
    expect(p).toEqual({
      kind: 'orders',
      ref: run,
      title: 'Tue: 2 orders · Wed: 1 order',
      body: [
        'Tue — Sharma Stores, Meena · Wed — Joshi Kirana',
        'Tue: Chakli 3 × 250 gm, Chivda 1 × 200 gm',
        'Wed: Shankarpali 5 × 125 gm',
      ].join('\n'),
      url: '/calendar?date=2026-11-24',
    });
  });

  it('omits a day with no orders and links to the first listed day', () => {
    const p = buildOrdersPayload(run, [order('3', '2026-11-25', 'Joshi Kirana', [['Chakli', 1]])]);
    expect(p?.title).toBe('Wed: 1 order');
    expect(p?.body).toBe('Wed — Joshi Kirana\nWed: Chakli 1 × 250 gm');
    expect(p?.url).toBe('/calendar?date=2026-11-25');
  });

  it('ignores orders outside the window and returns null when nothing is due', () => {
    expect(
      buildOrdersPayload(run, [
        order('x', '2026-11-23', 'Today Co', [['Chakli', 1]]),
        order('y', '2026-11-26', 'Thursday Co', [['Chakli', 1]]),
      ]),
    ).toBeNull();
  });

  it('lists a repeat customer once, ordered by earliest order', () => {
    const p = buildOrdersPayload(run, [
      order('1', '2026-11-24', 'Meena', [['Chakli', 1]], '2026-11-22T04:00:00Z'),
      order('2', '2026-11-24', 'Sharma', [['Chakli', 1]], '2026-11-20T04:00:00Z'),
      order('3', '2026-11-24', 'Meena', [['Chakli', 1]], '2026-11-19T04:00:00Z'),
    ]);
    expect(p?.title).toBe('Tue: 3 orders');
    expect(p?.body.split('\n')[0]).toBe('Tue — Meena, Sharma');
  });

  it('caps customers at 8 across both days', () => {
    const orders = Array.from({ length: 10 }, (_, i) =>
      order(`o${i}`, '2026-11-24', `C${i}`, [['Chakli', 1]], `2026-11-20T0${i}:00:00Z`),
    );
    const first = buildOrdersPayload(run, orders)?.body.split('\n')[0];
    expect(first).toBe('Tue — C0, C1, C2, C3, C4, C5, C6, C7 +2 more');
  });

  it('caps products per day at 5', () => {
    const p = buildOrdersPayload(run, [
      order('1', '2026-11-24', 'A', [['P1', 7], ['P2', 6], ['P3', 5], ['P4', 4], ['P5', 3], ['P6', 2], ['P7', 1]]),
    ]);
    expect(p?.body.split('\n')[1]).toBe('Tue: P1 7 × 250 gm, P2 6 × 250 gm, P3 5 × 250 gm, P4 4 × 250 gm, P5 3 × 250 gm +2 more');
  });
});

describe('buildOrdersPayload with a Sunday in the window', () => {
  it('a Saturday run lists a Sunday order first', () => {
    const p = buildOrdersPayload('2026-11-28', [
      order('1', '2026-11-29', 'Sunday Co', [['Chakli', 1]]),
      order('2', '2026-12-01', 'Tuesday Co', [['Chakli', 2]]),
    ]);
    expect(p?.title).toBe('Sun: 1 order · Tue: 1 order');
    expect(p?.url).toBe('/calendar?date=2026-11-29');
  });
});

describe('buildWeeklyPlanPayload', () => {
  it('fires on Monday only', () => {
    expect(buildWeeklyPlanPayload('2026-11-23')).toEqual({
      kind: 'weekly_plan',
      ref: '2026-11-23',
      title: "Plan this week's production",
      body: "Tap to set this week's targets.",
      url: '/production/plan-this-week',
    });
    expect(buildWeeklyPlanPayload('2026-11-24')).toBeNull();
  });
});

describe('eventLeadPayloads', () => {
  it('fires from the lead date until the day before the event', () => {
    expect(eventLeadPayloads('2026-11-20', [event()])).toEqual([]);
    expect(eventLeadPayloads('2026-11-21', [event()])).toEqual([
      {
        kind: 'event_lead',
        ref: 'ev1',
        title: 'Diwali Mela starts Sat 5 Dec',
        body: 'Time to plan production for it.',
        url: '/events/ev1',
      },
    ]);
    // catch-up: created after its lead date
    expect(eventLeadPayloads('2026-12-01', [event()])).toHaveLength(1);
    expect(eventLeadPayloads('2026-12-05', [event()])).toEqual([]);
  });

  it('skips inactive events and zero lead weeks', () => {
    expect(eventLeadPayloads('2026-11-25', [event({ active: false })])).toEqual([]);
    expect(eventLeadPayloads('2026-12-04', [event({ lead_weeks: 0 })])).toEqual([]);
  });
});

describe('buildRunPayloads', () => {
  it('returns orders, weekly and event payloads together on a Monday', () => {
    const kinds = buildRunPayloads(
      '2026-11-23',
      [order('1', '2026-11-24', 'A', [['Chakli', 1]])],
      [event()],
    ).map((p) => p.kind);
    expect(kinds).toEqual(['orders', 'weekly_plan', 'event_lead']);
  });
});
