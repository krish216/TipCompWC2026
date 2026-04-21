-- Migration 052 — force re-score R32 fixtures with pen_bonus=5
-- The scoring trigger fires on UPDATE OF home_score, away_score, pen_winner, result_outcome.
-- Touching pen_winner guarantees it fires even when the value doesn't change.

-- Verify R32 pen_bonus is 5 first
DO $$
DECLARE v int;
BEGIN
  SELECT pen_bonus INTO v FROM public.tournament_rounds tr
  JOIN public.tournaments t ON t.id = tr.tournament_id
  WHERE t.slug = 'wc2026' AND tr.round_code = 'r32';
  IF v IS DISTINCT FROM 5 THEN
    RAISE EXCEPTION 'R32 pen_bonus is %, run migration 051 first', v;
  END IF;
END $$;

-- Touch pen_winner on all R32 fixtures with results — fires the scoring trigger
UPDATE public.fixtures
SET pen_winner = pen_winner
WHERE home_score IS NOT NULL
  AND round::text = 'r32';

REFRESH MATERIALIZED VIEW public.leaderboard;

-- Verify: R32 draws with correct pen winner should now show 10 pts
SELECT f.home, f.away, f.home_score, f.away_score, f.pen_winner,
       p.outcome, p.pen_winner AS pred_pen, p.points_earned
FROM public.predictions p
JOIN public.fixtures f ON f.id = p.fixture_id
WHERE f.round::text = 'r32'
  AND f.home_score = f.away_score
  AND f.pen_winner IS NOT NULL
  AND p.outcome = 'D'
  AND p.pen_winner IS NOT NULL
ORDER BY f.id;

SELECT 'Migration 052 complete — R32 re-scored with pen_bonus=5' AS status;
