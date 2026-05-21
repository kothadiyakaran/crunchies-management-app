-- 0003_function_search_paths.sql
-- Pin search_path on every function we own so a malicious schema (or a future
-- accidental shadowing of a public name) can't redirect calls inside the function
-- body. Recommended by the Supabase security linter
-- (https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable).
--
-- pg_temp is included so plpgsql temp tables still resolve.

alter function next_public_order_number(int)        set search_path = public, pg_temp;
alter function refresh_customer_last_ordered_at(uuid) set search_path = public, pg_temp;
alter function trg_orders_after_change()            set search_path = public, pg_temp;
alter function trg_production_plans_freeze_original() set search_path = public, pg_temp;
alter function trg_event_demand_freeze_committed()  set search_path = public, pg_temp;
alter function auth_is_admin()                       set search_path = public, pg_temp;
