-- Migration 201: sell sweep tickets before the field is known — "selling open" and "draw open"
-- become separate switches.
--
-- tournaments.sweep_draw_open — can ticket holders spin for a horse yet? Off for the
-- Melbourne Cup until the final field is loaded (barrier draw, Sat 31 Oct); while it's off,
-- organisers can still create sweeps (enrollment_open), sell and approve tickets, but the
-- wheel stays closed and each pool sells up to the race's maximum field (24) rather than
-- the horses currently loaded (src/lib/sweep/field.ts). Defaults true, so every other sweep
-- tournament (the practice sweep, future races with a known field) is unaffected.
--
-- sweep_draw_reminder_sent_at — when "the field's in, spin now" went out (set when an admin
-- opens the draw), so re-toggling never re-sends it.
-- sweep_draw_nudge_sent_at — when the race-morning "still to spin" nudge went out (sent by
-- the sweep-auto-lock cron, once, ~6 hours before race_start_at).

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS sweep_draw_open boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sweep_draw_reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS sweep_draw_nudge_sent_at timestamptz;

UPDATE public.tournaments SET sweep_draw_open = false WHERE slug = 'melbourne-cup-2026';
