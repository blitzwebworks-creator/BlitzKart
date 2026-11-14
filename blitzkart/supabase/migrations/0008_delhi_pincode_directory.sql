-- Delhi PIN code directory supplied for BlitzKart operations.
-- The locality data below is imported from the user's supplied list. No PIN
-- codes are inferred or created for unassigned numbers.
alter table public.delivery_zones
  alter column delivery_charge set default 60,
  add column if not exists locality text not null default '',
  add column if not exists district text not null default 'Delhi',
  add column if not exists state text not null default 'Delhi',
  add column if not exists locality_aliases text[] not null default '{}',
  add column if not exists minimum_order_amount numeric(12,2) not null default 0 check (minimum_order_amount >= 0),
  add column if not exists estimated_delivery_minutes integer check (estimated_delivery_minutes is null or estimated_delivery_minutes between 1 and 10080),
  add column if not exists is_directory_verified boolean not null default false;

insert into public.delivery_zones
  (postal_code, city, locality, district, state, locality_aliases, delivery_charge, minimum_order_amount, estimated_delivery_minutes, is_active, is_directory_verified)
values
  ('110001','New Delhi','Connaught Place','Delhi','Delhi',array['New Delhi'],60,0,null,false,true),
  ('110002','New Delhi','Indraprastha','Delhi','Delhi',array['Darya Ganj'],60,0,null,false,true),
  ('110003','New Delhi','Lodhi Road','Delhi','Delhi','{}',60,0,null,false,true),
  ('110004','New Delhi','Rashtrapati Bhawan','Delhi','Delhi','{}',60,0,null,false,true),
  ('110005','New Delhi','Karol Bagh','Delhi','Delhi','{}',60,0,null,false,true),
  ('110006','New Delhi','Old Delhi','Delhi','Delhi',array['Delhi GPO'],60,0,null,false,true),
  ('110007','New Delhi','Malka Ganj','Delhi','Delhi','{}',60,0,null,false,true),
  ('110008','New Delhi','Patel Nagar','Delhi','Delhi','{}',60,0,null,false,true),
  ('110009','New Delhi','Dr. Mukherjee Nagar','Delhi','Delhi','{}',60,0,null,false,true),
  ('110010','New Delhi','Delhi Cantt','Delhi','Delhi','{}',60,0,null,false,true),
  ('110011','New Delhi','Nirman Bhawan','Delhi','Delhi','{}',60,0,null,false,true),
  ('110012','New Delhi','IARI','Delhi','Delhi',array['Pusa'],60,0,null,false,true),
  ('110013','New Delhi','Hazrat Nizamuddin','Delhi','Delhi','{}',60,0,null,false,true),
  ('110014','New Delhi','Jangpura','Delhi','Delhi','{}',60,0,null,false,true),
  ('110015','New Delhi','Ramesh Nagar','Delhi','Delhi','{}',60,0,null,false,true),
  ('110016','New Delhi','Hauz Khas','Delhi','Delhi','{}',60,0,null,false,true),
  ('110017','New Delhi','Malviya Nagar','Delhi','Delhi','{}',60,0,null,false,true),
  ('110018','New Delhi','Tilak Nagar','Delhi','Delhi','{}',60,0,null,false,true),
  ('110019','New Delhi','Kalkaji','Delhi','Delhi','{}',60,0,null,false,true),
  ('110020','New Delhi','Okhla Industrial Estate','Delhi','Delhi','{}',60,0,null,false,true),
  ('110021','New Delhi','Chanakyapuri','Delhi','Delhi','{}',60,0,null,false,true),
  ('110022','New Delhi','R.K. Puram Sector 5','Delhi','Delhi','{}',60,0,null,false,true),
  ('110023','New Delhi','Sarojini Nagar','Delhi','Delhi','{}',60,0,null,false,true),
  ('110024','New Delhi','Lajpat Nagar','Delhi','Delhi','{}',60,0,null,false,true),
  ('110025','New Delhi','New Friends Colony','Delhi','Delhi','{}',60,0,null,false,true),
  ('110026','New Delhi','Punjabi Bagh','Delhi','Delhi','{}',60,0,null,false,true),
  ('110027','New Delhi','Rajouri Garden','Delhi','Delhi',array['Tagore Garden'],60,0,null,false,true),
  ('110028','New Delhi','Naraina Industrial Estate','Delhi','Delhi','{}',60,0,null,false,true),
  ('110029','New Delhi','Safdarjung Enclave','Delhi','Delhi','{}',60,0,null,false,true),
  ('110030','New Delhi','Mehrauli','Delhi','Delhi','{}',60,0,null,false,true),
  ('110031','New Delhi','Gandhi Nagar','Delhi','Delhi','{}',60,0,null,false,true),
  ('110032','New Delhi','Shahdara','Delhi','Delhi','{}',60,0,null,false,true),
  ('110033','New Delhi','N.S. Mandi','Delhi','Delhi','{}',60,0,null,false,true),
  ('110034','New Delhi','Saraswati Vihar','Delhi','Delhi','{}',60,0,null,false,true),
  ('110035','New Delhi','Onkar Nagar','Delhi','Delhi','{}',60,0,null,false,true),
  ('110036','New Delhi','Alipur','Delhi','Delhi','{}',60,0,null,false,true),
  ('110037','New Delhi','Gurgaon Road','Delhi','Delhi',array['IGI Airport'],60,0,null,false,true),
  ('110038','New Delhi','A.F. Rajokari','Delhi','Delhi','{}',60,0,null,false,true),
  ('110039','New Delhi','Bawana','Delhi','Delhi','{}',60,0,null,false,true),
  ('110040','New Delhi','Narela','Delhi','Delhi','{}',60,0,null,false,true),
  ('110041','New Delhi','Nangloi','Delhi','Delhi','{}',60,0,null,false,true),
  ('110042','New Delhi','Samai Pur','Delhi','Delhi','{}',60,0,null,false,true),
  ('110043','New Delhi','Najafgarh','Delhi','Delhi','{}',60,0,null,false,true),
  ('110044','New Delhi','Badarpur','Delhi','Delhi','{}',60,0,null,false,true),
  ('110045','New Delhi','Palam Village','Delhi','Delhi','{}',60,0,null,false,true),
  ('110046','New Delhi','Nangal Raya','Delhi','Delhi','{}',60,0,null,false,true),
  ('110047','New Delhi','Arjungarh','Delhi','Delhi','{}',60,0,null,false,true),
  ('110048','New Delhi','Greater Kailash','Delhi','Delhi','{}',60,0,null,false,true),
  ('110049','New Delhi','Andrews Ganj','Delhi','Delhi','{}',60,0,null,false,true),
  ('110051','New Delhi','Krishna Nagar','Delhi','Delhi','{}',60,0,null,false,true),
  ('110052','New Delhi','Ashok Vihar','Delhi','Delhi','{}',60,0,null,false,true),
  ('110053','New Delhi','Seelampur','Delhi','Delhi','{}',60,0,null,false,true),
  ('110054','New Delhi','Civil Lines','Delhi','Delhi','{}',60,0,null,false,true),
  ('110055','New Delhi','S.R.T. Nagar','Delhi','Delhi','{}',60,0,null,false,true),
  ('110056','New Delhi','Shakur Basti','Delhi','Delhi','{}',60,0,null,false,true),
  ('110057','New Delhi','Vasant Vihar','Delhi','Delhi','{}',60,0,null,false,true),
  ('110058','New Delhi','Janakpuri','Delhi','Delhi','{}',60,0,null,false,true),
  ('110059','New Delhi','Mohan Garden','Delhi','Delhi','{}',60,0,null,false,true),
  ('110060','New Delhi','Rajender Nagar','Delhi','Delhi','{}',60,0,null,false,true),
  ('110061','New Delhi','Bijwasan','Delhi','Delhi','{}',60,0,null,false,true),
  ('110062','New Delhi','Pushpa Bhawan','Delhi','Delhi','{}',60,0,null,false,true),
  ('110063','New Delhi','Paschim Vihar','Delhi','Delhi','{}',60,0,null,false,true),
  ('110064','New Delhi','Mayapuri','Delhi','Delhi','{}',60,0,null,false,true),
  ('110065','New Delhi','Sriniwaspuri','Delhi','Delhi',array['East of Kailash postal area'],60,0,null,false,true),
  ('110066','New Delhi','R.K. Puram','Delhi','Delhi','{}',60,0,null,false,true),
  ('110067','New Delhi','JNU','Delhi','Delhi','{}',60,0,null,false,true),
  ('110068','New Delhi','IGNOU','Delhi','Delhi','{}',60,0,null,false,true),
  ('110069','New Delhi','UPSC','Delhi','Delhi','{}',60,0,null,false,true),
  ('110070','New Delhi','Vasant Kunj','Delhi','Delhi','{}',60,0,null,false,true),
  ('110071','New Delhi','Chhawla','Delhi','Delhi','{}',60,0,null,false,true),
  ('110072','New Delhi','Jharoda Kalan','Delhi','Delhi','{}',60,0,null,false,true),
  ('110073','New Delhi','Ujwa','Delhi','Delhi','{}',60,0,null,false,true),
  ('110074','New Delhi','Chhattarpur','Delhi','Delhi','{}',60,0,null,false,true),
  ('110075','New Delhi','Dwarka Sector 6','Delhi','Delhi','{}',60,0,null,false,true),
  ('110076','New Delhi','Sarita Vihar','Delhi','Delhi','{}',60,0,null,false,true),
  ('110077','New Delhi','Raj Nagar II','Delhi','Delhi','{}',60,0,null,false,true)
