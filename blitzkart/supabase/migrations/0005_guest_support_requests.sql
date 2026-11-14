alter table public.support_requests alter column customer_id drop not null;
alter table public.support_requests add column contact_name text;
alter table public.support_requests add column contact_email text;
alter table public.support_requests add column contact_phone text;
alter table public.support_requests add constraint support_requests_guest_contact_required check (
  customer_id is not null or (
    contact_name is not null and length(trim(contact_name)) between 2 and 100
    and contact_email is not null and length(trim(contact_email)) between 3 and 254
  )
);

create table public.support_request_rate_limits (
  rate_key text primary key check (rate_key ~ '^[a-f0-9]{64}$'),
  window_started timestamptz not null default now(),
  submission_count integer not null default 0 check (submission_count >= 0)
);
alter table public.support_request_rate_limits enable row level security;
revoke all on public.support_request_rate_limits from public, anon, authenticated;

create or replace function public.submit_public_support_request(
  p_rate_key text,
  p_customer_id uuid,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_subject text,
  p_message text
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_count integer;
  v_request_id uuid;
begin
  if p_rate_key !~ '^[a-f0-9]{64}$'
    or length(trim(coalesce(p_contact_name, ''))) not between 2 and 100
    or length(trim(coalesce(p_contact_email, ''))) not between 3 and 254
    or length(trim(coalesce(p_subject, ''))) not between 3 and 120
    or length(trim(coalesce(p_message, ''))) not between 10 and 3000 then
    raise exception 'Invalid support request';
  end if;

  insert into public.support_request_rate_limits(rate_key, window_started, submission_count)
  values (p_rate_key, now(), 1)
  on conflict (rate_key) do update set
    window_started = case
      when support_request_rate_limits.window_started < now() - interval '15 minutes' then now()
      else support_request_rate_limits.window_started
    end,
    submission_count = case
      when support_request_rate_limits.window_started < now() - interval '15 minutes' then 1
      else support_request_rate_limits.submission_count + 1
    end
  returning submission_count into v_count;

  if v_count > 3 then return null; end if;

  insert into public.support_requests(customer_id, order_id, subject, message, status, contact_name, contact_email, contact_phone)
  values (
    p_customer_id,
    null,
    trim(p_subject),
    trim(p_message),
    'open',
    trim(p_contact_name),
    lower(trim(p_contact_email)),
    nullif(trim(coalesce(p_contact_phone, '')), '')
  ) returning id into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.submit_public_support_request(text, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_public_support_request(text, uuid, text, text, text, text, text) to service_role;
