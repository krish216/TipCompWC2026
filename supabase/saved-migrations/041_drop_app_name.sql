-- Migration 041 — remove app_name from comps
-- app_name was a "display name override" that duplicated name.
-- We migrate any non-null app_name values into name, then drop the column.

-- Overwrite name with app_name where app_name was set
UPDATE public.comps
SET name = app_name
WHERE app_name IS NOT NULL AND app_name != '';

-- Drop the column
ALTER TABLE public.comps DROP COLUMN IF EXISTS app_name;

-- Rebuild leaderboard view (references comp name)
REFRESH MATERIALIZED VIEW public.leaderboard;

SELECT id, name, slug FROM public.comps ORDER BY name;
SELECT 'Migration 041 complete' AS status;
