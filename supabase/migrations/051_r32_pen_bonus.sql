-- Migration 051 — add pen_winner bonus to R32
-- Per user confirmation: R32 should award +5 for correct penalty winner
-- (consistent with R16/QF/SF/3P/F)

UPDATE public.tournament_rounds
SET pen_bonus = 5
WHERE round_code = 'r32'
  AND tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'wc2026');

-- Re-score all R32 fixtures that already have results
UPDATE public.fixtures
SET home_score = home_score
WHERE home_score IS NOT NULL
  AND round = 'r32';

REFRESH MATERIALIZED VIEW public.leaderboard;

SELECT round_code, result_pts, exact_bonus, pen_bonus
FROM public.tournament_rounds tr
JOIN public.tournaments t ON t.id = tr.tournament_id
WHERE t.slug = 'wc2026' AND tr.round_code IN ('r32','r16')
ORDER BY round_order;

SELECT 'Migration 051 complete — R32 pen_bonus set to 5' AS status;
