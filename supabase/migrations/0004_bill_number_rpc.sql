-- Allocates a bill number for an order. If the order already has one (e.g. mom
-- regenerates the bill), returns the existing number — the sequence is not
-- advanced. Otherwise pulls nextval from bill_number_seq, persists it on the
-- order row, and returns it. Atomic within the function body.
create or replace function public.allocate_bill_number(p_order_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing int;
  v_new int;
begin
  select bill_number into v_existing from orders where id = p_order_id;
  if v_existing is not null then
    return v_existing;
  end if;
  v_new := nextval('bill_number_seq');
  update orders set bill_number = v_new where id = p_order_id;
  return v_new;
end;
$$;

grant execute on function public.allocate_bill_number(uuid) to authenticated;
