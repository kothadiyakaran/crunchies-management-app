-- 0010: purchases feature — vendors, categories, purchases (trips), purchase_items.
-- Authed-only. No anon access, no RPCs (feature has zero public surface).
set search_path = public, extensions;

create table vendors (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(trim(name)) between 1 and 60),
  created_at  timestamptz not null default now()
);
create unique index vendors_name_lower_uq on vendors (lower(name));

create table purchase_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(trim(name)) between 1 and 20),
  is_system   boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index purchase_categories_name_lower_uq on purchase_categories (lower(name));

create table purchases (
  id            uuid primary key default gen_random_uuid(),
  vendor_id     uuid not null references vendors(id),
  purchased_on  date not null,
  note          text,
  created_at    timestamptz not null default now()
);
create index purchases_purchased_on_idx on purchases (purchased_on desc);
create index purchases_vendor_idx on purchases (vendor_id);

create table purchase_items (
  id           uuid primary key default gen_random_uuid(),
  purchase_id  uuid not null references purchases(id) on delete cascade,
  item_name    text not null check (char_length(trim(item_name)) between 1 and 60),
  category_id  uuid not null references purchase_categories(id),
  qty          numeric(12,3) check (qty > 0),
  unit         text,
  amount       numeric(10,2) not null check (amount >= 0),
  created_at   timestamptz not null default now()
);
create index purchase_items_purchase_idx on purchase_items (purchase_id);
create index purchase_items_name_lower_idx on purchase_items (lower(item_name));

insert into purchase_categories (name, is_system) values
  ('Ingredients', true),
  ('Packaging', true),
  ('Made products', true),
  ('Fuel', true),
  ('Other', true);

alter table vendors enable row level security;
alter table purchase_categories enable row level security;
alter table purchases enable row level security;
alter table purchase_items enable row level security;

create policy authed_all on vendors
  for all to authenticated using (true) with check (true);
create policy authed_all on purchase_categories
  for all to authenticated using (true) with check (true);
create policy authed_all on purchases
  for all to authenticated using (true) with check (true);
create policy authed_all on purchase_items
  for all to authenticated using (true) with check (true);
