-- 0008_discounts.sql
-- Improvement #4 — discounts. Additive, non-breaking: three columns + a seed.
-- Precedence resolved at order-creation time (order > customer > channel > 0)
-- and SNAPSHOT into orders.discount_percent, the only value bills/totals read.
--
-- channels.default_discount_percent : category default; Reseller seeded to 20, others 0.
-- customers.discount_percent (nullable): null = inherit channel default; an explicit
--   value (incl. 0) = per-customer override. Present on every customer, any channel.
-- orders.discount_percent : the frozen snapshot. Existing rows default to 0, so no
--   historical order or bill changes — resellers' past orders are NOT retro-discounted.

set search_path = public, extensions;

alter table public.channels
  add column default_discount_percent numeric(5, 2) not null default 0
    check (default_discount_percent between 0 and 100);

alter table public.customers
  add column discount_percent numeric(5, 2)
    check (discount_percent is null or discount_percent between 0 and 100);

alter table public.orders
  add column discount_percent numeric(5, 2) not null default 0
    check (discount_percent between 0 and 100);

update public.channels set default_discount_percent = 20 where lower(name) = 'reseller';
