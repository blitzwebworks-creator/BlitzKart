-- Add provider references while preserving existing orders and payment history.
alter table public.orders
  add column payment_provider text check (payment_provider is null or payment_provider in ('razorpay','payu')),
  add column gateway_payment_id text;

create index orders_payment_provider_idx on public.orders(payment_provider, gateway_order_id);

create or replace function public.store_payment_session(
  p_order_id uuid,
  p_provider text,
  p_gateway_order_id text,
  p_payment_url text,
  p_environment text
) returns void
language plpgsql security definer set search_path = public
as $$ begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  if p_provider not in ('razorpay','payu') then raise exception 'Invalid payment provider'; end if;
  if p_environment not in ('live','sandbox') then raise exception 'Invalid payment environment'; end if;
  if coalesce(trim(p_gateway_order_id),'') = '' then raise exception 'Payment provider order reference is required'; end if;
  update public.orders
  set payment_provider=p_provider, gateway_order_id=p_gateway_order_id,
      gateway_payment_url=p_payment_url, payment_environment=p_environment
  where id=p_order_id and payment_status='pending' and gateway_order_id is null;
  if not found then raise exception 'Order cannot accept a payment session'; end if;
end $$;
revoke all on function public.store_payment_session(uuid,text,text,text,text) from public;
grant execute on function public.store_payment_session(uuid,text,text,text,text) to service_role;

create or replace function public.confirm_external_payment(
  p_order_id uuid,
  p_provider text,
  p_gateway_order_id text,
  p_gateway_payment_id text,
  p_amount numeric,
  p_environment text
) returns text
language plpgsql security definer set search_path = public
as $$
declare v_order public.orders%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  if p_provider not in ('razorpay','payu') or coalesce(trim(p_gateway_payment_id),'') = '' then
    raise exception 'Invalid verified payment reference';
  end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found
     or v_order.payment_provider is distinct from p_provider
     or v_order.gateway_order_id is distinct from p_gateway_order_id
     or v_order.payment_environment is distinct from p_environment
     or round(p_amount,2) <> v_order.total then
    raise exception 'Payment verification mismatch';
  end if;
  if v_order.payment_status='paid' then
    if v_order.gateway_payment_id is not null and v_order.gateway_payment_id is distinct from p_gateway_payment_id then
      raise exception 'A different payment was already recorded for this order';
    end if;
    update public.orders set gateway_payment_id=p_gateway_payment_id where id=p_order_id and gateway_payment_id is null;
    return 'paid';
  end if;
  perform public.confirm_gateway_payment(p_order_id,p_gateway_order_id,p_amount,p_environment);
  update public.orders set gateway_payment_id=p_gateway_payment_id where id=p_order_id;
  return 'paid';
end $$;
revoke all on function public.confirm_external_payment(uuid,text,text,text,numeric,text) from public;
grant execute on function public.confirm_external_payment(uuid,text,text,text,numeric,text) to service_role;

-- Admin-managed category photography is stored in its own public-read bucket.
alter table public.categories add column image_url text;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('category-images','category-images',true,5242880,array['image/jpeg','image/png','image/webp','image/avif'])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy category_images_bucket_read on storage.objects for select to anon,authenticated using (bucket_id='category-images');
create policy category_images_bucket_admin_insert on storage.objects for insert to authenticated with check (bucket_id='category-images' and public.is_admin());
create policy category_images_bucket_admin_update on storage.objects for update to authenticated using (bucket_id='category-images' and public.is_admin()) with check (bucket_id='category-images' and public.is_admin());
create policy category_images_bucket_admin_delete on storage.objects for delete to authenticated using (bucket_id='category-images' and public.is_admin());
