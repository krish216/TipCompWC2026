-- Migration 130 — user_tournaments.favourite_team_auto
-- Flags a bonus (favourite) team as SYSTEM-ASSIGNED rather than user-picked. Set true
-- when we auto-assign a random alive team to users who never chose one (see
-- scripts/assign-bonus-teams.js). Lets us distinguish/undo auto-assignments later.

ALTER TABLE public.user_tournaments
  ADD COLUMN IF NOT EXISTS favourite_team_auto boolean NOT NULL DEFAULT false;

SELECT '130 complete — user_tournaments.favourite_team_auto added' AS status;
