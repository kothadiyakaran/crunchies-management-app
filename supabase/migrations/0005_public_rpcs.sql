-- 0005_public_rpcs.sql
-- Three SECURITY DEFINER functions backing the public exhibition form (v1-spec §10).
-- Anon role retains zero direct table access (per 0002_rls.sql); all surface area
-- lives in these RPCs, which enforce slug + active-window + anti-leak validation.

set search_path = public, extensions;

-- ----------------------------------------------------------------------------
-- public_get_event_by_slug(p_slug) -> json
-- Used by the public form's initial page load. Returns event meta + product list
-- if the event exists; window_state field signals whether to render the form or
-- a fail landing. Returns NULL only when slug not found / not an exhibition.
-- ----------------------------------------------------------------------------

create or replace function public_get_event_by_slug(p_slug text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_event events%rowtype;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_window_state text;
  v_products json;
begin
  select * into v_event from events where slug = p_slug;
  if not found then
    return null;
  end if;

  if v_event.kind <> 'exhibition' then
    return null;
  end if;

  if not v_event.active then
    v_window_state := 'inactive';
  elsif v_today < v_event.starts_on then
    v_window_state := 'not_yet_open';
  elsif v_today > v_event.ends_on then
    v_window_state := 'ended';
  else
    v_window_state := 'open';
  end if;

  -- Product list (active only, both in-house and aggregated per §10 — public form
  -- shows aggregated with source_maker_name disclosure)
  select coalesce(json_agg(
    json_build_object(
      'id', p.id,
      'name', p.name,
      'unit', p.unit,
      'default_price', p.default_price,
      'is_aggregated', p.is_aggregated,
      'source_maker_name', p.source_maker_name
    ) order by p.is_aggregated asc, p.name asc
  ), '[]'::json) into v_products
  from products p
  where p.active = true;

  return json_build_object(
    'event', json_build_object(
      'id', v_event.id,
      'name', v_event.name,
      'starts_on', v_event.starts_on,
      'ends_on', v_event.ends_on,
      'pickup_window_start', v_event.pickup_window_start,
      'pickup_window_end', v_event.pickup_window_end,
      'venue_line', v_event.venue_line,
      'slug', v_event.slug
    ),
    'window_state', v_window_state,
    'products', v_products
  );
end
$$;

grant execute on function public_get_event_by_slug(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- public_create_exhibition_order(p_slug, p_name, p_phone, p_notes, p_items, p_honeypot)
-- p_items: jsonb array of { product_id: uuid, qty: number }, qty > 0.
-- p_honeypot: hidden CSS field; if filled, silently no-op (return null).
-- Dedup-on-phone: matching customer reactivated if archived (§10 + ADR-26 carry).
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

  -- Create order
  insert into orders (customer_id, ordered_at, target_fulfilment_date, source,
                      payment_status, notes, public_order_number)
  values (v_customer_id, now(), null, 'exhibition_form',
          'unpaid', nullif(trim(coalesce(p_notes, '')), ''), v_public_number)
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
-- public_get_order_by_ref(p_slug, p_order_id) -> json
-- Anti-leak: returns NULL unless the order's customer.source_event_id matches the
-- event identified by p_slug AND order.source = 'exhibition_form'. This prevents
-- enumerating other customers' orders by tampering with the ref query param.
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

  select * into v_customer from customers where id = v_order.customer_id;
  if not found then return null; end if;
  -- Anti-leak: order must belong to a customer whose source_event_id is this event.
  if v_customer.source_event_id is null or v_customer.source_event_id <> v_event.id then
    return null;
  end if;

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
