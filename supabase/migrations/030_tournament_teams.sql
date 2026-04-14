-- Migration 030 — tournament teams list and tournament-scoped leaderboard

-- 1. Add teams array to tournaments (list of participating teams)
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS teams text[] DEFAULT NULL;

-- 2. Set WC2026 teams
UPDATE public.tournaments
SET teams = ARRAY[
  'Algeria','Argentina','Australia','Austria','Belgium',
  'Bosnia and Herzegovina','Brazil','Canada','Cape Verde',
  'Colombia','Croatia','Curacao','Czechia','DR Congo',
  'Ecuador','Egypt','England','France','Germany','Ghana',
  'Haiti','Iran','Iraq','Ivory Coast','Japan','Jordan',
  'Mexico','Morocco','Netherlands','New Zealand','Norway',
  'Panama','Paraguay','Portugal','Qatar','Saudi Arabia',
  'Scotland','Senegal','South Africa','South Korea','Spain',
  'Sweden','Switzerland','Tunisia','Turkey','Uruguay',
  'USA','Uzbekistan'
]
WHERE slug = 'wc2026';

-- 3. Tournament-scoped leaderboard view
-- Replaces the global leaderboard materialized view with a function-based approach
-- The leaderboard API now queries predictions directly filtered by tournament_id

-- Add tournament_id to leaderboard materialized view
-- Drop and recreate with tournament support
DROP MATERIALIZED VIEW IF EXISTS public.leaderboard;

CREATE MATERIALIZED VIEW public.leaderboard AS
SELECT
  p.user_id,
  p.tournament_id,
  u.display_name,
  u.tribe_id,
  t.name                                    AS tribe_name,
  u.org_id,
  o.name                                    AS org_name,
  COALESCE(SUM(p.points_earned), 0)::int    AS total_points,
  COUNT(*) FILTER (
    WHERE p.points_earned IS NOT NULL
      AND p.points_earned > 0
      AND (
        -- exact: for exact-score rounds, full exact points
        (f.round IN ('sf','tp','f') AND p.home = f.home_score AND p.away = f.away_score)
      )
  )::int                                    AS exact_count,
  COUNT(*) FILTER (
    WHERE p.points_earned IS NOT NULL
      AND p.points_earned > 0
  )::int                                    AS correct_count,
  COUNT(*) FILTER (
    WHERE p.points_earned IS NOT NULL
  )::int                                    AS predictions_made
FROM public.predictions p
JOIN public.users u       ON u.id = p.user_id
JOIN public.fixtures f    ON f.id = p.fixture_id
LEFT JOIN public.tribes t ON t.id = u.tribe_id
LEFT JOIN public.organisations o ON o.id = u.org_id
WHERE p.points_earned IS NOT NULL
GROUP BY p.user_id, p.tournament_id, u.display_name, u.tribe_id, t.name, u.org_id, o.name;

CREATE UNIQUE INDEX IF NOT EXISTS leaderboard_user_tournament
  ON public.leaderboard (user_id, tournament_id);

CREATE INDEX IF NOT EXISTS leaderboard_tournament
  ON public.leaderboard (tournament_id, total_points DESC);

-- Refresh
REFRESH MATERIALIZED VIEW public.leaderboard;

SELECT 'Migration 030 complete' AS status;
