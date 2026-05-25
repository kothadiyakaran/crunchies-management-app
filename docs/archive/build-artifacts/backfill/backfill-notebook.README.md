# backfill-notebook.ts — notebook history importer

Sprint 9 / T9.8. Idempotent CSV importer for mom's notebook history. Inserts customers + orders + order_items into Supabase based on a flat CSV exported from her records.

## When to use

Once at launch, after mom has set up her products and channels through the app, to seed the database with her existing notebook entries. Safe to re-run: existing customers (matched by phone) and existing orders (matched by composite fingerprint) are skipped.

## Requirements

- Node 20+ (already required by `package.json`).
- `tsx` (already in devDependencies — `npx tsx` works).
- A Supabase service-role key (`SUPABASE_SERVICE_KEY` env var). The script does admin inserts that bypass RLS; the anon key won't work.

## Env

The script reads env from `process.env` first, then falls back to `.env.local` / `.env`. Required for `--apply`:

```
SUPABASE_URL=https://<project>.supabase.co        # or VITE_SUPABASE_URL
SUPABASE_SERVICE_KEY=<service_role_key>
```

`--dry-run` mode does not need the service key only because it makes no writes — but it still needs the URL + a working anon/service key to read channels/products/customers/orders for the planning lookups. In practice, just set both env vars.

## CSV format

Header row required; columns must be in this order exactly:

```
customer_name,customer_phone,customer_channel,ordered_on,product_name,qty,unit_price,payment_status,target_fulfilment_date,notes
```

- `customer_phone`: Indian mobile, 10 digits starting 6-9. `+91` or spaces accepted (stripped).
- `customer_channel`: must match an existing row in `channels` (case-insensitive). The script will NOT auto-create channels — add them via the app first.
- `ordered_on`: `YYYY-MM-DD`.
- `product_name`: must match an existing product (case-insensitive). The script will NOT invent products — add them via `/products` first.
- `qty`: positive number.
- `unit_price`: non-negative number (rupees, no symbol).
- `payment_status`: `paid` | `unpaid` | `partial`.
- `target_fulfilment_date`: `YYYY-MM-DD` or empty (→ null).
- `notes`: free text (empty allowed). Quote with `"..."` if it contains commas. Use `""` to embed a literal quote.

### Multi-item orders

Multiple consecutive rows that share the same `customer_phone + ordered_on + customer_name` are collapsed into ONE order with multiple line items. See `scripts/backfill-notebook.sample.csv` for an example.

## What gets defaulted

The CSV doesn't carry every field. Defaults applied:

- `orders.source` → `whatsapp` (notebook entries are almost all from WhatsApp orders).
- `orders.ordered_at` → `${ordered_on}T12:00:00+05:30` (stable timestamp; idempotent across re-runs).
- `orders.fulfilled_at` → `ordered_on` (historical rows are assumed completed; otherwise every backfilled order would show up in Today's pending list).
- `orders.paid_at` → `ordered_on` when `payment_status='paid'`, else null.
- `customers.active` → `true`. `size_tier`, `source_event_id`, `notes` → null.

## Usage

### Dry-run (default — safe)

```powershell
npx tsx scripts/backfill-notebook.ts --input scripts/backfill-notebook.sample.csv
```

Sample output:

```
Mode: DRY-RUN (no writes)
Input: C:\...\scripts\backfill-notebook.sample.csv

Parsed 4 CSV rows into 3 order groups.
[customer] CREATE Sunita Patil (9876543210, channel=Personal)
[customer] CREATE Anil Sharma (9123456789, channel=Reseller)
[customer] CREATE Meera Joshi (9988776655, channel=Personal)
[order] CREATE Sunita Patil 2024-12-10 (2 items) [dry-run]
[order] CREATE Anil Sharma 2025-01-05 (1 items) [dry-run]
[order] CREATE Meera Joshi 2025-02-14 (1 items) [dry-run]

Summary:
  Customers: 3 created, 0 existing
  Orders:    3 created, 0 existing
  Items:     4 created

(Dry-run — re-run with --apply to actually write.)
```

### Apply

```powershell
npx tsx scripts/backfill-notebook.ts --input my-notebook.csv --apply
```

## Idempotency guarantees

- **Customer**: matched by `cleanPhone(customer_phone)` against `customers.phone`. Existing match → `[customer] EXISTS`, id reused. No new customer is created.
- **Order**: matched by `(customer_id, ordered_on, sorted-items-fingerprint)`. The fingerprint is `sorted(product_id:qty).join(',')` — `unit_price` is excluded so re-imports with slightly different prices still dedup. Existing match → `[order] EXISTS`, no insert. New → `[order] CREATE`.

Running the same CSV twice in `--apply` mode is safe: the second run will report 100% EXISTS.

## What aborts a row (or group)

The script never partially commits an order. A group is aborted (logged `[order] ABORT`) when:

1. **Unknown channel** — the customer's `customer_channel` isn't in the `channels` table. (Channels are user-curated. Add via the app first.)
2. **Unknown product** — any line item's `product_name` isn't in the `products` table. (Products are user-curated. Add via `/products` first.)
3. **Validation failure** — invalid phone, malformed date, non-numeric qty/price, bad payment_status. Validation runs first across the whole CSV; if any row fails, the script exits with code 1 and lists all errors. Fix and re-run.

Other rows continue normally. The summary at the end reports `Aborted: N CSV rows` with reasons.

## Limitations

- CSV parser does not support newlines inside quoted fields. Export your CSV from Sheets/Excel with that constraint in mind.
- Does not import `complaints`, `production_logs`, or `event_demand`. Notebook entries are orders only.
- Does not set `customer.size_tier`. Mom curates that via the customer detail page.

## Tests

```powershell
npx vitest run scripts/backfill-notebook.test.ts
```
