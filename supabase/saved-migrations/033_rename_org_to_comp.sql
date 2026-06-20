-- Migration 033 — rename "organisation" to "comp" throughout the schema

-- 1. Rename tables
ALTER TABLE public.organisations   RENAME TO comps;
ALTER TABLE public.org_admins      RENAME TO comp_admins;
ALTER TABLE public.org_subscriptions RENAME TO comp_subscriptions;
ALTER TABLE public.org_announcements RENAME TO comp_announcements;
ALTER TABLE public.org_prizes       RENAME TO comp_prizes;
ALTER TABLE public.org_challenges   RENAME TO comp_challenges;

-- 2. Rename columns: org_id → comp_id everywhere
ALTER TABLE public.users        RENAME COLUMN org_id       TO comp_id;
ALTER TABLE public.tribes       RENAME COLUMN org_id       TO comp_id;
ALTER TABLE public.comp_admins  RENAME COLUMN org_id       TO comp_id;
ALTER TABLE public.comp_subscriptions RENAME COLUMN org_id TO comp_id;
ALTER TABLE public.comp_announcements RENAME COLUMN org_id TO comp_id;
ALTER TABLE public.comp_prizes  RENAME COLUMN org_id       TO comp_id;
ALTER TABLE public.comp_challenges RENAME COLUMN org_id    TO comp_id;

-- org_admins user_id stays as user_id (not org-specific)

-- 3. Rename indexes that reference old names
-- (Supabase auto-renames FK constraints, but we recreate key indexes)
CREATE INDEX IF NOT EXISTS idx_users_comp         ON public.users(comp_id);
CREATE INDEX IF NOT EXISTS idx_tribes_comp        ON public.tribes(comp_id);
CREATE INDEX IF NOT EXISTS idx_comp_admins_comp   ON public.comp_admins(comp_id);

-- 4. Rename the slug of the PUBLIC comp (no rename needed — slug stays 'public')
-- Update the comps table: rename owner_* columns for clarity (optional, skip for now)

-- 5. Rebuild leaderboard materialized view with new column names
DROP MATERIALIZED VIEW IF EXISTS public.leaderboard;

CREATE MATERIALIZED VIEW public.leaderboard AS
SELECT
  p.user_id,
  p.tournament_id,
  u.display_name,
  u.tribe_id,
  t.name                                    AS tribe_name,
  u.comp_id,
  c.name                                    AS comp_name,
  COALESCE(SUM(p.points_earned), 0)::int    AS total_points,
  COUNT(*) FILTER (
    WHERE p.points_earned IS NOT NULL
      AND p.points_earned > 0
      AND f.round IN ('sf','tp','f')
      AND p.home = f.home_score AND p.away = f.away_score
  )::int                                    AS exact_count,
  COUNT(*) FILTER (
    WHERE p.points_earned IS NOT NULL AND p.points_earned > 0
  )::int                                    AS correct_count,
  COUNT(*) FILTER (
    WHERE p.points_earned IS NOT NULL
  )::int                                    AS predictions_made
FROM public.predictions p
JOIN public.users u       ON u.id = p.user_id
JOIN public.fixtures f    ON f.id = p.fixture_id
LEFT JOIN public.tribes t ON t.id = u.tribe_id
LEFT JOIN public.comps  c ON c.id = u.comp_id
WHERE p.points_earned IS NOT NULL
GROUP BY p.user_id, p.tournament_id, u.display_name, u.tribe_id, t.name, u.comp_id, c.name;

CREATE UNIQUE INDEX IF NOT EXISTS leaderboard_user_tournament
  ON public.leaderboard (user_id, tournament_id);
CREATE INDEX IF NOT EXISTS leaderboard_tournament
  ON public.leaderboard (tournament_id, total_points DESC);

REFRESH MATERIALIZED VIEW public.leaderboard;

-- 6. Update RLS policies that reference old table names
-- (Supabase carries policies when renaming tables, but verify after migration)

SELECT 'Migration 033 complete — org renamed to comp' AS status;
