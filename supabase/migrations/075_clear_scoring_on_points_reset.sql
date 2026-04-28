-- Migration 075 — Clear standard_points and bonus_points when points_earned is reset
--
-- Problem: the results reset API sets points_earned = NULL but leaves
-- standard_points and bonus_points at their previously-scored values.
-- This causes the tribe standings fallback (standard_points + bonus_points when
-- points_earned IS NULL) to double-count points that have been invalidated.
--
-- Fix 1: BEFORE UPDATE trigger — whenever points_earned transitions from a
--         non-null value to NULL, zero out standard_points and bonus_points.
--         Applies to any code path, not just the results API.
--
-- Fix 2: One-time cleanup of existing stale rows.

-- ── 1. Trigger function ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION sync_scoring_on_points_reset()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.standard_points := 0;
  NEW.bonus_points    := 0;
  RETURN NEW;
END;
$$;

-- ── 2. Trigger (BEFORE UPDATE so we can rewrite NEW before the write) ─────────
DROP TRIGGER IF EXISTS trg_sync_scoring_on_points_reset ON public.predictions;
CREATE TRIGGER trg_sync_scoring_on_points_reset
  BEFORE UPDATE OF points_earned ON public.predictions
  FOR EACH ROW
  WHEN (NEW.points_earned IS NULL AND OLD.points_earned IS NOT NULL)
  EXECUTE FUNCTION sync_scoring_on_points_reset();

-- ── 3. Cleanup existing stale rows ────────────────────────────────────────────
UPDATE public.predictions
SET    standard_points = 0,
       bonus_points    = 0
WHERE  points_earned IS NULL
  AND  (standard_points > 0 OR bonus_points > 0);

SELECT 'Migration 075 complete — scoring fields now zeroed when points_earned is reset' AS status;
