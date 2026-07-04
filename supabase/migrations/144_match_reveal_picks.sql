-- 144: per-entry control for showing a match prediction on the public leaderboard.
-- Default true (opt-out) — picks are shown unless the entrant unticks it; either way
-- they still compete and score. A user always sees their own pick.

ALTER TABLE public.match_entries
  ADD COLUMN IF NOT EXISTS reveal_picks boolean NOT NULL DEFAULT true;
