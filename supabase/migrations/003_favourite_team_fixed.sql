-- ============================================================
-- Migration 003 (fixed) — run this instead of 003_favourite_team.sql
-- Safe to run even if admin_users already exists
-- ============================================================

-- 1. Add favourite_team column to users (safe — does nothing if already exists)
alter table public.users
  add column if not exists favourite_team text;

-- 2. Replace the scoring trigger with the double-points version
--    (create or replace is safe — overwrites the existing function)
create or replace function score_predictions_for_fixture()
returns trigger language plpgsql as $$
declare
  sc_result  smallint;
  sc_exact   smallint;
begin
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
      -- Exact score
      when p.home = new.home_score and p.away = new.away_score then
        sc_exact * case
          when exists (
            select 1 from public.users u
            where u.id = p.user_id
              and u.favourite_team in (new.home, new.away)
          ) then 2 else 1 end
      -- Correct result
      when (p.home > p.away)  = (new.home_score > new.away_score)
        and (p.home < p.away) = (new.home_score < new.away_score)
        and (p.home = p.away) = (new.home_score = new.away_score) then
        sc_result * case
          when exists (
            select 1 from public.users u
            where u.id = p.user_id
              and u.favourite_team in (new.home, new.away)
          ) then 2 else 1 end
      else 0
    end,
    updated_at = now()
  where p.fixture_id = new.id;

  return new;
end;
$$;

-- 3. Create admin_users table only if it doesn't already exist
create table if not exists public.admin_users (
  user_id    uuid primary key references public.users(id) on delete cascade,
  granted_by uuid references public.users(id),
  granted_at timestamptz not null default now()
);

-- Enable RLS only if not already enabled (safe — idempotent)
alter table public.admin_users enable row level security;

-- 4. Drop and recreate the policy cleanly (avoids the "already exists" error)
drop policy if exists "admin_users_select" on public.admin_users;
create policy "admin_users_select"
  on public.admin_users for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.admin_users where user_id = auth.uid()
    )
  );

-- 5. Grant yourself admin — replace with your actual email
insert into public.admin_users (user_id)
select id from public.users where email = 'krishnan.mootoosamy@gmail.com'
on conflict do nothing;

-- 6. Confirm — should return your user row
select u.email, u.display_name, a.granted_at
from public.admin_users a
join public.users u on u.id = a.user_id;
