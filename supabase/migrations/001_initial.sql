-- ============================================================
-- WC2026 Predictor — full database schema
-- Run: psql $DATABASE_URL -f supabase/migrations/001_initial.sql
-- ============================================================

-- ─── Extensions ──────────────────────────────────────────────
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- ─── Users (extends Supabase auth.users) ─────────────────────
create table public.users (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null unique,
  display_name text not null,
  avatar_url   text,
  tribe_id     uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ─── Tribes ──────────────────────────────────────────────────
create table public.tribes (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null,
  invite_code  text not null unique default upper(substr(md5(random()::text), 1, 8)),
  created_by   uuid not null references public.users(id) on delete cascade,
  created_at   timestamptz not null default now()
);

alter table public.users
  add constraint users_tribe_id_fk
  foreign key (tribe_id) references public.tribes(id) on delete set null;

-- ─── Tribe members ───────────────────────────────────────────
create table public.tribe_members (
  user_id   uuid not null references public.users(id) on delete cascade,
  tribe_id  uuid not null references public.tribes(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (user_id, tribe_id)
);

-- ─── Fixtures ────────────────────────────────────────────────
create type public.round_id as enum ('gs','r32','r16','qf','sf','tp','f');

create table public.fixtures (
  id           serial primary key,
  round        public.round_id not null,
  grp          char(1),                         -- group letter, gs only
  home         text not null,
  away         text not null,
  kickoff_utc  timestamptz not null,
  venue        text not null,
  home_score   smallint,                        -- null until played
  away_score   smallint,
  result_set_at timestamptz,
  result_set_by uuid references public.users(id)
);

create index idx_fixtures_round on public.fixtures(round);
create index idx_fixtures_kickoff on public.fixtures(kickoff_utc);

-- ─── Predictions ─────────────────────────────────────────────
create table public.predictions (
  id            bigserial primary key,
  user_id       uuid not null references public.users(id) on delete cascade,
  fixture_id    int  not null references public.fixtures(id) on delete cascade,
  home          smallint not null check (home >= 0),
  away          smallint not null check (away >= 0),
  points_earned smallint,                       -- null until result confirmed
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, fixture_id)
);

create index idx_predictions_user on public.predictions(user_id);
create index idx_predictions_fixture on public.predictions(fixture_id);

-- ─── Tribe chat messages ──────────────────────────────────────
create table public.chat_messages (
  id         uuid primary key default uuid_generate_v4(),
  tribe_id   uuid not null references public.tribes(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  content    text not null check (char_length(content) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index idx_chat_tribe on public.chat_messages(tribe_id, created_at desc);

-- ─── Notification preferences ────────────────────────────────
create table public.notification_prefs (
  user_id       uuid primary key references public.users(id) on delete cascade,
  push_enabled  boolean not null default true,
  email_enabled boolean not null default true,
  tribe_nudges  boolean not null default false,
  updated_at    timestamptz not null default now()
);

-- ─── Leaderboard view (materialised for perf) ────────────────
create materialized view public.leaderboard as
  select
    u.id                            as user_id,
    u.display_name,
    t.name                          as tribe_name,
    coalesce(sum(p.points_earned), 0)   as total_points,
    count(*) filter (where p.points_earned = (
      select exact from (values
        ('gs'::public.round_id,5),('r32',8),('r16',10),
        ('qf',14),('sf',20),('tp',25),('f',30)
      ) as sc(r,exact)
      join public.fixtures f2 on f2.id = p.fixture_id and f2.round = sc.r
      limit 1
    ))                              as exact_count,
    count(*) filter (where p.points_earned > 0) as correct_count,
    count(p.id)                     as predictions_made
  from public.users u
  left join public.tribes t on t.id = u.tribe_id
  left join public.predictions p on p.user_id = u.id
  group by u.id, u.display_name, t.name
with data;

create unique index on public.leaderboard(user_id);

-- Refresh leaderboard whenever predictions are scored
create or replace function refresh_leaderboard()
returns trigger language plpgsql as $$
begin
  refresh materialized view concurrently public.leaderboard;
  return null;
end;
$$;

create trigger trg_refresh_lb
after update of points_earned on public.predictions
for each statement execute function refresh_leaderboard();

-- ─── Auto-score predictions after result is entered ──────────
create or replace function score_predictions_for_fixture()
returns trigger language plpgsql as $$
declare
  sc_result  smallint;
  sc_exact   smallint;
begin
  -- look up scoring for this round
  select
    case new.round
      when 'gs'  then 3  when 'r32' then 5  when 'r16' then 7
      when 'qf'  then 10 when 'sf'  then 15 when 'tp'  then 20
      when 'f'   then 25
    end,
    case new.round
      when 'gs'  then 5  when 'r32' then 8  when 'r16' then 10
      when 'qf'  then 14 when 'sf'  then 20 when 'tp'  then 25
      when 'f'   then 30
    end
  into sc_result, sc_exact;

  update public.predictions p
  set points_earned =
    case
      when p.home = new.home_score and p.away = new.away_score then sc_exact
      when (p.home > p.away)  = (new.home_score > new.away_score)
        and (p.home < p.away) = (new.home_score < new.away_score)
        and (p.home = p.away) = (new.home_score = new.away_score) then sc_result
      else 0
    end,
    updated_at = now()
  where p.fixture_id = new.id;

  return new;
end;
$$;

create trigger trg_score_predictions
after update of home_score, away_score on public.fixtures
for each row
when (new.home_score is not null and new.away_score is not null)
execute function score_predictions_for_fixture();

-- ─── updated_at auto-bump ─────────────────────────────────────
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger trg_users_updated before update on public.users
  for each row execute function touch_updated_at();
create trigger trg_preds_updated before update on public.predictions
  for each row execute function touch_updated_at();

-- ─── Row-level security ───────────────────────────────────────
alter table public.users           enable row level security;
alter table public.tribes          enable row level security;
alter table public.tribe_members   enable row level security;
alter table public.fixtures        enable row level security;
alter table public.predictions     enable row level security;
alter table public.chat_messages   enable row level security;
alter table public.notification_prefs enable row level security;

-- users: can read all, edit only self
create policy "users_select_all"   on public.users for select using (true);
create policy "users_update_self"  on public.users for update using (auth.uid() = id);
create policy "users_insert_self"  on public.users for insert with check (auth.uid() = id);

-- tribes: readable by all, editable by creator
create policy "tribes_select_all"  on public.tribes for select using (true);
create policy "tribes_insert_auth" on public.tribes for insert with check (auth.uid() = created_by);
create policy "tribes_update_own"  on public.tribes for update using (auth.uid() = created_by);

-- tribe_members: readable by tribe members, insert own row only
create policy "tm_select_own_tribe" on public.tribe_members for select
  using (tribe_id in (select tribe_id from public.users where id = auth.uid()));
create policy "tm_insert_self"      on public.tribe_members for insert
  with check (auth.uid() = user_id);
create policy "tm_delete_self"      on public.tribe_members for delete
  using (auth.uid() = user_id);

-- fixtures: world-readable, only service role can write
create policy "fixtures_select_all" on public.fixtures for select using (true);

-- predictions: users see only their own; insert/update own only
create policy "preds_select_own"  on public.predictions for select  using (auth.uid() = user_id);
create policy "preds_insert_own"  on public.predictions for insert  with check (auth.uid() = user_id);
create policy "preds_update_own"  on public.predictions for update  using (auth.uid() = user_id);

-- chat: tribe members can read/write own tribe
create policy "chat_select_tribe" on public.chat_messages for select
  using (tribe_id in (select tribe_id from public.users where id = auth.uid()));
create policy "chat_insert_tribe" on public.chat_messages for insert
  with check (auth.uid() = user_id
    and tribe_id = (select tribe_id from public.users where id = auth.uid()));

-- notification prefs: own row only
create policy "notif_own" on public.notification_prefs for all using (auth.uid() = user_id);
