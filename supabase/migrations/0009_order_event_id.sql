-- 0009_order_event_id.sql — link exhibition orders to their event directly.
--
-- Fixes: a repeat customer (same phone) ordering at a DIFFERENT event saw
-- "Order not found." on their confirmation, because public_get_order_by_ref's
-- anti-leak inferred the order's event via customers.source_event_id (the
-- customer's FIRST event, preserved by dedup-on-phone). orders.event_id ties
-- each order to its actual event, so cross-event repeat orders resolve.

set search_path = public, extensions;

alter table public.orders
  add column event_id uuid references public.events(id) on delete set null;

-- Backfill existing exhibition orders so their confirmations keep working under
-- the new anti-leak. (Non-exhibition orders keep event_id = null.)
update public.orders o
set event_id = c.source_event_id
from public.customers c
where o.customer_id = c.id
  and o.source = 'exhibition_form'
  and c.source_event_id is not null;

-- ----------------------------------------------------------------------------
-- public_create_exhibition_order — now stamps orders.event_id = the event.
-- (Unchanged from 0005 except the order insert.)
-- ----------------------------------------------------------------------------
create or replace function public_create_exhibition_order(
  p_slug text,
  p_name text,
  p_phone text,
  p_notes text,
  p_items jsonb,
  p_honeypot text default ''
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_event events%rowtype;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_customer_id uuid;
  v_existing_customer customers%rowtype;
  v_order_id uuid;
  v_public_number text;
  v_exhibition_channel_id uuid;
  v_year int := extract(year from now())::int;
  v_item jsonb;
  v_product_price numeric;
  v_clean_phone text;
begin
  -- Honeypot
  if p_honeypot is not null and length(p_honeypot) > 0 then
    return null;
  end if;

  -- Validate inputs
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'name required';
  end if;
  v_clean_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  if length(v_clean_phone) = 12 and left(v_clean_phone, 2) = '91' then
    v_clean_phone := right(v_clean_phone, 10);
  end if;
  if length(v_clean_phone) <> 10 or left(v_clean_phone, 1) not in ('6','7','8','9') then
    raise exception 'invalid phone';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'no items';
  end if;

  -- Event window check
  select * into v_event from events where slug = p_slug;
  if not found or v_event.kind <> 'exhibition' or not v_event.active
     or v_today < v_event.starts_on or v_today > v_event.ends_on then
    raise exception 'event not accepting orders';
  end if;

  -- Dedup-on-phone (active OR archived; reactivate if archived)
  select * into v_existing_customer from customers where phone = v_clean_phone;
  if found then
    v_customer_id := v_existing_customer.id;
    if not v_existing_customer.active then
      update customers set active = true where id = v_customer_id;
    end if;
    -- Do NOT update source_event_id (provenance preserved per §10)
  else
    select id into v_exhibition_channel_id
      from channels where lower(name) = 'exhibition' and is_system = true limit 1;
    insert into customers (name, phone, channel_id, source_event_id, active)
    values (trim(p_name), v_clean_phone, v_exhibition_channel_id, v_event.id, true)
    returning id into v_customer_id;
  end if;

  -- Allocate public order number atomically
  v_public_number := next_public_order_number(v_year);

  -- Create order (event_id ties it to THIS event — see 0009)
  insert into orders (customer_id, ordered_at, target_fulfilment_date, source,
                      payment_status, notes, public_order_number, event_id)
  values (v_customer_id, now(), null, 'exhibition_form',
          'unpaid', nullif(trim(coalesce(p_notes, '')), ''), v_public_number, v_event.id)
  returning id into v_order_id;

  -- Insert order_items with unit_price snapshot from products.default_price
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select default_price into v_product_price
      from products where id = (v_item->>'product_id')::uuid and active = true;
    if v_product_price is null then
      raise exception 'product not found or inactive';
    end if;
    insert into order_items (order_id, product_id, qty, unit_price)
    values (v_order_id, (v_item->>'product_id')::uuid,
            (v_item->>'qty')::numeric, v_product_price);
  end loop;

  return json_build_object(
    'order_id', v_order_id,
    'public_order_number', v_public_number
  );
end
$$;

grant execute on function public_create_exhibition_order(text, text, text, text, jsonb, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- public_get_order_by_ref — anti-leak now matches orders.event_id to the event
-- identified by p_slug (was customers.source_event_id, which broke cross-event
-- repeat customers). Still requires source = 'exhibition_form'.
-- ----------------------------------------------------------------------------
create or replace function public_get_order_by_ref(p_slug text, p_order_id uuid)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_event events%rowtype;
  v_order orders%rowtype;
  v_customer customers%rowtype;
  v_items json;
  v_total numeric;
begin
  select * into v_event from events where slug = p_slug;
  if not found then return null; end if;

  select * into v_order from orders where id = p_order_id;
  if not found then return null; end if;
  if v_order.source <> 'exhibition_form' then return null; end if;
  -- Anti-leak: the order must belong to THIS event. Linked directly via
  -- orders.event_id (0009) so repeat customers at a different event still
  -- resolve — provenance (customers.source_event_id) is not the order's event.
  if v_order.event_id is null or v_order.event_id <> v_event.id then
    return null;
  end if;

  select * into v_customer from customers where id = v_order.customer_id;
  if not found then return null; end if;

  select coalesce(json_agg(
    json_build_object(
      'product_id', oi.product_id,
      'name', p.name,
      'unit', p.unit,
      'qty', oi.qty,
      'unit_price', oi.unit_price
    ) order by p.name
  ), '[]'::json),
  coalesce(sum(oi.qty * oi.unit_price), 0)
  into v_items, v_total
  from order_items oi join products p on p.id = oi.product_id
  where oi.order_id = v_order.id;

  return json_build_object(
    'order', json_build_object(
      'id', v_order.id,
      'public_order_number', v_order.public_order_number,
      'ordered_at', v_order.ordered_at,
      'notes', v_order.notes,
      'total', v_total
    ),
    'customer', json_build_object(
      'name', v_customer.name,
      'phone', v_customer.phone
    ),
    'event', json_build_object(
      'name', v_event.name,
      'starts_on', v_event.starts_on,
      'ends_on', v_event.ends_on,
      'pickup_window_start', v_event.pickup_window_start,
      'pickup_window_end', v_event.pickup_window_end,
      'venue_line', v_event.venue_line,
      'slug', v_event.slug
    ),
    'items', v_items
  );
end
$$;

grant execute on function public_get_order_by_ref(text, uuid) to anon, authenticated;
