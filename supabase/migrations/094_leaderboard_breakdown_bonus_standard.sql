-- Migration 094 — Add standard_points + bonus_points to leaderboard_round_breakdown
--
-- Previously the view only stored total points per (user, tournament, tab_group).
-- Bonus and standard points were computed from the live predictions table in the API,
-- keyed by round_code — a second data source with a different key structure.
--
-- Fix: rebuild the view with all three point components so the API has a single
-- source of truth for all tab-level breakdown data, with consistent tab_group keys.
-- The API fallback (derives tab data from round_breakdown when the view is stale)
-- is also extended to cover bonus and standard points.

DROP MATERIALIZED VIEW IF EXISTS public.leaderboard_round_breakdown CASCADE;

CREATE MATERIALIZED VIEW public.leaderboard_round_breakdown AS
SELECT
  p.user_id,
  p.tournament_id,
  COALESCE(tr.tab_group, f.round::text)         AS tab_group,
  MIN(COALESCE(tr.round_order, 999))             AS round_order,
  COALESCE(SUM(p.points_earned),   0)::int       AS points,
  COALESCE(SUM(p.standard_points), 0)::int       AS standard_points,
  COALESCE(SUM(p.bonus_points),    0)::int       AS bonus_points
FROM       public.predictions       p
JOIN       public.fixtures          f  ON f.id             = p.fixture_id
LEFT JOIN  public.tournament_rounds tr ON tr.tournament_id = f.tournament_id
                                      AND tr.round_code    = f.round
WHERE p.points_earned IS NOT NULL
GROUP BY p.user_id, p.tournament_id, COALESCE(tr.tab_group, f.round::text);

-- Unique index required for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX lrb_user_tournament_tab
  ON public.leaderboard_round_breakdown (user_id, tournament_id, tab_group);

-- Covering index for the API query pattern: filter by tournament, IN user list
CREATE INDEX lrb_tournament_user
  ON public.leaderboard_round_breakdown (tournament_id, user_id);

REFRESH MATERIALIZED VIEW public.leaderboard_round_breakdown;

SELECT '094 complete — leaderboard_round_breakdown rebuilt with standard_points + bonus_points' AS status;
