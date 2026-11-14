-- Customer ratings can be submitted only for real delivered, paid purchases.
create table public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  review_text text check (review_text is null or length(review_text) <= 1000),
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_id, product_id)
);
create index product_reviews_public_idx on public.product_reviews(product_id, created_at desc) where is_published;
create index product_reviews_owner_idx on public.product_reviews(customer_id, order_id);
alter table public.product_reviews enable row level security;
create policy product_reviews_admin_read on public.product_reviews for select to authenticated using (public.is_admin());
revoke all on public.product_reviews from anon, authenticated;
grant select on public.product_reviews to authenticated;

create function public.get_product_reviews(p_product_id uuid)
returns table(rating smallint, review_text text, created_at timestamptz)
language sql stable security definer set search_path=pg_catalog, public
as $$
  select r.rating,r.review_text,r.created_at
  from public.product_reviews r
  where r.product_id=p_product_id and r.is_published
  order by r.created_at desc
  limit 100
$$;
revoke all on function public.get_product_reviews(uuid) from public;
grant execute on function public.get_product_reviews(uuid) to anon, authenticated;

create function public.get_order_product_reviews(p_order_id uuid)
returns table(product_id uuid,rating smallint,review_text text)
language sql stable security definer set search_path=pg_catalog, public, auth
as $$
  select r.product_id,r.rating,r.review_text
  from public.product_reviews r
  join public.orders o on o.id=r.order_id
  where r.order_id=p_order_id and r.customer_id=auth.uid() and o.customer_id=auth.uid()
$$;
revoke all on function public.get_order_product_reviews(uuid) from public, anon;
grant execute on function public.get_order_product_reviews(uuid) to authenticated;

create function public.submit_product_review(p_order_id uuid,p_product_id uuid,p_rating integer,p_review_text text default null)
returns void
language plpgsql security definer set search_path=pg_catalog, public, auth
as $$
declare v_user uuid := auth.uid(); v_order public.orders%rowtype;
begin
  if v_user is null or not public.is_active_customer() then raise exception 'Sign in with an active customer account to rate a product'; end if;
  if p_rating not between 1 and 5 or length(coalesce(p_review_text,'')) > 1000 then raise exception 'Choose a rating from one to five stars and keep the review under 1,000 characters'; end if;
  select * into v_order from public.orders where id=p_order_id and customer_id=v_user and payment_environment='live' for share;
  if not found or v_order.status <> 'delivered' or v_order.payment_status <> 'paid' then raise exception 'Only products in paid, delivered orders can be rated'; end if;
  if not exists(select 1 from public.order_items where order_id=p_order_id and product_id=p_product_id) then raise exception 'This product was not part of the selected order'; end if;
  insert into public.product_reviews(order_id,product_id,customer_id,rating,review_text)
    values(p_order_id,p_product_id,v_user,p_rating,nullif(trim(coalesce(p_review_text,'')),''))
  on conflict(order_id,product_id) do update set rating=excluded.rating,review_text=excluded.review_text,updated_at=now();
end
$$;
revoke all on function public.submit_product_review(uuid,uuid,integer,text) from public, anon;
grant execute on function public.submit_product_review(uuid,uuid,integer,text) to authenticated;
