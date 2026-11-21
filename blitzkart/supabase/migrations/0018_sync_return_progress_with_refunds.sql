-- Keep a linked return/exchange timeline in sync with authoritative Razorpay refunds.
-- Only the backend refund record/webhook can set orders.refund_status; this trigger
-- mirrors those confirmed states into the existing return history and request.

create or replace function public.sync_return_progress_after_refund()
returns trigger
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_next_status text;
begin
  if new.refund_status is not distinct from old.refund_status
    or new.return_request_id is null
    or new.refund_status not in ('refund_pending','refunded')
    or not exists (
      select 1 from public.customer_requests r
      where r.id=new.return_request_id and r.request_type in ('return','exchange')
    ) then
    return new;
  end if;

  if new.refund_status='refund_pending' then
    if new.return_status in ('item_received','returned_successfully') then
      v_next_status:='refund_initiated';
      update public.orders set return_status=v_next_status,updated_at=now()
      where id=new.id and return_status=new.return_status;
      if found then
        insert into public.order_return_history(order_id,customer_request_id,previous_status,new_status,note)
        values(new.id,new.return_request_id,new.return_status,v_next_status,'Razorpay accepted the refund request.');
      end if;
    end if;
    return new;
  end if;

  if new.refund_status='refunded' and new.return_status is distinct from 'refunded'
    and new.return_status is distinct from 'return_rejected' then
    if new.return_status is not null and new.return_status is distinct from 'refund_initiated' then
      insert into public.order_return_history(order_id,customer_request_id,previous_status,new_status,note)
      values(new.id,new.return_request_id,new.return_status,'refund_initiated','Razorpay confirmed that the refund was initiated.');
    end if;
    update public.orders set return_status='refunded',updated_at=now()
    where id=new.id and return_status is distinct from 'refunded' and return_status is distinct from 'return_rejected';
    if found then
      insert into public.order_return_history(order_id,customer_request_id,previous_status,new_status,note)
      values(new.id,new.return_request_id,'refund_initiated','refunded','Razorpay confirmed the refund as processed.');
      update public.customer_requests
      set status='completed',processed_at=coalesce(processed_at,now()),updated_at=now()
      where id=new.return_request_id and request_type in ('return','exchange') and status not in ('completed','rejected');
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.sync_return_progress_after_refund() from public,anon,authenticated;

drop trigger if exists orders_sync_return_progress_after_refund on public.orders;
create trigger orders_sync_return_progress_after_refund
  after update of refund_status on public.orders
  for each row execute function public.sync_return_progress_after_refund();

-- Repair already-confirmed refunds so existing customer timelines do not remain
-- stuck at Item received after this migration is applied.
insert into public.order_return_history(order_id,customer_request_id,previous_status,new_status,note,created_at)
select o.id,o.return_request_id,o.return_status,'refund_initiated',
  'Razorpay refund was initiated before return progress synchronization was enabled.',
  coalesce(o.refund_initiated_at,now())
from public.orders o
join public.customer_requests r on r.id=o.return_request_id and r.request_type in ('return','exchange')
where o.refund_status='refunded'
  and o.return_status is not null
  and o.return_status not in ('refund_initiated','refunded','return_rejected')
  and not exists (
    select 1 from public.order_return_history h
    where h.order_id=o.id and h.customer_request_id=o.return_request_id and h.new_status='refund_initiated'
  );

insert into public.order_return_history(order_id,customer_request_id,previous_status,new_status,note,created_at)
select o.id,o.return_request_id,'refund_initiated','refunded',
  'Razorpay confirmed the refund as processed.',
  coalesce((
    select max(h.created_at) from public.order_refund_history h
    join public.order_refunds f on f.id=h.refund_record_id
    where f.order_id=o.id and h.status='refunded'
  ),o.refund_initiated_at,now())
from public.orders o
join public.customer_requests r on r.id=o.return_request_id and r.request_type in ('return','exchange')
where o.refund_status='refunded'
  and o.return_status is distinct from 'refunded'
  and o.return_status is distinct from 'return_rejected'
  and not exists (
    select 1 from public.order_return_history h
    where h.order_id=o.id and h.customer_request_id=o.return_request_id and h.new_status='refunded'
  );

update public.orders o
set return_status='refunded',updated_at=now()
from public.customer_requests r
where r.id=o.return_request_id and r.request_type in ('return','exchange')
  and o.refund_status='refunded'
  and o.return_status is distinct from 'refunded'
  and o.return_status is distinct from 'return_rejected';

update public.customer_requests r
set status='completed',processed_at=coalesce(r.processed_at,now()),updated_at=now()
from public.orders o
where o.return_request_id=r.id and r.request_type in ('return','exchange')
  and o.refund_status='refunded' and o.return_status='refunded'
  and r.status not in ('completed','rejected');

notify pgrst,'reload schema';
