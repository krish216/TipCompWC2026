-- Migration 136 — Tournament feature flag: knockout-only leaderboard
--
-- Controls whether the "Knockouts only" leaderboard toggle (backed by the
-- leaderboard_knockout MV from migration 135) is offered to tipsters.
-- Off by default so it stays dark until an admin flips it on per tournament.
-- Purely additive; mirrors the existing enforce_premium / allow_retroactive flags.

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS knockout_leaderboard_enabled boolean NOT NULL DEFAULT false;

SELECT '136 complete — tournaments.knockout_leaderboard_enabled added (default false)' AS status;
