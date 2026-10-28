-- 187: backfill tournaments.espn_league for the EPL. Migration 149 added the column
-- and backfilled 'fifa.world' for wc2026 but never set the EPL's 'eng.1' — so
-- /api/scores/sync (updated in the same change as this migration to look up each
-- tournament's own espn_league instead of a single global ESPN_LEAGUE env var) had
-- no feed to query for EPL fixtures. Idempotent.

UPDATE public.tournaments SET espn_league = 'eng.1' WHERE slug = 'epl-2026-27' AND espn_league IS NULL;

-- Verify
SELECT slug, espn_league FROM public.tournaments WHERE slug IN ('wc2026', 'epl-2026-27');
