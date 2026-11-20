-- Central operating schedule for the existing dual-delivery/PIN system.
create or replace function public.default_delivery_weekly_schedule(p_all_day boolean)
returns jsonb
language sql immutable set search_path=pg_catalog,public
as $$
  select jsonb_object_agg(day_key, jsonb_build_object(
    'enabled', true,
    'all_day', p_all_day,
    'open', case when p_all_day then '00:00' else '10:00' end,
    'close', case when p_all_day then '23:59' else '22:00' end
  ))
  from unnest(array['mon','tue','wed','thu','fri','sat','sun']::text[]) as days(day_key)
$$;

create or replace function public.valid_delivery_weekly_schedule(p_schedule jsonb)
returns boolean
language plpgsql immutable set search_path=pg_catalog,public
as $$
declare v_day text; v_entry jsonb; v_open text; v_close text;
begin
  if jsonb_typeof(p_schedule) <> 'object' then return false; end if;
  foreach v_day in array array['mon','tue','wed','thu','fri','sat','sun'] loop
    v_entry := p_schedule -> v_day;
    if jsonb_typeof(v_entry) is distinct from 'object'
      or jsonb_typeof(v_entry -> 'enabled') is distinct from 'boolean'
      or jsonb_typeof(v_entry -> 'all_day') is distinct from 'boolean'
      or jsonb_typeof(v_entry -> 'open') is distinct from 'string'
      or jsonb_typeof(v_entry -> 'close') is distinct from 'string' then return false; end if;
    v_open := v_entry ->> 'open'; v_close := v_entry ->> 'close';
    if v_open !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
      or v_close !~ '^(?:(?:[01][0-9]|2[0-3]):[0-5][0-9]|24:00)$'
      or v_open = v_close then return false; end if;
  end loop;
  return true;
end $$;

create or replace function public.delivery_weekly_schedule_is_open(p_schedule jsonb, p_local_time timestamp without time zone)
returns boolean
language plpgsql immutable set search_path=pg_catalog,public
as $$
declare
  v_today text; v_yesterday text; v_entry jsonb; v_open text; v_close text;
  v_open_min integer; v_close_min integer; v_now_min integer;
begin
  if p_local_time is null then return false; end if;
  if not public.valid_delivery_weekly_schedule(p_schedule) then return false; end if;
  v_today := case extract(isodow from p_local_time)::integer
    when 1 then 'mon' when 2 then 'tue' when 3 then 'wed' when 4 then 'thu'
    when 5 then 'fri' when 6 then 'sat' else 'sun' end;
  v_yesterday := case v_today
    when 'mon' then 'sun' when 'tue' then 'mon' when 'wed' then 'tue'
    when 'thu' then 'wed' when 'fri' then 'thu' when 'sat' then 'fri' else 'sat' end;
  v_now_min := extract(hour from p_local_time)::integer * 60 + extract(minute from p_local_time)::integer;
  v_entry := p_schedule -> v_today;
  if (v_entry ->> 'enabled')::boolean then
    if (v_entry ->> 'all_day')::boolean then return true; end if;
    v_open := v_entry ->> 'open'; v_close := v_entry ->> 'close';
    v_open_min := split_part(v_open, ':', 1)::integer * 60 + split_part(v_open, ':', 2)::integer;
    v_close_min := case when v_close = '24:00' then 1440 else split_part(v_close, ':', 1)::integer * 60 + split_part(v_close, ':', 2)::integer end;
    if v_open_min < v_close_min and v_now_min >= v_open_min and v_now_min < v_close_min then return true; end if;
    if v_open_min > v_close_min and (v_now_min >= v_open_min or v_now_min < v_close_min) then return true; end if;
  end if;
  v_entry := p_schedule -> v_yesterday;
  if (v_entry ->> 'enabled')::boolean and not (v_entry ->> 'all_day')::boolean then
    v_open := v_entry ->> 'open'; v_close := v_entry ->> 'close';
    v_open_min := split_part(v_open, ':', 1)::integer * 60 + split_part(v_open, ':', 2)::integer;
    v_close_min := case when v_close = '24:00' then 1440 else split_part(v_close, ':', 1)::integer * 60 + split_part(v_close, ':', 2)::integer end;
    if v_open_min > v_close_min and v_now_min < v_close_min then return true; end if;
  end if;
  return false;
end $$;

create table public.delivery_operating_settings (
  id smallint primary key check (id = 1),
  timezone text not null default 'Asia/Kolkata' check (timezone = 'Asia/Kolkata'),
  blitz_enabled boolean not null default true,
  standard_enabled boolean not null default true,
  automatic_scheduling boolean not null default true,
  blitz_paused boolean not null default false,
  standard_paused boolean not null default false,
  blitz_weekly_schedule jsonb not null default public.default_delivery_weekly_schedule(false)
    check (public.valid_delivery_weekly_schedule(blitz_weekly_schedule)),
  standard_weekly_schedule jsonb not null default public.default_delivery_weekly_schedule(true)
    check (public.valid_delivery_weekly_schedule(standard_weekly_schedule)),
  updated_at timestamptz not null default now()
);

