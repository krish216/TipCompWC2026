-- Migration 059: add tab_group to tournament_rounds
-- tab_group controls which UI tab a round appears under on the predict page.
-- Rounds with the same tab_group are grouped into one tab, ordered by round_order.

-- Step 1: add nullable column (no default — can't reference another column)
ALTER TABLE public.tournament_rounds
  ADD COLUMN IF NOT EXISTS tab_group text;

-- Step 2: backfill — every round maps to itself except tp+f which share 'finals'
UPDATE public.tournament_rounds
SET tab_group = CASE
  WHEN round_code IN ('tp', 'f') THEN 'finals'
  ELSE round_code
END;

-- Step 3: now safe to make NOT NULL
ALTER TABLE public.tournament_rounds
  ALTER COLUMN tab_group SET NOT NULL;

-- Verify
SELECT round_code, round_name, round_order, tab_group
FROM public.tournament_rounds tr
JOIN public.tournaments t ON t.id = tr.tournament_id
WHERE t.slug = 'wc2026'
ORDER BY round_order;

SELECT 'Migration 059 complete — tab_group column added to tournament_rounds' AS status;
