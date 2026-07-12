-- 169: tag EPL-interest votes by campaign channel
--
-- The Comp-Chief poll and the Tipster poll both write to epl_interest (keyed by user_id, one
-- answer per person). `source` records which campaign drove the latest response so the tally
-- can read "X via tipster email, Y via chief email" alongside overall yes/maybe/no. Existing
-- rows are all Comp-Chief votes → default 'chief' backfills them correctly.

ALTER TABLE public.epl_interest
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'chief';

SELECT 'Migration 169 complete — epl_interest.source (existing rows → chief)' AS status;

-- Tally by channel once tipster responses land:
--   select source, response, count(*) from public.epl_interest group by source, response order by source, response;
