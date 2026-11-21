-- Customer and support request notifications were rejected by the original
-- order-only target_path constraint, rolling back the request insert trigger.
alter table public.admin_notifications
  drop constraint if exists admin_notifications_target_path_check;

alter table public.admin_notifications
  add constraint admin_notifications_target_path_check
  check (
    target_path = '/admin/orders'
    or target_path like '/admin/orders/%'
    or target_path = '/admin/requests'
    or target_path like '/admin/requests/%'
    or target_path = '/admin/support'
    or target_path like '/admin/support/%'
  );
