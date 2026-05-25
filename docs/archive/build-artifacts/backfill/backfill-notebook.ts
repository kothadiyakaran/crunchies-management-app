/**
 * Sprint 9 / T9.8 — Notebook backfill importer.
 *
 * Reads a CSV of mom's notebook history and (in --apply mode) inserts customers
 * + orders + order_items into Supabase. Idempotent: re-running the same CSV
 * skips rows that already exist (matched by phone for customers; by composite
 * customer_id + ordered_on + sorted-items fingerprint for orders).
 *
 * Defaults to --dry-run for safety. Requires SUPABASE_SERVICE_KEY in env (admin
 * inserts bypass RLS); will refuse to start without it.
 *
 * Usage: npx tsx scripts/backfill-notebook.ts --input scripts/backfill-notebook.sample.csv [--apply]
 *
 * Schema notes (per supabase/migrations/0001_init.sql):
 * - orders.source is an enum (whatsapp|exhibition_form|in_person|phone). CSV
 *   has no source column; notebook backfill defaults to `whatsapp`.
 * - orders has no `total` column; order_items has no `line_total` column.
 *   Totals are computed client-side.
 * - Historical rows are assumed completed: fulfilled_at = ordered_on. When
 *   payment_status = paid, paid_at = ordered_on; for unpaid/partial, paid_at = null.
 * - Channels are user-curated — unknown channel_name aborts the row.
 * - Products are user-curated — unknown product_name aborts the row.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

// -------------------- pure helpers --------------------

export function cleanPhone(raw: string): string {
  let p = raw.replace(/[^0-9]/g, '');
  if (p.length === 12 && p.startsWith('91')) p = p.slice(2);
  return p;
}

export function isValidIndianMobile(raw: string): boolean {
  const p = cleanPhone(raw);
  return p.length === 10 && /^[6-9]/.test(p);
}

/**
 * Minimal RFC-4180-ish parser. Supports quoted fields with escaped doubled
 * quotes (`""`). Does NOT support newlines inside quoted fields — backfill
 * inputs are exported from a spreadsheet without embedded newlines. Unbalanced
 * quotes throw.
 */
export function parseCsv(text: string): string[][] {
  // Normalize line endings.
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const rows: string[][] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    if (line.length === 0) continue;
    const fields: string[] = [];
    let cur = '';
    let inQuotes = false;
    let j = 0;
    while (j < line.length) {
      const ch = line[j];
      if (inQuotes) {
        if (ch === '"') {
          if (line[j + 1] === '"') {
            cur += '"';
            j += 2;
            continue;
          }
          inQuotes = false;
          j++;
          continue;
        }
        cur += ch;
        j++;
        continue;
      }
      if (ch === '"') {
        if (cur.length > 0) throw new Error(`Line ${i + 1}: unexpected quote mid-field`);
        inQuotes = true;
        j++;
        continue;
      }
      if (ch === ',') {
        fields.push(cur);
        cur = '';
        j++;
        continue;
      }
      cur += ch;
      j++;
    }
    if (inQuotes) throw new Error(`Line ${i + 1}: unbalanced quotes`);
    fields.push(cur);
    rows.push(fields);
  }
  return rows;
}

export type CsvRow = {
  lineNumber: number; // 1-indexed in source file (header is line 1)
  customer_name: string;
  customer_phone: string; // cleanPhone applied
  customer_channel: string;
  ordered_on: string;
  product_name: string;
  qty: number;
  unit_price: number;
  payment_status: 'paid' | 'unpaid' | 'partial';
  target_fulfilment_date: string | null;
  notes: string;
};

export type RowError = { lineNumber: number; reason: string };

