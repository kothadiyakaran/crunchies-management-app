-- 0006_event_demand_unfreeze.sql
-- Allow committed_expected_qty to be reset to NULL (used when an event's
-- starts_on is edited from past back to future — see v1-spec §6 behaviour calls).
-- Other UPDATEs to a different non-null value remain blocked.

create or replace function trg_event_demand_freeze_committed()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if old.committed_expected_qty is not null
     and new.committed_expected_qty is not null
     and new.committed_expected_qty is distinct from old.committed_expected_qty then
    raise exception 'event_demand.committed_expected_qty is immutable once set (only NULL reset allowed)';
  end if;
  return new;
end
$$;
