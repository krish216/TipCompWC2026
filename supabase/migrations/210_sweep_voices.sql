-- 210_sweep_voices.sql
-- tournaments.sweep_voices — Vicky & Gordo on or off for a whole sweep tournament. Off
-- silences every voice tied to it: the "you drew" calls and Gordo's sign-off on the wheel,
-- the sweep intro by the race countdown, the voiced practice race (it falls back to the
-- plain animation) and Vicky's "new ticket request" call on sweep-admin. Switched by a
-- platform admin on /admin, next to "Draw (spinning)". On by default.
--
-- The public demo (/melbourne-cup/race) belongs to no tournament and keeps its voices.
--
-- Column on an existing table, so no new PostgREST grants are needed.

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS sweep_voices boolean NOT NULL DEFAULT true;
