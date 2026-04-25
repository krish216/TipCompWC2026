-- Migration 072 — Fix leaderboard refresh trigger and view to prevent prediction 500s
--
-- Root cause: trg_refresh_lb fires AFTER UPDATE OF points_earned on predictions.
-- refresh_leaderboard() calls REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard.
-- The leaderboard view (migration 066) joins tribe_members directly which fans out
-- rows for users in multiple tribes, violating the unique (user_id, tournament_id)
-- index during concurrent refresh, aborting the prediction upsert transaction.
--
-- Fix 1: Make refresh_leaderboard() catch and swallow errors (never abort callers).
-- Fix 2: Rebuild leaderboard view with a deduplicating CTE so each user has at most
--         one row per tournament regardless of tribe membership count.

-- ── 1. Make refresh resilient ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION refresh_leaderboard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.leaderboard;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'leaderboard refresh skipped: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

-- ── 2. Rebuild leaderboard without tribe fan-out ──────────────────────────────
DROP MATERIALIZED VIEW IF EXISTS public.leaderboard CASCADE;

CREATE MATERIALIZED VIEW public.leaderboard AS
WITH pred_agg AS (
  -- Aggregate points per (user, tournament) — no tribe join yet
  SELECT
    p.user_id,
    p.tournament_id,
    COALESCE(SUM(p.points_earned),   0)::int           AS total_points,
    COALESCE(SUM(p.bonus_points),    0)::int           AS total_bonus_points,
    COUNT(*) FILTER (WHERE p.bonus_points    > 0)::int  AS bonus_count,
    COUNT(*) FILTER (WHERE p.standard_points > 0)::int  AS correct_count,
    COUNT(*) FILTER (WHERE p.points_earned IS NOT NULL)::int AS predictions_made
  FROM  public.predictions p
  WHERE p.points_earned IS NOT NULL
  GROUP BY p.user_id, p.tournament_id
),
user_tribe AS (
  -- Pick at most one tribe per user (most recently joined)
  SELECT DISTINCT ON (tm.user_id)
    tm.user_id,
    tm.tribe_id,
    tr.name AS tribe_name
  FROM  public.tribe_members tm
  JOIN  public.tribes        tr ON tr.id = tm.tribe_id
  ORDER BY tm.user_id, tm.joined_at DESC
)
SELECT
  pa.user_id,
  pa.tournament_id,
  u.display_name,
  ut.tribe_id,
  ut.tribe_name,
  up.comp_id,
  c.name                AS comp_name,
  pa.total_points,
  pa.total_bonus_points,
  pa.bonus_count,
  pa.correct_count,
  pa.predictions_made
FROM       pred_agg              pa
JOIN       public.users          u   ON u.id       = pa.user_id
LEFT JOIN  user_tribe            ut  ON ut.user_id = pa.user_id
LEFT JOIN  public.user_preferences up ON up.user_id = pa.user_id
LEFT JOIN  public.comps           c  ON c.id       = up.comp_id;

-- Unique index required for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX leaderboard_user_tournament
  ON public.leaderboard (user_id, tournament_id);

CREATE INDEX leaderboard_tournament
  ON public.leaderboard (tournament_id, total_points DESC);

REFRESH MATERIALIZED VIEW public.leaderboard;

SELECT 'Migration 072 complete — leaderboard view rebuilt, refresh_leaderboard made resilient' AS status;
