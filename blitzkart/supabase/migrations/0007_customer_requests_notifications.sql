-- Customer service requests, order notifications and privacy-safe account deletion.
-- No seed/demo rows are inserted by this migration.

-- Retain operational order/payment records when a customer requests account deletion.
-- The admin deletion RPC below clears delivery PII before removing the auth user.
alter table public.orders alter column customer_id drop not null;
alter table public.orders drop constraint orders_customer_id_fkey;
alter table public.orders
  add constraint orders_customer_id_fkey
  foreign key (customer_id) references auth.users(id) on delete set null;

-- Keep coupon/order accounting while allowing account erasure to anonymize the owner.
alter table public.coupon_usage alter column customer_id drop not null;
alter table public.coupon_usage drop constraint coupon_usage_customer_id_fkey;
alter table public.coupon_usage
  add constraint coupon_usage_customer_id_fkey
  foreign key (customer_id) references auth.users(id) on delete set null;

create table public.customer_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references auth.users(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  order_number text,
  request_type text not null check (request_type in ('cancel','return','exchange','account_deletion')),
  reason text not null check (length(trim(reason)) between 3 and 120),
  details text check (details is null or length(details) <= 2000),
  customer_name text,
  customer_email text,
  customer_phone text,
  status text not null default 'open' check (status in ('open','in_progress','approved','rejected','completed')),
  processed_by uuid references auth.users(id) on delete set null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (request_type <> 'account_deletion' or order_id is null)
);
create index customer_requests_created_idx on public.customer_requests(status, created_at desc);
create index customer_requests_owner_idx on public.customer_requests(customer_id, created_at desc);

