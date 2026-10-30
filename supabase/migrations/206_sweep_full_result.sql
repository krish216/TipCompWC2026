-- 206_sweep_full_result.sql
-- Roll-down prizes (src/lib/sweep/podium.ts): each pool's 1st/2nd/3rd prizes go to the
-- best-finishing horses that pool holds, so the whole finishing order is needed, not just the
-- top 3. sweep_horses.finish_position now holds every runner's position (dead heats share
-- one), and did_not_finish marks the horses that fell or were pulled up — they never win.
-- A result is complete once every non-scratched horse has one or the other; only then are
-- podiums shown and the results emails sent.
--
-- tribes.practice_results (migration 200) now holds a practice race's FULL order (every
-- horse id, 1st first) rather than just the top 3.
--
-- Column on an existing table, so no new PostgREST grants are needed.

ALTER TABLE public.sweep_horses
  ADD COLUMN IF NOT EXISTS did_not_finish boolean NOT NULL DEFAULT false;
