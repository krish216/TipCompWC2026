-- 174: bracket_entries.excluded — omit ineligible entrants from a challenge.
--
-- Some entrants shouldn't count toward a challenge (e.g. an international user in a
-- geo-restricted sponsor prize). This flag lets an admin exclude a specific entry: the
-- leaderboard API and the rank recompute both skip excluded rows, so the user disappears
-- from the board, the prize pool, and the stored ranks (and everyone below them shifts up).
--
-- IMPORTANT: apply this migration BEFORE deploying the code that selects `excluded`.

ALTER TABLE public.bracket_entries
  ADD COLUMN IF NOT EXISTS excluded        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS excluded_reason text;

COMMENT ON COLUMN public.bracket_entries.excluded
  IS 'When true, the entrant is omitted from the challenge leaderboard, rank recompute and prize pool.';

-- Exclude the reported ineligible (international) entrant and clear any stored rank so the
-- tipster cabinet / snapshots don't keep showing it. A rank recompute re-ranks the rest.
UPDATE public.bracket_entries
SET excluded        = true,
    excluded_reason = 'ineligible — international',
    final_rank      = NULL,
    final_points    = NULL,
    field_size      = NULL,
    ranked_at       = NULL
WHERE challenge_id = '561e6a71-d682-48bc-b636-d72cf24a99a2'
  AND user_id      = '4dc8a18b-2314-4b8c-a62a-7bd0a8484992';

-- Verify
SELECT user_id, excluded, excluded_reason, final_rank
FROM public.bracket_entries
WHERE challenge_id = '561e6a71-d682-48bc-b636-d72cf24a99a2'
  AND user_id      = '4dc8a18b-2314-4b8c-a62a-7bd0a8484992';

SELECT 'Migration 174 complete — bracket_entries.excluded added; ineligible entrant excluded' AS status;
