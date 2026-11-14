-- Restrict active delivery coverage to PIN codes explicitly configured for New Delhi.
-- Keep existing out-of-area rows for auditability, but deactivate them.
update public.delivery_zones
set is_active = false, updated_at = now()
where lower(btrim(city)) not in ('new delhi', 'delhi');
-- Delhi service PINs use the 110-series; deactivate any previously misconfigured code too.
update public.delivery_zones
set is_active = false, updated_at = now()
where is_active and postal_code !~ '^110[0-9]{3}$';

update public.delivery_zones
set city = 'New Delhi', updated_at = now()
where lower(btrim(city)) in ('new delhi', 'delhi') and city <> 'New Delhi';

alter table public.delivery_zones
  add constraint delivery_zones_active_new_delhi_only
  check (not is_active or (city = 'New Delhi' and postal_code ~ '^110[0-9]{3}$'));

-- New registrations receive their required, normalized phone number in the profile row.
create or replace function public.create_profile_for_auth_user() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_phone text := coalesce(new.raw_user_meta_data->>'phone', '');
begin
  if v_phone !~ '^\+91[6-9][0-9]{9}$' then
    raise exception 'A valid Indian mobile number is required';
  end if;
  insert into public.profiles(id, full_name, email, phone)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), coalesce(new.email,''), v_phone);
  return new;
end $$;

create or replace function public.validate_profile_phone() returns trigger
language plpgsql set search_path = public
as $$
begin
  if coalesce(new.phone, '') !~ '^\+91[6-9][0-9]{9}$' then
    raise exception 'A valid Indian mobile number is required';
  end if;
  return new;
end $$;
create trigger profiles_phone_required
before update of phone on public.profiles
for each row execute function public.validate_profile_phone();

create or replace function public.validate_new_delhi_customer_address() returns trigger
language plpgsql set search_path = public
as $$
declare
  v_city text;
  v_state text;
  v_phone text;
  v_postal_code text;
begin
  if tg_table_name = 'addresses' then
    v_city := new.city;
    v_state := new.state;
    v_phone := new.phone;
    v_postal_code := new.postal_code;
  else
    v_city := new.delivery_address->>'city';
    v_state := new.delivery_address->>'state';
    v_phone := new.delivery_address->>'phone';
    v_postal_code := new.delivery_address->>'postal_code';
  end if;

  if lower(btrim(coalesce(v_city, ''))) not in ('new delhi', 'delhi')
    or lower(btrim(coalesce(v_state, ''))) not in ('delhi', 'nct of delhi', 'national capital territory of delhi') then
    raise exception 'Delivery is currently available only in New Delhi';
  end if;
  if coalesce(v_phone, '') !~ '^\+91[6-9][0-9]{9}$' then
    raise exception 'A valid Indian mobile number is required for delivery';
  end if;
  if not exists (
    select 1 from public.delivery_zones
    where postal_code = v_postal_code and city = 'New Delhi' and is_active
  ) then
    raise exception 'Delivery is not available for this New Delhi PIN code yet';
  end if;
  return new;
end $$;

create trigger addresses_new_delhi_only
before insert or update on public.addresses
for each row execute function public.validate_new_delhi_customer_address();

create trigger orders_new_delhi_only
before insert or update of delivery_address on public.orders
for each row execute function public.validate_new_delhi_customer_address();

-- Keep a stable gallery order and prevent more than six images per product.
with ranked_images as (
  select id, row_number() over (partition by product_id order by created_at, id) - 1 as new_position
  from public.product_images
)
update public.product_images as images
set position = ranked_images.new_position
from ranked_images
where images.id = ranked_images.id;

create unique index product_images_product_position_unique
  on public.product_images(product_id, position);

create or replace function public.guard_product_image_limit() returns trigger
language plpgsql set search_path = public
as $$
declare
  v_count integer;
begin
  if new.position < 0 or new.position > 5 then
    raise exception 'Product image position must be between 0 and 5';
  end if;
  if tg_op = 'INSERT' or new.product_id <> old.product_id then
    perform pg_advisory_xact_lock(hashtextextended(new.product_id::text, 0));
    select count(*) into v_count from public.product_images where product_id = new.product_id;
    if v_count >= 6 then
      raise exception 'A product can have at most six images';
    end if;
  end if;
  return new;
end $$;
create trigger product_images_max_six
before insert or update of product_id, position on public.product_images
for each row execute function public.guard_product_image_limit();
