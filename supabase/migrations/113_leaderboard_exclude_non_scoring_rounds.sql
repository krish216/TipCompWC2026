-- Migration 113 — Exclude non-scoring rounds from the leaderboard views
--
-- tournament_rounds.include_in_scoring = false (e.g. the warm-up round 'wup') was only
-- honoured by the scoring trigger at result-entry time. The leaderboard materialized
-- views summed stored points regardless of the flag, so toggling it had no retroactive
-- effect on the scoreboard.
--
-- Rebuild both views to JOIN tournament_rounds and filter on include_in_scoring at
-- query time. This leaves the stored prediction points UNTOUCHED — flip the flag back
-- to true and those rounds reappear on the next refresh. The views are read by the API
-- via the service-role client, so no grants are needed (mirrors 093/094/096).

-- ── leaderboard ───────────────────────────────────────────────────────────────
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
  FROM       public.predictions       p
  JOIN       public.fixtures          f  ON f.id             = p.fixture_id
  LEFT JOIN  public.tournament_rounds tr ON tr.tournament_id = f.tournament_id
                                        AND tr.round_code    = f.round
  WHERE p.points_earned IS NOT NULL
    AND COALESCE(tr.include_in_scoring, true)   -- exclude rounds flagged out of scoring
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

-- ── leaderboard_round_breakdown ───────────────────────────────────────────────
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
  AND COALESCE(tr.include_in_scoring, true)      -- exclude rounds flagged out of scoring
GROUP BY p.user_id, p.tournament_id, COALESCE(tr.tab_group, f.round::text);

CREATE UNIQUE INDEX lrb_user_tournament_tab
  ON public.leaderboard_round_breakdown (user_id, tournament_id, tab_group);
CREATE INDEX lrb_tournament_user
  ON public.leaderboard_round_breakdown (tournament_id, user_id);

-- ── Populate ──────────────────────────────────────────────────────────────────
REFRESH MATERIALIZED VIEW public.leaderboard;
REFRESH MATERIALIZED VIEW public.leaderboard_round_breakdown;

SELECT '113 complete — leaderboard views now exclude include_in_scoring = false rounds' AS status;
