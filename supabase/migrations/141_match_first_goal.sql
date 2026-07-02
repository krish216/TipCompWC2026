-- 141: First-goal-minute tie-breaker for match challenges.
--
-- Among entrants tied on points (e.g. everyone who nailed the exact score), the
-- winner is whoever's predicted minute of the first goal is closest to the actual.
-- We store the entrant's prediction on match_entries and the actual minute on the
-- fixture (entered by an admin at settlement). Both nullable — a null just forfeits
-- the tie-break (ranking falls through to total-goals closeness, then earliest entry).
-- 0 means "no goal / 0–0".

ALTER TABLE public.match_entries
  ADD COLUMN IF NOT EXISTS first_goal_min smallint;   -- entrant's predicted minute of the first goal

ALTER TABLE public.fixtures
  ADD COLUMN IF NOT EXISTS first_goal_min smallint;    -- actual minute of the first goal (set at settlement)
