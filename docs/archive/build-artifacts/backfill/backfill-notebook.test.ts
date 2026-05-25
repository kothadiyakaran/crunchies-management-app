/**
 * Tests for scripts/backfill-notebook.ts.
 *
 * Uses a hand-rolled fake SupabaseClient. Supabase's PostgREST builder is
 * chainable + thenable — we mimic that surface, recording every call so tests
 * can assert "no inserts in dry-run" etc.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseCsv,
  validateAndParseRows,
  groupRowsIntoOrders,
  fingerprintItems,
  parseCliArgs,
  runBackfill,
  cleanPhone,
  isValidIndianMobile,
  type DbClient,
} from './backfill-notebook';

// -------------------- fake supabase --------------------

type TableState = {
  rows: Record<string, unknown>[];
};

/** Records every method call. Used by tests to assert what was/wasn't called. */
type CallLog = { table: string; op: string; args?: unknown[]; payload?: unknown }[];

/**
 * Builds a minimal fake supabase client. Each `.from(table)` returns a chainable
 * builder. The builder records its filters and resolves to {data, error} when
 * awaited (or .single/.maybeSingle is called).
 */
function makeFakeDb(initial: Record<string, Record<string, unknown>[]>): {
  db: DbClient;
  state: Record<string, TableState>;
  calls: CallLog;
} {
  const state: Record<string, TableState> = {};
  for (const [k, v] of Object.entries(initial)) {
    state[k] = { rows: [...v] };
  }
  const calls: CallLog = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fromFn = (table: string): any => {
    if (!state[table]) state[table] = { rows: [] };
    const tbl = state[table];

    type Filter = { kind: 'eq' | 'is' | 'gte' | 'lte'; col: string; val: unknown };
    const filters: Filter[] = [];
    let pendingInsert: Record<string, unknown> | Record<string, unknown>[] | null = null;
    let mode: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let returnSingle = false;
    let returnMaybe = false;
    let selectCols: string | null = null;

    const applyFilters = (rows: Record<string, unknown>[]): Record<string, unknown>[] => {
      return rows.filter((r) =>
        filters.every((f) => {
          if (f.kind === 'eq') return r[f.col] === f.val;
          if (f.kind === 'is') return r[f.col] === f.val; // f.val is null typically
          if (f.kind === 'gte') return String(r[f.col]) >= String(f.val);
          if (f.kind === 'lte') return String(r[f.col]) <= String(f.val);
          return true;
        }),
      );
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {
      select(cols?: string) {
        selectCols = cols ?? '*';
        calls.push({ table, op: 'select', args: [cols] });
        return builder;
      },
      insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
        mode = 'insert';
        pendingInsert = payload;
        calls.push({ table, op: 'insert', payload });
        return builder;
      },
      update(payload: Record<string, unknown>) {
        mode = 'update';
        pendingInsert = payload;
        calls.push({ table, op: 'update', payload });
        return builder;
      },
      delete() {
        mode = 'delete';
        calls.push({ table, op: 'delete' });
        return builder;
      },
      eq(col: string, val: unknown) {
        filters.push({ kind: 'eq', col, val });
        return builder;
      },
      is(col: string, val: unknown) {
        filters.push({ kind: 'is', col, val });
        return builder;
      },
      gte(col: string, val: unknown) {
        filters.push({ kind: 'gte', col, val });
        return builder;
      },
      lte(col: string, val: unknown) {
        filters.push({ kind: 'lte', col, val });
        return builder;
      },
      single() {
        returnSingle = true;
        return builder.then((res: { data: unknown[] | null; error: { message: string } | null }) => {
          if (res.error) return res;
          const arr = (res.data ?? []) as Record<string, unknown>[];
          return { data: arr[0] ?? null, error: null };
        });
      },
      maybeSingle() {
        returnMaybe = true;
        return builder.then((res: { data: unknown[] | null; error: { message: string } | null }) => {
          if (res.error) return res;
          const arr = (res.data ?? []) as Record<string, unknown>[];
          return { data: arr[0] ?? null, error: null };
        });
      },
      order() {
        return builder;
      },
      limit() {
        return builder;
      },
      or() {
        return builder;
      },
      then(onFulfilled: (value: { data: unknown; error: { message: string } | null }) => unknown) {
        const result = (() => {
          try {
            if (mode === 'select') {
              const rows = applyFilters(tbl.rows);
              // If select includes a joined table (parens), do a tiny join.
              if (selectCols && /\(/.test(selectCols)) {
                const joined = rows.map((r) => attachJoins(state, table, r, selectCols!));
                return { data: joined, error: null };
              }
              return { data: rows, error: null };
            }
            if (mode === 'insert') {
              const payloads = Array.isArray(pendingInsert) ? pendingInsert : [pendingInsert!];
              const inserted = payloads.map((p) => {
                const row = { id: `id-${tbl.rows.length + 1}-${table}`, ...p };
                tbl.rows.push(row);
                return row;
              });
              return { data: inserted, error: null };
            }
            if (mode === 'update') {
              const matched = applyFilters(tbl.rows);
              for (const r of matched) Object.assign(r, pendingInsert);
              return { data: matched, error: null };
            }
            if (mode === 'delete') {
              const matched = applyFilters(tbl.rows);
              tbl.rows = tbl.rows.filter((r) => !matched.includes(r));
              state[table] = tbl;
              return { data: matched, error: null };
            }
            return { data: null, error: null };
          } catch (e) {
            return { data: null, error: { message: (e as Error).message } };
          }
        })();
        return Promise.resolve(onFulfilled(result));
      },
    };
    // touch unused vars so eslint/ts don't gripe
    void returnSingle;
    void returnMaybe;
    return builder;
  };

  const db = { from: fromFn } as unknown as DbClient;
  return { db, state, calls };
}

/**
 * Minimal join handler: parses `order_items(product_id, qty)` style and copies
 * matching rows in under the same key on each row. Only handles `orders →
 * order_items` since that's the only join the script uses.
 */
function attachJoins(
  state: Record<string, TableState>,
  parentTable: string,
  row: Record<string, unknown>,
  selectCols: string,
): Record<string, unknown> {
  // Find joined-table expressions like `order_items(product_id, qty)`
  const m = selectCols.match(/(\w+)\(([^)]*)\)/g);
  if (!m) return row;
  const out = { ...row };
  for (const expr of m) {
    const name = expr.split('(')[0]!;
    if (parentTable === 'orders' && name === 'order_items') {
      const children = (state['order_items']?.rows ?? []).filter((c) => c['order_id'] === row['id']);
      out[name] = children;
    }
  }
  return out;
}

