-- NIVELR - Progression utilisateur centralisee (niveau / XP)
-- A executer dans Supabase SQL Editor

create table if not exists public.user_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  handle text not null,
  level int not null default 1 check (level >= 1),
  xp_total int not null default 0 check (xp_total >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_progress_xp on public.user_progress(xp_total desc);

grant usage on schema public to authenticated;
grant select, insert, update on table public.user_progress to authenticated;

create table if not exists public.user_public_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  handle text not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_public_profiles_handle on public.user_public_profiles(handle);
create index if not exists idx_user_public_profiles_display_name on public.user_public_profiles(display_name);

grant select, insert, update on table public.user_public_profiles to authenticated;

create table if not exists public.user_app_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state_json jsonb not null default '{}'::jsonb,
  gamification_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

grant select, insert, update on table public.user_app_state to authenticated;

create table if not exists public.user_contacts (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('PENDING', 'ACCEPTED', 'DECLINED', 'BLOCKED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(requester_user_id, target_user_id)
);

grant select, insert, update, delete on table public.user_contacts to authenticated;

alter table public.user_progress enable row level security;

drop policy if exists user_progress_select_own on public.user_progress;
create policy user_progress_select_own
on public.user_progress
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists user_progress_upsert_own on public.user_progress;
create policy user_progress_upsert_own
on public.user_progress
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Option admin: lecture globale reservee a l'email admin
drop policy if exists user_progress_select_all_temp on public.user_progress;
drop policy if exists user_progress_select_admin_email on public.user_progress;
create policy user_progress_select_admin_email
on public.user_progress
for select
to authenticated
using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'nivelr2026@gmail.com');

alter table public.user_public_profiles enable row level security;

drop policy if exists user_public_profiles_select_all on public.user_public_profiles;
create policy user_public_profiles_select_all
on public.user_public_profiles
for select
to authenticated
using (true);

drop policy if exists user_public_profiles_upsert_own on public.user_public_profiles;
create policy user_public_profiles_upsert_own
on public.user_public_profiles
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

alter table public.user_app_state enable row level security;

drop policy if exists user_app_state_select_own on public.user_app_state;
create policy user_app_state_select_own
on public.user_app_state
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists user_app_state_upsert_own on public.user_app_state;
create policy user_app_state_upsert_own
on public.user_app_state
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

alter table public.user_contacts enable row level security;

drop policy if exists user_contacts_read_participant on public.user_contacts;
create policy user_contacts_read_participant
on public.user_contacts
for select
to authenticated
using (auth.uid() = requester_user_id or auth.uid() = target_user_id);

drop policy if exists user_contacts_insert_own on public.user_contacts;
create policy user_contacts_insert_own
on public.user_contacts
for insert
to authenticated
with check (auth.uid() = requester_user_id);

drop policy if exists user_contacts_update_target on public.user_contacts;
create policy user_contacts_update_target
on public.user_contacts
for update
to authenticated
using (auth.uid() = target_user_id or auth.uid() = requester_user_id)
with check (auth.uid() = target_user_id or auth.uid() = requester_user_id);

drop policy if exists user_contacts_delete_participant on public.user_contacts;
create policy user_contacts_delete_participant
on public.user_contacts
for delete
to authenticated
using (auth.uid() = requester_user_id or auth.uid() = target_user_id);
