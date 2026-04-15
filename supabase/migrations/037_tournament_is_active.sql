-- Migration 037 — add is_active flag to tournaments
-- Separate from `status` (upcoming/active/completed lifecycle field)
-- is_active = true means this tournament is shown on the homepage and used as a filter

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false;

-- Mark WC2026 as active (it's the current tournament)
UPDATE public.tournaments
SET is_active = true
WHERE slug = 'wc2026';

-- Index for fast reads
CREATE INDEX IF NOT EXISTS idx_tournaments_is_active
  ON public.tournaments(is_active)
  WHERE is_active = true;

SELECT name, slug, status, is_active FROM public.tournaments;
SELECT 'Migration 037 complete' AS status;
