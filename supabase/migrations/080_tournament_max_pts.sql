-- Add max achievable points columns to tournaments
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS max_base_pts  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_bonus_pts integer NOT NULL DEFAULT 0;
