-- 0001_init.sql
-- Crunchies v1 — initial schema.
-- Sources of truth:
--   docs/v1-spec.md §2 (data model)
--   docs/ENGINEERING_NOTES.md §2.1 (channels FK), §2.3 (public_order_number, pickup_window_*, venue_line)

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type customer_size_tier as enum ('small', 'large');
create type order_source as enum ('whatsapp', 'exhibition_form', 'in_person', 'phone');
create type order_payment_status as enum ('unpaid', 'paid', 'partial');
create type event_kind as enum ('festival', 'exhibition', 'other');
create type complaint_kind as enum ('quality', 'delivery', 'wrong_item', 'other');

-- ---------------------------------------------------------------------------
-- Tables (declared in FK-dependency order)
-- ---------------------------------------------------------------------------

create table channels (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(trim(name)) between 1 and 20),
  is_system   boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index channels_name_lower_uq on channels (lower(name));

create table products (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  unit               text not null,
  default_price      numeric(10, 2) not null check (default_price >= 0),
  is_seasonal        boolean not null default false,
  is_aggregated      boolean not null default false,
  source_maker_name  text,
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  -- if aggregated, source maker should be disclosed (v1-spec §2 products)
  constraint products_source_maker_required check (
    is_aggregated = false or (source_maker_name is not null and char_length(trim(source_maker_name)) > 0)
  )
);

create table events (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  kind                 event_kind not null,
  starts_on            date not null,
  ends_on              date not null,
  lead_weeks           int not null default 2 check (lead_weeks >= 0),
  slug                 text unique,
  active               boolean not null default true,
  pickup_window_start  timestamptz,
  pickup_window_end    timestamptz,
  venue_line           text,
  created_at           timestamptz not null default now(),
  constraint events_dates_ordered check (ends_on >= starts_on),
  constraint events_pickup_window_ordered check (
    pickup_window_start is null
    or pickup_window_end is null
    or pickup_window_end >= pickup_window_start
  ),
  -- only exhibitions have public slugs (v1-spec §2 events)
  constraint events_slug_only_for_exhibitions check (
    slug is null or kind = 'exhibition'
  )
);

create table customers (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  phone               text,
  channel_id          uuid not null references channels(id) on delete restrict,
  size_tier           customer_size_tier,
  source_event_id     uuid references events(id) on delete set null,
  notes               text,
  active              boolean not null default true,
  last_contacted_at   timestamptz,
  last_ordered_at     timestamptz,
  created_at          timestamptz not null default now()
);
-- dedup-on-phone (server-side check; v1-spec §10)
create unique index customers_phone_unique on customers (phone) where phone is not null;
create index customers_channel_idx on customers (channel_id);
create index customers_source_event_idx on customers (source_event_id);

create table orders (
  id                        uuid primary key default gen_random_uuid(),
  customer_id               uuid not null references customers(id) on delete restrict,
  ordered_at                timestamptz not null default now(),
  target_fulfilment_date    date,
  source                    order_source not null,
  fulfilled_at              date,
  payment_status            order_payment_status not null default 'unpaid',
  paid_at                   date,
  bill_number               int unique,
  public_order_number       text unique,
  notes                     text,
  created_at                timestamptz not null default now()
);
create index orders_customer_idx on orders (customer_id);
create index orders_pending_idx on orders (target_fulfilment_date) where fulfilled_at is null;
create index orders_ordered_at_idx on orders (ordered_at desc);

create table order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references orders(id) on delete cascade,
  product_id   uuid not null references products(id) on delete restrict,
  qty          numeric(12, 3) not null check (qty > 0),
  unit_price   numeric(10, 2) not null check (unit_price >= 0)
);
create index order_items_order_idx on order_items (order_id);
create index order_items_product_idx on order_items (product_id);

create table production_logs (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete restrict,
  made_on     date not null,
  qty         numeric(12, 3) not null check (qty > 0),
  notes       text,
  created_at  timestamptz not null default now()
);
create index production_logs_product_made_idx on production_logs (product_id, made_on);

create table production_plans (
  product_id            uuid not null references products(id) on delete restrict,
  week_start            date not null,
  planned_qty           numeric(12, 3) not null check (planned_qty >= 0),
  original_planned_qty  numeric(12, 3) not null check (original_planned_qty >= 0),
  entered_at            timestamptz not null default now(),
  notes                 text,
  primary key (product_id, week_start)
);

