-- Return/exchange evidence, review photos, and verified Razorpay refund tracking.
-- Existing orders and payments are retained; no availability or payment data is seeded.

alter table public.customer_requests
  add column request_images text[] not null default '{}';
alter table public.customer_requests
  add constraint customer_requests_request_images_max check (cardinality(request_images) <= 3);

alter table public.product_reviews
  add column review_images text[] not null default '{}';
alter table public.product_reviews
  add constraint product_reviews_review_images_max check (cardinality(review_images) <= 3);

alter table public.orders
  add column return_status text check (return_status is null or return_status in ('return_initiated','out_for_pickup','returned_successfully')),
  add column return_request_id uuid references public.customer_requests(id) on delete set null,
  add column refund_status text check (refund_status is null or refund_status in ('refund_pending','refunded','refund_failed')),
  add column refund_amount numeric(12,2),
  add column razorpay_refund_id text,
  add column refund_initiated_at timestamptz,
  add column refund_failure_details text;

create table public.order_return_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  customer_request_id uuid references public.customer_requests(id) on delete set null,
  previous_status text,
  new_status text not null check (new_status in ('return_initiated','out_for_pickup','returned_successfully')),
  note text,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index order_return_history_order_idx on public.order_return_history(order_id,created_at);
alter table public.order_return_history enable row level security;
revoke all on public.order_return_history from anon,authenticated;
grant select on public.order_return_history to authenticated;
create policy order_return_history_owner_or_admin_read on public.order_return_history
  for select to authenticated using (
    public.is_admin() or exists (
      select 1 from public.orders o
      where o.id=order_id and o.customer_id=auth.uid() and public.is_active_customer()
    )
  );

create table public.order_refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  razorpay_payment_id text not null,
  razorpay_refund_id text unique,
  amount_paise bigint not null check (amount_paise > 0),
  status text not null default 'initiating' check (status in ('initiating','refund_pending','refunded','refund_failed')),
  failure_details text,
  initiated_by uuid references auth.users(id) on delete set null,
  initiated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,order_id)
);
create table public.order_refund_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  refund_record_id uuid not null references public.order_refunds(id) on delete cascade,
  status text not null check (status in ('refund_pending','refunded','refund_failed')),
  created_at timestamptz not null default now()
);
create index order_refunds_order_idx on public.order_refunds(order_id,initiated_at desc);
create index order_refund_history_order_idx on public.order_refund_history(order_id,created_at);
create unique index order_refunds_one_active_per_order_idx on public.order_refunds(order_id)
  where status in ('initiating','refund_pending','refunded');
alter table public.order_refunds enable row level security;
alter table public.order_refund_history enable row level security;
revoke all on public.order_refunds from anon,authenticated;
revoke all on public.order_refund_history from anon,authenticated;
grant select on public.order_refunds,public.order_refund_history to authenticated;
create policy order_refunds_owner_or_admin_read on public.order_refunds
  for select to authenticated using (
    public.is_admin() or exists (
      select 1 from public.orders o
      where o.id=order_id and o.customer_id=auth.uid() and public.is_active_customer()
    )
  );
create policy order_refund_history_owner_or_admin_read on public.order_refund_history
  for select to authenticated using (
    public.is_admin() or exists (
      select 1 from public.orders o
      where o.id=order_id and o.customer_id=auth.uid() and public.is_active_customer()
    )
  );

create function public.prevent_order_delete_with_return_or_refund() returns trigger
language plpgsql security definer set search_path=pg_catalog,public
as $$
begin
  if old.return_status is not null or exists(select 1 from public.order_refunds r where r.order_id=old.id) then
    raise exception 'Orders with return or refund activity must be retained for audit and customer tracking';
  end if;
  return old;
end;
$$;
revoke all on function public.prevent_order_delete_with_return_or_refund() from public,anon,authenticated;
create trigger orders_prevent_delete_after_return_or_refund before delete on public.orders
  for each row execute function public.prevent_order_delete_with_return_or_refund();

