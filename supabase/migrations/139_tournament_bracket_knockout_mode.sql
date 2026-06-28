-- Migration 139 — Tournament feature flag: bracket knockout mode
--
-- Controls whether the Bracket builder seeds from the REAL Round-of-32 fixtures
-- (and hides the group/3rd-place prediction steps) instead of the user's predicted
-- qualifiers. Off by default so it stays dark until an admin flips it on per
-- tournament, once the group stage is complete. Purely additive; mirrors the
-- existing knockout_leaderboard_enabled / enforce_premium / allow_retroactive flags.

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS bracket_knockout_mode boolean NOT NULL DEFAULT false;

SELECT '139 complete — tournaments.bracket_knockout_mode added (default false)' AS status;