insert into public.delivery_operating_settings(id) values (1) on conflict (id) do nothing;

alter table public.delivery_zones
  add column blitz_schedule_override jsonb null check (blitz_schedule_override is null or public.valid_delivery_weekly_schedule(blitz_schedule_override)),
  add column standard_schedule_override jsonb null check (standard_schedule_override is null or public.valid_delivery_weekly_schedule(standard_schedule_override));

alter table public.delivery_operating_settings enable row level security;
create policy delivery_operating_settings_admin_read on public.delivery_operating_settings
  for select to authenticated using (public.is_admin());
create policy delivery_operating_settings_admin_update on public.delivery_operating_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.delivery_operating_settings from anon, public;
grant select, update on public.delivery_operating_settings to authenticated;
grant select on public.delivery_operating_settings to service_role;

create or replace function public.delivery_method_is_available_now(p_postal_code text, p_method text, p_at timestamptz)
returns boolean
language plpgsql volatile security definer set search_path=pg_catalog,public
as $$
declare
  v_settings public.delivery_operating_settings%rowtype;
  v_zone public.delivery_zones%rowtype;
  v_enabled boolean; v_paused boolean; v_override jsonb; v_schedule jsonb;
begin
  if p_method is null or p_method not in ('blitz','standard') or p_postal_code is null or p_postal_code !~ '^110[0-9]{3}$' or p_at is null then return false; end if;
  select * into v_settings from public.delivery_operating_settings where id=1;
  if not found then return false; end if;
  select * into v_zone from public.delivery_zones
    where postal_code=p_postal_code and city='New Delhi' and state='Delhi' and is_directory_verified and is_active;
  if not found then return false; end if;
  if p_method='blitz' then
    v_enabled := v_settings.blitz_enabled and v_zone.blitz_enabled;
    v_paused := v_settings.blitz_paused;
    v_override := v_zone.blitz_schedule_override;
    v_schedule := coalesce(v_override,v_settings.blitz_weekly_schedule);
  else
    v_enabled := v_settings.standard_enabled and v_zone.standard_enabled;
    v_paused := v_settings.standard_paused;
    v_override := v_zone.standard_schedule_override;
    v_schedule := coalesce(v_override,v_settings.standard_weekly_schedule);
  end if;
  if not v_enabled or v_paused then return false; end if;
  if not v_settings.automatic_scheduling then return true; end if;
  return public.delivery_weekly_schedule_is_open(v_schedule, timezone('Asia/Kolkata',p_at));
end $$;
revoke all on function public.delivery_method_is_available_now(text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.delivery_method_is_available_now(text,text,timestamptz) to service_role;

create or replace function public.validate_order_delivery_operating_hours() returns trigger
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_postal_code text;
begin
  if new.delivery_method is null then return new; end if;
  v_postal_code := trim(coalesce(new.delivery_address ->> 'postal_code',''));
  perform 1 from public.delivery_operating_settings where id=1 for share;
  if not found then raise exception 'Delivery operating schedule is not configured'; end if;
  perform 1 from public.delivery_zones where postal_code=v_postal_code and is_directory_verified for share;
  if not found then raise exception 'Delivery is not available for this PIN code'; end if;
  if not public.delivery_method_is_available_now(v_postal_code,new.delivery_method,clock_timestamp()) then
    raise exception 'Selected delivery method is unavailable right now based on its operating schedule';
  end if;
  return new;
end $$;
revoke all on function public.validate_order_delivery_operating_hours() from public,anon,authenticated;
drop trigger if exists orders_validate_delivery_operating_hours on public.orders;
create trigger orders_validate_delivery_operating_hours
  before insert on public.orders for each row execute function public.validate_order_delivery_operating_hours();

create or replace function public.admin_reset_delivery_operating_hours()
returns void
language plpgsql security definer set search_path=pg_catalog,public
as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  -- Use the same zone-then-settings lock order as place_order to avoid reset/checkout deadlocks.
  update public.delivery_zones set blitz_schedule_override=null, standard_schedule_override=null
    where blitz_schedule_override is not null or standard_schedule_override is not null;
  update public.delivery_operating_settings set
    timezone='Asia/Kolkata', blitz_enabled=true, standard_enabled=true, automatic_scheduling=true,
    blitz_paused=false, standard_paused=false,
    blitz_weekly_schedule=public.default_delivery_weekly_schedule(false),
    standard_weekly_schedule=public.default_delivery_weekly_schedule(true), updated_at=now()
  where id=1;
end $$;
revoke all on function public.admin_reset_delivery_operating_hours() from public,anon,service_role;
grant execute on function public.admin_reset_delivery_operating_hours() to authenticated;

drop trigger if exists admin_live_change on public.delivery_operating_settings;
create trigger admin_live_change after insert or update or delete on public.delivery_operating_settings
  for each row execute function public.publish_admin_live_change();

do $$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
    and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='admin_live_events') then
    alter publication supabase_realtime add table public.admin_live_events;
  end if;
end $$;

notify pgrst,'reload schema';