create table public.razorpay_webhook_events (
  event_id text primary key check (length(event_id) between 1 and 200),
  event_name text not null,
  processed_at timestamptz not null default now()
);
alter table public.razorpay_webhook_events enable row level security;
revoke all on public.razorpay_webhook_events from public,anon,authenticated;
grant all on public.razorpay_webhook_events to service_role;

-- Review images are intentionally public because published verified reviews are public.
-- Return evidence remains private and is shared with admins only using short-lived signed URLs.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values
  ('product-review-images','product-review-images',true,1048576,array['image/jpeg','image/png','image/webp']),
  ('customer-request-images','customer-request-images',false,1048576,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy product_review_images_public_read on storage.objects
  for select to anon,authenticated using (bucket_id='product-review-images');

drop function if exists public.create_customer_request(text,uuid,text,text);
create function public.create_customer_request(
  p_request_type text,
  p_order_id uuid,
  p_reason text,
  p_details text default null,
  p_request_images text[] default '{}'
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
  if cardinality(coalesce(p_request_images,'{}')) > 3 then raise exception 'Attach no more than three images'; end if;
  if p_request_type not in ('return','exchange') and cardinality(coalesce(p_request_images,'{}')) > 0 then raise exception 'Images can only be attached to return or exchange requests'; end if;
  if exists(select 1 from unnest(coalesce(p_request_images,'{}')) as uploaded_image(path) where uploaded_image.path !~ ('^' || v_user_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$')) then raise exception 'Invalid request image reference'; end if;

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

  insert into public.customer_requests(customer_id,order_id,order_number,request_type,reason,details,customer_name,customer_email,customer_phone,request_images)
  values(v_user_id,p_order_id,case when p_order_id is null then null else v_order.order_number end,p_request_type,
    trim(p_reason),nullif(trim(coalesce(p_details,'')),''),v_name,v_email,v_phone,coalesce(p_request_images,'{}'))
  returning id into v_request_id;
  return v_request_id;
end;
$$;
revoke all on function public.create_customer_request(text,uuid,text,text,text[]) from public,anon;
grant execute on function public.create_customer_request(text,uuid,text,text,text[]) to authenticated;

create or replace function public.admin_update_customer_request(p_request_id uuid,p_status text) returns void
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
    if v_order.payment_status='paid' then raise exception 'A paid order cannot be cancelled until a refund is processed'; end if;
    perform public.admin_update_order_status(v_order.id,'cancelled'::public.order_state,'Customer cancellation request approved.');
  elsif v_request.request_type in ('return','exchange') and p_status='approved' then
    select * into v_order from public.orders where id=v_request.order_id for update;
    if not found or v_order.status <> 'delivered' then raise exception 'Returns and exchanges can be approved only for delivered orders'; end if;
    if v_order.return_status is null then
      update public.orders set return_status='return_initiated',return_request_id=v_request.id,updated_at=now() where id=v_order.id;
      insert into public.order_return_history(order_id,customer_request_id,previous_status,new_status,note,changed_by)
      values(v_order.id,v_request.id,null,'return_initiated',case when v_request.request_type='exchange' then 'Exchange request approved.' else 'Return request approved.' end,auth.uid());
    elsif v_order.return_request_id is distinct from v_request.id then
      raise exception 'Another return or exchange is already in progress for this order';
    end if;
  end if;

  update public.customer_requests set status=p_status,
    processed_by=case when p_status in ('approved','rejected','completed') then auth.uid() else processed_by end,
    processed_at=case when p_status in ('approved','rejected','completed') then now() else null end
    where id=p_request_id;
end;
$$;
revoke all on function public.admin_update_customer_request(uuid,text) from public,anon;
grant execute on function public.admin_update_customer_request(uuid,text) to authenticated;

create function public.admin_update_return_status(p_order_id uuid,p_status text,p_note text default null) returns void
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_order public.orders%rowtype; v_previous text;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_status not in ('out_for_pickup','returned_successfully') then raise exception 'Choose the next return status'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.return_request_id is null then raise exception 'An approved return or exchange request is required'; end if;
  v_previous:=v_order.return_status;
  if (p_status='out_for_pickup' and v_previous is distinct from 'return_initiated') or (p_status='returned_successfully' and v_previous is distinct from 'out_for_pickup') then
    raise exception 'Return status must progress from Return initiated to Out for pickup to Returned successfully';
  end if;
  update public.orders set return_status=p_status,updated_at=now() where id=p_order_id;
  insert into public.order_return_history(order_id,customer_request_id,previous_status,new_status,note,changed_by)
  values(p_order_id,v_order.return_request_id,v_previous,p_status,nullif(trim(coalesce(p_note,'')),''),auth.uid());
end;
$$;
revoke all on function public.admin_update_return_status(uuid,text,text) from public,anon;
grant execute on function public.admin_update_return_status(uuid,text,text) to authenticated;

drop function if exists public.get_product_reviews(uuid);
create function public.get_product_reviews(p_product_id uuid)
returns table(rating smallint,review_text text,review_images text[],created_at timestamptz)
language sql stable security definer set search_path=pg_catalog,public
as $$
  select r.rating,r.review_text,r.review_images,r.created_at
  from public.product_reviews r where r.product_id=p_product_id and r.is_published
  order by r.created_at desc limit 100
$$;
revoke all on function public.get_product_reviews(uuid) from public;
grant execute on function public.get_product_reviews(uuid) to anon,authenticated;

drop function if exists public.get_order_product_reviews(uuid);
create function public.get_order_product_reviews(p_order_id uuid)
returns table(product_id uuid,rating smallint,review_text text,review_images text[])
language sql stable security definer set search_path=pg_catalog,public,auth
as $$
  select r.product_id,r.rating,r.review_text,r.review_images
  from public.product_reviews r join public.orders o on o.id=r.order_id
  where r.order_id=p_order_id and r.customer_id=auth.uid() and o.customer_id=auth.uid()
$$;
revoke all on function public.get_order_product_reviews(uuid) from public,anon;
grant execute on function public.get_order_product_reviews(uuid) to authenticated;

drop function if exists public.submit_product_review(uuid,uuid,integer,text);
create function public.submit_product_review(p_order_id uuid,p_product_id uuid,p_rating integer,p_review_text text default null,p_review_images text[] default '{}')
returns void
language plpgsql security definer set search_path=pg_catalog,public,auth
as $$
declare v_user uuid:=auth.uid(); v_order public.orders%rowtype;
begin
  if v_user is null or not public.is_active_customer() then raise exception 'Sign in with an active customer account to rate a product'; end if;
  if p_rating not between 1 and 5 or length(coalesce(p_review_text,''))>1000 then raise exception 'Choose a rating from one to five stars and keep the review under 1,000 characters'; end if;
  if cardinality(coalesce(p_review_images,'{}'))>3 then raise exception 'Attach no more than three review images'; end if;
  if exists(select 1 from unnest(coalesce(p_review_images,'{}')) as uploaded_image(path) where uploaded_image.path !~ ('^'||v_user::text||'/[0-9a-f-]{36}\.(jpg|png|webp)$')) then raise exception 'Invalid review image reference'; end if;
  select * into v_order from public.orders where id=p_order_id and customer_id=v_user and payment_environment='live' for share;
  if not found or v_order.status<>'delivered' or v_order.payment_status<>'paid' then raise exception 'Only products in paid, delivered orders can be rated'; end if;
  if not exists(select 1 from public.order_items where order_id=p_order_id and product_id=p_product_id) then raise exception 'This product was not part of the selected order'; end if;
  insert into public.product_reviews(order_id,product_id,customer_id,rating,review_text,review_images)
    values(p_order_id,p_product_id,v_user,p_rating,nullif(trim(coalesce(p_review_text,'')),''),coalesce(p_review_images,'{}'))
  on conflict(order_id,product_id) do update set rating=excluded.rating,review_text=excluded.review_text,review_images=excluded.review_images,updated_at=now();
end
$$;
revoke all on function public.submit_product_review(uuid,uuid,integer,text,text[]) from public,anon;
grant execute on function public.submit_product_review(uuid,uuid,integer,text,text[]) to authenticated;

create function public.admin_prepare_order_refund(p_order_id uuid)
returns table(refund_record_id uuid,payment_id text,amount_paise bigint,receipt text,order_number text)
language plpgsql security definer set search_path=pg_catalog,public,auth
as $$
declare v_order public.orders%rowtype; v_refund public.order_refunds%rowtype;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.payment_environment<>'live' or v_order.payment_provider<>'razorpay' or v_order.payment_status<>'paid' or coalesce(v_order.gateway_payment_id,'')='' then
    raise exception 'Only live, captured Razorpay orders can be refunded';
  end if;
  select * into v_refund from public.order_refunds r where r.order_id=p_order_id and r.status='initiating' order by r.initiated_at desc limit 1 for update;
  if found then
    return query select v_refund.id,v_refund.razorpay_payment_id,v_refund.amount_paise,v_refund.id::text,v_order.order_number;
    return;
  end if;
  if exists(select 1 from public.order_refunds r where r.order_id=p_order_id and r.status in ('refund_pending','refunded')) then raise exception 'A refund is already active or completed for this order'; end if;
  insert into public.order_refunds(order_id,razorpay_payment_id,amount_paise,status,initiated_by)
  values(p_order_id,v_order.gateway_payment_id,round(v_order.total*100)::bigint,'initiating',auth.uid())
  returning * into v_refund;
  update public.orders set refund_status=null,refund_amount=(v_refund.amount_paise::numeric/100),razorpay_refund_id=null,
    refund_initiated_at=v_refund.initiated_at,refund_failure_details=null where id=p_order_id;
  return query select v_refund.id,v_refund.razorpay_payment_id,v_refund.amount_paise,v_refund.id::text,v_order.order_number;
end;
$$;
revoke all on function public.admin_prepare_order_refund(uuid) from public,anon;
grant execute on function public.admin_prepare_order_refund(uuid) to authenticated;

create function public.record_razorpay_refund_response(
  p_refund_record_id uuid,p_refund_id text,p_payment_id text,p_amount_paise bigint,p_status text,p_failure_details text default null
) returns void
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_refund public.order_refunds%rowtype; v_new_status text;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required'; end if;
  if p_status not in ('pending','processed','failed') or coalesce(trim(p_refund_id),'')='' then raise exception 'Invalid Razorpay refund response'; end if;
  select * into v_refund from public.order_refunds where id=p_refund_record_id for update;
  if not found or v_refund.razorpay_payment_id is distinct from p_payment_id or v_refund.amount_paise<>p_amount_paise then raise exception 'Razorpay refund does not match the order payment'; end if;
  if v_refund.razorpay_refund_id is not null and v_refund.razorpay_refund_id is distinct from p_refund_id then raise exception 'A different Razorpay refund is already linked'; end if;
  v_new_status:=case p_status when 'processed' then 'refunded' when 'failed' then 'refund_failed' else 'refund_pending' end;
  if v_refund.status in ('refunded','refund_failed') and v_new_status is distinct from v_refund.status then return; end if;
  update public.order_refunds set razorpay_refund_id=p_refund_id,status=v_new_status,
    failure_details=case when v_new_status='refund_failed' then left(coalesce(p_failure_details,'Razorpay reported a refund failure.'),1000) else null end,updated_at=now()
  where id=v_refund.id;
  if v_refund.status is distinct from v_new_status then
    if v_refund.status='initiating' and v_new_status='refunded' then
      insert into public.order_refund_history(order_id,refund_record_id,status,created_at) values(v_refund.order_id,v_refund.id,'refund_pending',v_refund.initiated_at);
    end if;
    insert into public.order_refund_history(order_id,refund_record_id,status) values(v_refund.order_id,v_refund.id,v_new_status);
  end if;
  update public.orders set refund_status=v_new_status,refund_amount=(p_amount_paise::numeric/100),razorpay_refund_id=p_refund_id,
    refund_initiated_at=coalesce(refund_initiated_at,v_refund.initiated_at),refund_failure_details=case when v_new_status='refund_failed' then left(coalesce(p_failure_details,'Razorpay reported a refund failure.'),1000) else null end,
    payment_status=case when v_new_status='refunded' then 'refunded'::public.payment_state else payment_status end,updated_at=now()
  where id=v_refund.order_id;
end;
$$;
revoke all on function public.record_razorpay_refund_response(uuid,text,text,bigint,text,text) from public,anon,authenticated;
grant execute on function public.record_razorpay_refund_response(uuid,text,text,bigint,text,text) to service_role;

create function public.fail_razorpay_refund_attempt(p_refund_record_id uuid,p_failure_details text) returns void
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_refund public.order_refunds%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required'; end if;
  select * into v_refund from public.order_refunds where id=p_refund_record_id for update;
  if not found or v_refund.status<>'initiating' then raise exception 'Refund attempt is no longer pending'; end if;
  update public.order_refunds set status='refund_failed',failure_details=left(coalesce(p_failure_details,'Razorpay declined the refund request.'),1000),updated_at=now() where id=v_refund.id;
  insert into public.order_refund_history(order_id,refund_record_id,status) values(v_refund.order_id,v_refund.id,'refund_failed');
  update public.orders set refund_status='refund_failed',refund_amount=(v_refund.amount_paise::numeric/100),refund_initiated_at=coalesce(refund_initiated_at,v_refund.initiated_at),refund_failure_details=left(coalesce(p_failure_details,'Razorpay declined the refund request.'),1000),updated_at=now() where id=v_refund.order_id;
end;
$$;
revoke all on function public.fail_razorpay_refund_attempt(uuid,text) from public,anon,authenticated;
grant execute on function public.fail_razorpay_refund_attempt(uuid,text) to service_role;

create function public.apply_razorpay_refund_webhook(
  p_event_id text,p_event_name text,p_refund_id text,p_payment_id text,p_receipt text,p_amount_paise bigint,p_failure_reason text default null
) returns text
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_refund public.order_refunds%rowtype; v_new_status text;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required'; end if;
  if p_event_name not in ('refund.created','refund.processed','refund.failed') or coalesce(trim(p_event_id),'')='' then raise exception 'Unsupported refund event'; end if;
  select * into v_refund from public.order_refunds r
   where (p_receipt is not null and r.id::text=p_receipt) or (p_refund_id is not null and r.razorpay_refund_id=p_refund_id)
   order by r.initiated_at desc limit 1 for update;
  if not found then raise exception 'Razorpay refund does not match a BlitzKart refund request'; end if;
  if v_refund.razorpay_payment_id is distinct from p_payment_id or v_refund.amount_paise<>p_amount_paise then raise exception 'Razorpay refund payment or amount mismatch'; end if;
  if v_refund.razorpay_refund_id is not null and v_refund.razorpay_refund_id is distinct from p_refund_id then raise exception 'Razorpay refund ID mismatch'; end if;
  insert into public.razorpay_webhook_events(event_id,event_name) values(p_event_id,p_event_name) on conflict(event_id) do nothing;
  if not found then return 'duplicate'; end if;
  v_new_status:=case p_event_name when 'refund.processed' then 'refunded' when 'refund.failed' then 'refund_failed' else 'refund_pending' end;
  if v_refund.status in ('refunded','refund_failed') and v_new_status is distinct from v_refund.status then return 'ignored_terminal'; end if;
  update public.order_refunds set razorpay_refund_id=p_refund_id,status=v_new_status,
    failure_details=case when v_new_status='refund_failed' then left(coalesce(p_failure_reason,'Razorpay reported a refund failure.'),1000) else null end,updated_at=now()
  where id=v_refund.id;
  if v_refund.status is distinct from v_new_status then
    if v_refund.status='initiating' and v_new_status='refunded' then
      insert into public.order_refund_history(order_id,refund_record_id,status,created_at) values(v_refund.order_id,v_refund.id,'refund_pending',v_refund.initiated_at);
    end if;
    insert into public.order_refund_history(order_id,refund_record_id,status) values(v_refund.order_id,v_refund.id,v_new_status);
  end if;
  update public.orders set refund_status=v_new_status,refund_amount=(p_amount_paise::numeric/100),razorpay_refund_id=p_refund_id,
    refund_initiated_at=coalesce(refund_initiated_at,v_refund.initiated_at),refund_failure_details=case when v_new_status='refund_failed' then left(coalesce(p_failure_reason,'Razorpay reported a refund failure.'),1000) else null end,
    payment_status=case when v_new_status='refunded' then 'refunded'::public.payment_state else payment_status end,updated_at=now()
  where id=v_refund.order_id;
  return v_new_status;
end;
$$;
revoke all on function public.apply_razorpay_refund_webhook(text,text,text,text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.apply_razorpay_refund_webhook(text,text,text,text,text,bigint,text) to service_role;

-- Keep a visible customer notification for refund/payment state changes.
alter table public.customer_notifications drop constraint if exists customer_notifications_notification_type_check;
alter table public.customer_notifications add constraint customer_notifications_notification_type_check
  check (notification_type in ('order_placed','order_status','payment_status','refund_status'));
create or replace function public.notify_customer_order_changes() returns trigger
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_status text; v_payment text;
begin
  if new.customer_id is null or new.payment_environment <> 'live' then return new; end if;
  if tg_op='INSERT' then
    insert into public.customer_notifications(customer_id,order_id,order_number,notification_type,title,message)
    values(new.customer_id,new.id,new.order_number,'order_placed','Order received','We received order '||new.order_number||'. Payment status: '||replace(new.payment_status::text,'_',' ')||'.');
    return new;
  end if;
  if old.status is distinct from new.status then
    v_status:=replace(new.status::text,'_',' ');
    insert into public.customer_notifications(customer_id,order_id,order_number,notification_type,title,message)
    values(new.customer_id,new.id,new.order_number,'order_status',case new.status when 'out_for_delivery' then 'Order out for delivery' when 'delivered' then 'Order delivered' when 'cancelled' then 'Order cancelled' else 'Order update' end,'Order '||new.order_number||' is now '||v_status||'.');
  end if;
  if old.payment_status is distinct from new.payment_status then
    v_payment:=replace(new.payment_status::text,'_',' ');
    insert into public.customer_notifications(customer_id,order_id,order_number,notification_type,title,message)
    values(new.customer_id,new.id,new.order_number,'payment_status','Payment update','Payment status for order '||new.order_number||' is '||v_payment||'.');
  end if;
  if old.refund_status is distinct from new.refund_status and new.refund_status is not null then
    insert into public.customer_notifications(customer_id,order_id,order_number,notification_type,title,message)
    values(new.customer_id,new.id,new.order_number,'refund_status',case new.refund_status when 'refunded' then 'Refund completed' when 'refund_failed' then 'Refund update' else 'Refund initiated' end,
      'Refund status for order '||new.order_number||' is '||replace(new.refund_status,'_',' ')||'.');
  end if;
  if old.return_status is distinct from new.return_status and new.return_status is not null then
    insert into public.customer_notifications(customer_id,order_id,order_number,notification_type,title,message)
    values(new.customer_id,new.id,new.order_number,'order_status','Return update','Return for order '||new.order_number||' is now '||replace(new.return_status,'_',' ')||'.');
  end if;
  return new;
end;
$$;
revoke all on function public.notify_customer_order_changes() from public,anon,authenticated;

do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
     and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='orders') then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;

notify pgrst,'reload schema';
