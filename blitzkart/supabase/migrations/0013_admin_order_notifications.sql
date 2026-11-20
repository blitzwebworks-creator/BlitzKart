-- Durable admin notifications for newly placed live orders.
create table public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  notification_type text not null check (notification_type in ('order_received','customer_request','support_request')),
  source_id uuid not null,
  order_id uuid references public.orders(id) on delete set null,
  title text not null,
  message text not null,
  target_path text not null default '/admin/orders'
    check (target_path = '/admin/orders' or target_path like '/admin/orders/%'),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index admin_notifications_created_at_idx on public.admin_notifications(created_at desc);
create unique index admin_notifications_source_unique_idx on public.admin_notifications(notification_type,source_id);
alter table public.admin_notifications enable row level security;
revoke all on public.admin_notifications from anon, public;
grant select, update(read_at) on public.admin_notifications to authenticated;
grant all on public.admin_notifications to service_role;

create policy admin_notifications_admin_read on public.admin_notifications
  for select to authenticated using (public.is_admin());
create policy admin_notifications_admin_mark_read on public.admin_notifications
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.notify_admin_of_new_order() returns trigger
language plpgsql security definer set search_path=pg_catalog,public
as $$
begin
  insert into public.admin_notifications(notification_type,source_id,order_id,title,message,target_path)
  values (
    'order_received',
    new.id,
    new.id,
    'New order received',
    'Order ' || new.order_number || ' was placed. Check its payment status.',
    '/admin/orders/' || new.id::text
  );
  return new;
end $$;
revoke all on function public.notify_admin_of_new_order() from public,anon,authenticated,service_role;

drop trigger if exists orders_notify_admin_of_new_order on public.orders;
create trigger orders_notify_admin_of_new_order
  after insert on public.orders for each row execute function public.notify_admin_of_new_order();

create or replace function public.notify_admin_of_customer_request() returns trigger
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_title text;
begin
  v_title := case new.request_type
    when 'cancel' then 'New cancellation request'
    when 'return' then 'New return request'
    when 'exchange' then 'New exchange request'
    when 'account_deletion' then 'Account deletion requested'
    else 'New customer request'
  end;
  insert into public.admin_notifications(notification_type,source_id,order_id,title,message,target_path)
  values (
    'customer_request',new.id,new.order_id,v_title,
    'A customer submitted a request. Open the customer request queue to review it.',
    '/admin/requests'
  );
  return new;
end $$;
revoke all on function public.notify_admin_of_customer_request() from public,anon,authenticated,service_role;

drop trigger if exists customer_requests_notify_admin on public.customer_requests;
create trigger customer_requests_notify_admin
  after insert on public.customer_requests for each row execute function public.notify_admin_of_customer_request();

create or replace function public.notify_admin_of_support_request() returns trigger
language plpgsql security definer set search_path=pg_catalog,public
as $$
begin
  insert into public.admin_notifications(notification_type,source_id,title,message,target_path)
  values (
    'support_request',new.id,'New support request',
    'A customer sent a support request. Open the support queue to review it.',
    '/admin/support'
  );
  return new;
end $$;
revoke all on function public.notify_admin_of_support_request() from public,anon,authenticated,service_role;

drop trigger if exists support_requests_notify_admin on public.support_requests;
create trigger support_requests_notify_admin
  after insert on public.support_requests for each row execute function public.notify_admin_of_support_request();

do $$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
    and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='admin_notifications') then
    alter publication supabase_realtime add table public.admin_notifications;
  end if;
end $$;

notify pgrst,'reload schema';
