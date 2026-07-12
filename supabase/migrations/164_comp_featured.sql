-- 164: comps.featured — Chief opt-in to show a comp on their public profile
--
-- The Chief profile lists open + discoverable comps by default. This lets a Chief also
-- feature a specific comp (e.g. a private one they want to open to their audience) on
-- their profile, deliberately and per-comp — private comps are never exposed otherwise.

ALTER TABLE public.comps ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.comps.featured IS
  'Chief opt-in: also show this comp on their public /chief profile (in addition to open+discoverable ones).';

SELECT 'Migration 164 complete — comps.featured added' AS status;
