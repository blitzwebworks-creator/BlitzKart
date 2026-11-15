alter table public.products
  add column product_delivery_charge numeric(12,2) null
  check (product_delivery_charge is null or product_delivery_charge >= 0);

alter table public.orders
  add column product_delivery_charge numeric(12,2) not null default 0
  check (product_delivery_charge >= 0);

create or replace function public.admin_create_product(p_product jsonb,p_quantity integer,p_low_stock integer) returns uuid
language plpgsql security definer set search_path = pg_catalog, public
as $$ declare v_id uuid := gen_random_uuid();
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_quantity < 0 or p_low_stock < 0 then raise exception 'Inventory values cannot be negative'; end if;
  insert into public.products(id,name,slug,description,category_id,sku,selling_price,original_price,specifications,is_featured,is_active,product_delivery_charge)
  values(v_id,trim(p_product->>'name'),trim(p_product->>'slug'),nullif(trim(p_product->>'description'),''),nullif(p_product->>'category_id','')::uuid,trim(p_product->>'sku'),(p_product->>'selling_price')::numeric,nullif(p_product->>'original_price','')::numeric,coalesce(p_product->'specifications','{}'::jsonb),coalesce((p_product->>'is_featured')::boolean,false),coalesce((p_product->>'is_active')::boolean,true),nullif(p_product->>'product_delivery_charge','')::numeric);
  insert into public.inventory(product_id,quantity,reserved_quantity,low_stock_threshold) values(v_id,p_quantity,0,p_low_stock);
  if p_quantity > 0 then insert into public.inventory_movements(product_id,previous_quantity,new_quantity,reason,movement_type,admin_id) values(v_id,0,p_quantity,'Initial product stock','restock',auth.uid()); end if;
  return v_id;
end $$;
revoke all on function public.admin_create_product(jsonb,integer,integer) from public;
grant execute on function public.admin_create_product(jsonb,integer,integer) to authenticated;

create or replace function public.admin_update_product(p_product_id uuid,p_product jsonb) returns void
language plpgsql security definer set search_path = pg_catalog, public
as $$ begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  update public.products set
    name=trim(p_product->>'name'),
    slug=trim(p_product->>'slug'),
    description=nullif(trim(p_product->>'description'),''),
    category_id=nullif(p_product->>'category_id','')::uuid,
    sku=upper(trim(p_product->>'sku')),
    selling_price=(p_product->>'selling_price')::numeric,
    original_price=nullif(p_product->>'original_price','')::numeric,
    product_delivery_charge=nullif(p_product->>'product_delivery_charge','')::numeric,
    specifications=coalesce(p_product->'specifications','{}'::jsonb),
    is_featured=coalesce((p_product->>'is_featured')::boolean,false),
    is_active=coalesce((p_product->>'is_active')::boolean,false)
  where id=p_product_id;
  if not found then raise exception 'Product not found'; end if;
end $$;
revoke all on function public.admin_update_product(uuid,jsonb) from public;
grant execute on function public.admin_update_product(uuid,jsonb) to authenticated;

create or replace function public.place_order(p_customer_id uuid,p_address jsonb,p_lines jsonb,p_coupon_code text default null) returns uuid
language plpgsql security definer set search_path = pg_catalog, extensions, public
as $$
declare
  v_user uuid := p_customer_id;
  v_order uuid := gen_random_uuid();
  v_number text := 'BK-' || to_char(now() at time zone 'Asia/Kolkata','YYMMDD') || '-' || upper(substr(encode(extensions.gen_random_bytes(5),'hex'),1,8));
  v_line jsonb; v_product public.products%rowtype; v_qty integer; v_stock public.inventory%rowtype;
  v_subtotal numeric(12,2) := 0; v_delivery_charge numeric(12,2); v_product_delivery_charge numeric(12,2) := 0; v_discount numeric(12,2) := 0; v_coupon public.coupons%rowtype; v_payload jsonb := '[]'::jsonb;
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
  select delivery_charge into v_delivery_charge from public.delivery_zones where postal_code=trim(p_address->>'postal_code') and city='New Delhi' and is_active;
  if not found then raise exception 'Delivery is not available for this New Delhi PIN code yet'; end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_qty := (v_line->>'quantity')::integer;
    if v_qty < 1 or v_qty > 50 then raise exception 'Quantity is outside the allowed range'; end if;
    select * into v_product from public.products where id = (v_line->>'product_id')::uuid and is_active for share;
    if not found then raise exception 'A product in your cart is unavailable'; end if;
    select * into v_stock from public.inventory where product_id = v_product.id for update;
    if not found or v_stock.quantity - v_stock.reserved_quantity < v_qty then raise exception 'Insufficient stock for %', v_product.name; end if;
    update public.inventory set reserved_quantity = reserved_quantity + v_qty, updated_at = now() where product_id = v_product.id;
    v_subtotal := v_subtotal + (v_product.selling_price * v_qty);
    v_product_delivery_charge := v_product_delivery_charge + (coalesce(v_product.product_delivery_charge,0) * v_qty);
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

  insert into public.orders(id,customer_id,order_number,status,payment_status,subtotal,coupon_id,discount_amount,delivery_charge,product_delivery_charge,total,delivery_address)
  values(v_order,v_user,v_number,'pending','pending',v_subtotal,v_coupon.id,v_discount,v_delivery_charge,v_product_delivery_charge,v_subtotal-v_discount+v_delivery_charge+v_product_delivery_charge,p_address);
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