const HEADERS = [
  'customer_name',
  'customer_phone',
  'customer_channel',
  'ordered_on',
  'product_name',
  'qty',
  'unit_price',
  'payment_status',
  'target_fulfilment_date',
  'notes',
] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateAndParseRows(rawRows: string[][]): { rows: CsvRow[]; errors: RowError[] } {
  const errors: RowError[] = [];
  const rows: CsvRow[] = [];
  if (rawRows.length === 0) {
    errors.push({ lineNumber: 0, reason: 'CSV is empty' });
    return { rows, errors };
  }
  const header = rawRows[0];
  if (!header || header.length !== HEADERS.length || HEADERS.some((h, i) => header[i] !== h)) {
    errors.push({
      lineNumber: 1,
      reason: `Header must be exactly: ${HEADERS.join(',')} (got ${(header ?? []).join(',')})`,
    });
    return { rows, errors };
  }
  for (let i = 1; i < rawRows.length; i++) {
    const r = rawRows[i];
    if (!r) continue;
    const lineNumber = i + 1;
    if (r.length !== HEADERS.length) {
      errors.push({ lineNumber, reason: `Expected ${HEADERS.length} columns, got ${r.length}` });
      continue;
    }
    const [
      customer_name,
      customer_phone_raw,
      customer_channel,
      ordered_on,
      product_name,
      qty_raw,
      unit_price_raw,
      payment_status_raw,
      target_fulfilment_date_raw,
      notes,
    ] = r as [string, string, string, string, string, string, string, string, string, string];

    const fail = (reason: string): void => {
      errors.push({ lineNumber, reason });
    };

    if (!customer_name.trim()) fail('customer_name is required');
    if (!customer_channel.trim()) fail('customer_channel is required');
    if (!product_name.trim()) fail('product_name is required');

    if (!DATE_RE.test(ordered_on)) fail(`ordered_on must be YYYY-MM-DD (got "${ordered_on}")`);

    const target_fulfilment_date = target_fulfilment_date_raw.trim() === '' ? null : target_fulfilment_date_raw;
    if (target_fulfilment_date !== null && !DATE_RE.test(target_fulfilment_date)) {
      fail(`target_fulfilment_date must be YYYY-MM-DD or empty (got "${target_fulfilment_date_raw}")`);
    }

    const phone = cleanPhone(customer_phone_raw);
    if (!isValidIndianMobile(phone)) {
      fail(`customer_phone "${customer_phone_raw}" is not a valid Indian mobile (10 digits starting 6-9)`);
    }

    const qty = Number(qty_raw);
    if (!Number.isFinite(qty) || qty <= 0) fail(`qty must be a positive number (got "${qty_raw}")`);

    const unit_price = Number(unit_price_raw);
    if (!Number.isFinite(unit_price) || unit_price < 0) {
      fail(`unit_price must be a non-negative number (got "${unit_price_raw}")`);
    }

    const ps = payment_status_raw.trim().toLowerCase();
    if (ps !== 'paid' && ps !== 'unpaid' && ps !== 'partial') {
      fail(`payment_status must be paid|unpaid|partial (got "${payment_status_raw}")`);
    }

    // Only push if row produced no errors on this iteration.
    const beforeErrCount = errors.filter((e) => e.lineNumber === lineNumber).length;
    if (beforeErrCount === 0) {
      rows.push({
        lineNumber,
        customer_name: customer_name.trim(),
        customer_phone: phone,
        customer_channel: customer_channel.trim(),
        ordered_on,
        product_name: product_name.trim(),
        qty,
        unit_price,
        payment_status: ps as 'paid' | 'unpaid' | 'partial',
        target_fulfilment_date,
        notes: notes,
      });
    }
  }
  return { rows, errors };
}

/**
 * Group rows into orders. Key: phone | ordered_on | customer_name.
 * Within a group, items aggregate.
 */
export type OrderGroup = {
  key: string;
  customer_name: string;
  customer_phone: string;
  customer_channel: string;
  ordered_on: string;
  target_fulfilment_date: string | null;
  payment_status: 'paid' | 'unpaid' | 'partial';
  notes: string; // first non-empty
  items: { product_name: string; qty: number; unit_price: number }[];
  lineNumbers: number[];
};

export function groupRowsIntoOrders(rows: CsvRow[]): OrderGroup[] {
  const map = new Map<string, OrderGroup>();
  for (const r of rows) {
    const key = `${r.customer_phone}|${r.ordered_on}|${r.customer_name.toLowerCase()}`;
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        customer_name: r.customer_name,
        customer_phone: r.customer_phone,
        customer_channel: r.customer_channel,
        ordered_on: r.ordered_on,
        target_fulfilment_date: r.target_fulfilment_date,
        payment_status: r.payment_status,
        notes: r.notes,
        items: [],
        lineNumbers: [],
      };
      map.set(key, g);
    }
    g.items.push({ product_name: r.product_name, qty: r.qty, unit_price: r.unit_price });
    g.lineNumbers.push(r.lineNumber);
    if (!g.notes && r.notes) g.notes = r.notes;
  }
  return Array.from(map.values());
}

