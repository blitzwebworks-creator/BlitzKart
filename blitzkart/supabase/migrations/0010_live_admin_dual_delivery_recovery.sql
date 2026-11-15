-- Dual, independently configured delivery modes and immutable order snapshots.
alter table public.delivery_zones
  add column blitz_enabled boolean not null default false,
  add column standard_enabled boolean not null default false,
  add column blitz_price numeric(12,2) not null default 65 check (blitz_price >= 0),
  add column standard_price numeric(12,2) not null default 50 check (standard_price >= 0),
  add column blitz_eta text not null default 'Same Day' check (length(blitz_eta) between 1 and 80),
  add column standard_eta text not null default '2–4 Days' check (length(standard_eta) between 1 and 80);

alter table public.orders
  add column delivery_method text check (delivery_method in ('blitz','standard')),
  add column delivery_pincode text,
  add column delivery_location text,
  add column estimated_delivery text;

drop function if exists public.lookup_delivery_pincode(text);
create function public.lookup_delivery_pincode(p_postal_code text)
returns table(
  postal_code text, locality text, district text, state text, locality_aliases text[],
  is_serviceable boolean, delivery_charge numeric, minimum_order_amount numeric,
  estimated_delivery_minutes integer, blitz_enabled boolean, standard_enabled boolean,
  blitz_price numeric, standard_price numeric, blitz_eta text, standard_eta text
)
language sql stable security definer set search_path=pg_catalog,public
as $$
  select z.postal_code,z.locality,z.district,z.state,z.locality_aliases,
    (z.is_active and (z.blitz_enabled or z.standard_enabled)),z.delivery_charge,
    z.minimum_order_amount,z.estimated_delivery_minutes,z.blitz_enabled,z.standard_enabled,
    z.blitz_price,z.standard_price,z.blitz_eta,z.standard_eta
  from public.delivery_zones z
  where p_postal_code ~ '^[0-9]{6}$' and z.postal_code=p_postal_code and z.is_directory_verified
$$;
revoke all on function public.lookup_delivery_pincode(text) from public;
grant execute on function public.lookup_delivery_pincode(text) to anon,authenticated;

create or replace function public.validate_order_delivery_pincode() returns trigger
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_zone public.delivery_zones%rowtype; v_locality text; v_expected_charge numeric(12,2); v_expected_eta text;
begin
  if lower(trim(coalesce(new.delivery_address->>'city',''))) <> 'new delhi'
     or lower(trim(coalesce(new.delivery_address->>'state',''))) not in ('delhi','delhi nct','national capital territory of delhi') then
    raise exception 'Delivery is available only in Delhi';
  end if;
  select * into v_zone from public.delivery_zones
    where postal_code=trim(new.delivery_address->>'postal_code') and city='New Delhi'
      and state='Delhi' and is_directory_verified and is_active for share;
  if not found then raise exception 'Delivery is not available for this PIN code'; end if;
  v_locality := lower(trim(coalesce(new.delivery_address->>'locality','')));
  if v_locality <> lower(v_zone.locality) and not exists(
    select 1 from unnest(v_zone.locality_aliases) as locality_alias(value)
    where lower(trim(locality_alias.value))=v_locality
  ) then raise exception 'Choose a listed postal locality for this PIN code'; end if;
  if new.delivery_method='blitz' and v_zone.blitz_enabled then
    v_expected_charge := v_zone.blitz_price; v_expected_eta := v_zone.blitz_eta;
  elsif new.delivery_method='standard' and v_zone.standard_enabled then
    v_expected_charge := v_zone.standard_price; v_expected_eta := v_zone.standard_eta;
  else
    raise exception 'Selected delivery method is unavailable for this PIN code';
  end if;
  if new.delivery_charge is distinct from v_expected_charge then raise exception 'Delivery charge changed; refresh checkout'; end if;
  if new.subtotal < v_zone.minimum_order_amount then raise exception 'This PIN code requires a minimum order amount of %', v_zone.minimum_order_amount; end if;
  new.delivery_pincode := v_zone.postal_code;
  new.delivery_location := v_zone.locality;
  new.estimated_delivery := v_expected_eta;
  return new;
end $$;

drop function if exists public.place_order(uuid,jsonb,jsonb,text);
create function public.place_order(
  p_customer_id uuid,p_address jsonb,p_lines jsonb,p_delivery_method text,p_coupon_code text default null
) returns uuid
language plpgsql security definer set search_path=pg_catalog,extensions,public
as $$
declare
  v_user uuid:=p_customer_id; v_order uuid:=gen_random_uuid();
  v_number text:='BK-'||to_char(now() at time zone 'Asia/Kolkata','YYMMDD')||'-'||upper(substr(encode(extensions.gen_random_bytes(5),'hex'),1,8));
  v_line jsonb; v_product public.products%rowtype; v_qty integer; v_stock public.inventory%rowtype;
  v_subtotal numeric(12,2):=0; v_delivery_charge numeric(12,2); v_product_delivery_charge numeric(12,2):=0;
  v_discount numeric(12,2):=0; v_coupon public.coupons%rowtype; v_payload jsonb:='[]'::jsonb;
  v_account_status text; v_zone public.delivery_zones%rowtype; v_eta text;
