-- Migration 095 — Show first name on leaderboard (opt-in, default on)
--
-- Adds show_first_name to users so tipsters can control whether their
-- first name appears as a subtitle on comp/tribe leaderboards.
-- Rebuilds the leaderboard materialized view to expose first_name and
-- show_first_name so the API can apply per-row privacy filtering.

-- ── A. New column ─────────────────────────────────────────────────────────────

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS show_first_name boolean NOT NULL DEFAULT true;

-- ── B. Rebuild leaderboard view ───────────────────────────────────────────────

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
  u.first_name,
  u.show_first_name,
  u.avatar_url,
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

SELECT '095 complete — show_first_name added, leaderboard view rebuilt' AS status;
