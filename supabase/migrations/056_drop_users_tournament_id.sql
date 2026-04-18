-- Migration 056: drop stale tournament_id column from users table
-- tournament_id on users was a legacy denormalisation.
-- The source of truth is user_tournaments (one row per user per tournament)
-- and user_preferences (stores the currently selected tournament_id).
-- Nothing reads users.tournament_id — only user-tournaments/route.ts wrote it
-- as a side-effect, which is also being removed in this release.

ALTER TABLE public.users DROP COLUMN IF EXISTS tournament_id;

SELECT 'Migration 056 complete — tournament_id dropped from users table' AS status;
