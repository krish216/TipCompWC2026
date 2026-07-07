-- 149_tournament_club_support.sql
-- Multi-sport/multi-format support so a club league (EPL) can live alongside the
-- national-team World Cup:
--   * tournament_teams.logo_url  — club crest URL (clubs have no flag emoji)
--   * tournament_teams.short_name — compact label (e.g. "Spurs", "Man Utd")
--   * tournaments.espn_league    — per-tournament ESPN league slug for scores/schedule
--     sync ('fifa.world' for the WC, 'eng.1' for the Premier League). Replaces the
--     single global ESPN_LEAGUE env var so tournaments can use different feeds.
-- No new tables → existing grants (migration 110) already cover these columns.

ALTER TABLE public.tournament_teams
  ADD COLUMN IF NOT EXISTS logo_url   text,
  ADD COLUMN IF NOT EXISTS short_name text;

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS espn_league text;

-- Backfill the World Cup's ESPN feed so existing sync keeps working unchanged.
UPDATE public.tournaments SET espn_league = 'fifa.world' WHERE slug = 'wc2026' AND espn_league IS NULL;
