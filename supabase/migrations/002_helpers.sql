-- ============================================================
-- Migration 002 — admin helpers + leaderboard refresh fix
-- ============================================================

-- Function: promote a user to admin role
create or replace function public.make_admin(user_email text)
returns void
language plpgsql
security definer
as $$
begin
  update auth.users
  set raw_user_meta_data = raw_user_meta_data || '{"role":"admin"}'::jsonb
  where email = user_email;

  if not found then
    raise exception 'User with email % not found', user_email;
  end if;
end;
$$;

-- Function: manually refresh leaderboard (call after bulk result imports)
create or replace function public.refresh_leaderboard_now()
returns void
language plpgsql
security definer
as $$
begin
  refresh materialized view concurrently public.leaderboard;
end;
$$;

-- Function: get user's points breakdown by round
create or replace function public.get_user_round_breakdown(p_user_id uuid)
returns table(round text, points bigint, exact_count bigint, correct_count bigint)
language sql
stable
as $$
  select
    f.round::text,
    coalesce(sum(p.points_earned), 0) as points,
    count(*) filter (where p.points_earned = coalesce(tr.result_pts, 0) + coalesce(tr.exact_bonus, 0)) as exact_count,
    count(*) filter (
      where p.points_earned > 0
        and p.points_earned <> coalesce(tr.result_pts, 0) + coalesce(tr.exact_bonus, 0)
    ) as correct_count
  from public.predictions p
  join public.fixtures f on f.id = p.fixture_id
  left join public.tournament_rounds tr
    on tr.tournament_id = f.tournament_id
   and tr.round_code = f.round
  where p.user_id = p_user_id
    and p.points_earned is not null
  group by f.round, coalesce(tr.result_pts, 0), coalesce(tr.exact_bonus, 0)
  order by array_position(
    array['gs','r32','r16','qf','sf','tp','f'],
    f.round::text
  );
$$;

-- Function: get user's points breakdown by tab_group
create or replace function public.get_user_tab_breakdown(p_user_id uuid)
returns table(tab_group text, points bigint, exact_count bigint, correct_count bigint)
language sql
stable
as $$
  select
    coalesce(tr.tab_group, f.round::text) as tab_group,
    coalesce(sum(p.points_earned), 0) as points,
    count(*) filter (where p.points_earned = coalesce(tr.result_pts, 0) + coalesce(tr.exact_bonus, 0)) as exact_count,
    count(*) filter (
      where p.points_earned > 0
        and p.points_earned <> coalesce(tr.result_pts, 0) + coalesce(tr.exact_bonus, 0)
    ) as correct_count
  from public.predictions p
  join public.fixtures f on f.id = p.fixture_id
  left join public.tournament_rounds tr
    on tr.tournament_id = f.tournament_id
   and tr.round_code = f.round
  where p.user_id = p_user_id
    and p.points_earned is not null
  group by coalesce(tr.tab_group, f.round::text), coalesce(tr.result_pts, 0), coalesce(tr.exact_bonus, 0)
  order by min(coalesce(tr.round_order, 0));
$$;

-- Grant execute to authenticated users
grant execute on function public.get_user_round_breakdown to authenticated;
grant execute on function public.get_user_tab_breakdown to authenticated;
grant execute on function public.refresh_leaderboard_now  to service_role;
grant execute on function public.make_admin               to service_role;

-- Index to speed up leaderboard tribe filtering
create index if not exists idx_users_tribe_id
  on public.users(tribe_id)
  where tribe_id is not null;

-- Index to speed up chat pagination
create index if not exists idx_chat_tribe_created
  on public.chat_messages(tribe_id, created_at desc);
