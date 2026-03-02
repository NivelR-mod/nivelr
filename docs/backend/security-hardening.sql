-- NIVELR - Hardening SQL (Supabase)
-- A executer APRES user-progress.sql

-- 1) RLS forcee sur toutes les tables sensibles
alter table if exists public.user_progress force row level security;
alter table if exists public.user_public_profiles force row level security;
alter table if exists public.user_app_state force row level security;
alter table if exists public.user_contacts force row level security;

-- 2) Integrite de base pour user_contacts
alter table if exists public.user_contacts
  drop constraint if exists user_contacts_not_self;
alter table if exists public.user_contacts
  add constraint user_contacts_not_self check (requester_user_id <> target_user_id);

create index if not exists idx_user_contacts_requester on public.user_contacts(requester_user_id);
create index if not exists idx_user_contacts_target on public.user_contacts(target_user_id);
create index if not exists idx_user_contacts_status on public.user_contacts(status);

-- 3) Colonnes updated_at automatiquement maintenues
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_progress_set_updated_at on public.user_progress;
create trigger trg_user_progress_set_updated_at
before update on public.user_progress
for each row execute function public.set_updated_at();

drop trigger if exists trg_user_public_profiles_set_updated_at on public.user_public_profiles;
create trigger trg_user_public_profiles_set_updated_at
before update on public.user_public_profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_user_app_state_set_updated_at on public.user_app_state;
create trigger trg_user_app_state_set_updated_at
before update on public.user_app_state
for each row execute function public.set_updated_at();

drop trigger if exists trg_user_contacts_set_updated_at on public.user_contacts;
create trigger trg_user_contacts_set_updated_at
before update on public.user_contacts
for each row execute function public.set_updated_at();

-- 4) Backfill profils publics depuis user_progress (sans email)
insert into public.user_public_profiles (user_id, display_name, handle, updated_at)
select up.user_id, up.display_name, up.handle, now()
from public.user_progress up
where not exists (
  select 1 from public.user_public_profiles p where p.user_id = up.user_id
);

