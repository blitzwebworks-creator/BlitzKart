-- Admin-created customer orders/returns and auditable request removal.
-- Requests are archived from customer/admin queues instead of hard-deleted, preserving evidence.

alter table public.support_requests
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

alter table public.customer_requests
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null,
  add column if not exists return_number text,
  add column if not exists return_items jsonb not null default '[]'::jsonb,
  add column if not exists admin_notes text,
  add column if not exists admin_created boolean not null default false,
  add column if not exists admin_created_by uuid references auth.users(id) on delete set null,
  add constraint customer_requests_return_items_array check (jsonb_typeof(return_items) = 'array');

create unique index if not exists customer_requests_return_number_unique
  on public.customer_requests(return_number) where return_number is not null;
create index if not exists customer_requests_order_active_idx
  on public.customer_requests(order_id,created_at desc) where deleted_at is null;

alter table public.orders
  add column if not exists order_source text not null default 'checkout'
    check (order_source in ('checkout','admin')),
  add column if not exists admin_created_by uuid references auth.users(id) on delete set null;

alter table public.orders drop constraint if exists orders_return_status_check;
alter table public.orders add constraint orders_return_status_check check (
  return_status is null or return_status in (
    'return_requested','return_approved','return_pickup_scheduled','item_received',
    'refund_initiated','refunded','return_rejected',
    'return_initiated','out_for_pickup','returned_successfully'
  )
);
alter table public.order_return_history drop constraint if exists order_return_history_new_status_check;
alter table public.order_return_history add constraint order_return_history_new_status_check check (
  new_status in (
    'return_requested','return_approved','return_pickup_scheduled','item_received',
    'refund_initiated','refunded','return_rejected',
    'return_initiated','out_for_pickup','returned_successfully'
  )
);

create table if not exists public.admin_activity_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on delete set null,
  action text not null check (length(action) between 1 and 80),
  entity_type text not null check (entity_type in ('order','return','customer_request','support_request')),
  entity_id uuid,
  entity_reference text,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);
create index if not exists admin_activity_log_created_idx on public.admin_activity_log(created_at desc);
create index if not exists admin_activity_log_entity_idx on public.admin_activity_log(entity_type,entity_id,created_at desc);
alter table public.admin_activity_log enable row level security;
drop policy if exists admin_activity_log_admin_read on public.admin_activity_log;
create policy admin_activity_log_admin_read on public.admin_activity_log
  for select to authenticated using (public.is_admin());
revoke all on public.admin_activity_log from anon,public,authenticated;
grant select on public.admin_activity_log to authenticated;
grant select on public.admin_activity_log to service_role;

