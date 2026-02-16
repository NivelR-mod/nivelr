-- NIVELR Backend Schema v1 (safe foundation)
-- Cible recommandee: PostgreSQL / Supabase

-- Extensions utiles
create extension if not exists pgcrypto;

-- =====================
-- USERS / PROFIL / AUTH
-- =====================
-- Note Supabase: auth.users existe deja. On lie les donnees metier via user_id.

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique,
  display_name text not null,
  avatar_url text,
  bio text,
  level int not null default 1,
  xp_total int not null default 0,
  active_title text check (active_title in ('EXPLORATEUR','STRATEGE','PERFORMEUR','PILIER','MENTOR')),
  title_last_changed_at timestamptz,
  prestige_level int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_profiles_handle on public.user_profiles(handle);

-- =====================
-- SESSIONS SPORTIVES
-- =====================
create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  performed_at timestamptz not null,
  duration_min numeric(8,2) not null check (duration_min > 0),
  distance_km numeric(8,3),
  workout_type text not null check (
    workout_type in ('EF','TEMPO_LEGER','SEUIL','FRAC_COURT','FRAC_LONG','LONGUE','FARTLEK','COTES','RENFO','RECUP')
  ),
  rpe int not null check (rpe between 1 and 10),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workouts_user_date on public.workouts(user_id, performed_at desc);

-- =====================
-- XP LOG / NIVEAU / STREAK
-- =====================
create table if not exists public.user_xp_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date_key date not null,
  week_key text not null,
  amount int not null,
  reason text not null,
  source_ref text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_xp_log_user_week on public.user_xp_log(user_id, week_key);

create table if not exists public.user_streak (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active_weeks int not null default 0,
  joker_remaining int not null default 1,
  last_evaluated_week_key text,
  awarded_milestones text[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- =====================
-- MISSIONS / PROGRESSION
-- =====================
create table if not exists public.missions (
  id text primary key,
  title text not null,
  description text not null,
  category text not null check (category in ('BRONZE','SILVER','GOLD','PLATINUM')),
  window text not null check (window in ('WEEKLY','ONE_SHOT','SEASON')),
  unlock_level int not null check (unlock_level between 0 and 30),
  xp_reward int not null,
  rules_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.missions_user_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  mission_id text not null references public.missions(id) on delete cascade,
  progress_value numeric(10,2) not null default 0,
  status text not null check (status in ('LOCKED','IN_PROGRESS','DONE','CLAIMED')),
  unlock_baseline numeric(10,2) not null default 0,
  claimed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, mission_id)
);

-- =====================
-- SAISONS / EQUIPES / SOCIAL
-- =====================
create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  end_date date not null,
  is_active boolean not null default false,
  is_free_season boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'MEMBER' check (role in ('OWNER','MEMBER')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  has_left_season boolean not null default false,
  primary key (team_id, user_id)
);

-- recherche/contact utilisateur
create table if not exists public.user_contacts (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('PENDING','ACCEPTED','DECLINED','BLOCKED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(requester_user_id, target_user_id)
);

create index if not exists idx_user_contacts_target on public.user_contacts(target_user_id, status);

-- =====================
-- DEFIS MENSUELS / OBJECTIFS PERSO
-- =====================
create table if not exists public.challenge_options (
  id text primary key,
  tier text not null check (tier in ('STANDARD','AVANCE','EXPERT')),
  title text not null,
  description text not null,
  rules_json jsonb not null,
  xp_reward int not null
);

create table if not exists public.monthly_challenges (
  id uuid primary key default gen_random_uuid(),
  month_key text not null,
  option_ids text[] not null,
  created_at timestamptz not null default now(),
  unique(month_key)
);

create table if not exists public.user_monthly_challenge (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month_key text not null,
  chosen_option_id text not null references public.challenge_options(id),
  status text not null check (status in ('ACTIVE','COMPLETED','FAILED')),
  progress_json jsonb not null default '{}'::jsonb,
  locked_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, month_key)
);

create table if not exists public.user_goal_personal (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_type text not null,
  target_value numeric(10,2) not null,
  duration_weeks int not null check (duration_weeks between 6 and 16),
  start_date date not null,
  end_date date not null,
  status text not null check (status in ('ACTIVE','COMPLETED','FAILED')),
  progress_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =====================
-- ABONNEMENT (PREPARATION)
-- =====================
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'STRIPE',
  plan_code text not null,
  status text not null check (status in ('TRIAL','ACTIVE','PAST_DUE','CANCELED','EXPIRED')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_subscriptions_user_status on public.subscriptions(user_id, status);

-- =====================
-- LEADERBOARDS / HALL OF FAME
-- =====================
create table if not exists public.hall_of_fame_entries (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  title_category text not null check (title_category in ('EXPLORATEUR','STRATEGE','PERFORMEUR','PILIER','MENTOR')),
  user_id uuid not null references auth.users(id) on delete cascade,
  rank int not null,
  score numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_hof_season_title_rank on public.hall_of_fame_entries(season_id, title_category, rank);

-- IMPORTANT:
-- RLS policies a definir avant mise en production.
-- En phase safe: backend peut rester desactive via feature flags.
