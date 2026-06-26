-- Migration 137 — Knockout leaderboard: list every participant at a 0 baseline
--
-- Replaces the leaderboard_knockout definition from 135. The original only included
-- tipsters who had ALREADY scored knockout points, so before the Round of 32 kicks
-- off the board looked empty. This version bases the row set on the full `leaderboard`
-- MV (i.e. everyone already competing) and LEFT JOINs their knockout points — so
-- everyone shows from the start at 0 and climbs as knockout results land.
--
-- Purely a view redefinition. Same name, same columns, same indexes → the refresh
-- functions from 135 keep working unchanged. Still read-only / additive.

DROP MATERIALIZED VIEW IF EXISTS public.leaderboard_knockout CASCADE;

CREATE MATERIALIZED VIEW public.leaderboard_knockout AS
WITH ko_agg AS (
  -- Knockout-only points (R32 onward), exactly as in migration 135.
  SELECT
    p.user_id,
    p.tournament_id,
    COALESCE(SUM(p.points_earned),   0)::int            AS total_points,
    COALESCE(SUM(p.bonus_points),    0)::int            AS total_bonus_points,
    COUNT(*) FILTER (WHERE p.bonus_points    > 0)::int  AS bonus_count,
    COUNT(*) FILTER (WHERE p.standard_points > 0)::int  AS correct_count,
    COUNT(*) FILTER (WHERE p.points_earned IS NOT NULL)::int AS predictions_made
  FROM       public.predictions       p
  JOIN       public.fixtures          f  ON f.id             = p.fixture_id
  LEFT JOIN  public.tournament_rounds tr ON tr.tournament_id = f.tournament_id
                                        AND tr.round_code    = f.round
  WHERE p.points_earned IS NOT NULL
    AND COALESCE(tr.include_in_scoring, true)   -- exclude rounds flagged out of scoring
    AND COALESCE(tr.is_knockout,       false)   -- knockout phase only (R32 onward)
  GROUP BY p.user_id, p.tournament_id
)
SELECT
  lb.user_id,
  lb.tournament_id,
  lb.display_name,
  lb.country,
  COALESCE(ko.total_points,       0)::int AS total_points,
  COALESCE(ko.total_bonus_points, 0)::int AS total_bonus_points,
  COALESCE(ko.bonus_count,        0)::int AS bonus_count,
  COALESCE(ko.correct_count,      0)::int AS correct_count,
  COALESCE(ko.predictions_made,   0)::int AS predictions_made
FROM      public.leaderboard lb           -- every tipster already on the full board
LEFT JOIN ko_agg             ko ON ko.user_id = lb.user_id
                               AND ko.tournament_id = lb.tournament_id;

CREATE UNIQUE INDEX leaderboard_knockout_user_tournament
  ON public.leaderboard_knockout (user_id, tournament_id);
CREATE INDEX leaderboard_knockout_tournament
  ON public.leaderboard_knockout (tournament_id, total_points DESC);

REFRESH MATERIALIZED VIEW public.leaderboard_knockout;

SELECT '137 complete — leaderboard_knockout now lists all participants at a 0 baseline' AS status;
