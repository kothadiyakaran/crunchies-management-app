-- 0002_rls.sql
-- Crunchies v1 — Row-Level Security policies.
-- Sources:
--   docs/v1-spec.md §2 RLS sketch
--   docs/v1-spec.md §10 (public exhibition form server-side validation)
--
-- Policy model:
--   * authenticated role (mom + Karan): full CRUD on every table.
--   * admin role (custom claim app_metadata.role = 'admin', i.e. Karan):
--       inherits authenticated access; explicit policies added if/when admin-only
--       surfaces appear (debug RPCs, raw queries). v1 has no admin-only tables.
--   * anon role: ZERO direct table access. The public exhibition form ships in
--       Sprint 5 as a SECURITY DEFINER RPC (`public_create_exhibition_order`) that
--       validates slug + event window + handles dedup-on-phone in a single
--       transaction. Per-table RLS for anon is intentionally NOT enabled because:
--         - inserts span customers + orders + order_items atomically;
--         - server-side dedup-on-phone (v1-spec §10) can't leak via RLS errors;
--         - slug + active-window check is one validation point, not three.
--
-- Until the RPC ships, anonymous users cannot insert anything. This is correct
-- for Sprint 0 — there is no public form yet.

-- ---------------------------------------------------------------------------
-- Enable RLS on every user-facing table
-- ---------------------------------------------------------------------------

alter table channels                       enable row level security;
alter table products                       enable row level security;
alter table events                         enable row level security;
alter table customers                      enable row level security;
alter table orders                         enable row level security;
alter table order_items                    enable row level security;
alter table production_logs                enable row level security;
alter table production_plans               enable row level security;
alter table seed_demand                    enable row level security;
alter table event_demand                   enable row level security;
alter table complaints                     enable row level security;
alter table public_order_number_counter    enable row level security;

-- ---------------------------------------------------------------------------
-- Authenticated full-access policies (mom + admin)
-- ---------------------------------------------------------------------------

create policy authed_all on channels
  for all to authenticated using (true) with check (true);

create policy authed_all on products
  for all to authenticated using (true) with check (true);

create policy authed_all on events
  for all to authenticated using (true) with check (true);

create policy authed_all on customers
  for all to authenticated using (true) with check (true);

create policy authed_all on orders
  for all to authenticated using (true) with check (true);

create policy authed_all on order_items
  for all to authenticated using (true) with check (true);

create policy authed_all on production_logs
  for all to authenticated using (true) with check (true);

create policy authed_all on production_plans
  for all to authenticated using (true) with check (true);

create policy authed_all on seed_demand
  for all to authenticated using (true) with check (true);

create policy authed_all on event_demand
  for all to authenticated using (true) with check (true);

create policy authed_all on complaints
  for all to authenticated using (true) with check (true);

-- public_order_number_counter is touched only by the SECURITY DEFINER function;
-- no policies needed for direct access.

-- ---------------------------------------------------------------------------
-- Helper: is the current JWT an admin?
-- Mom = authenticated (default). Karan = authenticated with app_metadata.role = 'admin'.
-- Use this in future policies that should be admin-only (e.g., destructive RPCs).
-- ---------------------------------------------------------------------------

create or replace function auth_is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;

grant execute on function auth_is_admin() to authenticated, anon;
