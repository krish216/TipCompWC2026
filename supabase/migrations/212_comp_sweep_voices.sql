-- 212_comp_sweep_voices.sql
-- The organiser's own Vicky & Gordo switch, per sweep, on sweep-admin's Settings tab. On by
-- default. Off silences what the sweep's people hear — the draw calls, Gordo's line, the sweep
-- intro and the voiced practice race with its outro. It can only narrow the tournament's
-- switches (tournaments.sweep_voices / sweep_voice_parts, migrations 210, 211): a part the
-- platform admin has turned off stays off whatever this says.
--
-- Column on an existing table, so no new PostgREST grants are needed.

ALTER TABLE public.comps
  ADD COLUMN IF NOT EXISTS sweep_voices boolean NOT NULL DEFAULT true;