create or replace function public.admin_delete_customer_request(p_request_id uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_request public.customer_requests%rowtype;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  select * into v_request from public.customer_requests where id=p_request_id and deleted_at is null for update;
  if not found then raise exception 'Customer request was not found or was already removed'; end if;
  update public.customer_requests set deleted_at=clock_timestamp(),deleted_by=auth.uid(),updated_at=clock_timestamp() where id=p_request_id;
  delete from public.admin_notifications where notification_type='customer_request' and source_id=p_request_id;
  insert into public.admin_activity_log(admin_id,action,entity_type,entity_id,entity_reference,details)
  values(auth.uid(),'request_archived','customer_request',v_request.id,coalesce(v_request.return_number,v_request.order_number),
    jsonb_build_object('request_type',v_request.request_type,'status',v_request.status,'reason',v_request.reason));
end $$;
revoke all on function public.admin_delete_customer_request(uuid) from public,anon;
grant execute on function public.admin_delete_customer_request(uuid) to authenticated;

create or replace function public.admin_delete_support_request(p_request_id uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_request public.support_requests%rowtype;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  select * into v_request from public.support_requests where id=p_request_id and deleted_at is null for update;
  if not found then raise exception 'Support request was not found or was already removed'; end if;
  update public.support_requests set deleted_at=clock_timestamp(),deleted_by=auth.uid(),updated_at=clock_timestamp() where id=p_request_id;
  delete from public.admin_notifications where notification_type='support_request' and source_id=p_request_id;
  insert into public.admin_activity_log(admin_id,action,entity_type,entity_id,entity_reference,details)
  values(auth.uid(),'request_archived','support_request',v_request.id,v_request.subject,
    jsonb_build_object('status',v_request.status,'customer_id',v_request.customer_id,'order_id',v_request.order_id));
end $$;
revoke all on function public.admin_delete_support_request(uuid) from public,anon;
grant execute on function public.admin_delete_support_request(uuid) to authenticated;

create or replace function public.admin_lookup_return(p_order_reference text,p_customer_email text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth
as $$
declare v_order public.orders%rowtype; v_user auth.users%rowtype; v_reference text;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  v_reference:=trim(coalesce(p_order_reference,''));
  if length(v_reference) not between 1 and 100 or length(trim(coalesce(p_customer_email,''))) not between 3 and 320 then raise exception 'Enter an order ID and customer email'; end if;
  select o.* into v_order from public.orders o
   where (o.id::text=v_reference or upper(o.order_number)=upper(v_reference)) and o.payment_environment='live' for update;
  if not found then raise exception 'Order not found'; end if;
  select u.* into v_user from auth.users u where u.id=v_order.customer_id and lower(u.email)=lower(trim(p_customer_email));
  if not found then raise exception 'Order ID and customer email do not match'; end if;
  if v_order.status <> 'delivered' then raise exception 'Returns can only be created for delivered orders'; end if;
  if v_order.return_status not in ('returned_successfully','return_rejected') and v_order.return_status is not null then raise exception 'A return or exchange is already in progress for this order'; end if;
  if exists(select 1 from public.customer_requests r where r.order_id=v_order.id and r.request_type in ('return','exchange') and r.deleted_at is null and r.status in ('open','in_progress','approved')) then
    raise exception 'A return or exchange request is already being reviewed for this order';
  end if;
  if exists(select 1 from public.customer_requests r where r.order_id=v_order.id and r.request_type in ('return','exchange') and r.status<>'rejected' and r.return_items='[]'::jsonb) then
    raise exception 'A previous return has no item-level quantity record, so another return cannot be safely created';
  end if;
  return jsonb_build_object(
    'order',jsonb_build_object('id',v_order.id,'order_number',v_order.order_number,'status',v_order.status,'payment_status',v_order.payment_status,'return_status',v_order.return_status),
    'customer',jsonb_build_object('id',v_user.id,'email',v_user.email,'name',coalesce(nullif((select p.full_name from public.profiles p where p.id=v_user.id),''),v_user.raw_user_meta_data->>'full_name','Customer')),
    'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'product_id',i.product_id,'name',i.product_name,'sku',i.sku,'quantity',i.quantity,'remaining_quantity',greatest(0,i.quantity-coalesce((
        select sum((ri->>'quantity')::integer) from public.customer_requests r2 cross join lateral jsonb_array_elements(r2.return_items) ri
        where r2.order_id=v_order.id and r2.status<>'rejected' and ri->>'order_item_id'=i.id::text
      ),0)),'unit_price',i.unit_price,'line_total',i.line_total) order by i.created_at)
      from public.order_items i where i.order_id=v_order.id),'[]'::jsonb)
  );
end $$;
revoke all on function public.admin_lookup_return(text,text) from public,anon;
grant execute on function public.admin_lookup_return(text,text) to authenticated;