create table public.customer_notifications (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  order_number text not null,
  notification_type text not null check (notification_type in ('order_placed','order_status','payment_status')),
  title text not null,
  message text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index customer_notifications_owner_idx on public.customer_notifications(customer_id, created_at desc);

alter table public.customer_requests enable row level security;
alter table public.customer_notifications enable row level security;

create policy customer_requests_owner_or_admin_read on public.customer_requests
  for select to authenticated using (customer_id = auth.uid() or public.is_admin());
create policy customer_notifications_owner_read on public.customer_notifications
  for select to authenticated using (customer_id = auth.uid() and public.is_active_customer() or public.is_admin());

revoke all on public.customer_requests from anon, authenticated;
grant select on public.customer_requests to authenticated;
revoke all on public.customer_notifications from anon, authenticated;
grant select on public.customer_notifications to authenticated;

create function public.notify_customer_order_changes() returns trigger
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  v_status text;
  v_payment text;
begin
  if new.customer_id is null or new.payment_environment <> 'live' then return new; end if;

  if tg_op = 'INSERT' then
    insert into public.customer_notifications(customer_id,order_id,order_number,notification_type,title,message)
    values(new.customer_id,new.id,new.order_number,'order_placed','Order received',
      'We received order ' || new.order_number || '. Payment status: ' || replace(new.payment_status::text,'_',' ') || '.');
    return new;
  end if;

  if old.status is distinct from new.status then
    v_status := replace(new.status::text,'_',' ');
    insert into public.customer_notifications(customer_id,order_id,order_number,notification_type,title,message)
    values(new.customer_id,new.id,new.order_number,'order_status',
      case new.status when 'out_for_delivery' then 'Order out for delivery' when 'delivered' then 'Order delivered' when 'cancelled' then 'Order cancelled' else 'Order update' end,
      'Order ' || new.order_number || ' is now ' || v_status || '.');
  end if;

  if old.payment_status is distinct from new.payment_status then
    v_payment := replace(new.payment_status::text,'_',' ');
    insert into public.customer_notifications(customer_id,order_id,order_number,notification_type,title,message)
    values(new.customer_id,new.id,new.order_number,'payment_status','Payment update',
      'Payment status for order ' || new.order_number || ' is ' || v_payment || '.');
  end if;
  return new;
end;
$$;
revoke all on function public.notify_customer_order_changes() from public, anon, authenticated;
create trigger orders_notify_customer_changes
  after insert or update on public.orders
  for each row execute function public.notify_customer_order_changes();

create function public.prevent_shipped_order_cancellation() returns trigger
language plpgsql set search_path = pg_catalog, public
as $$ begin
  if old.status in ('out_for_delivery','delivered') and new.status='cancelled' then
    raise exception 'An order cannot be cancelled after it is out for delivery';
  end if;
  return new;
end $$;
revoke all on function public.prevent_shipped_order_cancellation() from public, anon, authenticated;
create trigger orders_prevent_shipped_cancellation
  before update of status on public.orders
  for each row execute function public.prevent_shipped_order_cancellation();

create function public.create_customer_request(
  p_request_type text,
  p_order_id uuid,
  p_reason text,
  p_details text default null
) returns uuid
language plpgsql security definer set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.orders%rowtype;
  v_name text;
  v_email text;
  v_phone text;
  v_request_id uuid;
begin
  if v_user_id is null or not public.is_active_customer() then raise exception 'Sign in with an active customer account to send a request'; end if;
  if p_request_type is null or p_request_type not in ('cancel','return','exchange','account_deletion') then raise exception 'Choose a valid request type'; end if;
  if length(trim(coalesce(p_reason,''))) not between 3 and 120 or length(coalesce(p_details,'')) > 2000 then raise exception 'Check the request reason and details'; end if;

  select coalesce(nullif(trim(p.full_name),''),nullif(u.raw_user_meta_data->>'full_name',''),'Customer'),
         coalesce(nullif(trim(p.email),''),u.email), p.phone
    into v_name,v_email,v_phone
    from auth.users u left join public.profiles p on p.id=u.id where u.id=v_user_id;
  if not found then raise exception 'Customer account not found'; end if;

  if p_request_type = 'account_deletion' then
    if p_order_id is not null then raise exception 'Account deletion requests do not use an order'; end if;
    if exists(select 1 from public.customer_requests where customer_id=v_user_id and request_type='account_deletion' and status in ('open','in_progress','approved')) then
      raise exception 'An account deletion request is already being reviewed';
    end if;
  else
    if p_order_id is null then raise exception 'Select an order for this request'; end if;
    select * into v_order from public.orders where id=p_order_id and customer_id=v_user_id and payment_environment='live' for update;
    if not found then raise exception 'That order is not available on this account'; end if;
    if p_request_type = 'cancel' and v_order.status in ('out_for_delivery','delivered','cancelled') then
      raise exception 'Cancellation requests are unavailable after an order is out for delivery';
    end if;
    if p_request_type in ('return','exchange') and v_order.status <> 'delivered' then
      raise exception 'Return and exchange requests are available after delivery';
    end if;
  end if;

  insert into public.customer_requests(customer_id,order_id,order_number,request_type,reason,details,customer_name,customer_email,customer_phone)
  values(v_user_id,p_order_id,case when p_order_id is null then null else v_order.order_number end,p_request_type,
    trim(p_reason),nullif(trim(coalesce(p_details,'')),''),v_name,v_email,v_phone)
  returning id into v_request_id;
  return v_request_id;
end;
$$;
revoke all on function public.create_customer_request(text,uuid,text,text) from public, anon;
grant execute on function public.create_customer_request(text,uuid,text,text) to authenticated;

create function public.admin_update_customer_request(p_request_id uuid,p_status text) returns void
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  v_request public.customer_requests%rowtype;
  v_order public.orders%rowtype;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_status not in ('open','in_progress','approved','rejected','completed') then raise exception 'Invalid request status'; end if;
  select * into v_request from public.customer_requests where id=p_request_id for update;
  if not found then raise exception 'Customer request not found'; end if;
  if v_request.request_type='account_deletion' and p_status='completed' then raise exception 'Use the delete account action to complete an account deletion request'; end if;
  if p_status='completed' and v_request.status not in ('approved','in_progress') then raise exception 'Approve or begin the request before completing it'; end if;

  if v_request.request_type='cancel' and p_status='approved' then
    select * into v_order from public.orders where id=v_request.order_id for update;
    if not found or v_order.status in ('out_for_delivery','delivered','cancelled') then raise exception 'This order can no longer be cancelled'; end if;
    if v_order.payment_status='paid' then raise exception 'A paid order cannot be cancelled because refunds are not configured'; end if;
    perform public.admin_update_order_status(v_order.id,'cancelled'::public.order_state,'Customer cancellation request approved.');
  elsif v_request.request_type in ('return','exchange') and p_status='approved' then
    select * into v_order from public.orders where id=v_request.order_id for update;
    if not found or v_order.status <> 'delivered' then raise exception 'Returns and exchanges can be approved only for delivered orders'; end if;
  end if;

  update public.customer_requests set status=p_status,
    processed_by=case when p_status in ('approved','rejected','completed') then auth.uid() else processed_by end,
    processed_at=case when p_status in ('approved','rejected','completed') then now() else null end
    where id=p_request_id;
end;
$$;
revoke all on function public.admin_update_customer_request(uuid,text) from public, anon;
grant execute on function public.admin_update_customer_request(uuid,text) to authenticated;

create function public.admin_delete_order(p_order_id uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  v_order public.orders%rowtype;
  v_item record;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.payment_environment <> 'live' then raise exception 'Sandbox orders cannot be removed from live administration'; end if;
  if not v_order.reservation_released and v_order.payment_status <> 'paid' then
    for v_item in select product_id,quantity from public.order_items where order_id=p_order_id and product_id is not null loop
      update public.inventory set reserved_quantity=greatest(0,reserved_quantity-v_item.quantity),updated_at=now() where product_id=v_item.product_id;
    end loop;
  end if;
  delete from public.orders where id=p_order_id;
end;
$$;
revoke all on function public.admin_delete_order(uuid) from public, anon;
grant execute on function public.admin_delete_order(uuid) to authenticated;

create function public.admin_delete_customer_account(p_request_id uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public, auth
as $$
declare
  v_request public.customer_requests%rowtype;
  v_customer_id uuid;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  select * into v_request from public.customer_requests where id=p_request_id and request_type='account_deletion' for update;
  if not found or v_request.status not in ('open','in_progress','approved') then raise exception 'An active account deletion request is required'; end if;
  v_customer_id := v_request.customer_id;
  if v_customer_id is null then raise exception 'The customer account has already been removed'; end if;
  if exists(select 1 from public.admin_users where user_id=v_customer_id) then raise exception 'Administrator accounts cannot be deleted through customer requests'; end if;

  -- Keep financial/order records while removing delivery address and contact PII.
  update public.orders set delivery_address=jsonb_build_object(
    'recipient_name','Removed customer','address_line1','Personal address removed','address_line2','',
    'locality','','city','','state','','postal_code','','phone','')
    where customer_id=v_customer_id;
  update public.customer_requests set customer_id=null,customer_name=null,customer_email=null,customer_phone=null,
    reason='Account data removed',details=null,processed_by=auth.uid(),processed_at=now(),updated_at=now()
    where customer_id=v_customer_id and id<>p_request_id;
  update public.coupon_usage set customer_id=null where customer_id=v_customer_id;

  delete from auth.users where id=v_customer_id;
  if not found then raise exception 'Customer account could not be removed'; end if;

  update public.customer_requests set customer_id=null,customer_name=null,customer_email=null,customer_phone=null,
    reason='Account deletion completed',details=null,status='completed',processed_by=auth.uid(),processed_at=now(),updated_at=now()
    where id=p_request_id;
end;
$$;
revoke all on function public.admin_delete_customer_account(uuid) from public, anon;
grant execute on function public.admin_delete_customer_account(uuid) to authenticated;

create function public.mark_customer_notification_read(p_notification_id uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public
as $$ begin
  if auth.uid() is null or not public.is_active_customer() then raise exception 'Active customer account required'; end if;
  update public.customer_notifications set read_at=coalesce(read_at,now()) where id=p_notification_id and customer_id=auth.uid();
  if not found then raise exception 'Notification not found'; end if;
end $$;
revoke all on function public.mark_customer_notification_read(uuid) from public, anon;
grant execute on function public.mark_customer_notification_read(uuid) to authenticated;