/**
 * Fingerprint for idempotency: sorted `${product_id}:${qty}` joined by comma.
 * Excludes unit_price by design — re-imports may carry slightly different
 * prices but the same item composition should still be considered "same order."
 */
export function fingerprintItems(items: { product_id: string; qty: number }[]): string {
  return items
    .map((i) => `${i.product_id}:${Number(i.qty)}`)
    .sort()
    .join(',');
}

// -------------------- supabase client interface --------------------

/**
 * Minimal interface the script needs from supabase-js, so tests can supply a
 * fake. Calls are documented inline; behaviour matches @supabase/supabase-js.
 */
export type DbClient = SupabaseClient;

// -------------------- IO operations (testable; client injected) --------------------

export type CustomerLookup = { id: string; name: string };
export type ProductLookup = { id: string; name: string; default_price: number };
export type ChannelLookup = { id: string; name: string };

export async function loadChannels(db: DbClient): Promise<Map<string, ChannelLookup>> {
  const { data, error } = await db.from('channels').select('id, name').eq('active', true);
  if (error) throw new Error(`channels lookup failed: ${error.message}`);
  const m = new Map<string, ChannelLookup>();
  for (const c of (data ?? []) as { id: string; name: string }[]) {
    m.set(c.name.toLowerCase(), { id: c.id, name: c.name });
  }
  return m;
}

export async function loadProductsByName(db: DbClient, names: string[]): Promise<Map<string, ProductLookup>> {
  if (names.length === 0) return new Map();
  // Pull all products and match case-insensitively client-side; v1 scale is small.
  const { data, error } = await db.from('products').select('id, name, default_price').eq('active', true);
  if (error) throw new Error(`products lookup failed: ${error.message}`);
  const m = new Map<string, ProductLookup>();
  for (const p of (data ?? []) as { id: string; name: string; default_price: number }[]) {
    m.set(p.name.toLowerCase(), { id: p.id, name: p.name, default_price: Number(p.default_price) });
  }
  return m;
}

export async function findCustomerByPhone(db: DbClient, phone: string): Promise<CustomerLookup | null> {
  const { data, error } = await db
    .from('customers')
    .select('id, name')
    .eq('phone', phone)
    .maybeSingle();
  if (error) throw new Error(`customer lookup failed: ${error.message}`);
  if (!data) return null;
  return data as CustomerLookup;
}

export async function insertCustomer(
  db: DbClient,
  args: { name: string; phone: string; channel_id: string },
): Promise<string> {
  const { data, error } = await db
    .from('customers')
    .insert({
      name: args.name,
      phone: args.phone,
      channel_id: args.channel_id,
      active: true,
    })
    .select('id')
    .single();
  if (error) throw new Error(`customer insert failed: ${error.message}`);
  if (!data) throw new Error('customer insert returned no row');
  return (data as { id: string }).id;
}

export async function findExistingOrdersForCustomerOnDate(
  db: DbClient,
  customer_id: string,
  ordered_on: string,
): Promise<{ id: string; items: { product_id: string; qty: number }[] }[]> {
  // ordered_at is timestamptz; "the day" is a 24h IST window.
  // We use a UTC-ish bound liberal enough to catch IST midnights — `ordered_on`
  // 00:00 IST = previous day 18:30 UTC. Inclusive both ends.
  const startIst = `${ordered_on}T00:00:00+05:30`;
  const endIst = `${ordered_on}T23:59:59.999+05:30`;
  const { data, error } = await db
    .from('orders')
    .select('id, order_items(product_id, qty)')
    .eq('customer_id', customer_id)
    .gte('ordered_at', startIst)
    .lte('ordered_at', endIst);
  if (error) throw new Error(`existing-order lookup failed: ${error.message}`);
  type Raw = { id: string; order_items: { product_id: string; qty: number }[] | null };
  return ((data ?? []) as Raw[]).map((o) => ({
    id: o.id,
    items: (o.order_items ?? []).map((i) => ({ product_id: i.product_id, qty: Number(i.qty) })),
  }));
}

