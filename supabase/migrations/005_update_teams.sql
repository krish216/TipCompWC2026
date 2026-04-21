-- ============================================================
-- Migration 005 — update confirmed team names in fixtures
-- Replaces all TBD placeholders + old team names
-- Run in Supabase SQL Editor
-- ============================================================

-- ── Group A: replace TBD A4 with Czechia ─────────────────────
update public.fixtures set away = 'Czechia' where id = 2  and away = 'TBD A4';
update public.fixtures set away = 'Czechia' where id = 25 and away = 'Czechia';
update public.fixtures set home = 'Czechia' where id = 49 and home = 'TBD A4';
-- Full group A fix (handles any old name)
update public.fixtures set away = 'Czechia'
  where grp = 'A' and (away like 'TBD%' or away = 'Czechia');
update public.fixtures set home = 'Czechia'
  where grp = 'A' and (home like 'TBD%' or home = 'Czechia');

-- ── Group B: replace TBD B4 with Bosnia and Herzegovina ──────
update public.fixtures set
  home = case when home like 'TBD%' then 'Bosnia and Herzegovina' else home end,
  away = case when away like 'TBD%' then 'Bosnia and Herzegovina' else away end
where grp = 'B' and (home like 'TBD%' or away like 'TBD%');

-- ── Group D: replace TBD D4 with Turkey ──────────────────────
update public.fixtures set
  home = case when home like 'TBD%' then 'Turkey' else home end,
  away = case when away like 'TBD%' then 'Turkey' else away end
where grp = 'D' and (home like 'TBD%' or away like 'TBD%');

-- ── Group E: fix Curaçao → Curacao, Côte d'Ivoire → Ivory Coast
update public.fixtures set home = 'Ivory Coast'
  where home in ('Côte d''Ivoire', "Cote d'Ivoire", 'Cote d''Ivoire');
update public.fixtures set away = 'Ivory Coast'
  where away in ('Côte d''Ivoire', "Cote d'Ivoire", 'Cote d''Ivoire');
update public.fixtures set home = 'Curacao'
  where home in ('Curaçao', 'Curazao');
update public.fixtures set away = 'Curacao'
  where away in ('Curaçao', 'Curazao');

-- ── Group F: replace TBD F4 with Sweden ──────────────────────
update public.fixtures set
  home = case when home like 'TBD%' then 'Sweden' else home end,
  away = case when away like 'TBD%' then 'Sweden' else away end
where grp = 'F' and (home like 'TBD%' or away like 'TBD%');

-- ── Group I: replace TBD I4 with Iraq ────────────────────────
update public.fixtures set
  home = case when home like 'TBD%' then 'Iraq' else home end,
  away = case when away like 'TBD%' then 'Iraq' else away end
where grp = 'I' and (home like 'TBD%' or away like 'TBD%');

-- ── Group K: replace TBD K4 with DR Congo ────────────────────
update public.fixtures set
  home = case when home like 'TBD%' then 'DR Congo' else home end,
  away = case when away like 'TBD%' then 'DR Congo' else away end
where grp = 'K' and (home like 'TBD%' or away like 'TBD%');

-- ── Fix any remaining TBD placeholders in all groups ─────────
-- (catches anything missed above)
update public.fixtures set home = 'Czechia'            where home = 'TBD A4';
update public.fixtures set away = 'Czechia'            where away = 'TBD A4';
update public.fixtures set home = 'Bosnia and Herzegovina' where home = 'TBD B4';
update public.fixtures set away = 'Bosnia and Herzegovina' where away = 'TBD B4';
update public.fixtures set home = 'Turkey'             where home = 'TBD D4';
update public.fixtures set away = 'Turkey'             where away = 'TBD D4';
update public.fixtures set home = 'Sweden'             where home = 'TBD F4';
update public.fixtures set away = 'Sweden'             where away = 'TBD F4';
update public.fixtures set home = 'Iraq'               where home = 'TBD I4';
update public.fixtures set away = 'Iraq'               where away = 'TBD I4';
update public.fixtures set home = 'DR Congo'           where home = 'TBD K4';
update public.fixtures set away = 'DR Congo'           where away = 'TBD K4';

-- ── Verify — should show 0 rows with TBD placeholders ────────
select id, grp, home, away
from public.fixtures
where home like 'TBD%' or away like 'TBD%'
order by id;

-- ── Show all group stage fixtures to confirm ─────────────────
select id, grp, home, away
from public.fixtures
where round = 'gs'
order by grp, id;
