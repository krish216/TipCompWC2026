-- Migration 096 — Remove profile fields from leaderboard materialized view
--
-- first_name, avatar_url, show_first_name were added to the view in 095,
-- but the view only refreshes when predictions are scored. A user updating
-- their profile in Settings would see stale data until the next result lands.
--
-- Fix: remove these fields from the view (which caches scoring aggregations
-- only) and fetch them live from the users table in the API, alongside the
-- existing tribe-member lookup. This keeps profile data always current.

DROP MATERIALIZED VIEW IF EXISTS public.leaderboard CASCADE;

CREATE MATERIALIZED VIEW public.leaderboard AS
WITH pred_agg AS (
  SELECT
    p.user_id,
    p.tournament_id,
    COALESCE(SUM(p.points_earned),   0)::int            AS total_points,
    COALESCE(SUM(p.bonus_points),    0)::int            AS total_bonus_points,
    COUNT(*) FILTER (WHERE p.bonus_points    > 0)::int  AS bonus_count,
    COUNT(*) FILTER (WHERE p.standard_points > 0)::int  AS correct_count,
    COUNT(*) FILTER (WHERE p.points_earned IS NOT NULL)::int AS predictions_made
  FROM  public.predictions p
  WHERE p.points_earned IS NOT NULL
  GROUP BY p.user_id, p.tournament_id
)
SELECT
  pa.user_id,
  pa.tournament_id,
  u.display_name,
  u.country,
  pa.total_points,
  pa.total_bonus_points,
  pa.bonus_count,
  pa.correct_count,
  pa.predictions_made
FROM      pred_agg     pa
JOIN      public.users u ON u.id = pa.user_id;

CREATE UNIQUE INDEX leaderboard_user_tournament
  ON public.leaderboard (user_id, tournament_id);

CREATE INDEX leaderboard_tournament
  ON public.leaderboard (tournament_id, total_points DESC);

REFRESH MATERIALIZED VIEW public.leaderboard;

SELECT '096 complete — profile fields removed from leaderboard view, fetched live in API' AS status;
