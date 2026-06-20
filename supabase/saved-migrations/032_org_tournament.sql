-- Migration 032 — link organisations to a single tournament

ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS tournament_id uuid
  REFERENCES public.tournaments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_organisations_tournament
  ON public.organisations(tournament_id);

-- Tag existing non-PUBLIC orgs as WC2026
UPDATE public.organisations
SET tournament_id = (
  SELECT id FROM public.tournaments WHERE slug = 'wc2026' LIMIT 1
)
WHERE tournament_id IS NULL
  AND slug != 'public';

-- PUBLIC org is not tournament-specific (it's platform-wide)
-- Leave it as NULL

SELECT name, slug, tournament_id FROM public.organisations;
SELECT 'Migration 032 complete' AS status;