create table seed_demand (
  product_id        uuid primary key references products(id) on delete cascade,
  weekly_avg_qty    numeric(12, 3) not null check (weekly_avg_qty >= 0),
  entered_at        timestamptz not null default now()
);

create table event_demand (
  event_id                  uuid not null references events(id) on delete cascade,
  product_id                uuid not null references products(id) on delete restrict,
  expected_qty              numeric(12, 3) not null check (expected_qty >= 0),
  committed_expected_qty    numeric(12, 3) check (committed_expected_qty is null or committed_expected_qty >= 0),
  notes                     text,
  primary key (event_id, product_id)
);

create table complaints (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete restrict,
  reported_at   date not null default current_date,
  kind          complaint_kind not null,
  description   text not null,
  resolution    text,
  resolved_at   date
);
create index complaints_order_idx on complaints (order_id);
create index complaints_open_idx on complaints (reported_at desc) where resolved_at is null;

-- ---------------------------------------------------------------------------
-- Seeds (system channels)
-- ---------------------------------------------------------------------------

insert into channels (name, is_system, active) values
  ('Personal', true, true),
  ('Reseller', true, true),
  ('Exhibition', true, true);

-- ---------------------------------------------------------------------------
-- Sequences & generators
-- ---------------------------------------------------------------------------

-- Bill numbers: app-wide sequence starting at 1001 (v1-spec §7).
create sequence bill_number_seq start 1001;

-- Public order numbers per year: #YYYY-NNNN with NNNN per-year sequence
-- (v1-spec §2 orders + §10).
create table public_order_number_counter (
  year      int primary key,
  last_n    int not null default 0
);

create or replace function next_public_order_number(p_year int default extract(year from now())::int)
returns text
language plpgsql
as $$
declare
  v_n int;
begin
  insert into public_order_number_counter (year, last_n)
  values (p_year, 1)
  on conflict (year) do update set last_n = public_order_number_counter.last_n + 1
  returning last_n into v_n;

  return format('#%s-%s', p_year, lpad(v_n::text, 4, '0'));
end
$$;

-- ---------------------------------------------------------------------------
-- Triggers — maintain customers.last_ordered_at denorm (v1-spec §2 customers)
-- ---------------------------------------------------------------------------

create or replace function refresh_customer_last_ordered_at(p_customer_id uuid)
returns void
language sql
as $$
  update customers
     set last_ordered_at = (
       select max(ordered_at) from orders where customer_id = p_customer_id
     )
   where id = p_customer_id;
$$;

create or replace function trg_orders_after_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    perform refresh_customer_last_ordered_at(new.customer_id);
  elsif tg_op = 'UPDATE' then
    perform refresh_customer_last_ordered_at(new.customer_id);
    if old.customer_id <> new.customer_id then
      perform refresh_customer_last_ordered_at(old.customer_id);
    end if;
  elsif tg_op = 'DELETE' then
    perform refresh_customer_last_ordered_at(old.customer_id);
  end if;
  return null;
end
$$;

create trigger orders_last_ordered_at
  after insert or update or delete on orders
  for each row execute function trg_orders_after_change();

-- Prevent updating original_planned_qty after the row exists (v1-spec §12 immutability)
create or replace function trg_production_plans_freeze_original()
returns trigger
language plpgsql
as $$
begin
  if new.original_planned_qty is distinct from old.original_planned_qty then
    raise exception 'production_plans.original_planned_qty is immutable once set';
  end if;
  return new;
end
$$;

create trigger production_plans_freeze_original
  before update on production_plans
  for each row execute function trg_production_plans_freeze_original();

-- Prevent updating committed_expected_qty once it has been set (v1-spec §2 event_demand)
create or replace function trg_event_demand_freeze_committed()
returns trigger
language plpgsql
as $$
begin
  if old.committed_expected_qty is not null
     and new.committed_expected_qty is distinct from old.committed_expected_qty then
    raise exception 'event_demand.committed_expected_qty is immutable once set';
  end if;
  return new;
end
$$;

create trigger event_demand_freeze_committed
  before update on event_demand
  for each row execute function trg_event_demand_freeze_committed();
