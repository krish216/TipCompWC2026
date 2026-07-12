-- 168: persist per-user finishing rank on challenge entries
--
-- Match & bracket challenge ranks are computed on-read by the leaderboard routes and never
-- stored, so a tipster's best challenge finish can't be read cheaply for their trophy cabinet.
-- These columns hold the settled rank (recomputed nightly by /api/cron/challenge-ranks, which
-- reuses the SAME scoring as the live leaderboards). `field_size` lets us show "#3 of 40" and
-- derive top-%. Null until first ranked.

ALTER TABLE public.match_entries
  ADD COLUMN IF NOT EXISTS final_rank   int,
  ADD COLUMN IF NOT EXISTS final_points int,
  ADD COLUMN IF NOT EXISTS field_size   int,
  ADD COLUMN IF NOT EXISTS ranked_at    timestamptz;

ALTER TABLE public.bracket_entries
  ADD COLUMN IF NOT EXISTS final_rank   int,
  ADD COLUMN IF NOT EXISTS final_points int,
  ADD COLUMN IF NOT EXISTS field_size   int,
  ADD COLUMN IF NOT EXISTS ranked_at    timestamptz;

SELECT 'Migration 168 complete — challenge rank columns on match_entries + bracket_entries' AS status;
