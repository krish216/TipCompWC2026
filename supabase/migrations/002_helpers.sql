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
    count(*) filter (where p.points_earned = case f.round
      when 'gs'  then 5  when 'r32' then 8  when 'r16' then 10
      when 'qf'  then 14 when 'sf'  then 20 when 'tp'  then 25
      when 'f'   then 30 end) as exact_count,
    count(*) filter (where p.points_earned > 0) as correct_count
  from public.predictions p
  join public.fixtures f on f.id = p.fixture_id
  where p.user_id = p_user_id
    and p.points_earned is not null
  group by f.round
  order by array_position(
    array['gs','r32','r16','qf','sf','tp','f'],
    f.round::text
  );
$$;

-- Grant execute to authenticated users
grant execute on function public.get_user_round_breakdown to authenticated;
grant execute on function public.refresh_leaderboard_now  to service_role;
grant execute on function public.make_admin               to service_role;

-- Index to speed up leaderboard tribe filtering
create index if not exists idx_users_tribe_id
  on public.users(tribe_id)
  where tribe_id is not null;

-- Index to speed up chat pagination
create index if not exists idx_chat_tribe_created
  on public.chat_messages(tribe_id, created_at desc);
