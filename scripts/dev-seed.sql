-- scripts/dev-seed.sql
-- Idempotent dev fixture data for Sprint 1 walking skeleton.
-- All rows are prefixed "[DEV] " for easy identification + cleanup.
--
-- NOTE: products.name and customers.name have NO unique constraint, so
-- re-running this script will create duplicates. Run once; use
-- clear-dev-seed.sql to reset.

begin;

-- Products (5 across categories)
insert into products (name, unit, default_price, is_aggregated, source_maker_name)
values
  ('[DEV] Masala Chivda', '250g pack', 120.00, false, null),
  ('[DEV] Roasted Chana', '200g pack', 100.00, false, null),
  ('[DEV] Bhakarwadi',    '250g pack', 150.00, false, null),
  ('[DEV] Chakli',        '250g pack', 140.00, false, null),
  ('[DEV] Besan Ladoo',   '500g box',  280.00, true,  'Sunita Tai');

-- Customers (4 — one per channel + size tiers)
with personal as (select id from channels where lower(name) = 'personal'),
     reseller as (select id from channels where lower(name) = 'reseller'),
     exhib    as (select id from channels where lower(name) = 'exhibition')
insert into customers (name, phone, channel_id, size_tier, notes)
values
  ('[DEV] Neighbour Auntie', '+919800000001', (select id from personal), null,    'Daily building friend'),
  ('[DEV] Pune Sweet Mart',  '+919800000002', (select id from reseller), 'small', 'Picks up Fridays'),
  ('[DEV] Big Bazaar Hub',   '+919800000003', (select id from reseller), 'large', '50-100 packs/wk'),
  ('[DEV] Diwali Customer',  '+919800000004', (select id from exhib),    null,    'Met at fair 2025');

commit;