begin
  if auth.role()<>'service_role' then raise exception 'Server checkout is required'; end if;
  if v_user is null then raise exception 'An active customer account is required to place an order'; end if;
  select account_status into v_account_status from public.profiles where id=v_user;
  if not found or v_account_status<>'active' then raise exception 'An active customer account is required to place an order'; end if;
  if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'Your cart is empty'; end if;
  if length(coalesce(p_address->>'recipient_name','')) not between 1 and 100
    or length(coalesce(p_address->>'phone','')) not between 7 and 20
    or length(coalesce(p_address->>'address_line1','')) not between 1 and 200
    or length(coalesce(p_address->>'locality','')) not between 1 and 100
    or length(coalesce(p_address->>'city','')) not between 1 and 100
    or length(coalesce(p_address->>'state','')) not between 1 and 100
    or (p_address->>'postal_code') !~ '^110[0-9]{3}$' then raise exception 'Please provide a complete delivery address'; end if;
  if p_delivery_method not in ('blitz','standard') then raise exception 'Choose a delivery method'; end if;
  select * into v_zone from public.delivery_zones
    where postal_code=trim(p_address->>'postal_code') and city='New Delhi' and state='Delhi'
      and is_directory_verified and is_active for share;
  if not found then raise exception 'Delivery is not available for this New Delhi PIN code yet'; end if;
  if p_delivery_method='blitz' and v_zone.blitz_enabled then
    v_delivery_charge:=v_zone.blitz_price; v_eta:=v_zone.blitz_eta;
  elsif p_delivery_method='standard' and v_zone.standard_enabled then
    v_delivery_charge:=v_zone.standard_price; v_eta:=v_zone.standard_eta;
  else raise exception 'Selected delivery method is unavailable for this PIN code'; end if;
  if lower(trim(p_address->>'locality'))<>lower(v_zone.locality) and not exists(
    select 1 from unnest(v_zone.locality_aliases) as locality_alias(value)
    where lower(trim(locality_alias.value))=lower(trim(p_address->>'locality'))
  ) then raise exception 'Choose a listed postal locality for this PIN code'; end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_qty:=(v_line->>'quantity')::integer;
    if v_qty<1 or v_qty>50 then raise exception 'Quantity is outside the allowed range'; end if;
    select * into v_product from public.products where id=(v_line->>'product_id')::uuid and is_active for share;
    if not found then raise exception 'A product in your cart is unavailable'; end if;
    select * into v_stock from public.inventory where product_id=v_product.id for update;
    if not found or v_stock.quantity-v_stock.reserved_quantity<v_qty then raise exception 'Insufficient stock for %',v_product.name; end if;
    update public.inventory set reserved_quantity=reserved_quantity+v_qty,updated_at=now() where product_id=v_product.id;
    v_subtotal:=v_subtotal+(v_product.selling_price*v_qty);
    v_product_delivery_charge:=v_product_delivery_charge+(coalesce(v_product.product_delivery_charge,0)*v_qty);
    v_payload:=v_payload||jsonb_build_array(jsonb_build_object('product_id',v_product.id,'name',v_product.name,'sku',v_product.sku,'quantity',v_qty,'unit_price',v_product.selling_price,'line_total',v_product.selling_price*v_qty));
  end loop;
  if v_subtotal<v_zone.minimum_order_amount then raise exception 'This PIN code requires a minimum order amount of %',v_zone.minimum_order_amount; end if;

  if nullif(trim(p_coupon_code),'') is not null then
    select * into v_coupon from public.coupons where code=upper(trim(p_coupon_code)) and is_active for update;
    if not found then raise exception 'This coupon is not valid'; end if;
    if v_coupon.expires_at is not null and v_coupon.expires_at<=now() then raise exception 'This coupon has expired'; end if;
    if v_subtotal<v_coupon.minimum_order_value then raise exception 'Your cart does not meet this coupon minimum'; end if;
    if v_coupon.usage_limit is not null and v_coupon.usage_count>=v_coupon.usage_limit then raise exception 'This coupon has reached its usage limit'; end if;
    v_discount:=case when v_coupon.discount_type='percentage' then round(v_subtotal*v_coupon.discount_value/100,2) else least(v_subtotal,v_coupon.discount_value) end;
    update public.coupons set usage_count=usage_count+1 where id=v_coupon.id;
  end if;

  insert into public.orders(id,customer_id,order_number,status,payment_status,subtotal,coupon_id,discount_amount,delivery_charge,product_delivery_charge,total,delivery_address,delivery_method,delivery_pincode,delivery_location,estimated_delivery)
  values(v_order,v_user,v_number,'pending','pending',v_subtotal,v_coupon.id,v_discount,v_delivery_charge,v_product_delivery_charge,v_subtotal-v_discount+v_delivery_charge+v_product_delivery_charge,p_address,p_delivery_method,v_zone.postal_code,v_zone.locality,v_eta);
  insert into public.addresses(customer_id,recipient_name,phone,address_line1,address_line2,locality,city,state,postal_code,landmark,is_default)
    values(v_user,trim(p_address->>'recipient_name'),trim(p_address->>'phone'),trim(p_address->>'address_line1'),nullif(trim(coalesce(p_address->>'address_line2','')),''),trim(p_address->>'locality'),trim(p_address->>'city'),trim(p_address->>'state'),trim(p_address->>'postal_code'),nullif(trim(coalesce(p_address->>'landmark','')),''),not exists(select 1 from public.addresses where customer_id=v_user))
    on conflict(customer_id,phone,postal_code,address_line1,locality,city,state) do update set recipient_name=excluded.recipient_name,address_line2=excluded.address_line2,landmark=excluded.landmark,updated_at=now();
  insert into public.order_items(order_id,product_id,product_name,sku,quantity,unit_price,line_total)
    select v_order,(x->>'product_id')::uuid,x->>'name',x->>'sku',(x->>'quantity')::integer,(x->>'unit_price')::numeric,(x->>'line_total')::numeric from jsonb_array_elements(v_payload) x;
  insert into public.order_status_history(order_id,previous_status,new_status,changed_by,note) values(v_order,null,'pending',v_user,'Order submitted; payment is pending.');
  if v_coupon.id is not null then insert into public.coupon_usage(coupon_id,customer_id,order_id) values(v_coupon.id,v_user,v_order); end if;
  delete from public.cart_items where cart_id in(select id from public.carts where customer_id=v_user);
  return v_order;
