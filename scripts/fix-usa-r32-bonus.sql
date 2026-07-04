-- ============================================================================
-- Fix: USA / Bosnia fav-team 2× not applied for R32 (fixture #107)
-- Cause: the fixture stored ESPN names ('United States', 'Bosnia-Herzegovina'),
--        which don't match the canonical bonus-team names ('USA',
--        'Bosnia and Herzegovina'), so `favourite_team IN (home, away)` misses.
-- Fix:   rename to canonical, then re-fire the scoring trigger so the 2× recomputes.
-- Safe:  predictions are keyed by fixture_id (renames can't break result scoring);
--        the re-fire is an idempotent recompute (same technique as migration 081).
-- Run top-to-bottom in the Supabase SQL Editor.
-- ============================================================================

-- 0. BEFORE — the fixture + how bonus pickers who tipped it are currently scored
SELECT id, home, away, home_score, away_score
FROM public.fixtures WHERE id = 107;

SELECT ut.favourite_team, COALESCE(u.first_name, u.display_name) AS name,
       p.points_earned, p.standard_points, p.bonus_points
FROM public.predictions p
JOIN public.user_tournaments ut ON ut.user_id = p.user_id
JOIN public.users u            ON u.id       = p.user_id
WHERE p.fixture_id = 107
  AND ut.favourite_team IN ('USA', 'Bosnia and Herzegovina')
ORDER BY ut.favourite_team, p.points_earned DESC;

-- 1. Canonicalise the team names (guarded on the old value → idempotent)
UPDATE public.fixtures SET home = 'USA'
  WHERE id = 107 AND home = 'United States';

UPDATE public.fixtures SET away = 'Bosnia and Herzegovina'
  WHERE id = 107 AND away = 'Bosnia-Herzegovina';

-- 2. Re-fire the scoring trigger. It fires on UPDATE OF home_score/away_score
--    (NOT on name changes), so writing the score back to itself recomputes every
--    prediction on this fixture — exactly how migration 081 re-scored globally.
UPDATE public.fixtures SET home_score = home_score
  WHERE id = 107;

-- 3. AFTER — the ~14 correct tippers should now show doubled base points
--    (e.g. points_earned 5 → 10); wrong/no-tip pickers correctly stay put.
SELECT ut.favourite_team, COALESCE(u.first_name, u.display_name) AS name,
       p.points_earned, p.standard_points, p.bonus_points
FROM public.predictions p
JOIN public.user_tournaments ut ON ut.user_id = p.user_id
JOIN public.users u            ON u.id       = p.user_id
WHERE p.fixture_id = 107
  AND ut.favourite_team IN ('USA', 'Bosnia and Herzegovina')
ORDER BY ut.favourite_team, p.points_earned DESC;

-- 4. (Optional) confirm the leaderboard totals reflected the change
SELECT COALESCE(u.first_name, u.display_name) AS name, ut.favourite_team,
       l.total_points, l.total_bonus_points
FROM public.leaderboard l
JOIN public.user_tournaments ut ON ut.user_id = l.user_id AND ut.tournament_id = l.tournament_id
JOIN public.users u             ON u.id = l.user_id
WHERE ut.favourite_team IN ('USA', 'Bosnia and Herzegovina')
ORDER BY ut.favourite_team, l.total_points DESC;
