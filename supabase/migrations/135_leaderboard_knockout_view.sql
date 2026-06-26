-- Migration 135 — Knockout-only leaderboard ("comp within a comp")
--
-- Adds a parallel, read-only materialized view that ranks tipsters on KNOCKOUT
-- points only (Round of 32 onward). Lets new joiners start level with existing
-- subscribers once the group stage is banked — group-stage points simply drop off
-- for everyone in this view.
--
-- This is PURELY ADDITIVE and does not interfere with the current tournament setup:
--   * tournaments.scoring_config, tournament_rounds, predictions, fixtures — untouched
--   * the existing `leaderboard` / `leaderboard_round_breakdown` MVs — unchanged
--   * no scoring logic changes; stored prediction points are read as-is
--
-- The view mirrors migration 113's `leaderboard` definition exactly, with ONE extra
-- predicate: tournament_rounds.is_knockout = true. Because warm-up ('wup') is already
-- filtered out by include_in_scoring, this resolves to r32, r16, qf, sf, tp, f.
-- The "start line" is therefore config-driven — flip is_knockout / include_in_scoring
-- on tournament_rounds and this view follows on the next refresh, no code change.
--
-- Like the sibling leaderboard MVs (093/094/096/113), these views are read by the API
-- via the service-role client, so no PostgREST grants are required.

-- ── leaderboard_knockout ──────────────────────────────────────────────────────
DROP MATERIALIZED VIEW IF EXISTS public.leaderboard_knockout CASCADE;

CREATE MATERIALIZED VIEW public.leaderboard_knockout AS
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
    AND COALESCE(tr.is_knockout,       false)   -- knockout phase only (R32 onward)
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

CREATE UNIQUE INDEX leaderboard_knockout_user_tournament
  ON public.leaderboard_knockout (user_id, tournament_id);
CREATE INDEX leaderboard_knockout_tournament
  ON public.leaderboard_knockout (tournament_id, total_points DESC);

-- ── Keep it in sync with the existing refresh path ────────────────────────────
-- Append the new view to both refresh functions, each in its own guarded block so
-- a failure on one MV never aborts the others (mirrors 093's pattern).
CREATE OR REPLACE FUNCTION refresh_leaderboard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.leaderboard;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'leaderboard refresh skipped: %', SQLERRM;
  END;
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.leaderboard_round_breakdown;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'leaderboard_round_breakdown refresh skipped: %', SQLERRM;
  END;
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.leaderboard_knockout;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'leaderboard_knockout refresh skipped: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_leaderboard_now()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.leaderboard;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.leaderboard_round_breakdown;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.leaderboard_knockout;
END;
$$;

-- ── Populate ──────────────────────────────────────────────────────────────────
REFRESH MATERIALIZED VIEW public.leaderboard_knockout;

SELECT '135 complete — leaderboard_knockout (R32-onward) created; refresh functions updated' AS status;
