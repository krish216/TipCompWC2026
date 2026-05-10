-- Migration 093 — Leaderboard breakdown materialized view + slim leaderboard view
--
-- Problems with current design:
--   1. `leaderboard` view bakes in tribe_id/tribe_name (picks one arbitrary tribe per
--      user via DISTINCT ON) and comp_id/comp_name (from user_preferences — a mutable
--      user setting). Both are wrong at the materialisation layer.
--   2. Tab breakdown is computed by calling get_user_tab_breakdown() once per user —
--      50 RPC round-trips per leaderboard request. The function also has a buggy
--      GROUP BY (includes result_pts, exact_bonus) that causes multiple rows per
--      tab_group, with the client map silently dropping all but the last — this is
--      the root cause of the visible total vs column-sum mismatch.
--
-- Fix:
--   A. New `leaderboard_round_breakdown` materialized view — one row per
--      (user, tournament, tab_group), GROUP BY tab_group only. Replaces N RPC calls
--      with a single indexed query.
--   B. Slim `leaderboard` view — remove tribe_id, tribe_name, comp_id, comp_name.
--      The API fetches tribe membership contextually (filtered to the viewing comp)
--      and already knows the comp from user_preferences.
--   C. Both refresh functions updated to refresh the new view.

-- ── A. leaderboard_round_breakdown ───────────────────────────────────────────

CREATE MATERIALIZED VIEW public.leaderboard_round_breakdown AS
SELECT
  p.user_id,
  p.tournament_id,
  COALESCE(tr.tab_group, f.round::text)  AS tab_group,
  MIN(COALESCE(tr.round_order, 999))     AS round_order,
  COALESCE(SUM(p.points_earned), 0)::int AS points
FROM       public.predictions      p
JOIN       public.fixtures         f  ON f.id              = p.fixture_id
LEFT JOIN  public.tournament_rounds tr ON tr.tournament_id  = f.tournament_id
                                      AND tr.round_code     = f.round
WHERE p.points_earned IS NOT NULL
GROUP BY p.user_id, p.tournament_id, COALESCE(tr.tab_group, f.round::text);

-- Unique index required for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX lrb_user_tournament_tab
  ON public.leaderboard_round_breakdown (user_id, tournament_id, tab_group);

-- Covering index for the API query pattern: filter by tournament, IN user list
CREATE INDEX lrb_tournament_user
  ON public.leaderboard_round_breakdown (tournament_id, user_id);

-- ── B. Slim leaderboard view ─────────────────────────────────────────────────

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

-- ── C. Update refresh functions ───────────────────────────────────────────────

-- Trigger-based refresh (fires after points_earned is set on predictions)
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
  RETURN NULL;
END;
$$;

-- Manual refresh (called after bulk result imports)
CREATE OR REPLACE FUNCTION public.refresh_leaderboard_now()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.leaderboard;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.leaderboard_round_breakdown;
END;
$$;

-- ── D. Initial population ─────────────────────────────────────────────────────

REFRESH MATERIALIZED VIEW public.leaderboard;
REFRESH MATERIALIZED VIEW public.leaderboard_round_breakdown;

SELECT '093 complete — leaderboard_round_breakdown created, leaderboard view slimmed' AS status;