export async function insertOrderWithItems(
  db: DbClient,
  args: {
    customer_id: string;
    ordered_on: string;
    target_fulfilment_date: string | null;
    payment_status: 'paid' | 'unpaid' | 'partial';
    notes: string | null;
    items: { product_id: string; qty: number; unit_price: number }[];
  },
): Promise<string> {
  // Historical rows: treat as completed.
  const fulfilled_at = args.ordered_on;
  const paid_at = args.payment_status === 'paid' ? args.ordered_on : null;

  // ordered_at: pin to noon IST on ordered_on for a stable, idempotent timestamp
  // (re-runs land on the same instant, so the same-day lookup still matches).
  const ordered_at = `${args.ordered_on}T12:00:00+05:30`;

  const { data: order, error: oErr } = await db
    .from('orders')
    .insert({
      customer_id: args.customer_id,
      ordered_at,
      source: 'whatsapp', // notebook backfill default; see file header
      target_fulfilment_date: args.target_fulfilment_date,
      payment_status: args.payment_status,
      fulfilled_at,
      paid_at,
      notes: args.notes,
    })
    .select('id')
    .single();
  if (oErr || !order) throw new Error(`order insert failed: ${oErr?.message ?? 'no row'}`);

  const orderId = (order as { id: string }).id;
  const itemRows = args.items.map((it) => ({
    order_id: orderId,
    product_id: it.product_id,
    qty: it.qty,
    unit_price: it.unit_price,
  }));
  const { error: iErr } = await db.from('order_items').insert(itemRows);
  if (iErr) {
    await db.from('orders').delete().eq('id', orderId);
    throw new Error(`order_items insert failed (order rolled back): ${iErr.message}`);
  }
  return orderId;
}

// -------------------- core run loop --------------------

export type RunSummary = {
  customersCreated: number;
  customersExisting: number;
  ordersCreated: number;
  ordersExisting: number;
  itemsCreated: number;
  rowsAborted: number;
  abortReasons: string[];
};

export type Logger = (line: string) => void;

