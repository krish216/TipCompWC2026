-- Migration 100 — bracket_predictions: dismissed_at
--
-- Records when the user explicitly dismissed the share banner without sharing.
-- Completes the conversion funnel: picked champion → dismissed vs. shared.

ALTER TABLE public.bracket_predictions
  ADD COLUMN IF NOT EXISTS dismissed_at timestamptz;

SELECT '100 complete — bracket_predictions.dismissed_at added' AS status;
