-- 159: tournaments.format — explicit competition structure (league vs knockout)
--
-- "Is this a league or a knockout?" was derived three fragile ways (tournament_rounds
-- .is_knockout, presence of standings_quarters vs a bracket challenge, and the WC round
-- label map — which collided: EPL matchweek 32 rendered as WC's "Round of 32"). A single
-- explicit column is the source of truth for that tournament-level UI/flagship switch.
--
-- NOTE: this is distinct from tournament_rounds.is_knockout, which stays the per-ROUND
-- scoring truth (a knockout can still have a group stage). `format` is the whole-comp
-- shape; the round table drives scoring.
--
-- Values: 'league' (EPL — matchweeks, table predictor) | 'knockout' (WC — bracket).
-- Default 'league' so new comps lean league; WC is flipped to 'knockout' below.

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'league'
  CHECK (format IN ('league', 'knockout'));

COMMENT ON COLUMN public.tournaments.format IS
  'Competition structure: league (matchweeks/table predictor) or knockout (bracket). Tournament-level UI/flagship switch — distinct from tournament_rounds.is_knockout (per-round scoring).';

UPDATE public.tournaments SET format = 'knockout' WHERE slug = 'wc2026';
-- EPL and any other tournament keep the 'league' default.

-- Verify
SELECT slug, name, format FROM public.tournaments ORDER BY format, slug;

SELECT 'Migration 159 complete — tournaments.format added (wc2026=knockout, rest=league)' AS status;