create or replace function public.admin_create_return(
  p_order_id uuid,p_customer_email text,p_items jsonb,p_reason text,p_admin_notes text default null,p_initial_status text default 'return_requested'
) returns uuid language plpgsql security definer set search_path=pg_catalog,public,auth,extensions
as $$
declare
  v_order public.orders%rowtype; v_user auth.users%rowtype; v_item public.order_items%rowtype; v_line jsonb;
  v_request_id uuid:=gen_random_uuid(); v_return_number text:='RT-'||to_char(clock_timestamp() at time zone 'Asia/Kolkata','YYMMDD')||'-'||upper(substr(encode(extensions.gen_random_bytes(5),'hex'),1,8));
  v_items jsonb:='[]'::jsonb; v_qty integer; v_already integer; v_initial text; v_request_status text;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_order_id is null or length(trim(coalesce(p_customer_email,''))) not between 3 and 320 then raise exception 'Enter an order ID and matching customer email'; end if;
  if length(trim(coalesce(p_reason,''))) not between 3 and 120 or length(coalesce(p_admin_notes,''))>2000 then raise exception 'Check the return reason and admin notes'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Select at least one product quantity to return'; end if;
  if jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>50 then raise exception 'Select at least one product quantity to return'; end if;
  v_initial:=coalesce(p_initial_status,'return_requested');
  if v_initial not in ('return_requested','return_approved','return_pickup_scheduled','item_received','refund_initiated','refunded','return_rejected') then raise exception 'Invalid return status'; end if;
  select * into v_order from public.orders where id=p_order_id and payment_environment='live' for update;
  if not found then raise exception 'Order not found'; end if;
  select * into v_user from auth.users where id=v_order.customer_id and lower(email)=lower(trim(p_customer_email));
  if not found then raise exception 'Order and customer email do not match'; end if;
  if v_order.status<>'delivered' then raise exception 'Returns can only be created for delivered orders'; end if;
  if v_order.return_status not in ('returned_successfully','return_rejected') and v_order.return_status is not null then raise exception 'A return or exchange is already in progress for this order'; end if;
  if exists(select 1 from public.customer_requests r where r.order_id=v_order.id and r.request_type in ('return','exchange') and r.deleted_at is null and r.status in ('open','in_progress','approved')) then
    raise exception 'A return or exchange request is already being reviewed for this order';
  end if;
  if exists(select 1 from public.customer_requests r where r.order_id=v_order.id and r.request_type in ('return','exchange') and r.status<>'rejected' and r.return_items='[]'::jsonb) then
    raise exception 'A previous return has no item-level quantity record, so another return cannot be safely created';
  end if;
  if exists(select 1 from (select value->>'order_item_id' as item_id,count(*) as n from jsonb_array_elements(p_items) group by value->>'order_item_id') x where x.n>1) then
    raise exception 'A product may appear only once in the return selection';
  end if;
  for v_line in select value from jsonb_array_elements(p_items) loop
    if coalesce(v_line->>'order_item_id','') !~* '^[0-9a-f-]{36}$' then raise exception 'Invalid order item selection'; end if;
    begin v_qty:=(v_line->>'quantity')::integer; exception when others then raise exception 'Enter a valid return quantity'; end;
    if v_qty is null or v_qty<1 then raise exception 'Return quantity must be at least one'; end if;
    select * into v_item from public.order_items where id=(v_line->>'order_item_id')::uuid and order_id=v_order.id for share;
    if not found then raise exception 'A selected item does not belong to this order'; end if;
    select coalesce(sum((ri->>'quantity')::integer),0) into v_already
      from public.customer_requests r cross join lateral jsonb_array_elements(r.return_items) ri
      where r.order_id=v_order.id and r.status<>'rejected' and ri->>'order_item_id'=v_item.id::text;
    if v_qty>v_item.quantity-v_already then raise exception 'Return quantity exceeds the remaining quantity for %',v_item.product_name; end if;
    v_items:=v_items||jsonb_build_array(jsonb_build_object('order_item_id',v_item.id,'product_id',v_item.product_id,'name',v_item.product_name,'sku',v_item.sku,'quantity',v_qty,'unit_price',v_item.unit_price,'line_total',round(v_item.unit_price*v_qty,2)));
  end loop;
  if v_initial='refund_initiated' and v_order.refund_status is distinct from 'refund_pending' and v_order.refund_status is distinct from 'refunded' then
    raise exception 'Start the verified Razorpay refund workflow before setting this return status';
  end if;
  if v_initial='refunded' and v_order.refund_status is distinct from 'refunded' then raise exception 'Only Razorpay can confirm a completed refund'; end if;
  v_request_status:=case when v_initial='return_requested' then 'open' when v_initial='return_rejected' then 'rejected' when v_initial in ('item_received','refunded') then 'completed' else 'approved' end;
  insert into public.customer_requests(id,customer_id,order_id,order_number,request_type,reason,details,customer_name,customer_email,customer_phone,status,processed_by,processed_at,return_number,return_items,admin_notes,admin_created,admin_created_by)
  select v_request_id,v_order.customer_id,v_order.id,v_order.order_number,'return',trim(p_reason),null,coalesce(nullif(p.full_name,''),v_user.raw_user_meta_data->>'full_name','Customer'),v_user.email,p.phone,v_request_status,
    case when v_request_status='open' then null else auth.uid() end,case when v_request_status='open' then null else now() end,v_return_number,v_items,nullif(trim(coalesce(p_admin_notes,'')),''),true,auth.uid()
  from public.profiles p where p.id=v_order.customer_id;
  if not found then raise exception 'Customer profile is not available'; end if;
  update public.orders set return_status=v_initial,return_request_id=v_request_id,updated_at=now() where id=v_order.id;
  insert into public.order_return_history(order_id,customer_request_id,previous_status,new_status,note,changed_by)
  values(v_order.id,v_request_id,v_order.return_status,v_initial,'Return created by BlitzKart administrator.',auth.uid());
  insert into public.admin_activity_log(admin_id,action,entity_type,entity_id,entity_reference,details)
  values(auth.uid(),'return_created','return',v_request_id,v_return_number,jsonb_build_object('order_id',v_order.id,'order_number',v_order.order_number,'customer_id',v_order.customer_id,'items',v_items,'status',v_initial,'reason',trim(p_reason)));
  return v_request_id;