on conflict (postal_code) do update set
  city=excluded.city,
  locality=excluded.locality,
  district=excluded.district,
  state=excluded.state,
  locality_aliases=excluded.locality_aliases,
  delivery_charge=excluded.delivery_charge,
  minimum_order_amount=excluded.minimum_order_amount,
  estimated_delivery_minutes=null,
  is_active=false,
  is_directory_verified=true,
  updated_at=now();

-- Any prior manually-entered New Delhi code not in the supplied directory is
-- disabled. Only verified rows can be enabled from the admin PIN manager.
update public.delivery_zones
set is_active=false, is_directory_verified=false, updated_at=now()
where city='New Delhi' and not is_directory_verified;

create or replace function public.lookup_delivery_pincode(p_postal_code text)
returns table(postal_code text, locality text, district text, state text, locality_aliases text[], is_serviceable boolean, delivery_charge numeric, minimum_order_amount numeric, estimated_delivery_minutes integer)
language sql stable security definer set search_path=pg_catalog, public
as $$
  select z.postal_code,z.locality,z.district,z.state,z.locality_aliases,z.is_active,z.delivery_charge,z.minimum_order_amount,z.estimated_delivery_minutes
  from public.delivery_zones z
  where p_postal_code ~ '^[0-9]{6}$' and z.postal_code=p_postal_code and z.is_directory_verified
