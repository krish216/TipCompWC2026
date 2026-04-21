-- ============================================================
-- Migration 003 — favourite_team column + admin_users table
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Add favourite_team to users
alter table public.users
  add column if not exists favourite_team text;

-- 2. Admin users table (separate from metadata approach —
--    more reliable, queryable, and doesn't require JWT inspection)
create table if not exists public.admin_users (
  user_id    uuid primary key references public.users(id) on delete cascade,
  granted_by uuid references public.users(id),
  granted_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

-- Only admins can read the admin_users table (checked via this same table)
create policy "admin_users_select"
  on public.admin_users for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.admin_users where user_id = auth.uid()
    )
  );

-- Service role only can insert/delete (done via SQL or admin API)
-- No RLS insert policy means only service_role can modify it

-- 3. Grant yourself admin — replace with your actual email
-- (uncomment and run after the above)
-- insert into public.admin_users (user_id)
-- select id from public.users where email = 'your@email.com'
-- on conflict do nothing;

-- 4. Verify
select u.email, u.display_name, a.granted_at
from public.admin_users a
join public.users u on u.id = a.user_id;

-- ============================================================
-- Favourite team double-points scoring trigger
-- Replaces the existing score_predictions_for_fixture function
-- ============================================================
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
      -- Correct result (right outcome, wrong score)
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