export async function runBackfill(args: {
  db: DbClient;
  csvText: string;
  apply: boolean;
  log: Logger;
}): Promise<{ summary: RunSummary; validationErrors: RowError[] }> {
  const summary: RunSummary = {
    customersCreated: 0,
    customersExisting: 0,
    ordersCreated: 0,
    ordersExisting: 0,
    itemsCreated: 0,
    rowsAborted: 0,
    abortReasons: [],
  };

  const raw = parseCsv(args.csvText);
  const { rows, errors } = validateAndParseRows(raw);
  if (errors.length > 0) {
    return { summary, validationErrors: errors };
  }

  const channelMap = await loadChannels(args.db);
  const distinctProductNames = Array.from(new Set(rows.map((r) => r.product_name.toLowerCase())));
  const productMap = await loadProductsByName(args.db, distinctProductNames);

  const groups = groupRowsIntoOrders(rows);
  args.log(`Parsed ${rows.length} CSV rows into ${groups.length} order groups.`);

  // Customer pass: ensure each unique phone has an id.
  const customerIdByPhone = new Map<string, string>();
  const distinctCustomers = new Map<string, { name: string; phone: string; channel: string }>();
  for (const g of groups) {
    if (!distinctCustomers.has(g.customer_phone)) {
      distinctCustomers.set(g.customer_phone, {
        name: g.customer_name,
        phone: g.customer_phone,
        channel: g.customer_channel,
      });
    }
  }
  for (const c of distinctCustomers.values()) {
    const existing = await findCustomerByPhone(args.db, c.phone);
    if (existing) {
      customerIdByPhone.set(c.phone, existing.id);
      summary.customersExisting++;
      args.log(`[customer] EXISTS ${existing.name} (${c.phone})`);
      continue;
    }
    const channel = channelMap.get(c.channel.toLowerCase());
    if (!channel) {
      args.log(
        `[customer] SKIP ${c.name} (${c.phone}) — channel "${c.channel}" not in channels table; create it in the app first.`,
      );
      // We can't insert the customer, which means all their orders are blocked.
      // Don't record an id; downstream order loop will abort their orders.
      continue;
    }
    if (args.apply) {
      const id = await insertCustomer(args.db, { name: c.name, phone: c.phone, channel_id: channel.id });
      customerIdByPhone.set(c.phone, id);
    } else {
      customerIdByPhone.set(c.phone, `dry-run-${c.phone}`);
    }
    summary.customersCreated++;
    args.log(`[customer] CREATE ${c.name} (${c.phone}, channel=${channel.name})`);
  }

  // Order pass.
  for (const g of groups) {
    const customer_id = customerIdByPhone.get(g.customer_phone);
    if (!customer_id) {
      summary.rowsAborted += g.lineNumbers.length;
      const reason = `lines ${g.lineNumbers.join(',')}: customer "${g.customer_name}" could not be created (see [customer] SKIP above)`;
      summary.abortReasons.push(reason);
      args.log(`[order] ABORT ${reason}`);
      continue;
    }

    // Resolve product ids.
    const itemsResolved: { product_id: string; qty: number; unit_price: number; product_name: string }[] = [];
    let missingProduct: string | null = null;
    for (const it of g.items) {
      const p = productMap.get(it.product_name.toLowerCase());
      if (!p) {
        missingProduct = it.product_name;
        break;
      }
      itemsResolved.push({ product_id: p.id, qty: it.qty, unit_price: it.unit_price, product_name: it.product_name });
    }
    if (missingProduct) {
      summary.rowsAborted += g.lineNumbers.length;
      const reason = `lines ${g.lineNumbers.join(',')}: product "${missingProduct}" not in products table. Create it via /products first.`;
      summary.abortReasons.push(reason);
      args.log(`[order] ABORT ${reason}`);
      continue;
    }

    // Fingerprint + existing-order check.
    const fp = fingerprintItems(itemsResolved);
    if (args.apply) {
      const existing = await findExistingOrdersForCustomerOnDate(args.db, customer_id, g.ordered_on);
      const match = existing.find((e) => fingerprintItems(e.items) === fp);
      if (match) {
        summary.ordersExisting++;
        args.log(`[order] EXISTS ${g.customer_name} ${g.ordered_on} (${itemsResolved.length} items) → ${match.id}`);
        continue;
      }
    }
    // (in dry-run we still report as CREATE — we'd insert if applied.)

    if (args.apply) {
      const newId = await insertOrderWithItems(args.db, {
        customer_id,
        ordered_on: g.ordered_on,
        target_fulfilment_date: g.target_fulfilment_date,
        payment_status: g.payment_status,
        notes: g.notes && g.notes.trim() ? g.notes : null,
        items: itemsResolved.map(({ product_id, qty, unit_price }) => ({ product_id, qty, unit_price })),
      });
      args.log(
        `[order] CREATE ${g.customer_name} ${g.ordered_on} (${itemsResolved.length} items) → ${newId}`,
      );
    } else {
      args.log(
        `[order] CREATE ${g.customer_name} ${g.ordered_on} (${itemsResolved.length} items) [dry-run]`,
      );
    }
    summary.ordersCreated++;
    summary.itemsCreated += itemsResolved.length;
  }

  return { summary, validationErrors: [] };
}

// -------------------- env + CLI --------------------

type CliArgs = {
  input: string | null;
  apply: boolean;
  help: boolean;
};

export function parseCliArgs(argv: string[]): CliArgs {
  const out: CliArgs = { input: null, apply: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--input') {
      out.input = argv[i + 1] ?? null;
      i++;
    } else if (a === '--apply') out.apply = true;
    else if (a === '--dry-run') out.apply = false;
    else if (a !== undefined) throw new Error(`Unknown argument: ${a}`);
  }
  return out;
}