end $$;
revoke all on function public.admin_create_return(uuid,text,jsonb,text,text,text) from public,anon;
grant execute on function public.admin_create_return(uuid,text,jsonb,text,text,text) to authenticated;

create or replace function public.admin_update_created_return(p_request_id uuid,p_status text,p_note text default null) returns void
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_request public.customer_requests%rowtype; v_order public.orders%rowtype; v_previous text; v_request_status text;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_status not in ('return_requested','return_approved','return_pickup_scheduled','item_received','refund_initiated','refunded','return_rejected') then raise exception 'Invalid return status'; end if;
  select * into v_request from public.customer_requests where id=p_request_id and admin_created and deleted_at is null for update;
  if not found then raise exception 'Admin-created return not found'; end if;
  select * into v_order from public.orders where id=v_request.order_id for update;
  if not found then raise exception 'The linked order is unavailable'; end if;
  v_previous:=v_order.return_status;
  if p_status=v_previous then raise exception 'Choose a different return status'; end if;
  if p_status='return_rejected' then
    if v_previous in ('item_received','refund_initiated','refunded','returned_successfully') then raise exception 'A received return cannot be rejected'; end if;
  elsif p_status='return_approved' then
    if v_previous<>'return_requested' then raise exception 'Approve a return only after it is requested'; end if;
  elsif p_status='return_pickup_scheduled' then
    if v_previous not in ('return_approved','return_initiated') then raise exception 'Approve the return before scheduling pickup'; end if;
  elsif p_status='item_received' then
    if v_previous not in ('return_pickup_scheduled','out_for_pickup') then raise exception 'Schedule pickup before marking the item received'; end if;
  elsif p_status='refund_initiated' then
    if v_previous<>'item_received' or coalesce(v_order.refund_status,'') not in ('refund_pending','refunded') then raise exception 'Start the Razorpay refund workflow before marking a refund initiated'; end if;
  elsif p_status='refunded' then
    if v_order.refund_status is distinct from 'refunded' then raise exception 'Only Razorpay can confirm a completed refund'; end if;
  else
    raise exception 'Return status must follow the recorded workflow';
  end if;
  v_request_status:=case when p_status='return_requested' then 'open' when p_status='return_rejected' then 'rejected' when p_status in ('item_received','refunded') then 'completed' else 'approved' end;
  update public.orders set return_status=p_status,updated_at=now() where id=v_order.id;
  update public.customer_requests set status=v_request_status,admin_notes=coalesce(nullif(trim(left(coalesce(p_note,''),2000)),''),admin_notes),processed_by=auth.uid(),processed_at=now(),updated_at=now() where id=v_request.id;
  insert into public.order_return_history(order_id,customer_request_id,previous_status,new_status,note,changed_by)
  values(v_order.id,v_request.id,v_previous,p_status,nullif(trim(left(coalesce(p_note,''),500)),''),auth.uid());
  insert into public.admin_activity_log(admin_id,action,entity_type,entity_id,entity_reference,details)
  values(auth.uid(),'return_status_updated','return',v_request.id,v_request.return_number,jsonb_build_object('order_id',v_order.id,'previous_status',v_previous,'new_status',p_status));