end $$;
revoke all on function public.place_order(uuid,jsonb,jsonb,text,text) from public;
grant execute on function public.place_order(uuid,jsonb,jsonb,text,text) to service_role;

create function public.set_customer_default_address(p_address_id uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public
as $$
begin
  if auth.uid() is null or not public.is_active_customer() then raise exception 'An active customer account is required'; end if;
  if not exists(select 1 from public.addresses where id=p_address_id and customer_id=auth.uid()) then raise exception 'Saved address not found'; end if;
  update public.addresses set is_default=(id=p_address_id),updated_at=now() where customer_id=auth.uid() and is_default is distinct from (id=p_address_id);
end $$;
revoke all on function public.set_customer_default_address(uuid) from public,anon,service_role;
grant execute on function public.set_customer_default_address(uuid) to authenticated;

-- A change signal contains no business data. Admin clients listen to it and refresh
-- their server-rendered page; a short polling fallback covers Realtime disconnects.
create table public.admin_live_events(
  id smallint primary key check(id=1),
  table_name text not null,
  operation text not null,
  changed_at timestamptz not null default now()
);
insert into public.admin_live_events(id,table_name,operation) values(1,'bootstrap','UPDATE') on conflict(id) do nothing;
alter table public.admin_live_events enable row level security;
create policy admin_live_events_read on public.admin_live_events for select to authenticated using(public.is_admin());
revoke all on public.admin_live_events from anon,public;
grant select on public.admin_live_events to authenticated;

create or replace function public.publish_admin_live_change() returns trigger
language plpgsql security definer set search_path=pg_catalog,public
as $$
begin
  insert into public.admin_live_events(id,table_name,operation,changed_at)
  values(1,tg_table_name,tg_op,clock_timestamp())
  on conflict(id) do update set table_name=excluded.table_name,operation=excluded.operation,changed_at=excluded.changed_at;
  return null;
end $$;
revoke all on function public.publish_admin_live_change() from public,anon,authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','categories','promotional_banners','products','product_images','inventory','inventory_movements',
    'carts','cart_items','addresses','delivery_zones','orders','order_items','order_status_history',
    'support_requests','coupons','coupon_usage','deliveries','delivery_history','suppliers','sourcing_records',
    'internal_order_notes','payment_webhook_events','customer_requests','customer_notifications','product_reviews'
  ] loop
    if to_regclass('public.'||t) is not null then
      execute format('drop trigger if exists admin_live_change on public.%I',t);
      execute format('create trigger admin_live_change after insert or update or delete on public.%I for each row execute function public.publish_admin_live_change()',t);
    end if;
  end loop;
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
    and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='admin_live_events') then
    alter publication supabase_realtime add table public.admin_live_events;
  end if;
end $$;

notify pgrst,'reload schema';
