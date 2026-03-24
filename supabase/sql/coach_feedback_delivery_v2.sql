alter table if exists public.coach_feedbacks
  add column if not exists delivery_status text not null default 'SENT'
    check (delivery_status in ('PENDING', 'SENT', 'ERROR')),
  add column if not exists delivery_mode text not null default 'MANUAL'
    check (delivery_mode in ('MANUAL', 'AUTO')),
  add column if not exists emailed_at timestamptz,
  add column if not exists delivery_error text;

update public.coach_feedbacks
set
  delivery_status = coalesce(nullif(delivery_status, ''), 'SENT'),
  delivery_mode = coalesce(nullif(delivery_mode, ''), 'MANUAL')
where delivery_status is null
   or delivery_status = ''
   or delivery_mode is null
   or delivery_mode = '';
