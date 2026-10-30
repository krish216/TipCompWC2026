-- 205_sweep_draw_opened_at.sql
-- tournaments.sweep_draw_opened_at — when the draw FIRST opened (set by /api/admin/sweep-draw;
-- re-opening after a close keeps the original time).
--
-- Holders get 2 hours to spin a ticket themselves before the organiser can "Draw for them"
-- (src/lib/sweep/grace.ts). The 2 hours run from when a ticket could first be spun: when it
-- was granted, or when the draw opened, whichever is later. TribePicks still draws anything
-- left 30 minutes before the race.
--
-- Column on an existing table, so no new PostgREST grants are needed.

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS sweep_draw_opened_at timestamptz;

-- A sweep whose draw is already open (the practice sweep): it has been spinnable all along.
UPDATE public.tournaments
   SET sweep_draw_opened_at = COALESCE(sweep_draw_reminder_sent_at, now())
 WHERE format = 'sweep' AND sweep_draw_open = true AND sweep_draw_opened_at IS NULL;
