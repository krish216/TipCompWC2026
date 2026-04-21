-- Migration 044 — drop tribe_id and comp_id from users table
-- Source of truth:
--   user_comps    (user_id, comp_id)  — replaces users.comp_id
--   tribe_members (user_id, tribe_id) — replaces users.tribe_id

-- Step 1: Backfill join tables from denormalised columns before dropping them
INSERT INTO public.user_comps (user_id, comp_id)
SELECT id, comp_id FROM public.users
WHERE comp_id IS NOT NULL
ON CONFLICT (user_id, comp_id) DO NOTHING;

INSERT INTO public.tribe_members (user_id, tribe_id)
SELECT id, tribe_id FROM public.users
WHERE tribe_id IS NOT NULL
ON CONFLICT (user_id, tribe_id) DO NOTHING;

-- Step 2: Drop and rebuild the leaderboard materialized view
-- The old view referenced users.comp_id and users.tribe_id directly.
-- The new view resolves comp and tribe via their join tables.
DROP MATERIALIZED VIEW IF EXISTS public.leaderboard CASCADE;

CREATE MATERIALIZED VIEW public.leaderboard AS
SELECT
  p.user_id,
  p.tournament_id,
  u.display_name,
  -- tribe via tribe_members (a user can be in one tribe per comp — take most recent)
  tm.tribe_id,
  t.name                                     AS tribe_name,
  -- comp via user_prefs (the comp the user has selected for this tournament)
  up.comp_id,
  c.name                                     AS comp_name,
  COALESCE(SUM(p.points_earned), 0)::int     AS total_points,
  COUNT(*) FILTER (
    WHERE p.points_earned IS NOT NULL
      AND p.points_earned > 0
      AND f.round IN ('sf','tp','f')
      AND p.home = f.home_score AND p.away = f.away_score
  )::int                                     AS exact_count,
  COUNT(*) FILTER (
    WHERE p.points_earned IS NOT NULL AND p.points_earned > 0
  )::int                                     AS correct_count,
  COUNT(*) FILTER (
    WHERE p.points_earned IS NOT NULL
  )::int                                     AS predictions_made
FROM public.predictions p
JOIN  public.users        u   ON u.id  = p.user_id
JOIN  public.fixtures     f   ON f.id  = p.fixture_id
-- comp: join user_preferences which stores the user's selected comp per tournament
LEFT JOIN public.user_preferences up
  ON up.user_id = p.user_id
LEFT JOIN public.comps   c  ON c.id = up.comp_id
-- tribe: each user has at most one tribe_members row (enforced by app)
LEFT JOIN public.tribe_members tm ON tm.user_id = p.user_id
LEFT JOIN public.tribes   t  ON t.id = tm.tribe_id
WHERE p.points_earned IS NOT NULL
GROUP BY
  p.user_id, p.tournament_id, u.display_name,
  tm.tribe_id, t.name,
  up.comp_id, c.name;

-- Recreate indexes
CREATE UNIQUE INDEX leaderboard_user_tournament
  ON public.leaderboard (user_id, tournament_id);
CREATE INDEX leaderboard_tournament
  ON public.leaderboard (tournament_id, total_points DESC);

-- Step 3: Drop stale RLS policies that reference users.tribe_id
-- These were created when tribe_id lived on users — now tribe_members is the source of truth

DROP POLICY IF EXISTS "tm_select_own_tribe"  ON public.tribe_members;
DROP POLICY IF EXISTS "chat_select_tribe"    ON public.chat_messages;
DROP POLICY IF EXISTS "chat_insert_tribe"    ON public.chat_messages;

-- Recreate clean RLS policies using tribe_members join table

-- tribe_members: users can see rows for their own tribe
CREATE POLICY "tm_select_own_tribe" ON public.tribe_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR tribe_id IN (
      SELECT tribe_id FROM public.tribe_members WHERE user_id = auth.uid()
    )
  );

-- chat_messages: users can read messages from tribes they belong to
CREATE POLICY "chat_select_tribe" ON public.chat_messages
  FOR SELECT USING (
    tribe_id IN (
      SELECT tribe_id FROM public.tribe_members WHERE user_id = auth.uid()
    )
  );

-- chat_messages: users can post to tribes they belong to
CREATE POLICY "chat_insert_tribe" ON public.chat_messages
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND tribe_id IN (
      SELECT tribe_id FROM public.tribe_members WHERE user_id = auth.uid()
    )
  );

-- Now safe to drop the columns
ALTER TABLE public.users DROP COLUMN IF EXISTS comp_id;
ALTER TABLE public.users DROP COLUMN IF EXISTS tribe_id;

-- Step 4: Refresh with the new view
REFRESH MATERIALIZED VIEW public.leaderboard;

-- Verify
SELECT 'user_comps rows'    AS check_, count(*)::text FROM public.user_comps
UNION ALL
SELECT 'tribe_members rows',            count(*)::text FROM public.tribe_members
UNION ALL
SELECT 'leaderboard rows',              count(*)::text FROM public.leaderboard;

SELECT 'Migration 044 complete' AS status;
