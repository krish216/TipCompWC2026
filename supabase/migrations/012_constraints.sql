-- ============================================================
-- Migration 012 — unique constraints and display name
-- ============================================================

-- 1. Unique organisation name (case-insensitive)
create unique index if not exists idx_orgs_name_unique
  on public.organisations (lower(name));

-- 2. Unique tribe name within an organisation
create unique index if not exists idx_tribes_name_org_unique
  on public.tribes (lower(name), org_id);

-- 3. Unique display_name across the tournament (case-insensitive)
create unique index if not exists idx_users_display_name_unique
  on public.users (lower(display_name));

-- 4. Add org_name to leaderboard view
-- Drop and recreate the leaderboard view to include org info
drop materialized view if exists public.leaderboard;
create materialized view public.leaderboard as
select
  u.id                                                    as user_id,
  u.display_name,
  t.name                                                  as tribe_name,
  t.id                                                    as tribe_id,
  o.name                                                  as org_name,
  o.id                                                    as org_id,
  coalesce(sum(p.points_earned), 0)::int                  as total_points,
  count(case when p.points_earned = (
    case r.round
      when 'gs'  then 5  when 'r32' then 8  when 'r16' then 10
      when 'qf'  then 14 when 'sf'  then 20 when 'tp'  then 25
      when 'f'   then 30 else 0 end
  ) then 1 end)::int                                       as exact_count,
  count(case when p.points_earned > 0 and p.points_earned < (
    case r.round
      when 'gs'  then 5  when 'r32' then 8  when 'r16' then 10
      when 'qf'  then 14 when 'sf'  then 20 when 'tp'  then 25
      when 'f'   then 30 else 0 end
  ) then 1 end)::int                                       as correct_count,
  count(p.id)::int                                         as predictions_made
from public.users u
left join public.tribes t on t.id = u.tribe_id
left join public.organisations o on o.id = u.org_id
left join public.predictions p on p.user_id = u.id and p.points_earned is not null
left join public.fixtures r on r.id = p.fixture_id
group by u.id, u.display_name, t.name, t.id, o.name, o.id;

-- Allow concurrent refresh (requires a unique index on the mat view)
create unique index if not exists idx_leaderboard_user_id on public.leaderboard(user_id);

-- Refresh immediately so data is available
refresh materialized view public.leaderboard;

-- Verify
select user_id, display_name, tribe_name, org_name, total_points
from public.leaderboard
order by total_points desc
limit 5;
