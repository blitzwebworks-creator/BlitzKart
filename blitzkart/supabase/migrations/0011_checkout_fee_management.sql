-- Checkout fees are disabled until an administrator explicitly enables them.
-- Packaging's default amount is retained as a preset; it is not charged by default.
create table public.checkout_fee_settings (
  id smallint primary key check (id = 1),
  packaging_enabled boolean not null default false,
  packaging_amount numeric(12,2) not null default 5 check (packaging_amount >= 0),
  platform_enabled boolean not null default false,
  platform_amount numeric(12,2) not null default 0 check (platform_amount >= 0),
  handling_enabled boolean not null default false,
  handling_amount numeric(12,2) not null default 0 check (handling_amount >= 0),
  updated_at timestamptz not null default now()
);

insert into public.checkout_fee_settings(id) values (1) on conflict (id) do nothing;
alter table public.checkout_fee_settings enable row level security;
create policy checkout_fee_settings_admin_read on public.checkout_fee_settings
  for select to authenticated using (public.is_admin());
create policy checkout_fee_settings_admin_update on public.checkout_fee_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.checkout_fee_settings from anon, public;
grant select, update on public.checkout_fee_settings to authenticated;
grant select on public.checkout_fee_settings to service_role;

alter table public.orders
  add column packaging_fee numeric(12,2) not null default 0 check (packaging_fee >= 0),
  add column platform_fee numeric(12,2) not null default 0 check (platform_fee >= 0),
  add column handling_fee numeric(12,2) not null default 0 check (handling_fee >= 0);

-- Keep the existing server-only order placement path and take a stable snapshot
-- of current fees, delivery prices, product prices and coupon values in one txn.
create or replace function public.place_order(
  p_customer_id uuid,p_address jsonb,p_lines jsonb,p_delivery_method text,p_coupon_code text default null
) returns uuid
language plpgsql security definer set search_path=pg_catalog,extensions,public
as $$
declare
  v_user uuid:=p_customer_id; v_order uuid:=gen_random_uuid();
  v_number text:='BK-'||to_char(now() at time zone 'Asia/Kolkata','YYMMDD')||'-'||upper(substr(encode(extensions.gen_random_bytes(5),'hex'),1,8));
  v_line jsonb; v_product public.products%rowtype; v_qty integer; v_stock public.inventory%rowtype;
  v_subtotal numeric(12,2):=0; v_delivery_charge numeric(12,2); v_product_delivery_charge numeric(12,2):=0;
  v_packaging_fee numeric(12,2):=0; v_platform_fee numeric(12,2):=0; v_handling_fee numeric(12,2):=0;
  v_discount numeric(12,2):=0; v_coupon public.coupons%rowtype; v_payload jsonb:='[]'::jsonb;
  v_account_status text; v_zone public.delivery_zones%rowtype; v_eta text; v_fees public.checkout_fee_settings%rowtype;
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

  select * into v_fees from public.checkout_fee_settings where id=1 for share;
  if not found then raise exception 'Checkout fee settings are not configured'; end if;
  v_packaging_fee:=case when v_fees.packaging_enabled then v_fees.packaging_amount else 0 end;
  v_platform_fee:=case when v_fees.platform_enabled then v_fees.platform_amount else 0 end;
  v_handling_fee:=case when v_fees.handling_enabled then v_fees.handling_amount else 0 end;

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
    v_discount:=least(v_subtotal,case when v_coupon.discount_type='percentage' then round(v_subtotal*v_coupon.discount_value/100,2) else v_coupon.discount_value end);
    update public.coupons set usage_count=usage_count+1 where id=v_coupon.id;
  end if;

  insert into public.orders(
    id,customer_id,order_number,status,payment_status,subtotal,coupon_id,discount_amount,
    packaging_fee,platform_fee,handling_fee,delivery_charge,product_delivery_charge,total,
    delivery_address,delivery_method,delivery_pincode,delivery_location,estimated_delivery
  ) values (
    v_order,v_user,v_number,'pending','pending',v_subtotal,v_coupon.id,v_discount,
    v_packaging_fee,v_platform_fee,v_handling_fee,v_delivery_charge,v_product_delivery_charge,
    v_subtotal-v_discount+v_packaging_fee+v_platform_fee+v_handling_fee+v_delivery_charge+v_product_delivery_charge,
    p_address,p_delivery_method,v_zone.postal_code,v_zone.locality,v_eta
  );
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

-- Publish a data-free update signal so the existing admin live refresh sees fee changes.
drop trigger if exists admin_live_change on public.checkout_fee_settings;
create trigger admin_live_change after insert or update or delete on public.checkout_fee_settings
  for each row execute function public.publish_admin_live_change();

notify pgrst,'reload schema';
