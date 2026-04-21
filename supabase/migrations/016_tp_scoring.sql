-- ============================================================
-- Migration 016 — update 3rd place scoring to 5/10 pts
-- ============================================================

-- Rebuild leaderboard materialized view with corrected tp scoring
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
      when 'qf'  then 14 when 'sf'  then 20 when 'tp'  then 10
      when 'f'   then 30 else 0 end
  ) then 1 end)::int                                      as exact_count,
  count(case when p.points_earned > 0 and p.points_earned < (
    case r.round
      when 'gs'  then 5  when 'r32' then 8  when 'r16' then 10
      when 'qf'  then 14 when 'sf'  then 20 when 'tp'  then 10
      when 'f'   then 30 else 0 end
  ) then 1 end)::int                                      as correct_count,
  count(p.id)::int                                        as predictions_made
from public.users u
left join public.tribes t        on t.id = u.tribe_id
left join public.organisations o on o.id = u.org_id
left join public.predictions p   on p.user_id = u.id and p.points_earned is not null
left join public.fixtures r      on r.id = p.fixture_id
group by u.id, u.display_name, t.name, t.id, o.name, o.id;

create unique index idx_leaderboard_user_id on public.leaderboard(user_id);
refresh materialized view public.leaderboard;

-- Also update the scoring trigger so future results use 5/10 for tp
-- The trigger uses calcPoints from the app — the types change handles this automatically
-- But verify the current tp scoring in fixtures if any tp results already entered:
select id, round, home_score, away_score from public.fixtures where round = 'tp' and home_score is not null;