end $$;
revoke all on function public.admin_update_created_return(uuid,text,text) from public,anon;
grant execute on function public.admin_update_created_return(uuid,text,text) to authenticated;

create or replace function public.admin_create_order(
  p_customer_email text,p_address_id uuid,p_lines jsonb,p_delivery_method text,p_discount numeric default 0,
  p_order_status text default 'pending',p_admin_note text default null
) returns uuid language plpgsql security definer set search_path=pg_catalog,public,auth,extensions
as $$
declare
  v_user auth.users%rowtype; v_profile public.profiles%rowtype; v_address public.addresses%rowtype; v_zone public.delivery_zones%rowtype;
  v_fees public.checkout_fee_settings%rowtype; v_product public.products%rowtype; v_stock public.inventory%rowtype;
  v_line jsonb; v_payload jsonb:='[]'::jsonb; v_order_id uuid:=gen_random_uuid();
  v_order_number text:='BK-'||to_char(clock_timestamp() at time zone 'Asia/Kolkata','YYMMDD')||'-'||upper(substr(encode(extensions.gen_random_bytes(5),'hex'),1,8));
  v_qty integer; v_unit_price numeric(12,2); v_subtotal numeric(12,2):=0; v_discount numeric(12,2); v_product_delivery numeric(12,2):=0;
  v_delivery numeric(12,2); v_packaging numeric(12,2):=0; v_platform numeric(12,2):=0; v_handling numeric(12,2):=0; v_total numeric(12,2); v_eta text; v_status public.order_state;
  v_address_json jsonb; v_admin_note text:=left(trim(coalesce(p_admin_note,'')),1000);
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if length(trim(coalesce(p_customer_email,''))) not between 3 and 320 or p_address_id is null then raise exception 'Choose a registered customer and saved delivery address'; end if;
  if p_delivery_method not in ('blitz','standard') then raise exception 'Choose a delivery method'; end if;
  if p_order_status not in ('pending','confirmed','sourcing','packed','ready_for_pickup') then raise exception 'Admin-created orders must begin before dispatch'; end if;
  if p_order_status<>'pending' then raise exception 'Keep this order pending until payment is verified; fulfillment status updates require a confirmed payment'; end if;
  if jsonb_typeof(p_lines) is distinct from 'array' then raise exception 'Add at least one catalog product'; end if;
  if jsonb_array_length(p_lines)=0 or jsonb_array_length(p_lines)>50 then raise exception 'Add at least one catalog product'; end if;
  select * into v_user from auth.users where lower(email)=lower(trim(p_customer_email));
  if not found then raise exception 'No registered customer was found for that email'; end if;
  select * into v_profile from public.profiles where id=v_user.id and account_status='active' for share;
  if not found then raise exception 'This customer account is not active'; end if;
  select * into v_address from public.addresses where id=p_address_id and customer_id=v_user.id for share;
  if not found then raise exception 'Saved delivery address does not belong to this customer'; end if;
  if exists(select 1 from (select value->>'product_id' as product_id,count(*) n from jsonb_array_elements(p_lines) group by value->>'product_id') x where x.n>1) then raise exception 'Each product may appear only once'; end if;
  if p_discount is null or p_discount<0 then raise exception 'Discount cannot be negative'; end if;
  select * into v_zone from public.delivery_zones where postal_code=v_address.postal_code and city='New Delhi' and state='Delhi' and is_directory_verified and is_active for share;
  if not found then raise exception 'The selected address is outside configured delivery areas'; end if;
  if p_delivery_method='blitz' and v_zone.blitz_enabled then v_delivery:=v_zone.blitz_price; v_eta:=v_zone.blitz_eta;
  elsif p_delivery_method='standard' and v_zone.standard_enabled then v_delivery:=v_zone.standard_price; v_eta:=v_zone.standard_eta;
  else raise exception 'The selected delivery method is unavailable for this PIN code'; end if;
  if not public.delivery_method_is_available_now(v_zone.postal_code,p_delivery_method,clock_timestamp()) then raise exception 'The selected delivery method is currently outside operating hours'; end if;
  if v_address.locality<>v_zone.locality and not exists(select 1 from unnest(v_zone.locality_aliases) a(value) where lower(trim(a.value))=lower(trim(v_address.locality))) then raise exception 'The saved address locality is not configured for this PIN code'; end if;
  select * into v_fees from public.checkout_fee_settings where id=1 for share;
  if not found then raise exception 'Checkout fee settings are not configured'; end if;
  v_packaging:=case when v_fees.packaging_enabled then v_fees.packaging_amount else 0 end;
  v_platform:=case when v_fees.platform_enabled then v_fees.platform_amount else 0 end;
  v_handling:=case when v_fees.handling_enabled then v_fees.handling_amount else 0 end;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    if coalesce(v_line->>'product_id','') !~* '^[0-9a-f-]{36}$' then raise exception 'Choose a valid catalog product'; end if;
    begin v_qty:=(v_line->>'quantity')::integer; v_unit_price:=round((v_line->>'unit_price')::numeric,2); exception when others then raise exception 'Check the product quantity and price'; end;
    if v_qty is null or v_qty<1 or v_qty>50 or v_unit_price is null or v_unit_price<0 or v_unit_price>99999999.99 then raise exception 'Product quantity or price is outside allowed limits'; end if;
    select * into v_product from public.products where id=(v_line->>'product_id')::uuid and is_active for share;
    if not found then raise exception 'A selected product is no longer active'; end if;
    select * into v_stock from public.inventory where product_id=v_product.id for update;
    if not found or v_stock.quantity-v_stock.reserved_quantity<v_qty then raise exception 'Insufficient stock for %',v_product.name; end if;
    update public.inventory set reserved_quantity=reserved_quantity+v_qty,updated_at=now() where product_id=v_product.id;
    v_subtotal:=v_subtotal+v_unit_price*v_qty;
    v_product_delivery:=v_product_delivery+coalesce(v_product.product_delivery_charge,0)*v_qty;
    v_payload:=v_payload||jsonb_build_array(jsonb_build_object('product_id',v_product.id,'name',v_product.name,'sku',v_product.sku,'quantity',v_qty,'unit_price',v_unit_price,'line_total',round(v_unit_price*v_qty,2)));
  end loop;
  if v_subtotal<v_zone.minimum_order_amount then raise exception 'The order is below the minimum amount for this PIN code'; end if;
  v_discount:=round(p_discount,2);
  if v_discount>v_subtotal then raise exception 'Discount cannot exceed the product subtotal'; end if;
  v_total:=greatest(0,v_subtotal-v_discount+v_packaging+v_platform+v_handling+v_delivery+v_product_delivery);
  if v_total<1 then raise exception 'The order total must be at least ₹1 so the customer can pay securely through Razorpay'; end if;
  v_address_json:=jsonb_build_object('recipient_name',v_address.recipient_name,'phone',v_address.phone,'address_line1',v_address.address_line1,'address_line2',v_address.address_line2,'locality',v_address.locality,'city',v_address.city,'state',v_address.state,'postal_code',v_address.postal_code,'landmark',v_address.landmark);
  v_status:=p_order_status::public.order_state;
  insert into public.orders(id,customer_id,order_number,status,payment_status,payment_environment,subtotal,discount_amount,packaging_fee,platform_fee,handling_fee,delivery_charge,product_delivery_charge,total,delivery_address,delivery_method,delivery_pincode,delivery_location,estimated_delivery,order_source,admin_created_by,internal_note)
  values(v_order_id,v_user.id,v_order_number,v_status,'pending','live',v_subtotal,v_discount,v_packaging,v_platform,v_handling,v_delivery,v_product_delivery,
    v_total,v_address_json,p_delivery_method,v_zone.postal_code,v_zone.locality,v_eta,'admin',auth.uid(),nullif(v_admin_note,''));
  insert into public.order_items(order_id,product_id,product_name,sku,quantity,unit_price,line_total)
    select v_order_id,(x->>'product_id')::uuid,x->>'name',x->>'sku',(x->>'quantity')::integer,(x->>'unit_price')::numeric,(x->>'line_total')::numeric from jsonb_array_elements(v_payload) x;
  insert into public.order_status_history(order_id,previous_status,new_status,changed_by,note)
    values(v_order_id,null,v_status,auth.uid(),'Order created by BlitzKart administrator. Payment remains pending verification.');
  if v_admin_note<>'' then insert into public.internal_order_notes(order_id,admin_id,note) values(v_order_id,auth.uid(),v_admin_note); end if;
  insert into public.admin_activity_log(admin_id,action,entity_type,entity_id,entity_reference,details)
  values(auth.uid(),'order_created','order',v_order_id,v_order_number,jsonb_build_object(
    'customer_id',v_user.id,'customer_email',v_user.email,'items',v_payload,'subtotal',v_subtotal,'discount',v_discount,
    'delivery_method',p_delivery_method,'delivery_pincode',v_zone.postal_code,'delivery_charge',v_delivery,
    'product_delivery_charge',v_product_delivery,'packaging_fee',v_packaging,'platform_fee',v_platform,'handling_fee',v_handling,
    'total',v_total,'order_status',v_status,'payment_status','pending','admin_note',nullif(v_admin_note,'')));
  return v_order_id;
end $$;
revoke all on function public.admin_create_order(text,uuid,jsonb,text,numeric,text,text) from public,anon;
grant execute on function public.admin_create_order(text,uuid,jsonb,text,numeric,text,text) to authenticated;

-- Keep admin section auto-refresh signals current for the existing live dashboard.
drop trigger if exists admin_live_change on public.customer_requests;
create trigger admin_live_change after insert or update or delete on public.customer_requests
  for each row execute function public.publish_admin_live_change();
drop trigger if exists admin_live_change on public.support_requests;
create trigger admin_live_change after insert or update or delete on public.support_requests
  for each row execute function public.publish_admin_live_change();
drop trigger if exists admin_live_change on public.admin_activity_log;
create trigger admin_live_change after insert on public.admin_activity_log
  for each row execute function public.publish_admin_live_change();

notify pgrst,'reload schema';
