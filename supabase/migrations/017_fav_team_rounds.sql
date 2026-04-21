-- ============================================================
-- Migration 017 — favourite team double points: gs and r32 only
-- ============================================================

create or replace function score_predictions_for_fixture()
returns trigger language plpgsql as $$
declare
  sc_result  smallint;
  sc_exact   smallint;
  is_fav_round boolean;
begin
  -- Points per round (updated: tp = 5/10)
  select
    case new.round
      when 'gs'  then 3  when 'r32' then 5  when 'r16' then 7
      when 'qf'  then 10 when 'sf'  then 15 when 'tp'  then 5
      when 'f'   then 25
    end,
    case new.round
      when 'gs'  then 5  when 'r32' then 8  when 'r16' then 10
      when 'qf'  then 14 when 'sf'  then 20 when 'tp'  then 10
      when 'f'   then 30
    end
  into sc_result, sc_exact;

  -- Favourite team double points only applies in group stage and round of 32
  is_fav_round := new.round in ('gs', 'r32');

  update public.predictions p
  set points_earned =
    case
      when p.home = new.home_score and p.away = new.away_score then
        sc_exact * case
          when is_fav_round and exists (
            select 1 from public.users u
            where u.id = p.user_id
              and u.favourite_team in (new.home, new.away)
          ) then 2 else 1 end
      when (p.home > p.away)  = (new.home_score > new.away_score)
        and (p.home < p.away) = (new.home_score < new.away_score)
        and (p.home = p.away) = (new.home_score = new.away_score) then
        sc_result * case
          when is_fav_round and exists (
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

select 'Trigger updated: double points for gs and r32 only, tp scoring 5/10' as status;