// -------------------- helper to capture logs --------------------

function makeLog(): { log: (s: string) => void; lines: string[] } {
  const lines: string[] = [];
  return { log: (s: string) => lines.push(s), lines };
}

// -------------------- pure-helper tests --------------------

describe('cleanPhone / isValidIndianMobile', () => {
  it('strips non-digits and +91 prefix', () => {
    expect(cleanPhone('+91 98765 43210')).toBe('9876543210');
    expect(cleanPhone('919876543210')).toBe('9876543210');
  });
  it('rejects bad phones', () => {
    expect(isValidIndianMobile('1234567890')).toBe(false); // starts with 1
    expect(isValidIndianMobile('98765')).toBe(false);
    expect(isValidIndianMobile('9876543210')).toBe(true);
  });
});

describe('parseCsv', () => {
  it('parses simple rows', () => {
    expect(parseCsv('a,b,c\n1,2,3\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });
  it('handles quoted fields with commas', () => {
    expect(parseCsv('a,b\n"hello, world",x\n')).toEqual([
      ['a', 'b'],
      ['hello, world', 'x'],
    ]);
  });
  it('handles escaped quotes', () => {
    expect(parseCsv('a\n"he said ""hi"""\n')).toEqual([['a'], ['he said "hi"']]);
  });
  it('throws on unbalanced quotes', () => {
    expect(() => parseCsv('a\n"unbalanced\n')).toThrow(/unbalanced/);
  });
});

describe('fingerprintItems', () => {
  it('is order-independent and excludes price', () => {
    const a = fingerprintItems([
      { product_id: 'p1', qty: 2 },
      { product_id: 'p2', qty: 1 },
    ]);
    const b = fingerprintItems([
      { product_id: 'p2', qty: 1 },
      { product_id: 'p1', qty: 2 },
    ]);
    expect(a).toBe(b);
  });
});

describe('groupRowsIntoOrders', () => {
  it('groups same-phone+date+name into one order', () => {
    const groups = groupRowsIntoOrders([
      {
        lineNumber: 2,
        customer_name: 'A',
        customer_phone: '9876543210',
        customer_channel: 'Personal',
        ordered_on: '2025-01-01',
        product_name: 'X',
        qty: 1,
        unit_price: 100,
        payment_status: 'paid',
        target_fulfilment_date: null,
        notes: '',
      },
      {
        lineNumber: 3,
        customer_name: 'A',
        customer_phone: '9876543210',
        customer_channel: 'Personal',
        ordered_on: '2025-01-01',
        product_name: 'Y',
        qty: 2,
        unit_price: 50,
        payment_status: 'paid',
        target_fulfilment_date: null,
        notes: '',
      },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.items).toHaveLength(2);
  });
});

describe('parseCliArgs', () => {
  it('parses input + apply', () => {
    expect(parseCliArgs(['--input', 'foo.csv', '--apply'])).toEqual({
      input: 'foo.csv',
      apply: true,
      help: false,
    });
  });
  it('defaults to dry-run', () => {
    expect(parseCliArgs(['--input', 'foo.csv'])).toEqual({
      input: 'foo.csv',
      apply: false,
      help: false,
    });
  });
  it('throws on unknown', () => {
    expect(() => parseCliArgs(['--whoknows'])).toThrow();
  });
});

// -------------------- validation tests --------------------

const HEADER =
  'customer_name,customer_phone,customer_channel,ordered_on,product_name,qty,unit_price,payment_status,target_fulfilment_date,notes';

describe('validateAndParseRows', () => {
  it('accepts a valid row', () => {
    const csv = `${HEADER}\nSunita,9876543210,Personal,2024-12-10,Laddu,2,200,paid,2024-12-12,\n`;
    const { rows, errors } = validateAndParseRows(parseCsv(csv));
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.customer_phone).toBe('9876543210');
    expect(rows[0]?.qty).toBe(2);
    expect(rows[0]?.target_fulfilment_date).toBe('2024-12-12');
  });

  it('flags invalid phone', () => {
    const csv = `${HEADER}\nSunita,1234567890,Personal,2024-12-10,Laddu,2,200,paid,2024-12-12,\n`;
    const { rows, errors } = validateAndParseRows(parseCsv(csv));
    expect(rows).toHaveLength(0);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.reason).toMatch(/phone/);
  });

  it('flags malformed date', () => {
    const csv = `${HEADER}\nSunita,9876543210,Personal,12-10-2024,Laddu,2,200,paid,,\n`;
    const { errors } = validateAndParseRows(parseCsv(csv));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.reason).toMatch(/ordered_on/);
  });

  it('accepts empty target_fulfilment_date', () => {
    const csv = `${HEADER}\nSunita,9876543210,Personal,2024-12-10,Laddu,2,200,paid,,\n`;
    const { rows, errors } = validateAndParseRows(parseCsv(csv));
    expect(errors).toEqual([]);
    expect(rows[0]?.target_fulfilment_date).toBeNull();
  });
});

// -------------------- end-to-end runBackfill tests --------------------

const CHANNEL_PERSONAL = { id: 'ch-personal', name: 'Personal', active: true };
const CHANNEL_RESELLER = { id: 'ch-reseller', name: 'Reseller', active: true };
const PRODUCT_LADDU = { id: 'p-laddu', name: 'Laddu box', default_price: 200, active: true };
const PRODUCT_CHIVDA = { id: 'p-chivda', name: 'Chivda', default_price: 150, active: true };
const PRODUCT_CHAKLI = { id: 'p-chakli', name: 'Chakli', default_price: 120, active: true };

function seedState(extra?: Record<string, Record<string, unknown>[]>): Record<string, Record<string, unknown>[]> {
  return {
    channels: [CHANNEL_PERSONAL, CHANNEL_RESELLER],
    products: [PRODUCT_LADDU, PRODUCT_CHIVDA, PRODUCT_CHAKLI],
    customers: [],
    orders: [],
    order_items: [],
    ...(extra ?? {}),
  };
}

const SAMPLE_CSV = `${HEADER}
Sunita Patil,9876543210,Personal,2024-12-10,Laddu box,2,200,paid,2024-12-12,Diwali order
Sunita Patil,9876543210,Personal,2024-12-10,Chivda,1,150,paid,2024-12-12,
Anil Sharma,9123456789,Reseller,2025-01-05,Chakli,5,120,unpaid,2025-01-07,For shop
`;

describe('runBackfill — dry-run', () => {
  let fixture: ReturnType<typeof makeFakeDb>;
  beforeEach(() => {
    fixture = makeFakeDb(seedState());
  });

  it('writes nothing and reports correct counts', async () => {
    const { log, lines } = makeLog();
    const { summary, validationErrors } = await runBackfill({
      db: fixture.db,
      csvText: SAMPLE_CSV,
      apply: false,
      log,
    });
    expect(validationErrors).toEqual([]);
    expect(summary.customersCreated).toBe(2);
    expect(summary.ordersCreated).toBe(2);
    expect(summary.itemsCreated).toBe(3); // 2+1 items in Sunita's order, 1 in Anil's
    expect(summary.customersExisting).toBe(0);
    expect(summary.ordersExisting).toBe(0);
    // No inserts to customers / orders / order_items during dry-run.
    const writes = fixture.calls.filter(
      (c) => c.op === 'insert' && ['customers', 'orders', 'order_items'].includes(c.table),
    );
    expect(writes).toEqual([]);
    // Should log CREATE lines.
    expect(lines.some((l) => l.includes('[customer] CREATE Sunita Patil'))).toBe(true);
    expect(lines.some((l) => l.includes('[order] CREATE'))).toBe(true);
  });
});

describe('runBackfill — apply mode', () => {
  it('inserts customers + orders + items', async () => {
    const fixture = makeFakeDb(seedState());
    const { log } = makeLog();
    const { summary } = await runBackfill({
      db: fixture.db,
      csvText: SAMPLE_CSV,
      apply: true,
      log,
    });
    expect(summary.customersCreated).toBe(2);
    expect(summary.ordersCreated).toBe(2);
    expect(fixture.state['customers']!.rows).toHaveLength(2);
    expect(fixture.state['orders']!.rows).toHaveLength(2);
    expect(fixture.state['order_items']!.rows).toHaveLength(3);
    // Sunita's order should have fulfilled_at = ordered_on and paid_at set.
    const sunitaOrder = fixture.state['orders']!.rows.find(
      (o) => o['ordered_at'] === '2024-12-10T12:00:00+05:30',
    );
    expect(sunitaOrder?.['fulfilled_at']).toBe('2024-12-10');
    expect(sunitaOrder?.['paid_at']).toBe('2024-12-10');
    // Anil's order: unpaid → paid_at null.
    const anilOrder = fixture.state['orders']!.rows.find(
      (o) => o['ordered_at'] === '2025-01-05T12:00:00+05:30',
    );
    expect(anilOrder?.['fulfilled_at']).toBe('2025-01-05');
    expect(anilOrder?.['paid_at']).toBeNull();
    expect(anilOrder?.['source']).toBe('whatsapp');
  });
});

describe('runBackfill — idempotency', () => {
  it('a second apply over the same data writes nothing', async () => {
    const fixture = makeFakeDb(seedState());
    const { log: log1 } = makeLog();
    await runBackfill({ db: fixture.db, csvText: SAMPLE_CSV, apply: true, log: log1 });

    // Snapshot post-first-run.
    const customerCount = fixture.state['customers']!.rows.length;
    const orderCount = fixture.state['orders']!.rows.length;
    const itemCount = fixture.state['order_items']!.rows.length;

    const { log: log2, lines } = makeLog();
    const { summary } = await runBackfill({ db: fixture.db, csvText: SAMPLE_CSV, apply: true, log: log2 });

    expect(summary.customersCreated).toBe(0);
    expect(summary.customersExisting).toBe(2);
    expect(summary.ordersCreated).toBe(0);
    expect(summary.ordersExisting).toBe(2);
    // Nothing new inserted.
    expect(fixture.state['customers']!.rows).toHaveLength(customerCount);
    expect(fixture.state['orders']!.rows).toHaveLength(orderCount);
    expect(fixture.state['order_items']!.rows).toHaveLength(itemCount);
    expect(lines.some((l) => l.includes('[customer] EXISTS'))).toBe(true);
    expect(lines.some((l) => l.includes('[order] EXISTS'))).toBe(true);
  });
});

describe('runBackfill — missing product aborts that order, others continue', () => {
  it('reports the abort + still imports unaffected orders', async () => {
    const fixture = makeFakeDb(seedState());
    const csv = `${HEADER}
Sunita Patil,9876543210,Personal,2024-12-10,Nonexistent Snack,2,200,paid,2024-12-12,
Anil Sharma,9123456789,Reseller,2025-01-05,Chakli,5,120,unpaid,2025-01-07,
`;
    const { log, lines } = makeLog();
    const { summary, validationErrors } = await runBackfill({
      db: fixture.db,
      csvText: csv,
      apply: true,
      log,
    });
    expect(validationErrors).toEqual([]);
    expect(summary.rowsAborted).toBe(1);
    expect(summary.ordersCreated).toBe(1); // Anil's order
    expect(summary.abortReasons[0]).toMatch(/Nonexistent Snack/);
    expect(lines.some((l) => l.includes('[order] ABORT'))).toBe(true);
    // Anil's row still inserted.
    expect(fixture.state['orders']!.rows).toHaveLength(1);
  });
});

describe('runBackfill — invalid phone exits with validation errors', () => {
  it('reports validation errors and writes nothing', async () => {
    const fixture = makeFakeDb(seedState());
    const csv = `${HEADER}
Sunita Patil,1234567890,Personal,2024-12-10,Laddu box,2,200,paid,2024-12-12,
`;
    const { log } = makeLog();
    const { summary, validationErrors } = await runBackfill({
      db: fixture.db,
      csvText: csv,
      apply: true,
      log,
    });
    expect(validationErrors.length).toBeGreaterThan(0);
    expect(validationErrors[0]?.reason).toMatch(/phone/);
    expect(summary.ordersCreated).toBe(0);
    expect(fixture.state['orders']!.rows).toHaveLength(0);
  });
});

describe('runBackfill — unknown channel aborts the customer + their orders', () => {
  it('skips customer and order, continues with other rows', async () => {
    const fixture = makeFakeDb(seedState());
    const csv = `${HEADER}
Ghost,9999999999,UnknownChannel,2024-12-10,Laddu box,2,200,paid,,
Anil Sharma,9123456789,Reseller,2025-01-05,Chakli,5,120,unpaid,2025-01-07,
`;
    const { log, lines } = makeLog();
    const { summary } = await runBackfill({
      db: fixture.db,
      csvText: csv,
      apply: true,
      log,
    });
    expect(summary.rowsAborted).toBe(1);
    expect(summary.ordersCreated).toBe(1);
    expect(lines.some((l) => l.includes('[customer] SKIP Ghost'))).toBe(true);
  });
});

describe('runBackfill — multi-row order grouping', () => {
  it('three CSV rows for same phone+date → one order with three items', async () => {
    const fixture = makeFakeDb(seedState());
    const csv = `${HEADER}
Sunita Patil,9876543210,Personal,2024-12-10,Laddu box,2,200,paid,2024-12-12,
Sunita Patil,9876543210,Personal,2024-12-10,Chivda,1,150,paid,2024-12-12,
Sunita Patil,9876543210,Personal,2024-12-10,Chakli,3,120,paid,2024-12-12,
`;
    const { log } = makeLog();
    const { summary } = await runBackfill({
      db: fixture.db,
      csvText: csv,
      apply: true,
      log,
    });
    expect(summary.ordersCreated).toBe(1);
    expect(summary.itemsCreated).toBe(3);
    expect(fixture.state['orders']!.rows).toHaveLength(1);
    expect(fixture.state['order_items']!.rows).toHaveLength(3);
  });
});

describe('runBackfill — case-insensitive product / channel lookup', () => {
  it('matches "laddu box" CSV against "Laddu box" product', async () => {
    const fixture = makeFakeDb(seedState());
    const csv = `${HEADER}
Sunita Patil,9876543210,PERSONAL,2024-12-10,laddu BOX,2,200,paid,2024-12-12,
`;
    const { log } = makeLog();
    const { summary } = await runBackfill({
      db: fixture.db,
      csvText: csv,
      apply: true,
      log,
    });
    expect(summary.ordersCreated).toBe(1);
  });
});