const HELP = `
backfill-notebook.ts — idempotent CSV importer for mom's notebook history.

Usage:
  npx tsx scripts/backfill-notebook.ts --input <path.csv> [--apply]

Flags:
  --input <path>   Path to CSV file (required).
  --dry-run        Default. Prints plan, makes no writes.
  --apply          Actually insert into Supabase. Requires SUPABASE_SERVICE_KEY.
  --help, -h       Show this message.

Env:
  SUPABASE_URL              (required for --apply)
  SUPABASE_SERVICE_KEY      (required for --apply)
  Or VITE_SUPABASE_URL      (fallback for URL)

CSV format (header row required):
  customer_name,customer_phone,customer_channel,ordered_on,product_name,qty,unit_price,payment_status,target_fulfilment_date,notes

See scripts/backfill-notebook.README.md for details.
`;

async function loadEnvLocal(): Promise<Record<string, string>> {
  // Tiny .env loader: KEY=VALUE per line, ignores comments and blank lines, no
  // multiline values. Both Vite (`VITE_KEY=val`) and shell (`$env:KEY = "val"`)
  // forms are commonly present; we handle the simple Vite form.
  const out: Record<string, string> = {};
  for (const candidate of ['.env.local', '.env']) {
    try {
      const text = await fs.readFile(path.join(process.cwd(), candidate), 'utf8');
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let val = trimmed.slice(eq + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!(key in out)) out[key] = val;
      }
    } catch {
      // file missing — fine
    }
  }
  return out;
}

async function main(): Promise<void> {
  let args: CliArgs;
  try {
    args = parseCliArgs(process.argv.slice(2));
  } catch (e) {
    console.error((e as Error).message);
    console.error(HELP);
    process.exit(2);
  }
  if (args.help || !args.input) {
    console.log(HELP);
    process.exit(args.help ? 0 : 2);
  }

  const inputPath = path.resolve(process.cwd(), args.input);
  const csvText = await fs.readFile(inputPath, 'utf8');

  const envFile = await loadEnvLocal();
  const url = process.env.SUPABASE_URL ?? envFile.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? envFile.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY ?? envFile.SUPABASE_SERVICE_KEY;

  if (!url) {
    console.error('ERROR: SUPABASE_URL not set (looked at env + .env.local).');
    process.exit(1);
  }
  if (!serviceKey) {
    console.error(
      'ERROR: SUPABASE_SERVICE_KEY not set. This script requires the service key (admin) to bypass RLS.',
    );
    process.exit(1);
  }

  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`Mode: ${args.apply ? 'APPLY (writes)' : 'DRY-RUN (no writes)'}`);
  console.log(`Input: ${inputPath}`);
  console.log('');

  const log: Logger = (line) => console.log(line);
  const { summary, validationErrors } = await runBackfill({ db, csvText, apply: args.apply, log });

  if (validationErrors.length > 0) {
    console.error('');
    console.error(`VALIDATION ERRORS (${validationErrors.length}):`);
    for (const e of validationErrors) {
      console.error(`  line ${e.lineNumber}: ${e.reason}`);
    }
    process.exit(1);
  }

  console.log('');
  console.log('Summary:');
  console.log(`  Customers: ${summary.customersCreated} created, ${summary.customersExisting} existing`);
  console.log(`  Orders:    ${summary.ordersCreated} created, ${summary.ordersExisting} existing`);
  console.log(`  Items:     ${summary.itemsCreated} created`);
  if (summary.rowsAborted > 0) {
    console.log(`  Aborted:   ${summary.rowsAborted} CSV rows`);
    for (const r of summary.abortReasons) {
      console.log(`    - ${r}`);
    }
  }
  if (!args.apply) {
    console.log('');
    console.log('(Dry-run — re-run with --apply to actually write.)');
  }
}

// Allow this file to be imported by tests without running main().
const isDirectRun = (() => {
  try {
    // import.meta.url ends with the actual file; argv[1] is the entry script.
    const argv1 = process.argv[1];
    if (!argv1) return false;
    // When invoked via tsx scripts/backfill-notebook.ts, argv[1] will be that path.
    const here = new URL(import.meta.url).pathname.toLowerCase();
    return here.endsWith(argv1.replace(/\\/g, '/').toLowerCase()) || argv1.toLowerCase().includes('backfill-notebook');
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  main().catch((e) => {
    console.error('FATAL:', (e as Error).message);
    process.exit(1);
  });
}
