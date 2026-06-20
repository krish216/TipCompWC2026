-- 124: Challenge end date (when entries close)
--
-- Gives a challenge its own close/lock moment, independent of the tournament.
-- NULL → falls back to the first R32 kick-off (the existing bracket lock), so
-- nothing changes for challenges that don't set one.

ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS closes_at timestamptz;
