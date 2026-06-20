-- Migration 023 — penalty winner for knockout round draws
-- In knockout rounds (r32+), if score is level the winner on penalties must be picked

-- Add pen_winner to predictions (team name, or null if no draw predicted)
ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS pen_winner text;

-- Add pen_winner to fixtures for the actual result
ALTER TABLE public.fixtures
  ADD COLUMN IF NOT EXISTS pen_winner text;  -- actual team that won on penalties

-- Verify
SELECT column_name FROM information_schema.columns
WHERE table_name = 'predictions' AND column_name = 'pen_winner';
