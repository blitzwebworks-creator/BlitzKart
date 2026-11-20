-- BlitzKart core schema. Run against a fresh Supabase project; no demo rows are inserted.
create extension if not exists pgcrypto;

create type public.order_state as enum ('pending','confirmed','sourcing','packed','ready_for_pickup','out_for_delivery','delivered','cancelled');
create type public.payment_state as enum ('not_configured','pending','paid','failed','expired','review','refunded');
create type public.delivery_state as enum ('pending','booked','picked_up','in_transit','out_for_delivery','delivered','exception','cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  phone text,
  account_status text not null default 'active' check (account_status in ('active','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.promotional_banners (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 2 and 120),
  body text,
  href text check (href is null or (href like '/%' and href not like '//%')),
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  category_id uuid references public.categories(id) on delete set null,
  sku text not null unique,
  selling_price numeric(12,2) not null check (selling_price >= 0),
  original_price numeric(12,2) check (original_price is null or original_price >= selling_price),
  specifications jsonb not null default '{}'::jsonb,
  is_featured boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  image_url text not null,
  alt_text text,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create table public.inventory (
  product_id uuid primary key references public.products(id) on delete cascade,
  quantity integer not null default 0 check (quantity >= 0),
  reserved_quantity integer not null default 0 check (reserved_quantity >= 0 and reserved_quantity <= quantity),
  low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0),
  updated_at timestamptz not null default now()
);
create table public.carts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity integer not null check (quantity > 0),
  unique(cart_id, product_id)
);
create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  recipient_name text not null,
  phone text not null,
  address_line1 text not null,
  address_line2 text,
  locality text not null,
  city text not null,
  state text not null,
  postal_code text not null,
  landmark text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index addresses_customer_location_unique on public.addresses(customer_id,phone,postal_code,address_line1,locality,city,state);
create table public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  postal_code text not null unique check (postal_code ~ '^[0-9]{6}$'),
  city text not null,
  delivery_charge numeric(12,2) not null check (delivery_charge >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete restrict,
  order_number text not null unique,
  status public.order_state not null default 'pending',
  payment_status public.payment_state not null default 'pending',
  payment_environment text not null default 'live' check (payment_environment in ('live','sandbox')),
  subtotal numeric(12,2) not null check (subtotal >= 0),
  coupon_id uuid,
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  delivery_charge numeric(12,2) not null check (delivery_charge >= 0),
  total numeric(12,2) not null check (total >= 0),
  delivery_address jsonb not null,
  gateway_order_id text unique,
  gateway_payment_url text,
  gateway_expires_at timestamptz,
  payment_event_sequence integer not null default 0,
  reservation_released boolean not null default false,
  tracking_token_hash text,
  internal_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.support_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  subject text not null check (length(subject) between 3 and 120),
  message text not null check (length(message) between 10 and 3000),
  status text not null default 'open' check (status in ('open','in_progress','resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_customer_created_idx on public.orders(customer_id, created_at desc);
create index orders_status_created_idx on public.orders(status, created_at desc);
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  sku text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);
create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  previous_status public.order_state,
  new_status public.order_state not null,
  changed_by uuid references auth.users(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  previous_quantity integer not null,
  new_quantity integer not null,
  reason text not null,
  movement_type text not null check (movement_type in ('adjustment','sale','restock','reservation_release')),
  order_id uuid references public.orders(id) on delete set null,
  admin_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type text not null check (discount_type in ('percentage','fixed')),
  discount_value numeric(12,2) not null check (discount_value > 0 and (discount_type='fixed' or discount_value <= 100)),
  minimum_order_value numeric(12,2) not null default 0 check (minimum_order_value >= 0),
  usage_limit integer check (usage_limit is null or usage_limit >= 0),
  usage_count integer not null default 0 check (usage_count >= 0),
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.orders add constraint orders_coupon_id_fkey foreign key (coupon_id) references public.coupons(id) on delete set null;
create table public.coupon_usage (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete restrict,
  customer_id uuid not null references auth.users(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete cascade,
  used_at timestamptz not null default now(),
  unique(coupon_id, order_id)
);
create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  mode text not null default 'manual' check (mode in ('manual','shiprocket_quick')),
  status public.delivery_state not null default 'pending',
  pickup_location text,
  delivery_charge numeric(12,2) not null check (delivery_charge >= 0),
  tracking_reference text,
  provider_reference text,
  notes text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.delivery_history (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  previous_status public.delivery_state,
  new_status public.delivery_state not null,
  tracking_reference text,
  note text,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  reference text,
  phone text,
  email text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.sourcing_records (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.suppliers(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  purchase_cost numeric(12,2) not null check (purchase_cost >= 0),
  purchase_date date,
  status text not null default 'pending' check (status in ('pending','ordered','received','cancelled')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.internal_order_notes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  admin_id uuid references auth.users(id) on delete set null,
  note text not null,
  created_at timestamptz not null default now()
);
create table public.payment_webhook_events (
  event_id text primary key,
  event_sequence integer not null default 0,
  event_name text not null,
  received_at timestamptz not null default now()
);

create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
do $$ declare t text; begin
  foreach t in array array['profiles','categories','promotional_banners','products','carts','addresses','delivery_zones','orders','support_requests','coupons','deliveries','suppliers','sourcing_records'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t || '_touch_updated_at', t);
  end loop;
end $$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.admin_users where user_id = auth.uid() and active) $$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

create function public.is_active_customer() returns boolean
language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles where id=auth.uid() and account_status='active') $$;
revoke all on function public.is_active_customer() from public;
grant execute on function public.is_active_customer() to authenticated, service_role;

create function public.admin_list_customers(p_limit integer default 500,p_offset integer default 0)
returns table(id uuid,full_name text,email text,phone text,account_status text,created_at timestamptz,order_count bigint)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  return query
    select p.id,p.full_name,p.email,p.phone,p.account_status,p.created_at,count(o.id)::bigint
    from public.profiles p
    left join public.admin_users a on a.user_id=p.id
    left join public.orders o on o.customer_id=p.id and o.payment_environment='live'
    where a.user_id is null
    group by p.id,p.full_name,p.email,p.phone,p.account_status,p.created_at
    order by p.created_at desc
    limit greatest(1,least(coalesce(p_limit,500),500))
    offset greatest(coalesce(p_offset,0),0);
end $$;
revoke all on function public.admin_list_customers(integer,integer) from public;
grant execute on function public.admin_list_customers(integer,integer) to authenticated;

create function public.admin_dashboard_metrics()
returns table(total_orders bigint,pending_orders bigint,processing_orders bigint,completed_orders bigint,cancelled_orders bigint,registered_customers bigint,active_products bigint,low_stock_products bigint,revenue numeric)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  return query select
    (select count(*) from public.orders o where o.payment_environment='live'),
    (select count(*) from public.orders o where o.payment_environment='live' and o.status='pending'),
    (select count(*) from public.orders o where o.payment_environment='live' and o.status in ('confirmed','sourcing','packed','ready_for_pickup','out_for_delivery')),
    (select count(*) from public.orders o where o.payment_environment='live' and o.status='delivered'),
    (select count(*) from public.orders o where o.payment_environment='live' and o.status='cancelled'),
    (select count(*) from public.profiles p where not exists (select 1 from public.admin_users a where a.user_id=p.id)),
    (select count(*) from public.products p where p.is_active),
    (select count(*) from public.inventory i join public.products p on p.id=i.product_id where p.is_active and i.quantity-i.reserved_quantity<=i.low_stock_threshold),
    (select coalesce(sum(o.total),0) from public.orders o where o.payment_environment='live' and o.status='delivered' and o.payment_status='paid');
end $$;
revoke all on function public.admin_dashboard_metrics() from public;
grant execute on function public.admin_dashboard_metrics() to authenticated;

create function public.admin_daily_analytics(p_days integer default 14)
returns table(sales_day date,order_count bigint,revenue numeric)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  return query select o.created_at::date,count(*)::bigint,
    coalesce(sum(o.total) filter (where o.status='delivered' and o.payment_status='paid'),0)::numeric
    from public.orders o
    where o.payment_environment='live'
      and o.created_at >= now() - make_interval(days => greatest(1,least(coalesce(p_days,14),90)))
    group by o.created_at::date order by o.created_at::date;
end $$;
revoke all on function public.admin_daily_analytics(integer) from public;
grant execute on function public.admin_daily_analytics(integer) to authenticated;

create function public.admin_order_status_breakdown()
returns table(order_status text,order_count bigint)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  return query select o.status::text,count(*)::bigint from public.orders o
    where o.payment_environment='live' group by o.status order by count(*) desc,o.status;
end $$;
revoke all on function public.admin_order_status_breakdown() from public;
grant execute on function public.admin_order_status_breakdown() to authenticated;

create function public.admin_bestsellers(p_limit integer default 10)
returns table(product_name text,quantity bigint,revenue numeric)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  return query select i.product_name,sum(i.quantity)::bigint,sum(i.line_total)::numeric
    from public.order_items i join public.orders o on o.id=i.order_id
    where o.payment_environment='live' and o.status='delivered' and o.payment_status='paid'
    group by i.product_id,i.product_name order by sum(i.quantity) desc,i.product_name
    limit greatest(1,least(coalesce(p_limit,10),50));
end $$;
revoke all on function public.admin_bestsellers(integer) from public;
grant execute on function public.admin_bestsellers(integer) to authenticated;

create function public.admin_low_stock_products()
returns table(product_id uuid,product_name text,sku text,available_quantity integer,low_stock_threshold integer)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  return query select p.id,p.name,p.sku,greatest(0,i.quantity-i.reserved_quantity),i.low_stock_threshold
    from public.inventory i join public.products p on p.id=i.product_id
    where p.is_active and i.quantity-i.reserved_quantity<=i.low_stock_threshold
    order by i.quantity-i.reserved_quantity,p.name;
end $$;
revoke all on function public.admin_low_stock_products() from public;
grant execute on function public.admin_low_stock_products() to authenticated;

create function public.sync_cart(p_lines jsonb) returns void
language plpgsql security definer set search_path = public
as $$
declare v_user uuid:=auth.uid(); v_cart_id uuid; v_line jsonb; v_product_id uuid; v_quantity integer;
begin
  if v_user is null or not public.is_active_customer() then raise exception 'An active customer account is required'; end if;
  if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)>50 then raise exception 'Invalid cart'; end if;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    if jsonb_typeof(v_line)<>'object' or coalesce(v_line->>'product_id','') !~* '^[0-9a-f-]{36}$' or coalesce(v_line->>'quantity','') !~ '^[0-9]{1,2}$' then raise exception 'Invalid cart item'; end if;
    v_product_id:=(v_line->>'product_id')::uuid; v_quantity:=(v_line->>'quantity')::integer;
    if v_quantity<1 or v_quantity>50 then raise exception 'Cart quantities must be between 1 and 50'; end if;
    perform 1 from public.products where id=v_product_id and is_active;
    if not found then raise exception 'A product in your cart is unavailable'; end if;
  end loop;
  insert into public.carts(customer_id) values(v_user)
    on conflict(customer_id) do update set updated_at=now() returning id into v_cart_id;
  delete from public.cart_items where cart_id=v_cart_id;
  insert into public.cart_items(cart_id,product_id,quantity)
    select v_cart_id,(value->>'product_id')::uuid,(value->>'quantity')::integer from jsonb_array_elements(p_lines)
    on conflict(cart_id,product_id) do update set quantity=excluded.quantity;
end $$;
revoke all on function public.sync_cart(jsonb) from public;
grant execute on function public.sync_cart(jsonb) to authenticated;

create function public.create_profile_for_auth_user() returns trigger language plpgsql security definer set search_path = public
as $$ begin insert into public.profiles(id, full_name, email) values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), coalesce(new.email,'')); return new; end $$;
create trigger auth_user_profile after insert on auth.users for each row execute function public.create_profile_for_auth_user();
create function public.sync_profile_email() returns trigger language plpgsql security definer set search_path = public
as $$ begin update public.profiles set email=coalesce(new.email,'') where id=new.id; return new; end $$;
create trigger auth_user_email_sync after update of email on auth.users for each row execute function public.sync_profile_email();

create function public.place_order(p_customer_id uuid,p_address jsonb,p_lines jsonb,p_coupon_code text default null) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := p_customer_id;
  v_order uuid := gen_random_uuid();
  v_number text := 'BK-' || to_char(now() at time zone 'Asia/Kolkata','YYMMDD') || '-' || upper(substr(encode(gen_random_bytes(5),'hex'),1,8));
  v_line jsonb; v_product public.products%rowtype; v_qty integer; v_stock public.inventory%rowtype;
  v_subtotal numeric(12,2) := 0; v_delivery_charge numeric(12,2); v_discount numeric(12,2) := 0; v_coupon public.coupons%rowtype; v_payload jsonb := '[]'::jsonb;
  v_account_status text;
begin
  if auth.role() <> 'service_role' then raise exception 'Server checkout is required'; end if;
  if v_user is null then raise exception 'An active customer account is required to place an order'; end if;
  select account_status into v_account_status from public.profiles where id=v_user;
  if not found or v_account_status<>'active' then raise exception 'An active customer account is required to place an order'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Your cart is empty'; end if;
  if length(coalesce(p_address->>'recipient_name','')) not between 1 and 100
     or length(coalesce(p_address->>'phone','')) not between 7 and 20
     or length(coalesce(p_address->>'address_line1','')) not between 1 and 200
     or length(coalesce(p_address->>'locality','')) not between 1 and 100
     or length(coalesce(p_address->>'city','')) not between 1 and 100
     or length(coalesce(p_address->>'state','')) not between 1 and 100
     or (p_address->>'postal_code') !~ '^[0-9]{6}$' then raise exception 'Please provide a complete delivery address'; end if;
  select delivery_charge into v_delivery_charge from public.delivery_zones where postal_code=trim(p_address->>'postal_code') and is_active;
  if not found then raise exception 'Delivery is not available for this PIN code yet'; end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_qty := (v_line->>'quantity')::integer;
    if v_qty < 1 or v_qty > 50 then raise exception 'Quantity is outside the allowed range'; end if;
    select * into v_product from public.products where id = (v_line->>'product_id')::uuid and is_active for share;
    if not found then raise exception 'A product in your cart is unavailable'; end if;
    select * into v_stock from public.inventory where product_id = v_product.id for update;
    if not found or v_stock.quantity - v_stock.reserved_quantity < v_qty then raise exception 'Insufficient stock for %', v_product.name; end if;
    update public.inventory set reserved_quantity = reserved_quantity + v_qty, updated_at = now() where product_id = v_product.id;
    v_subtotal := v_subtotal + (v_product.selling_price * v_qty);
    v_payload := v_payload || jsonb_build_array(jsonb_build_object('product_id',v_product.id,'name',v_product.name,'sku',v_product.sku,'quantity',v_qty,'unit_price',v_product.selling_price,'line_total',v_product.selling_price*v_qty));
  end loop;

  if nullif(trim(p_coupon_code),'') is not null then
    select * into v_coupon from public.coupons where code=upper(trim(p_coupon_code)) and is_active for update;
    if not found then raise exception 'This coupon is not valid'; end if;
    if v_coupon.expires_at is not null and v_coupon.expires_at <= now() then raise exception 'This coupon has expired'; end if;
    if v_subtotal < v_coupon.minimum_order_value then raise exception 'Your cart does not meet this coupon minimum'; end if;
    if v_coupon.usage_limit is not null and v_coupon.usage_count >= v_coupon.usage_limit then raise exception 'This coupon has reached its usage limit'; end if;
    v_discount := case when v_coupon.discount_type='percentage' then round(v_subtotal * v_coupon.discount_value / 100,2) else least(v_subtotal,v_coupon.discount_value) end;
    update public.coupons set usage_count=usage_count+1 where id=v_coupon.id;
  end if;

  insert into public.orders(id,customer_id,order_number,status,payment_status,subtotal,coupon_id,discount_amount,delivery_charge,total,delivery_address)
  values(v_order,v_user,v_number,'pending','pending',v_subtotal,v_coupon.id,v_discount,v_delivery_charge,v_subtotal-v_discount+v_delivery_charge,p_address);
  insert into public.addresses(customer_id,recipient_name,phone,address_line1,address_line2,locality,city,state,postal_code,landmark,is_default)
    values(v_user,trim(p_address->>'recipient_name'),trim(p_address->>'phone'),trim(p_address->>'address_line1'),nullif(trim(coalesce(p_address->>'address_line2','')),''),trim(p_address->>'locality'),trim(p_address->>'city'),trim(p_address->>'state'),trim(p_address->>'postal_code'),nullif(trim(coalesce(p_address->>'landmark','')),''),not exists(select 1 from public.addresses where customer_id=v_user))
    on conflict(customer_id,phone,postal_code,address_line1,locality,city,state) do update set recipient_name=excluded.recipient_name,address_line2=excluded.address_line2,landmark=excluded.landmark,updated_at=now();
  insert into public.order_items(order_id,product_id,product_name,sku,quantity,unit_price,line_total)
    select v_order,(x->>'product_id')::uuid,x->>'name',x->>'sku',(x->>'quantity')::integer,(x->>'unit_price')::numeric,(x->>'line_total')::numeric from jsonb_array_elements(v_payload) x;
  insert into public.order_status_history(order_id,previous_status,new_status,changed_by,note) values(v_order,null,'pending',v_user,'Order submitted; payment is pending.');
  if v_coupon.id is not null then insert into public.coupon_usage(coupon_id,customer_id,order_id) values(v_coupon.id,v_user,v_order); end if;
  delete from public.cart_items where cart_id in (select id from public.carts where customer_id=v_user);
  return v_order;
end $$;
revoke all on function public.place_order(uuid,jsonb,jsonb,text) from public;
grant execute on function public.place_order(uuid,jsonb,jsonb,text) to service_role;

create function public.store_gateway_session(p_order_id uuid,p_gateway_order_id text,p_payment_url text,p_expires_at timestamptz,p_environment text) returns void
language plpgsql security definer set search_path = public
as $$ begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  if p_environment not in ('live','sandbox') then raise exception 'Invalid payment environment'; end if;
  update public.orders set gateway_order_id=p_gateway_order_id,gateway_payment_url=p_payment_url,gateway_expires_at=p_expires_at,payment_environment=p_environment where id=p_order_id and payment_status='pending';
  if not found then raise exception 'Order cannot accept a payment session'; end if;
end $$;
revoke all on function public.store_gateway_session(uuid,text,text,timestamptz,text) from public;
grant execute on function public.store_gateway_session(uuid,text,text,timestamptz,text) to service_role;

create function public.fail_gateway_initialization(p_order_id uuid) returns void
language plpgsql security definer set search_path = public
as $$ declare v_order public.orders%rowtype; v_item record;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.payment_status <> 'pending' or v_order.gateway_order_id is not null then return; end if;
  if not v_order.reservation_released then
    for v_item in select product_id,quantity from public.order_items where order_id=v_order.id and product_id is not null loop
      update public.inventory set reserved_quantity=greatest(0,reserved_quantity-v_item.quantity),updated_at=now() where product_id=v_item.product_id;
    end loop;
  end if;
  update public.orders set payment_status='failed',reservation_released=true where id=v_order.id;
end $$;
revoke all on function public.fail_gateway_initialization(uuid) from public;
grant execute on function public.fail_gateway_initialization(uuid) to service_role;

create function public.apply_gateway_event(p_event jsonb) returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_data jsonb := p_event->'data'; v_id text := p_event->>'event_id'; v_name text := p_event->>'event';
  v_seq integer := coalesce((p_event->>'event_sequence')::integer,0); v_order public.orders%rowtype;
  v_item record; v_before integer; v_reserved integer; v_shortage boolean := false; v_next_status public.order_state;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  if coalesce(v_id,'') = '' or coalesce(v_data->>'client_order_id','') = '' then raise exception 'Invalid payment event'; end if;
  insert into public.payment_webhook_events(event_id,event_sequence,event_name) values(v_id,v_seq,v_name) on conflict do nothing;
  if not found then return 'duplicate'; end if;
  select * into v_order from public.orders where id = (v_data->>'client_order_id')::uuid for update;
  if not found or v_order.gateway_order_id is distinct from v_data->>'order_id' then raise exception 'Order reference mismatch'; end if;
  if v_order.payment_environment is distinct from v_data->>'environment' then raise exception 'Payment environment mismatch'; end if;
  if round((v_data->>'amount')::numeric,2) <> v_order.total then raise exception 'Payment amount mismatch'; end if;
  if v_seq <= v_order.payment_event_sequence then return 'stale'; end if;
  update public.orders set payment_event_sequence = v_seq where id = v_order.id;
  if v_name = 'order.paid' and v_order.payment_status <> 'paid' then
    for v_item in select product_id,quantity from public.order_items where order_id = v_order.id and product_id is not null loop
      select quantity,reserved_quantity into v_before,v_reserved from public.inventory where product_id = v_item.product_id for update;
      if v_order.reservation_released then
        if v_before-v_reserved < v_item.quantity then v_shortage := true;
        else
          update public.inventory set quantity=quantity-v_item.quantity,updated_at=now() where product_id=v_item.product_id;
          insert into public.inventory_movements(product_id,previous_quantity,new_quantity,reason,movement_type,order_id) values(v_item.product_id,v_before,v_before-v_item.quantity,'Paid order '||v_order.order_number,'sale',v_order.id);
        end if;
      else
        update public.inventory set quantity=quantity-v_item.quantity,reserved_quantity=greatest(0,reserved_quantity-v_item.quantity),updated_at=now() where product_id=v_item.product_id;
        insert into public.inventory_movements(product_id,previous_quantity,new_quantity,reason,movement_type,order_id) values(v_item.product_id,v_before,v_before-v_item.quantity,'Paid order '||v_order.order_number,'sale',v_order.id);
      end if;
    end loop;
    v_next_status := case when v_shortage or v_order.status='cancelled' then 'sourcing'::public.order_state when v_order.status='pending' then 'confirmed'::public.order_state else v_order.status end;
    update public.orders set payment_status='paid',status=v_next_status,reservation_released=true,updated_at=now() where id=v_order.id;
    insert into public.deliveries(order_id,status,mode,delivery_charge) values(v_order.id,'pending','manual',v_order.delivery_charge) on conflict(order_id) do nothing;
    insert into public.order_status_history(order_id,previous_status,new_status,note)
      select v_order.id,v_order.status,v_next_status,case when v_shortage then 'Payment verified; order requires fulfilment review.' else 'Payment verified by gateway.' end
      where v_order.status is distinct from v_next_status or v_order.payment_status<>'paid';
  elsif v_name in ('order.expired','order.failed') and v_order.payment_status='pending' then
    if not v_order.reservation_released then
      for v_item in select product_id,quantity from public.order_items where order_id = v_order.id and product_id is not null loop
        update public.inventory set reserved_quantity=greatest(0,reserved_quantity-v_item.quantity),updated_at=now() where product_id=v_item.product_id;
      end loop;
    end if;
    update public.orders set payment_status=case when v_name='order.expired' then 'expired'::public.payment_state else 'failed'::public.payment_state end,reservation_released=true where id=v_order.id;
  end if;
  return 'processed';
end $$;
revoke all on function public.apply_gateway_event(jsonb) from public;
grant execute on function public.apply_gateway_event(jsonb) to service_role;

create function public.confirm_gateway_payment(p_order_id uuid,p_gateway_order_id text,p_amount numeric,p_environment text) returns text
language plpgsql security definer set search_path = public
as $$
declare v_order public.orders%rowtype; v_item record; v_before integer; v_reserved integer; v_shortage boolean := false; v_next_status public.order_state;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.gateway_order_id is distinct from p_gateway_order_id or round(p_amount,2) <> v_order.total or v_order.payment_environment is distinct from p_environment then raise exception 'Payment verification mismatch'; end if;
  if v_order.payment_status='paid' then return 'paid'; end if;
  for v_item in select product_id,quantity from public.order_items where order_id=v_order.id and product_id is not null loop
    select quantity,reserved_quantity into v_before,v_reserved from public.inventory where product_id=v_item.product_id for update;
    if v_order.reservation_released then
      if v_before-v_reserved < v_item.quantity then v_shortage := true;
      else
        update public.inventory set quantity=quantity-v_item.quantity,updated_at=now() where product_id=v_item.product_id;
        insert into public.inventory_movements(product_id,previous_quantity,new_quantity,reason,movement_type,order_id) values(v_item.product_id,v_before,v_before-v_item.quantity,'Paid order '||v_order.order_number,'sale',v_order.id);
      end if;
    else
      update public.inventory set quantity=quantity-v_item.quantity,reserved_quantity=greatest(0,reserved_quantity-v_item.quantity),updated_at=now() where product_id=v_item.product_id;
      insert into public.inventory_movements(product_id,previous_quantity,new_quantity,reason,movement_type,order_id) values(v_item.product_id,v_before,v_before-v_item.quantity,'Paid order '||v_order.order_number,'sale',v_order.id);
    end if;
  end loop;
  v_next_status := case when v_shortage or v_order.status='cancelled' then 'sourcing'::public.order_state when v_order.status='pending' then 'confirmed'::public.order_state else v_order.status end;
  update public.orders set payment_status='paid',status=v_next_status,reservation_released=true where id=v_order.id;
  insert into public.deliveries(order_id,status,mode,delivery_charge) values(v_order.id,'pending','manual',v_order.delivery_charge) on conflict(order_id) do nothing;
  insert into public.order_status_history(order_id,previous_status,new_status,note) values(v_order.id,v_order.status,v_next_status,case when v_shortage then 'Payment verified; order requires fulfilment review.' else 'Payment verified by gateway.' end);
  return 'paid';
end $$;
revoke all on function public.confirm_gateway_payment(uuid,text,numeric,text) from public;
grant execute on function public.confirm_gateway_payment(uuid,text,numeric,text) to service_role;

create function public.admin_update_order_status(p_order_id uuid,p_status public.order_state,p_note text default null) returns void
language plpgsql security definer set search_path = public
as $$ declare v_order public.orders%rowtype; v_item record;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.payment_environment <> 'live' then raise exception 'Sandbox orders cannot be changed from live operations'; end if;
  if v_order.payment_status <> 'paid' and p_status not in ('pending','cancelled') then
    raise exception 'Order fulfilment can start only after payment is verified';
  end if;
  if v_order.payment_status='paid' and p_status='pending' then
    raise exception 'A paid order cannot return to pending';
  end if;
  if p_status='cancelled' and v_order.payment_status='paid' then
    raise exception 'Paid order cancellation requires a refund workflow';
  end if;
  if v_order.status='delivered' and p_status <> 'delivered' then raise exception 'Delivered orders cannot be moved backwards'; end if;
  if p_status='cancelled' and v_order.payment_status <> 'paid' and not v_order.reservation_released then
    for v_item in select product_id,quantity from public.order_items where order_id=v_order.id and product_id is not null loop
      update public.inventory set reserved_quantity=greatest(0,reserved_quantity-v_item.quantity),updated_at=now() where product_id=v_item.product_id;
    end loop;
    update public.orders set reservation_released=true where id=v_order.id;
  end if;
  update public.orders set status=p_status where id=p_order_id;
  insert into public.order_status_history(order_id,previous_status,new_status,changed_by,note) values(p_order_id,v_order.status,p_status,auth.uid(),nullif(left(coalesce(p_note,''),1000),''));
end $$;
revoke all on function public.admin_update_order_status(uuid,public.order_state,text) from public;
grant execute on function public.admin_update_order_status(uuid,public.order_state,text) to authenticated;

create function public.admin_set_customer_status(p_user_id uuid,p_status text) returns void
language plpgsql security definer set search_path = public
as $$ begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_status not in ('active','disabled') then raise exception 'Invalid account status'; end if;
  update public.profiles set account_status=p_status where id=p_user_id;
  if not found then raise exception 'Customer not found'; end if;
end $$;
revoke all on function public.admin_set_customer_status(uuid,text) from public;
grant execute on function public.admin_set_customer_status(uuid,text) to authenticated;

create function public.admin_update_support_status(p_request_id uuid,p_status text) returns void
language plpgsql security definer set search_path = public
as $$ begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_status not in ('open','in_progress','resolved') then raise exception 'Invalid request status'; end if;
  update public.support_requests set status=p_status where id=p_request_id;
  if not found then raise exception 'Support request not found'; end if;
end $$;
revoke all on function public.admin_update_support_status(uuid,text) from public;
grant execute on function public.admin_update_support_status(uuid,text) to authenticated;

create function public.admin_adjust_inventory(p_product_id uuid,p_new_quantity integer,p_reason text) returns void
language plpgsql security definer set search_path = public
as $$ declare v_before integer;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_new_quantity < 0 or length(trim(p_reason)) < 3 then raise exception 'Enter a valid quantity and reason'; end if;
  select quantity into v_before from public.inventory where product_id=p_product_id for update;
  if not found then raise exception 'Inventory record not found'; end if;
  if p_new_quantity < (select reserved_quantity from public.inventory where product_id=p_product_id) then raise exception 'New quantity cannot be lower than reserved stock'; end if;
  update public.inventory set quantity=p_new_quantity,updated_at=now() where product_id=p_product_id;
  insert into public.inventory_movements(product_id,previous_quantity,new_quantity,reason,movement_type,admin_id) values(p_product_id,v_before,p_new_quantity,left(trim(p_reason),500),'adjustment',auth.uid());
end $$;
revoke all on function public.admin_adjust_inventory(uuid,integer,text) from public;
grant execute on function public.admin_adjust_inventory(uuid,integer,text) to authenticated;

create function public.admin_create_product(p_product jsonb,p_quantity integer,p_low_stock integer) returns uuid
language plpgsql security definer set search_path = public
as $$ declare v_id uuid := gen_random_uuid();
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_quantity < 0 or p_low_stock < 0 then raise exception 'Inventory values cannot be negative'; end if;
  insert into public.products(id,name,slug,description,category_id,sku,selling_price,original_price,specifications,is_featured,is_active)
  values(v_id,trim(p_product->>'name'),trim(p_product->>'slug'),nullif(trim(p_product->>'description'),''),nullif(p_product->>'category_id','')::uuid,trim(p_product->>'sku'),(p_product->>'selling_price')::numeric,nullif(p_product->>'original_price','')::numeric,coalesce(p_product->'specifications','{}'::jsonb),coalesce((p_product->>'is_featured')::boolean,false),coalesce((p_product->>'is_active')::boolean,true));
  insert into public.inventory(product_id,quantity,reserved_quantity,low_stock_threshold) values(v_id,p_quantity,0,p_low_stock);
  if p_quantity > 0 then insert into public.inventory_movements(product_id,previous_quantity,new_quantity,reason,movement_type,admin_id) values(v_id,0,p_quantity,'Initial product stock','restock',auth.uid()); end if;
  return v_id;
end $$;
revoke all on function public.admin_create_product(jsonb,integer,integer) from public;
grant execute on function public.admin_create_product(jsonb,integer,integer) to authenticated;

create function public.admin_update_product(p_product_id uuid,p_product jsonb) returns void
language plpgsql security definer set search_path = public
as $$ begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  update public.products set name=trim(p_product->>'name'),slug=trim(p_product->>'slug'),description=nullif(trim(p_product->>'description'),''),category_id=nullif(p_product->>'category_id','')::uuid,sku=upper(trim(p_product->>'sku')),selling_price=(p_product->>'selling_price')::numeric,original_price=nullif(p_product->>'original_price','')::numeric,specifications=coalesce(p_product->'specifications','{}'::jsonb),is_featured=coalesce((p_product->>'is_featured')::boolean,false),is_active=coalesce((p_product->>'is_active')::boolean,false) where id=p_product_id;
  if not found then raise exception 'Product not found'; end if;
end $$;
revoke all on function public.admin_update_product(uuid,jsonb) from public;
grant execute on function public.admin_update_product(uuid,jsonb) to authenticated;

create function public.admin_delete_product(p_product_id uuid) returns void
language plpgsql security definer set search_path = public
as $$ declare v_locked_id uuid;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  select id into v_locked_id from public.products where id=p_product_id for update;
  if not found then raise exception 'Product not found'; end if;
  select product_id into v_locked_id from public.inventory where product_id=p_product_id for update;
  if exists(select 1 from public.order_items where product_id=p_product_id) then raise exception 'Products with order history cannot be deleted; deactivate the product to preserve records'; end if;
  if exists(select 1 from public.inventory_movements where product_id=p_product_id) then raise exception 'Products with stock history cannot be deleted; deactivate the product to preserve audit records'; end if;
  if exists(select 1 from public.inventory where product_id=p_product_id and (quantity>0 or reserved_quantity>0)) then raise exception 'Clear the product stock before deleting it'; end if;
  delete from public.products where id=p_product_id;
end $$;
revoke all on function public.admin_delete_product(uuid) from public;
grant execute on function public.admin_delete_product(uuid) to authenticated;

create function public.admin_update_delivery(p_order_id uuid,p_status public.delivery_state,p_tracking text,p_notes text,p_mode text default 'manual') returns void
language plpgsql security definer set search_path = public
as $$ declare v_delivery public.deliveries%rowtype; v_previous public.delivery_state; v_old_tracking text; v_order public.orders%rowtype; v_new_order_status public.order_state;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_mode <> 'manual' then raise exception 'Only manual delivery updates are configured'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.payment_status<>'paid' or v_order.payment_environment<>'live' then raise exception 'Delivery updates require a verified live paid order'; end if;
  select status,tracking_reference into v_previous,v_old_tracking from public.deliveries where order_id=p_order_id for update;
  if v_previous='delivered' and p_status<>'delivered' then raise exception 'Delivered records cannot be moved backwards'; end if;
  insert into public.deliveries(order_id,mode,status,tracking_reference,notes,updated_by,delivery_charge) values(p_order_id,p_mode,p_status,nullif(trim(p_tracking),''),left(coalesce(p_notes,''),1000),auth.uid(),v_order.delivery_charge)
    on conflict(order_id) do update set mode=excluded.mode,status=excluded.status,tracking_reference=excluded.tracking_reference,notes=excluded.notes,updated_by=auth.uid(),updated_at=now()
    returning * into v_delivery;
  insert into public.delivery_history(delivery_id,previous_status,new_status,tracking_reference,note,changed_by)
    values(v_delivery.id,v_previous,v_delivery.status,v_delivery.tracking_reference,nullif(left(trim(coalesce(p_notes,'')),1000),''),auth.uid());
  if p_status='delivered' and v_order.payment_status='paid' and v_order.status<>'delivered' then v_new_order_status='delivered';
  elsif p_status in ('picked_up','in_transit','out_for_delivery') and v_order.payment_status='paid' and v_order.status not in ('cancelled','delivered') then v_new_order_status='out_for_delivery';
  else v_new_order_status:=v_order.status; end if;
  if v_new_order_status is distinct from v_order.status then
    update public.orders set status=v_new_order_status where id=p_order_id;
    insert into public.order_status_history(order_id,previous_status,new_status,changed_by,note) values(p_order_id,v_order.status,v_new_order_status,auth.uid(),'Updated from delivery management.');
  end if;
end $$;
revoke all on function public.admin_update_delivery(uuid,public.delivery_state,text,text,text) from public;
grant execute on function public.admin_update_delivery(uuid,public.delivery_state,text,text,text) to authenticated;

-- RLS: customers read only their own private records; operational tables are admin-only.
alter table public.profiles enable row level security;
alter table public.admin_users enable row level security;
alter table public.categories enable row level security;
alter table public.promotional_banners enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.inventory enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.addresses enable row level security;
alter table public.delivery_zones enable row level security;
alter table public.orders enable row level security;
alter table public.support_requests enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.coupons enable row level security;
alter table public.coupon_usage enable row level security;
alter table public.deliveries enable row level security;
alter table public.delivery_history enable row level security;
alter table public.suppliers enable row level security;
alter table public.sourcing_records enable row level security;
alter table public.internal_order_notes enable row level security;
alter table public.payment_webhook_events enable row level security;

create policy profile_self_read on public.profiles for select to authenticated using (id=auth.uid() or public.is_admin());
create policy profile_self_update on public.profiles for update to authenticated using (id=auth.uid() and public.is_active_customer()) with check (id=auth.uid() and public.is_active_customer());
revoke update on public.profiles from authenticated;
grant update(full_name,phone) on public.profiles to authenticated;
create policy admins_admin_only on public.admin_users for select to authenticated using (public.is_admin());
create policy categories_visible on public.categories for select to anon,authenticated using (is_active or public.is_admin());
create policy categories_admin on public.categories for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy banners_active_read on public.promotional_banners for select to anon,authenticated using (is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()) or public.is_admin());
create policy banners_admin on public.promotional_banners for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy products_visible on public.products for select to anon,authenticated using (is_active or public.is_admin());
create policy products_admin_insert on public.products for insert to authenticated with check (public.is_admin());
create policy products_admin_update on public.products for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy images_visible on public.product_images for select to anon,authenticated using (exists(select 1 from public.products p where p.id=product_id and (p.is_active or public.is_admin())));
create policy images_admin on public.product_images for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy inventory_public_read on public.inventory for select to anon,authenticated using (exists(select 1 from public.products p where p.id=product_id and p.is_active) or public.is_admin());
create policy inventory_admin_read on public.inventory for select to authenticated using (public.is_admin());
create policy carts_self on public.carts for all to authenticated using ((customer_id=auth.uid() and public.is_active_customer()) or public.is_admin()) with check ((customer_id=auth.uid() and public.is_active_customer()) or public.is_admin());
create policy cart_items_self on public.cart_items for all to authenticated using (exists(select 1 from public.carts c where c.id=cart_id and ((c.customer_id=auth.uid() and public.is_active_customer()) or public.is_admin()))) with check (exists(select 1 from public.carts c where c.id=cart_id and ((c.customer_id=auth.uid() and public.is_active_customer()) or public.is_admin())));
create policy addresses_self_read on public.addresses for select to authenticated using ((customer_id=auth.uid() and public.is_active_customer()) or public.is_admin());
create policy addresses_self_write on public.addresses for all to authenticated using ((customer_id=auth.uid() and public.is_active_customer()) or public.is_admin()) with check ((customer_id=auth.uid() and public.is_active_customer()) or public.is_admin());
create policy delivery_zones_active_read on public.delivery_zones for select to anon,authenticated using (is_active or public.is_admin());
create policy delivery_zones_admin on public.delivery_zones for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy orders_customer_read on public.orders for select to authenticated using ((customer_id=auth.uid() and public.is_active_customer()) or public.is_admin());
create policy support_requests_customer_read on public.support_requests for select to authenticated using ((customer_id=auth.uid() and public.is_active_customer()) or public.is_admin());
create policy support_requests_customer_insert on public.support_requests for insert to authenticated with check (customer_id=auth.uid() and public.is_active_customer());
create policy items_customer_read on public.order_items for select to authenticated using (exists(select 1 from public.orders o where o.id=order_id and ((o.customer_id=auth.uid() and public.is_active_customer()) or public.is_admin())));
create policy order_history_read on public.order_status_history for select to authenticated using (exists(select 1 from public.orders o where o.id=order_id and ((o.customer_id=auth.uid() and public.is_active_customer()) or public.is_admin())));
create policy movements_admin on public.inventory_movements for select to authenticated using (public.is_admin());
create policy coupons_admin on public.coupons for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy coupon_usage_customer_read on public.coupon_usage for select to authenticated using ((customer_id=auth.uid() and public.is_active_customer()) or public.is_admin());
create policy coupon_usage_admin on public.coupon_usage for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy deliveries_visible_to_order_owner on public.deliveries for select to authenticated using (exists(select 1 from public.orders o where o.id=order_id and ((o.customer_id=auth.uid() and public.is_active_customer()) or public.is_admin())));
create policy deliveries_admin_read on public.deliveries for select to authenticated using (public.is_admin());
create policy delivery_history_owner_read on public.delivery_history for select to authenticated using (exists(select 1 from public.deliveries d join public.orders o on o.id=d.order_id where d.id=delivery_id and ((o.customer_id=auth.uid() and public.is_active_customer()) or public.is_admin())));
create policy delivery_history_admin_read on public.delivery_history for select to authenticated using (public.is_admin());
create policy suppliers_admin on public.suppliers for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy sourcing_admin on public.sourcing_records for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy internal_notes_admin on public.internal_order_notes for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy webhook_events_admin on public.payment_webhook_events for select to authenticated using (public.is_admin());

-- Product images live in a private-by-default project bucket; public reads are limited to this bucket.
insert into storage.buckets(id,name,public) values('product-images','product-images',true) on conflict(id) do nothing;
create policy product_images_bucket_read on storage.objects for select to anon,authenticated using (bucket_id='product-images');
create policy product_images_bucket_admin_insert on storage.objects for insert to authenticated with check (bucket_id='product-images' and public.is_admin());
create policy product_images_bucket_admin_update on storage.objects for update to authenticated using (bucket_id='product-images' and public.is_admin()) with check (bucket_id='product-images' and public.is_admin());
create policy product_images_bucket_admin_delete on storage.objects for delete to authenticated using (bucket_id='product-images' and public.is_admin());