$$;
revoke all on function public.lookup_delivery_pincode(text) from public;
grant execute on function public.lookup_delivery_pincode(text) to anon, authenticated;

create function public.admin_orders_by_delivery_pincode()
returns table(postal_code text,order_count bigint,recent_orders jsonb)
language plpgsql stable security definer set search_path=pg_catalog, public
as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  return query
    with live_orders as (
      select o.id,o.order_number,o.status::text as status,o.created_at,o.delivery_address->>'postal_code' as pin
      from public.orders o
      where o.payment_environment='live'
        and coalesce(o.delivery_address->>'postal_code','') ~ '^[0-9]{6}$'
        and exists(select 1 from public.delivery_zones z where z.postal_code=o.delivery_address->>'postal_code' and z.is_directory_verified)
    ), counts as (
      select l.pin,count(*)::bigint as order_count from live_orders l group by l.pin
    )
    select c.pin,c.order_count,
      coalesce((select jsonb_agg(jsonb_build_object('id',recent.id,'order_number',recent.order_number,'status',recent.status) order by recent.created_at desc)
                from (select l.id,l.order_number,l.status,l.created_at from live_orders l where l.pin=c.pin order by l.created_at desc limit 4) recent),'[]'::jsonb)
    from counts c order by c.pin;
end $$;
revoke all on function public.admin_orders_by_delivery_pincode() from public, anon;
grant execute on function public.admin_orders_by_delivery_pincode() to authenticated;

-- Protect checkout even if a caller skips the website's lookup and quote APIs.
create or replace function public.validate_order_delivery_pincode() returns trigger
language plpgsql security definer set search_path=pg_catalog, public
as $$
declare v_zone public.delivery_zones%rowtype; v_locality text;
begin
  if lower(trim(coalesce(new.delivery_address->>'city',''))) <> 'new delhi'
     or lower(trim(coalesce(new.delivery_address->>'state',''))) not in ('delhi','delhi nct','national capital territory of delhi') then
    raise exception 'Delivery is available only in Delhi';
  end if;
  select * into v_zone from public.delivery_zones
    where postal_code=trim(new.delivery_address->>'postal_code')
      and is_directory_verified and is_active for share;
  if not found then raise exception 'Delivery is not available for this PIN code'; end if;
  v_locality := lower(trim(coalesce(new.delivery_address->>'locality','')));
  if v_locality <> lower(v_zone.locality) and not exists(
    select 1 from unnest(v_zone.locality_aliases) as locality_alias(value) where lower(trim(locality_alias.value))=v_locality
  ) then raise exception 'Choose a listed postal locality for this PIN code'; end if;
  if new.delivery_charge is distinct from v_zone.delivery_charge then raise exception 'Delivery charge changed; refresh checkout'; end if;
  if new.subtotal < v_zone.minimum_order_amount then raise exception 'This PIN code requires a minimum order amount of %', v_zone.minimum_order_amount; end if;
  return new;
end $$;
revoke all on function public.validate_order_delivery_pincode() from public, anon, authenticated;
create trigger orders_validate_delivery_pincode
  before insert on public.orders
  for each row execute function public.validate_order_delivery_pincode();
