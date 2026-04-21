-- ============================================================
-- Migration 005 (fixed) — update confirmed team names
-- ============================================================

-- Group A: Czechia
update public.fixtures set away = 'Czechia' where away like 'TBD A%';
update public.fixtures set home = 'Czechia' where home like 'TBD A%';

-- Group B: Bosnia and Herzegovina
update public.fixtures set away = 'Bosnia and Herzegovina' where away like 'TBD B%';
update public.fixtures set home = 'Bosnia and Herzegovina' where home like 'TBD B%';

-- Group D: Turkey
update public.fixtures set away = 'Turkey' where away like 'TBD D%';
update public.fixtures set home = 'Turkey' where home like 'TBD D%';

-- Group E: Ivory Coast (fix all spelling variants — single quotes only)
update public.fixtures set home = 'Ivory Coast'
  where home in ('Cote d''Ivoire', 'Côte d''Ivoire', 'Curazao');
update public.fixtures set away = 'Ivory Coast'
  where away in ('Cote d''Ivoire', 'Côte d''Ivoire');

-- Group E: Curacao (fix special character)
update public.fixtures set home = 'Curacao' where home = 'Curaçao';
update public.fixtures set away = 'Curacao' where away = 'Curaçao';
update public.fixtures set home = 'Curacao' where home = 'Curazao';
update public.fixtures set away = 'Curacao' where away = 'Curazao';

-- Group F: Sweden
update public.fixtures set away = 'Sweden' where away like 'TBD F%';
update public.fixtures set home = 'Sweden' where home like 'TBD F%';

-- Group I: Iraq
update public.fixtures set away = 'Iraq' where away like 'TBD I%';
update public.fixtures set home = 'Iraq' where home like 'TBD I%';

-- Group K: DR Congo
update public.fixtures set away = 'DR Congo' where away like 'TBD K%';
update public.fixtures set home = 'DR Congo' where home like 'TBD K%';

-- Verify: should return 0 rows (no remaining TBD placeholders)
select id, grp, home, away
from public.fixtures
where round = 'gs' and (home like 'TBD%' or away like 'TBD%')
order by id;

-- Show all group stage fixtures
select id, grp, home, away
from public.fixtures
where round = 'gs'
order by grp, id;
