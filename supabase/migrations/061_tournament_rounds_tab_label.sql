-- Migration 061: add tab_label to tournament_rounds
-- tab_label is the explicit display label for a tab group.
-- For grouped tabs (e.g. tp+f both in 'finals'), all rounds in the group
-- share the same tab_label value. This avoids deriving the label from
-- round_name which can differ per round (e.g. '3rd Place' vs 'Final').

ALTER TABLE public.tournament_rounds
  ADD COLUMN IF NOT EXISTS tab_label text;

-- Backfill: use round_name as default, override for grouped tabs
UPDATE public.tournament_rounds
SET tab_label = CASE
  WHEN tab_group = 'finals' THEN 'Finals'
  ELSE round_name
END
WHERE tab_label IS NULL;

-- Make non-nullable
ALTER TABLE public.tournament_rounds
  ALTER COLUMN tab_label SET NOT NULL;

-- Verify
SELECT round_code, round_name, tab_group, tab_label
FROM public.tournament_rounds tr
JOIN public.tournaments t ON t.id = tr.tournament_id
WHERE t.slug = 'wc2026'
ORDER BY round_order;

SELECT 'Migration 061 complete — tab_label column added to tournament_rounds' AS status;
