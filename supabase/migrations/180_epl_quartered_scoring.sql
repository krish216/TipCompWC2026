-- 180: EPL matchweek scoring — quartered escalation, mirroring the Table Predictor
-- checkpoints (after MW9 / MW19 / MW28 / MW38). Points per correct Home/Draw/Away outcome
-- scale up through the season, so a slow start — or a late joiner — can still catch up.
-- The warm-up round folds into Q1 (1pt).
--
--   Warm-up + MW1–9   → 1 pt   (Q1)
--   MW10–19           → 2 pts  (Q2)
--   MW20–28           → 3 pts  (Q3)
--   MW29–38           → 4 pts  (Q4)
--
-- Outcome-mode rounds, so result_pts is the only lever (exact/margin/pen bonuses stay 0).
-- EPL is pre-launch; no live season points depend on this yet.

DO $$
DECLARE epl uuid;
BEGIN
  SELECT id INTO epl FROM public.tournaments WHERE slug = 'epl-2026-27';
  IF epl IS NULL THEN RAISE EXCEPTION 'epl-2026-27 tournament not found'; END IF;

  UPDATE public.tournament_rounds SET result_pts = 1 WHERE tournament_id = epl AND round_order BETWEEN 0  AND 9;   -- WUP + MW1-9
  UPDATE public.tournament_rounds SET result_pts = 2 WHERE tournament_id = epl AND round_order BETWEEN 10 AND 19;  -- MW10-19
  UPDATE public.tournament_rounds SET result_pts = 3 WHERE tournament_id = epl AND round_order BETWEEN 20 AND 28;  -- MW20-28
  UPDATE public.tournament_rounds SET result_pts = 4 WHERE tournament_id = epl AND round_order BETWEEN 29 AND 38;  -- MW29-38
END $$;

SELECT round_code, round_order, result_pts
FROM public.tournament_rounds
WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'epl-2026-27')
ORDER BY round_order;

SELECT 'Migration 180 complete — EPL quartered matchweek scoring (1/2/3/4)' AS status;
