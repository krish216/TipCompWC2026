-- Migration 046 — rename exact_count to bonus_count in leaderboard materialized view
-- "exact" meant "predicted exact score on sf/tp/f" which earns a +5 bonus
-- Renaming to "bonus_count" makes the concept clear throughout the app

DROP MATERIALIZED VIEW IF EXISTS public.leaderboard CASCADE;

CREATE MATERIALIZED VIEW public.leaderboard AS
SELECT
  p.user_id,
  p.tournament_id,
  u.display_name,
  tm.tribe_id,
  t.name                                     AS tribe_name,
  up.comp_id,
  c.name                                     AS comp_name,
  COALESCE(SUM(p.points_earned), 0)::int     AS total_points,
  -- bonus_count: predictions where a score bonus was earned (exact score on sf/tp/f)
  COUNT(*) FILTER (
    WHERE p.points_earned IS NOT NULL
      AND p.points_earned > 0
      AND f.round IN ('sf','tp','f')
      AND p.home = f.home_score AND p.away = f.away_score
  )::int                                     AS bonus_count,
  COUNT(*) FILTER (
    WHERE p.points_earned IS NOT NULL AND p.points_earned > 0
  )::int                                     AS correct_count,
  COUNT(*) FILTER (
    WHERE p.points_earned IS NOT NULL
  )::int                                     AS predictions_made
FROM public.predictions p
JOIN  public.users        u   ON u.id  = p.user_id
JOIN  public.fixtures     f   ON f.id  = p.fixture_id
LEFT JOIN public.user_preferences up
  ON up.user_id = p.user_id
LEFT JOIN public.comps   c  ON c.id = up.comp_id
LEFT JOIN public.tribe_members tm ON tm.user_id = p.user_id
LEFT JOIN public.tribes   t  ON t.id = tm.tribe_id
WHERE p.points_earned IS NOT NULL
GROUP BY
  p.user_id, p.tournament_id, u.display_name,
  tm.tribe_id, t.name,
  up.comp_id, c.name;

CREATE UNIQUE INDEX leaderboard_user_tournament
  ON public.leaderboard (user_id, tournament_id);
CREATE INDEX leaderboard_tournament
  ON public.leaderboard (tournament_id, total_points DESC);

REFRESH MATERIALIZED VIEW public.leaderboard;

SELECT 'Migration 046 complete — exact_count renamed to bonus_count' AS status;
