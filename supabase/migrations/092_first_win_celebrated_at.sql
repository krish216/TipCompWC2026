-- Migration 092 — Track first correct-prediction celebration
-- Used by homepage card + predict-page toast to show the "Nice call!" moment once,
-- cross-device, and never again after the user dismisses it.
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS first_win_celebrated_at timestamptz;
