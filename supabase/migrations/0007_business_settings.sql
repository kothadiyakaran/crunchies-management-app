-- 0007_business_settings.sql
-- Single-row business identity table backing /settings UI and the bill PDF.
-- Sprint 9 T9.1 — replaces the constants currently in src/lib/business.ts.
--
-- Single-row enforcement: unique index on a constant column ((true)) — second
-- INSERT raises unique_violation. Authenticated mom can SELECT/UPDATE/INSERT/DELETE
-- (only one INSERT will ever succeed); anon has NO direct table access and reads
-- the customer-facing subset via public_get_business_identity() below.

set search_path = public, extensions;

create table public.business_settings (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  tagline         text,
  address_lines   text[] not null default '{}',
  gst_line        text,
  phone           text,
  whatsapp        text,
  email           text,
  bill_footer     text not null default 'Thank you',
  signature_line  text not null default '— Archana',
  updated_at      timestamptz not null default now()
);

-- Enforce single-row: any second INSERT will fail with unique_violation.
create unique index business_settings_singleton on public.business_settings ((true));

-- RLS: authenticated full access, anon no access (no policy for anon).
alter table public.business_settings enable row level security;

create policy authed_all on public.business_settings
  for all to authenticated using (true) with check (true);

-- Seed the single row to match the current src/lib/business.ts:BUSINESS_INFO.
insert into public.business_settings
  (name, tagline, address_lines, gst_line, phone, whatsapp, email, bill_footer, signature_line)
values
  ('Crunchies by Archana',
   'Homemade traditional snacks',
   array['Aundh, Pune 411007'],
   null, null, null, null,
   'Thank you',
   '— Archana');

-- ----------------------------------------------------------------------------
-- public_get_business_identity() -> (name, tagline, whatsapp)
-- Anon-callable read of the customer-facing subset shown on the public
-- exhibition form header / confirmation page. Returns the single seeded row.
-- ----------------------------------------------------------------------------

create or replace function public.public_get_business_identity()
returns table (name text, tagline text, whatsapp text)
language sql
security definer
set search_path = public
as $$
  select name, tagline, whatsapp from business_settings limit 1;
$$;

grant execute on function public.public_get_business_identity() to anon, authenticated;
