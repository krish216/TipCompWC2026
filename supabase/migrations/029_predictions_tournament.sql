-- Migration 029 — link predictions to tournaments
-- predictions.tournament_id: which tournament this prediction belongs to

ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS tournament_id uuid
  REFERENCES public.tournaments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_predictions_tournament ON public.predictions(tournament_id);

-- Backfill: existing predictions belong to WC2026
-- (derive from the fixture's tournament_id)
UPDATE public.predictions p
SET tournament_id = f.tournament_id
FROM public.fixtures f
WHERE f.id = p.fixture_id
  AND p.tournament_id IS NULL
  AND f.tournament_id IS NOT NULL;

-- Make tournament_id NOT NULL after backfill
-- (only if all rows now have a value)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.predictions WHERE tournament_id IS NULL
  ) THEN
    ALTER TABLE public.predictions ALTER COLUMN tournament_id SET NOT NULL;
  END IF;
END $$;

-- Update RLS: users can only see their own predictions (unchanged)
-- The tournament filter is applied at the API level

SELECT
  t.name,
  count(p.id) as prediction_count
FROM public.predictions p
JOIN public.tournaments t ON t.id = p.tournament_id
GROUP BY t.id, t.name;
