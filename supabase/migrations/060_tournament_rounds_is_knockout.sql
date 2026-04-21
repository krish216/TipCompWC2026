-- Migration 060: add is_knockout to tournament_rounds
-- Replaces the hardcoded KNOCKOUT_ROUNDS array in application code.
-- A round is "knockout" when it uses a single-elimination format
-- (pen_winner can decide the match, there is no group standing).

ALTER TABLE public.tournament_rounds
  ADD COLUMN IF NOT EXISTS is_knockout boolean NOT NULL DEFAULT false;

-- Backfill: every round except group stage is knockout
UPDATE public.tournament_rounds
SET is_knockout = (round_code <> 'gs');

-- Verify
SELECT round_code, round_name, round_order, tab_group, is_knockout, predict_mode, pen_bonus, fav_team_2x
FROM public.tournament_rounds tr
JOIN public.tournaments t ON t.id = tr.tournament_id
WHERE t.slug = 'wc2026'
ORDER BY round_order;

SELECT 'Migration 060 complete — is_knockout column added to tournament_rounds' AS status;
